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

import { type AnchorOwner, type AnchorRecord, ownerOf } from './anchor.ts'
import {
  addOrRelabel, claim, idOf, isRecord, prune, recordById, remove, share,
  type Mint, type RecordId, type Register, type Retention, type Tombstone,
} from './register-file.ts'

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
  | { op: 'union'; other: Register }

export type Applied = {
  register: Register
  /** The record the operation made, changed or copied (mint, relabel, share, claim). */
  record?: AnchorRecord
  added?: boolean
  removed?: AnchorRecord
  pruned?: AnchorRecord[]
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
    case 'union':
      return union(reg, op.other, now)
  }
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
