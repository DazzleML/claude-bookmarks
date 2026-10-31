// Operations on the register, as data. A save carries one operation, so that when the file
// on disk is not the text this session last saw (another window, a hand edit, a restore),
// the operation is applied again to the file as it is, instead of this session's whole copy
// overwriting the other's work (commit by operation: the record-format assessment of
// 2026-10-16, C7, probe p8). An operation names its record by identity, decided at the
// moment of intent (`RecordId`), never by a position in a list; a replay that cannot find
// the record fails and says so, and is never resolved silently.
//
// Pure: no I/O. The handler (handlers/bookmarks.ts commitOp) does the reading, the
// comparison and the write.

import { type AnchorOwner, type AnchorRecord, ownerOf, placeOfRecord, tierOf } from './anchor.ts'
import { sameMessage } from '../kit/message-id.ts'
import type { Mark, Marks } from '../marks/marks.ts'
import { sameBase, type NoteBase } from './note.ts'
import { setPin, unionPins, type PinFrom, type PinPlace, type PinScope } from './pins.ts'
import { adoptInto } from './adopt.ts'
import {
  addOrRelabel, claim, idOf, isRecord, prune, recordById, recordsOn, remove, share,
  type Mint, type RecordId, type Register, type Retention, type Slot, type Tombstone,
} from './register-file.ts'

/**
 * How many records a letter remembers (the `a_001` stack). A named constant whose value is
 * djdarcy's to choose (goal 2026-10-16, the open format values); the tests use the name.
 */
export const LETTER_HISTORY_CAP = 50

/** Where a letter points: the message and what was selected there, as the marks handler knows it. */
export type MarkPlace = {
  uuid: string
  head: string
  /** The selected text, when the mark came from a selection. */
  words?: string
  line?: number
  bytes?: [number, number]
  role?: 'user' | 'assistant'
  timestamp?: string
  transcript?: string
}

/** What a relabel may change on a record it names. */
export type Relabel = Partial<Pick<Mint, 'label' | 'why' | 'words' | 'temporary' | 'tier' | 'line' | 'bytes' | 'transcript' | 'tags' | 'x'>>

export type Op =
  | { op: 'mint'; mint: Mint }
  | { op: 'relabel'; id: RecordId; changes: Relabel; by?: Mint['by'] }
  | { op: 'remove'; id: RecordId; removedBy: string }
  | { op: 'share'; id: RecordId; to: AnchorOwner }
  | { op: 'claim'; id: RecordId }
  | { op: 'prune'; retention: Retention }
  /** A pin on a place in a list turned on or off (pins.ts); `scope` says which pins an off turns off. */
  | { op: 'pin'; owner: AnchorOwner; place: PinPlace; from: PinFrom; on: boolean; scope: PinScope; at: number }
  /** A letter (or the reading position's key) set on a place: the place's mark record found or made, the slot's current moved to it. */
  | { op: 'setMark'; owner: AnchorOwner; letter: string; place: MarkPlace; at: number }
  /** Letters cleared: each slot's current becomes null, its history kept (the delete gesture's first verb). */
  | { op: 'clearMarks'; owner: AnchorOwner; letters: string[] }
  /** A letter brought back to a record in its history, by `n`, never by position. */
  | { op: 'bringBack'; owner: AnchorOwner; letter: string; n: number; at: number }
  /** `D` + letter: the letter's current record leaves the file and the history (the delete gesture's second verb; the keys design, unit 5). */
  | { op: 'forget'; owner: AnchorOwner; letter: string }
  /** The note's base set on its primary record after the note is written: what a later read-back compares against (unit 9). */
  | { op: 'noteBase'; id: RecordId; base: NoteBase }
  | { op: 'union'; other: Register }
  /** An earlier session's records, tombstones, letters and pins copied in, this conversation's own winning (adopt.ts, U83). */
  | { op: 'adopt'; earlier: Register }

