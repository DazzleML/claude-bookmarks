// Adopting an earlier session's register into the current one (U83 unit 4, the design
// 2026-10-30__11-26-12): a conversation Claude Code carried on under a new session id gets the
// earlier session's records, tombstones, letters and pins, so its bookmarks pane, marks and pins
// are there again. Unlike `union` (two copies of ONE register meeting), the current conversation's
// own data always wins: its records of a message, its numbers, its letters.
//
// Each copied record keeps its `sessionId` -- the register writes it explicitly when it differs
// from the file's, so the record's note stays at sessions/<earlier>/ and every link already
// written keeps working -- and gains `rel: copied-from` naming its earlier lookup. Its number is
// kept when free here, else it takes the next one. The earlier register is only read.
//
// Several earlier sessions (a chain, CK3's three ids) are adopted newest first: what is
// already here wins, so the newest copy of a record is the one kept, and a record a newer
// session removed is not brought back from an older one.
//
// Pure.
import { lookupRef } from './ref.ts'
import { samePlaceOf, type Register } from './register-file.ts'
import { ownerOf, type AnchorRecord } from './anchor.ts'
import { unionPins } from './pins.ts'
import { sameMessage } from '../kit/message-id.ts'

export type Adopted = { register: Register; adopted: number }

const samePlace = (a: AnchorRecord, b: AnchorRecord) => sameMessage(a.uuid, b.uuid) && ownerOf(a) === ownerOf(b) && samePlaceOf(a, b)

/** `earlier`'s records, tombstones, letters and pins brought into `current`; `current` itself when nothing was new. */
export function adoptInto(current: Register, earlier: Register, now: number): Adopted {
  const taken = new Set<number>()
  for (const r of current.perma) if (r.n !== undefined) taken.add(r.n)
  for (const t of current.tombstones) if (t.n !== undefined) taken.add(t.n)
  let next = Math.max(current.nextN ?? 1, ...[...taken].map(n => n + 1))
  const numberFor = (n: number | undefined): number | undefined => {
    if (n === undefined) return undefined
    if (!taken.has(n)) {
      taken.add(n)
      return n
    }
    while (taken.has(next)) next++
    taken.add(next)
    return next++
  }

  // The same record removed here (a newer session, adopted first, removed it): it stays removed.
  const removedHere = (r: AnchorRecord) =>
    r.createdAt !== undefined && current.tombstones.some(t => sameMessage(t.uuid, r.uuid) && (t.owner ?? 'user') === ownerOf(r) && t.createdAt === r.createdAt)

  const renumbered = new Map<number, number>()
  const perma = [...current.perma]
  let adopted = 0
  for (const r of earlier.perma) {
    if (perma.some(x => samePlace(x, r)) || removedHere(r)) continue
    const n = numberFor(r.n)
    if (r.n !== undefined && n !== undefined) renumbered.set(r.n, n)
    const from = r.n !== undefined ? [{ kind: 'copied-from', to: lookupRef({ sessionId: earlier.sessionId, n: r.n, uuid: r.uuid }) }] : []
    const rel = [...(r.rel ?? []), ...from.filter(f => !(r.rel ?? []).some(x => x.kind === f.kind && x.to === f.to))]
    perma.push({ ...r, sessionId: r.sessionId ?? earlier.sessionId, ...(n !== undefined ? { n } : {}), ...(rel.length ? { rel } : {}) })
    adopted++
  }

  const tombstones = [...current.tombstones]
  for (const t of earlier.tombstones) {
    if (tombstones.some(x => sameMessage(x.uuid, t.uuid) && x.owner === t.owner && x.createdAt === t.createdAt)) continue
    const n = numberFor(t.n)
    tombstones.push({ ...t, ...(n !== undefined ? { n } : {}) })
    adopted++
  }

  // A letter comes along only when the conversation has none of its own under it.
  const slots: NonNullable<Register['slots']> = { ...(current.slots ?? {}) }
  for (const [owner, letters] of Object.entries(earlier.slots ?? {}) as [keyof NonNullable<Register['slots']>, Record<string, NonNullable<Register['slots']>[keyof NonNullable<Register['slots']>]>[string]][]) {
    for (const [letter, slot] of Object.entries(letters ?? {})) {
      if (slots[owner]?.[letter]) continue
      const history = slot.history.filter(h => renumbered.has(h.n)).map(h => ({ ...h, n: renumbered.get(h.n)! }))
      const cur = slot.current !== null && renumbered.has(slot.current) ? renumbered.get(slot.current)! : null
      if (cur === null && history.length === 0) continue
      slots[owner] = { ...(slots[owner] ?? {}), [letter]: { current: cur, history } }
      adopted++
    }
  }

  // Pins meet as two copies' pins do (pins.ts): one per owner, list and place, the later touch winning.
  const p = unionPins(current.pins, earlier.pins)
  const pins = p.pins
  if (p.changed) adopted += Math.max(1, pins.length - (current.pins?.length ?? 0))

  if (adopted === 0) return { register: current, adopted }
  const nextN = Math.max(current.nextN ?? 1, ...[...taken].map(n => n + 1))
  return {
    register: {
      ...current,
      perma,
      tombstones,
      ...(Object.keys(slots).length ? { slots } : {}),
      ...(pins.length ? { pins } : {}),
      nextN,
      rev: current.rev + 1,
      updatedAt: now,
    },
    adopted,
  }
}
