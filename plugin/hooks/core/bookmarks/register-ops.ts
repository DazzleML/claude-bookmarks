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

import { type AnchorOwner, type AnchorRecord, ownerOf, tierOf } from './anchor.ts'
import { sameMessage } from '../kit/message-id.ts'
import type { Mark, Marks } from '../marks/marks.ts'
import {
  addOrRelabel, claim, idOf, isRecord, prune, recordById, remove, share,
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
export type Relabel = Partial<Pick<Mint, 'label' | 'why' | 'words' | 'temporary' | 'tier' | 'line' | 'bytes' | 'transcript'>>

export type Op =
  | { op: 'mint'; mint: Mint }
  | { op: 'relabel'; id: RecordId; changes: Relabel; by?: Mint['by'] }
  | { op: 'remove'; id: RecordId; removedBy: string }
  | { op: 'share'; id: RecordId; to: AnchorOwner }
  | { op: 'claim'; id: RecordId }
  | { op: 'prune'; retention: Retention }
  | { op: 'pin'; owner: AnchorOwner; uuid: string; on: boolean }
  /** A letter (or the reading position's key) set on a place: the place's mark record found or made, the slot's current moved to it. */
  | { op: 'setMark'; owner: AnchorOwner; letter: string; place: MarkPlace; at: number }
  /** Letters cleared: each slot's current becomes null, its history kept (the delete gesture's first verb). */
  | { op: 'clearMarks'; owner: AnchorOwner; letters: string[] }
  /** A letter brought back to a record in its history, by `n`, never by position. */
  | { op: 'bringBack'; owner: AnchorOwner; letter: string; n: number; at: number }
  | { op: 'union'; other: Register }

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
      }
      return addOrRelabel(reg, mint, now)
    }
    case 'remove': {
      const rec = recordById(reg, op.id)
      if (!rec) return { error: `no bookmark ${describeId(op.id)}: already removed` }
      return remove(reg, rec.uuid, ownerOf(rec), op.removedBy, now)
    }
    case 'share': {
      const rec = recordById(reg, op.id)
      if (!rec) return { error: `no bookmark ${describeId(op.id)} to share` }
      return share(reg, rec.uuid, ownerOf(rec), op.to, now)
    }
    case 'claim': {
      const rec = recordById(reg, { ...op.id, owner: 'claude' })
      if (!rec) return { error: `no bookmark ${describeId({ ...op.id, owner: 'claude' })} to claim` }
      return claim(reg, rec.uuid, now)
    }
    case 'prune': {
      const r = prune(reg, op.retention, now)
      return { register: r.register, pruned: r.pruned, unchanged: r.pruned.length === 0 }
    }
    case 'pin': {
      const list = reg.pins?.[op.owner] ?? []
      const has = list.includes(op.uuid)
      if (has === op.on) return { register: reg, unchanged: true }
      const pins = { ...(reg.pins ?? {}), [op.owner]: op.on ? [...list, op.uuid] : list.filter(u => u !== op.uuid) }
      return { register: { ...reg, pins, rev: reg.rev + 1, updatedAt: now } }
    }
    case 'setMark':
      return setMark(reg, op.owner, op.letter, op.place, op.at)
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
    case 'union':
      return union(reg, op.other, now)
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
    changed = true
  }
  // A tombstone later than a kept record removes it on this side too.
  const kept = perma.filter(r => {
    const tomb = tombstones.find(t => isRecord(r, { ...(t.n !== undefined ? { n: t.n } : {}), uuid: t.uuid, createdAt: t.createdAt, owner: t.owner }))
    const gone = !!tomb && tombAt(tomb) >= lastTouched(r)
    if (gone) changed = true
    return !gone
  })
  const nextN = Math.max(base.nextN ?? -Infinity, other.nextN ?? -Infinity)
  const pins: Register['pins'] = { ...(base.pins ?? {}) }
  for (const [owner, list] of Object.entries(other.pins ?? {}) as [AnchorOwner, string[]][]) {
    const mine = pins[owner] ?? []
    const merged = [...mine, ...list.filter(u => !mine.includes(u))]
    if (merged.length !== mine.length) { pins[owner] = merged; changed = true }
  }
  if (Number.isFinite(nextN) && nextN !== base.nextN) changed = true
  if (!changed) return { register: base, unchanged: true }
  return {
    register: {
      ...base,
      perma: kept,
      tombstones,
      ...(Number.isFinite(nextN) ? { nextN } : {}),
      ...(Object.keys(pins).length > 0 ? { pins } : {}),
      rev: Math.max(a.rev, b.rev) + 1,
      updatedAt: now,
    },
  }
}