export type Applied = {
  register: Register
  /** The record the operation made, changed or copied (mint, relabel, share, claim). */
  record?: AnchorRecord
  added?: boolean
  removed?: AnchorRecord
  pruned?: AnchorRecord[]
  /** clearMarks: the letters that had a current record, and those that did not. */
  cleared?: string[]
  missing?: string[]
  /** forget: whether the record left a tombstone (something still refers to it) or went outright. */
  tombstoned?: boolean
  /** adopt: how many records, tombstones, letters and pins came over. */
  adopted?: number
  /** True when the register is unchanged (a prune with nothing to prune, a union that adds nothing). */
  unchanged?: boolean
}
export type OpResult = Applied | { error: string }

/** One sentence naming a record in an error. */
const describeId = (id: RecordId) => (id.n !== undefined ? `#${id.n}` : id.uuid.slice(0, 8)) + (id.owner ? ` on ${id.owner === 'claude' ? "Claude's" : "the person's"} list` : '')

/** Applies one operation to a register. Pure; the same operation on the same register gives the same result. */
export function applyOp(reg: Register, op: Op, now: number): OpResult {
  switch (op.op) {
    case 'mint':
      return addOrRelabel(reg, op.mint, now)
    case 'relabel': {
      const rec = recordById(reg, op.id)
      if (!rec) return { error: `no bookmark ${describeId(op.id)}: it was removed or never existed` }
      // The existing branch of addOrRelabel merges; the mint is the record itself plus the changes.
      const mint: Mint = {
        uuid: rec.uuid,
        owner: ownerOf(rec),
        label: op.changes.label ?? rec.label,
        head: rec.head,
        by: op.by ?? rec.by,
        source: rec.source,
        ...(op.changes.why !== undefined ? { why: op.changes.why } : {}),
        ...(op.changes.words !== undefined ? { words: op.changes.words } : {}),
        ...(op.changes.temporary !== undefined ? { temporary: op.changes.temporary } : {}),
        ...(op.changes.tier !== undefined ? { tier: op.changes.tier } : {}),
        ...(op.changes.line !== undefined ? { line: op.changes.line } : {}),
        ...(op.changes.bytes !== undefined ? { bytes: op.changes.bytes } : {}),
        ...(op.changes.transcript !== undefined ? { transcript: op.changes.transcript } : {}),
        ...(op.changes.tags !== undefined ? { tags: op.changes.tags } : {}),
        ...(op.changes.x !== undefined ? { x: op.changes.x } : {}),
      }
      return addOrRelabel(reg, mint, now)
    }
    case 'remove': {
      const rec = recordById(reg, op.id)
      if (!rec) return { error: `no bookmark ${describeId(op.id)}: already removed` }
      // The record's own place, so a tool row's record is never taken for its reply's (2026-10-26).
      return remove(reg, rec.uuid, ownerOf(rec), op.removedBy, now, placeOfRecord(rec))
    }
    case 'share': {
      const rec = recordById(reg, op.id)
      if (!rec) return { error: `no bookmark ${describeId(op.id)} to share` }
      return share(reg, rec.uuid, ownerOf(rec), op.to, now, placeOfRecord(rec))
    }
    case 'claim': {
      const rec = recordById(reg, { ...op.id, owner: 'claude' })
      if (!rec) return { error: `no bookmark ${describeId({ ...op.id, owner: 'claude' })} to claim` }
      return claim(reg, rec.uuid, now, placeOfRecord(rec))
    }
    case 'prune': {
      const r = prune(reg, op.retention, now)
      return { register: r.register, pruned: r.pruned, unchanged: r.pruned.length === 0 }
    }
    case 'pin': {
      const r = setPin(reg.pins, op.owner, op.place, op.from, op.on, op.scope, op.at)
      if (!r.changed) return { register: reg, unchanged: true }
      return { register: { ...reg, pins: r.pins, rev: reg.rev + 1, updatedAt: now } }
    }
    case 'setMark':
      return setMark(reg, op.owner, op.letter, op.place, op.at)
    case 'noteBase': {
      const rec = recordById(reg, op.id)
      if (!rec) return { error: `no bookmark ${describeId(op.id)} for the note's base` }
      if (sameBase(rec.md?.base, op.base)) return { register: reg, record: rec, unchanged: true }
      const record: AnchorRecord = { ...rec, md: { ...(rec.md ?? {}), base: op.base } }
      return { register: { ...reg, perma: reg.perma.map(r => (r === rec ? record : r)), rev: reg.rev + 1, updatedAt: now }, record }
    }
    case 'clearMarks': {
      const slots = reg.slots?.[op.owner] ?? {}
      const cleared = op.letters.filter(l => slots[l]?.current !== null && slots[l]?.current !== undefined)
      const missing = op.letters.filter(l => !cleared.includes(l))
      if (cleared.length === 0) return { register: reg, cleared, missing, unchanged: true }
      const next = { ...slots }
      for (const l of cleared) next[l] = { ...slots[l]!, current: null }
      return { register: withSlots(reg, op.owner, next, now), cleared, missing }
    }
    case 'bringBack': {
      const slots = reg.slots?.[op.owner] ?? {}
      const slot = slots[op.letter]
      const entry = slot?.history.find(h => h.n === op.n)
      if (!slot || !entry) return { error: `#${op.n} is not in ${op.letter}'s history` }
      const record = reg.perma.find(r => r.n === op.n)
      if (!record) return { error: `#${op.n} is gone from the register (removed)` }
      const history = [{ n: op.n, at: op.at }, ...slot.history.filter(h => h.n !== op.n)].slice(0, LETTER_HISTORY_CAP)
      return { register: withSlots(reg, op.owner, { ...slots, [op.letter]: { current: op.n, history } }, now), record }
    }
    case 'forget': {
      // `D` + letter (the keys design, unit 5; djdarcy, 2026-10-20): the letter's current record
      // leaves the file and the letter's history. Outright -- no tombstone -- when nothing refers
      // to it: the letter's only entry, named by no other slot, no record made from its place
      // (promote mints a bookmark on the same message), no `rel` pointing at it. Otherwise it
      // leaves the tombstone `remove` would, so a union with an older copy and the order of the
      // remaining history stay right. This is the one stated exception, by his word, to
      // "nothing is deleted from the file's history of events" (register-file.ts).
      const slots = reg.slots?.[op.owner] ?? {}
      const slot = slots[op.letter]
      if (!slot || slot.current === null) return { error: `${op.letter} has no current mark to forget` }
      const n = slot.current
      const history = slot.history.filter(h => h.n !== n)
      const next = { ...slots }
      if (history.length === 0) delete next[op.letter]
      else next[op.letter] = { current: null, history }
      const rec = reg.perma.find(r => r.n === n)
      if (!rec) return { register: withSlots(reg, op.owner, next, now) } // already gone from the file: the slot alone is mended
      const namedElsewhere = Object.entries(reg.slots ?? {}).some(([owner, letters]) =>
        Object.entries(letters ?? {}).some(([letter, s]) => !(owner === op.owner && letter === op.letter) && s.history.some(h => h.n === n)))
      // A `rel` naming a record here would name it by its uuid. The one writer so far, adoption's
      // `copied-from` (adopt.ts), names a record in another session's file, never one here.
      const referred = reg.perma.some(r => r !== rec && (r.rel ?? []).some(x => x.to === rec.uuid))
      const referenced = history.length > 0 || namedElsewhere || referred || recordsOn(reg, rec.uuid).length > 0
      const perma = reg.perma.filter(r => r !== rec)
      if (!referenced) return { register: withSlots({ ...reg, perma }, op.owner, next, now), removed: rec, tombstoned: false }
      const tomb: Tombstone = { uuid: rec.uuid, n, createdAt: rec.createdAt, owner: op.owner, label: rec.label, removedAt: now, removedBy: 'user' }
      return { register: withSlots({ ...reg, perma, tombstones: [...reg.tombstones, tomb] }, op.owner, next, now), removed: rec, tombstoned: true }
    }
    case 'union':
      return union(reg, op.other, now)
    case 'adopt': {
      const r = adoptInto(reg, op.earlier, now)
      return r.adopted === 0 ? { register: reg, adopted: 0, unchanged: true } : { register: r.register, adopted: r.adopted }
    }
  }
}

