// The resolver of a reference to a place (the bm: short-reference design, 2026-10-27__14-00-02,
// unit 2; its consultation's F6/F7): what a `bm:` reference, or a `file:` link, names, found the
// way the disk says to look.
//
// - The current conversation first: a fork keeps its parent's message uuids (measured: every one
//   of 34,305 forked rows), so a reference into the parent is often on screen already.
// - Then the conversation the reference names, by its prefix; two conversations sharing it are
//   offered, never chosen between.
// - A lookup (`bm:<sid>.<n>~<check>`) goes through that conversation's register; its check must
//   agree with the record the number names now, else the answer is a mismatch with both halves and
//   a fallback search of the conversation for the check's prefix.
//
// Seven outcomes, and no guess: found, ambiguous-row, ambiguous-session, mismatch, removed,
// not-found, not-on-this-machine. Pure: everything it reads comes through RefPorts.
import { checkMatches, type Ref } from './ref.ts'

/** What the resolver needs of a register: its records and tombstones, by number. */
export type RegisterView = {
  records: { n?: number; uuid: string; part?: number; file?: string; label?: string }[]
  tombstones: { n?: number; uuid: string }[]
}

export type RefPorts = {
  /** The conversation this session is in (its full id). */
  currentSession(): string
  /** The conversations on this machine whose id starts with the prefix, with their titles when known. */
  sessionsByPrefix(prefix: string): Promise<{ id: string; title?: string }[]>
  /** A conversation's rows whose uuid starts with the prefix (compared without dashes), any length. */
  rowsByPrefix(sessionId: string, prefix: string): Promise<{ uuid: string; text?: string }[]>
  /** A conversation's register, or undefined when it has none. */
  register(sessionId: string): Promise<RegisterView | undefined>
}

type Place = { session: string; uuid: string; part?: number; file?: string; words?: string; record?: number }

export type Resolution =
  | ({ kind: 'found' } & Place)
  | { kind: 'ambiguous-row'; session: string; candidates: string[] }
  | { kind: 'ambiguous-session'; candidates: { id: string; title?: string }[] }
  | { kind: 'mismatch'; session: string; record: number; check: string; registerNames?: string; fallback?: { kind: 'found' } & Place }
  | { kind: 'removed'; session: string; record: number; uuid: string }
  | { kind: 'not-found'; session?: string; record?: number }
  | { kind: 'not-on-this-machine'; session: string }

/** A register loader that reads each conversation's register once (per resolver use, e.g. per draw). */
export function cachedRegisters(load: RefPorts['register']): RefPorts['register'] {
  const seen = new Map<string, Promise<RegisterView | undefined>>()
  return sessionId => {
    let p = seen.get(sessionId)
    if (!p) seen.set(sessionId, (p = load(sessionId)))
    return p
  }
}

type SessionAnswer = { id: string } | Extract<Resolution, { kind: 'ambiguous-session' | 'not-on-this-machine' }>

async function sessionOf(prefix: string, ports: RefPorts): Promise<SessionAnswer> {
  const p = prefix.toLowerCase()
  const cur = ports.currentSession().toLowerCase()
  if (cur.startsWith(p)) return { id: cur }
  const found = await ports.sessionsByPrefix(p)
  if (found.length === 0) return { kind: 'not-on-this-machine', session: p }
  if (found.length > 1) return { kind: 'ambiguous-session', candidates: found }
  return { id: found[0]!.id }
}

const extras = (ref: Ref): Omit<Place, 'session' | 'uuid'> => ({
  ...(ref.part !== undefined ? { part: ref.part } : {}),
  ...(ref.file !== undefined ? { file: ref.file } : {}),
  ...(ref.words ? { words: ref.words } : {}),
})

/** One row, or the words' choice among several, or all of them offered. */
function pick(session: string, rows: { uuid: string; text?: string }[], ref: Ref): Resolution {
  const uuids = [...new Set(rows.map(r => r.uuid))]
  if (uuids.length === 1) return { kind: 'found', session, uuid: uuids[0]!, ...extras(ref) }
  if (ref.words) {
    const w = ref.words.toLowerCase()
    const hits = [...new Set(rows.filter(r => r.text?.toLowerCase().includes(w)).map(r => r.uuid))]
    if (hits.length === 1) return { kind: 'found', session, uuid: hits[0]!, ...extras(ref) }
  }
  return { kind: 'ambiguous-row', session, candidates: uuids }
}

async function resolveRow(ref: Ref, ports: RefPorts): Promise<Resolution> {
  const row = ref.uuid!
  const cur = ports.currentSession()
  const local = await ports.rowsByPrefix(cur, row)
  if (local.length) return pick(cur, local, ref)
  const s = await sessionOf(ref.session!, ports)
  if (!('id' in s)) return s
  const rows = s.id === cur.toLowerCase() ? [] : await ports.rowsByPrefix(s.id, row)
  return rows.length ? pick(s.id, rows, ref) : { kind: 'not-found', session: s.id }
}

async function resolveLookup(ref: Ref, ports: RefPorts): Promise<Resolution> {
  const n = ref.record!
  const s = await sessionOf(ref.session!, ports)
  if (!('id' in s)) return s
  const reg = await ports.register(s.id)
  const rec = reg?.records.find(r => r.n === n)
  const tomb = rec ? undefined : reg?.tombstones.find(t => t.n === n)
  const named = rec?.uuid ?? tomb?.uuid
  if (ref.check && !(named && checkMatches(ref.check, named))) {
    // The number names another record now (a register re-created, or two copies unioned), or no
    // record at all: report both halves, and search the conversation for the check's prefix.
    const byCheck = [...new Set((await ports.rowsByPrefix(s.id, ref.check)).map(r => r.uuid))]
    return {
      kind: 'mismatch', session: s.id, record: n, check: ref.check,
      ...(named ? { registerNames: named } : {}),
      ...(byCheck.length === 1 ? { fallback: { kind: 'found' as const, session: s.id, uuid: byCheck[0]!, record: n } } : {}),
    }
  }
  if (tomb) return { kind: 'removed', session: s.id, record: n, uuid: tomb.uuid }
  if (!rec) return { kind: 'not-found', session: s.id, record: n }
  const cur = ports.currentSession()
  const here = (await ports.rowsByPrefix(cur, rec.uuid)).length > 0
  return {
    kind: 'found', session: here ? cur : s.id, uuid: rec.uuid, record: n,
    ...(rec.part !== undefined ? { part: rec.part } : {}),
    ...(rec.file !== undefined ? { file: rec.file } : {}),
    ...(ref.words ? { words: ref.words } : {}),
  }
}

/** What a reference names, by the order above. A bare list marker names no place: not-found. */
export async function resolveRef(ref: Ref, ports: RefPorts): Promise<Resolution> {
  if (!ref.session) return { kind: 'not-found' }
  if (ref.record !== undefined && !ref.uuid) return resolveLookup(ref, ports)
  if (ref.uuid) return resolveRow(ref, ports)
  return { kind: 'not-found', session: ref.session }
}