function withSlots(reg: Register, owner: AnchorOwner, slots: Record<string, Slot>, now: number): Register {
  return { ...reg, slots: { ...(reg.slots ?? {}), [owner]: slots }, rev: reg.rev + 1, updatedAt: now }
}

/**
 * A letter set on a place: the place's record of tier `mark` on the owner's list is found
 * (the same message, as `addOrRelabel` matches it) or minted, with the selection's words
 * as its label; the slot's `current` moves to it and its history gains the entry, capped.
 * The file must be numbered (v2 or later); an unnumbered file is an error, since a slot
 * names its record by `n`.
 */
export function setMark(reg: Register, owner: AnchorOwner, letter: string, place: MarkPlace, at: number): OpResult {
  if (typeof reg.nextN !== 'number') return { error: 'the register is not numbered yet (format v1); the migration at the next start numbers it' }
  const mint: Mint = {
    uuid: place.uuid,
    owner,
    label: (place.words ?? place.head).slice(0, 80),
    head: place.head,
    ...(place.words ? { words: place.words } : {}),
    ...(place.line !== undefined ? { line: place.line } : {}),
    ...(place.bytes ? { bytes: place.bytes } : {}),
    ...(place.role ? { role: place.role } : {}),
    ...(place.timestamp ? { timestamp: place.timestamp } : {}),
    ...(place.transcript ? { transcript: place.transcript } : {}),
    by: owner === 'user' ? 'user' : 'claude',
    source: 'mark',
    tier: 'mark',
  }
  const minted = addOrRelabel(reg, mint, at)
  const n = minted.record.n
  if (n === undefined) return { error: 'the mark record has no number' }
  const slots = minted.register.slots?.[owner] ?? {}
  const old = slots[letter] ?? { current: null, history: [] }
  const history = [{ n, at }, ...old.history.filter(h => h.n !== n)].slice(0, LETTER_HISTORY_CAP)
  return { register: withSlots(minted.register, owner, { ...slots, [letter]: { current: n, history } }, at), record: minted.record, added: minted.added }
}

/**
 * The marks as the marks handler and the panes know them, derived from the slots: one
 * `Mark` per letter with a current record. `markedAt` is when the letter was last set
 * there; `source` is `selection` when the record has words to highlight, else `screen`.
 */
export function marksOf(reg: Register, owner: AnchorOwner): Marks {
  const out: Marks = {}
  for (const [letter, slot] of Object.entries(reg.slots?.[owner] ?? {})) {
    if (slot.current === null || slot.current === undefined) continue
    const r = reg.perma.find(x => x.n === slot.current && tierOf(x) === 'mark')
    if (!r) continue
    const at = slot.history.find(h => h.n === slot.current)?.at ?? r.createdAt
    const mark: Mark = { uuid: r.uuid, head: r.head, markedAt: at, source: r.words ? 'selection' : 'screen', ...(r.words ? { snippet: r.words } : {}) }
    out[letter] = mark
  }
  return out
}

/** The letter's history as `a`, `a_001`, `a_002`...: the current record first, each with its number and when the letter pointed at it. */
export function letterHistory(reg: Register, owner: AnchorOwner, letter: string): { name: string; n: number; at: number; record?: AnchorRecord; current: boolean }[] {
  const slot = reg.slots?.[owner]?.[letter]
  if (!slot) return []
  return slot.history.map((h, i) => ({
    name: i === 0 && slot.current === h.n ? letter : `${letter}_${String(slot.current === null ? i + 1 : i).padStart(3, '0')}`,
    n: h.n,
    at: h.at,
    record: reg.perma.find(r => r.n === h.n && sameMessage(r.uuid, r.uuid)),
    current: slot.current === h.n,
  }))
}

/** Whether two tombstones name the same record. */
const sameTomb = (a: Tombstone, b: Tombstone) =>
  (a.n !== undefined && b.n !== undefined) ? a.n === b.n : a.uuid === b.uuid && (a.createdAt === undefined || b.createdAt === undefined || a.createdAt === b.createdAt) && a.owner === b.owner

const lastTouched = (r: AnchorRecord) => r.updatedAt ?? r.createdAt
const tombAt = (t: Tombstone) => t.removedAt ?? t.prunedAt ?? 0

/**
 * Two whole copies of one register meeting (a restore, an import): the union by identity.
 * Every record of either is kept once, the later-touched version of a record winning; a
 * record one side removed stays removed when its tombstone is later than the other side's
 * last touch; tombstones and pins union; `nextN` is the larger. Idempotent: the union with
 * itself, or with a copy already folded in, changes nothing (and bumps nothing).
 */
export function union(a: Register, b: Register, now: number): Applied {
  const base = a.rev >= b.rev ? a : b
  const other = base === a ? b : a
  const perma = [...base.perma]
  const tombstones = [...base.tombstones]
  let changed = false
  const pushed = new Set<AnchorRecord>()
  for (const t of other.tombstones) if (!tombstones.some(x => sameTomb(x, t))) { tombstones.push(t); changed = true }
  for (const r of other.perma) {
    const i = perma.findIndex(x => isRecord(x, idOf(r)) || isRecord(r, idOf(x)))
    if (i >= 0) {
      if (lastTouched(r) > lastTouched(perma[i]!)) { perma[i] = r; changed = true }
      continue
    }
    const tomb = tombstones.find(t => isRecord(r, { ...(t.n !== undefined ? { n: t.n } : {}), uuid: t.uuid, createdAt: t.createdAt, owner: t.owner }))
    if (tomb && tombAt(tomb) >= lastTouched(r)) continue
    perma.push(r)
    pushed.add(r)
  }
  // A tombstone later than a kept record removes it on this side too.
  const kept = perma.filter(r => {
    const tomb = tombstones.find(t => isRecord(r, { ...(t.n !== undefined ? { n: t.n } : {}), uuid: t.uuid, createdAt: t.createdAt, owner: t.owner }))
    const gone = !!tomb && tombAt(tomb) >= lastTouched(r)
    if (gone) changed = true
    return !gone
  })
  // A letter's record (tier `mark`) the other copy pushed in that no slot on this side names
  // is an orphan: a mark forgotten outright here (no tombstone, by design) that the older
  // copy still holds. Slots never merge, so the base's slots decide (the keys design, unit 5,
  // 2026-10-20). A push that is dropped again is no change.
  const named = new Set<number>()
  for (const letters of Object.values(base.slots ?? {})) for (const s of Object.values(letters ?? {})) for (const h of s.history) named.add(h.n)
  const live = kept.filter(r => !(pushed.has(r) && tierOf(r) === 'mark' && r.n !== undefined && !named.has(r.n)))
  if (live.some(r => pushed.has(r))) changed = true
  const nextN = Math.max(base.nextN ?? -Infinity, other.nextN ?? -Infinity)
  // The v2/v3 pins map: two old copies meeting (a restore) merge their lists.
  const pinsV3: Register['pinsV3'] = { ...(base.pinsV3 ?? {}) }
  for (const [owner, list] of Object.entries(other.pinsV3 ?? {}) as [AnchorOwner, string[]][]) {
    const mine = pinsV3[owner] ?? []
    const merged = [...mine, ...list.filter(u => !mine.includes(u))]
    if (merged.length !== mine.length) { pinsV3[owner] = merged; changed = true }
  }
  if (Number.isFinite(nextN) && nextN !== base.nextN) changed = true
  // Pins (v4 on): one per owner, list and place, the later touch winning, so one turned off stays off.
  const pins = unionPins(base.pins, other.pins)
  if (pins.changed) changed = true
  if (!changed) return { register: base, unchanged: true }
  return {
    register: {
      ...base,
      perma: live,
      tombstones,
      ...(Number.isFinite(nextN) ? { nextN } : {}),
      ...(Object.keys(pinsV3).length > 0 ? { pinsV3 } : {}),
      ...(pins.pins.length > 0 ? { pins: pins.pins } : {}),
      rev: Math.max(a.rev, b.rev) + 1,
      updatedAt: now,
    },
  }
}
