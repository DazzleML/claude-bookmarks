// The bookmark register: one readable JSON file per session under the data root, plus one
// markdown export per bookmark. Pure: the mod does the reads and writes.
//
//   <dataRoot>/bookmarks/sessions/<sessionId>.json          the register (this file's shape)
//   <dataRoot>/bookmarks/sessions/<sessionId>/<uuid8>.md    one export per bookmark
//
// Rules (issue #6 and the anchors DWP, 2026-10-09): the file is the source of truth and
// is hand-editable, so keys are written in a fixed order; records are append-only (a
// re-mark adds or relabels, never deletes); only `temporary` records are pruned, and a
// pruned one leaves a tombstone so "never marked" and "marked, then pruned" stay distinct.
//
// The guard (0.5.1, the data design of 2026-10-16): a key this build does not know -- at
// the file's top level, on a record or on a tombstone -- is read and written back as it
// was, after the known keys and in its original order, so a newer build's fields survive
// a save by this one. A file whose `version` is above REGISTER_VERSION is read in full and
// never written (`newerThanBuild`); the handler says so once and keeps the file as it is.

import { type AnchorOwner, type AnchorRecord, exportName, ownerOf, type PlaceOf, placeOfRecord, tierOf, uuid8 } from './anchor.ts'
import { isDrawnId, matchesPrefix, sameMessage } from '../kit/message-id.ts'
import { aliasesOf, noteOwners, noteTags } from './note.ts'
import { isPin, type Pin } from './pins.ts'

/**
 * The format this build writes. 1: the proof of concept's file. 2 (0.5.4): `sessionId` and
 * `transcript` once at the top with per-record overrides, `n`/`nextN`, pins in the file.
 * 3 (0.5.5): the letter marks and the reading position as records of tier `mark`, pointed
 * at by `slots`. 4 (0.7.1): each pin a record with the list it was made in, under the key
 * `stars` (core/bookmarks/pins.ts). 5: the same list under `pins`, one name for one concept
 * (the pins-by-name design, 2026-10-26). An older file is migrated at a session's start, and
 * the session's own file also the first time a build loads it (core/bookmarks/migrations.ts;
 * handlers/bookmarks.ts loadRegister).
 */
export const REGISTER_VERSION = 5

/**
 * The format this build understands: the MINIMUM READER a file may ask for. `version` counts
 * migrations (each one changed the shape, each one ran with a backup); `format` is the
 * oldest format a build must know to operate on the file's data safely, and it moves only
 * when a shape change leaves an older build unable to handle the data (djdarcy, 2026-10-17:
 * "we should be tracking when the format itself changes so we can easily ensure that old
 * versions that CAN support our format DO support our format rather than needlessly forcing
 * people to upgrade"). A build refuses to write a file whose `format` is above this; a file
 * with a higher `version` but a `format` it knows is read and written, unknown keys kept.
 * 1, 2, 3 coincide with the versions: each of the first three shapes needed its own reader
 * (v3's slots, say: a v2 build would put marks back in the store). 4 does too: a v3 build
 * reads only `pins` and would show none of the stars. So does 5: a v4 build reads the list
 * only under `stars`, and a save of its own would drop the list under `pins`. A file without
 * the field (written before 0.5.12) reads as `format: version`.
 */
export const REGISTER_FORMAT = 5

/**
 * What a letter (or the reading position's key) points at: `current` is the record's `n`,
 * or null when the letter was cleared with its history kept (djdarcy, 2026-10-16: "the
 * only thing that should ever need to be saved is which is the CURRENTLY active 'a' mark or
 * if NO 'a' mark is saved currently"); `history` is every record the letter has pointed
 * at, newest first, the current one included -- `a_001` is the second entry, derived,
 * never stored.
 */
export type Slot = { current: number | null; history: { n: number; at: number }[] }

/** True when the file was written by a build whose format is ahead of this one: read it, never write it. */
export function newerThanBuild(reg: Register): boolean {
  return formatOf(reg) > REGISTER_FORMAT
}

/** The format a file asks its reader for: its `format`, else (a file from before 0.5.12) its `version`. */
export const formatOf = (reg: Pick<Register, 'version' | 'format'>): number => reg.format ?? reg.version

/**
 * What is left when a record goes: pruned (temporary, aged out) or removed (on request).
 * Carries the record's identity (`n` when it had one, `uuid`, `createdAt`) so a removal
 * replayed onto another copy of the file finds the same record (the data design, 2026-10-16).
 */
export type Tombstone = { uuid: string; n?: number; createdAt?: number; owner?: AnchorOwner; label?: string; prunedAt?: number; removedAt?: number; removedBy?: string }

export type Register = {
  /** Counts the migrations the file has been through: the shape it was written in (REGISTER_VERSION). */
  version: number
  /** The minimum reader the data asks for (REGISTER_FORMAT); absent in a file from before 0.5.12, read as `version`. */
  format?: number
  sessionId: string
  /**
   * The conversation's transcript path, forward slashes, once for the file (v2). A record
   * carries its own `transcript` or `sessionId` only when it differs (a record copied from
   * another conversation); `parseRegister` fills the file's into every record, and
   * `serializeRegister` writes a record's only when it differs.
   */
  transcript?: string
  /** Where Claude Code kept its config when the file was written (never used to find anything). */
  configDir?: string
  cwd?: string
  /** The conversation's title (its `/rename` name, else the first prompt's head), refreshed on save, so a file is findable without renaming it (unit 6). */
  title?: string
  /** The project folder's name (the last segment of `cwd`), refreshed on save. */
  project?: string
  /** Bumped on every write; the higher wins when two copies meet (#6). */
  rev: number
  updatedAt: number
  writer: string
  /**
   * The next record number (format v2): every record minted into a file with `nextN` gets
   * `n = nextN`, and `nextN` moves on; a number is never reused. A v1 file has none, and
   * its records get none until the migration (unit 4) gives the file a `nextN`.
   */
  nextN?: number
  perma: AnchorRecord[]
  tombstones: Tombstone[]
  /**
   * Formats v2 and v3 only: the pinned prompts, per owner, by message uuid, as the file's `pins`
   * key held them then. Read for the migrations (v3to4 turns it into `pins` below) and written
   * back only to a file of those versions; no other code reads it (the pins-by-name design,
   * 2026-10-26).
   */
  pinsV3?: Partial<Record<AnchorOwner, string[]>>
  /** The letters and the reading position, per owner (format v3). Absent on a file not yet migrated: its marks are still in the store. */
  slots?: Partial<Record<AnchorOwner, Record<string, Slot>>>
  /**
   * Pinned places, each with the list it was pinned in (pins.ts). In the file: `pins` from
   * format v5, `stars` at v4 (0.7.1's name); `serializeRegister` writes the key the file's own
   * version uses, so a file is never written in a shape its version does not say.
   */
  pins?: Pin[]
}

export function emptyRegister(sessionId: string, writer: string, now: number, env?: { configDir?: string; cwd?: string; transcript?: string }): Register {
  const { transcript, ...rest } = env ?? {}
  return { version: REGISTER_VERSION, format: REGISTER_FORMAT, sessionId, ...(transcript ? { transcript } : {}), ...rest, rev: 0, updatedAt: now, writer, nextN: 1, perma: [], tombstones: [], slots: {} }
}

/**
 * What names one record for an operation: decided when the person or Claude acts, so a
 * replay onto a changed file finds the same record and not whatever sits at its position.
 * `n` when the record has one; `(uuid, createdAt)` breaks a tie between files that
 * numbered independently; `owner` because the same message may be on both lists.
 */
export type RecordId = { n?: number; uuid: string; createdAt?: number; owner?: AnchorOwner }

export const idOf = (r: AnchorRecord): RecordId => ({ ...(r.n !== undefined ? { n: r.n } : {}), uuid: r.uuid, createdAt: r.createdAt, owner: ownerOf(r) })

/**
 * Whether a record is the one an id names (identity, never a typed prefix). `n` decides
 * when both sides have one -- the owner is mutable (a claim moves a record between the
 * lists and it stays the same record). Without `n`, the message, the minting time and the
 * list together name it.
 */
export function isRecord(r: AnchorRecord, id: RecordId): boolean {
  if (id.n !== undefined && r.n !== undefined) return r.n === id.n
  if (id.owner !== undefined && ownerOf(r) !== id.owner) return false
  if (!sameMessage(r.uuid, id.uuid)) return false
  return id.createdAt === undefined || r.createdAt === id.createdAt
}

/** The record an id names, or undefined when it is gone (removed, pruned, never there). */
export const recordById = (reg: Register, id: RecordId): AnchorRecord | undefined => reg.perma.find(r => isRecord(r, id))

/** What a mint supplies; the register fills the rest. */
export type Mint = {
  uuid: string
  /** A row that is not a prompt or a reply: its file and block (AnchorRecord.file, part), and the id it is drawn under. */
  file?: string
  part?: number
  drawn?: string
  /** Whose list: the person's or Claude's. */
  owner: AnchorOwner
  sharedFrom?: AnchorOwner
  label: string
  why?: string
  words?: string
  temporary?: boolean
  /** `perma` or `bookmark`; absent means a bookmark. */
  tier?: AnchorRecord['tier']
  line?: number
  bytes?: [number, number]
  head: string
  by: AnchorRecord['by']
  source: AnchorRecord['source']
  transcript?: string
  role?: 'user' | 'assistant'
  timestamp?: string
  /** Tags to set (replacing the record's); nested with `/`. */
  tags?: string[]
  /** Open namespaces to merge onto the record's `x`, one object per namespace (`x.claude`, `x['agent:<name>']`). */
  x?: Record<string, Record<string, unknown>>
}

export type AddResult = { register: Register; record: AnchorRecord; added: boolean }

/**
 * Adds a bookmark for a message to one owner's list, or relabels the one that exists
 * there. Never removes. A record is found by uuid (full match, or either side an 8+
 * prefix of the other) within the owner's list: the two lists may hold the same message.
 */
export function addOrRelabel(reg: Register, mint: Mint, now: number): AddResult {
  // The same message (a drawn id included), or a prefix a hand-written link carried: typed input, so matchesPrefix.
  // A letter's record (tier `mark`) and a bookmark on the same message are two records: a mark never relabels a bookmark, nor the reverse.
  const isMark = mint.tier === 'mark'
  // The same place too: a tool call and the reply before it share a uuid but are two records.
  const existing = reg.perma.find(r => ownerOf(r) === mint.owner && (tierOf(r) === 'mark') === isMark && (sameMessage(r.uuid, mint.uuid) || matchesPrefix(r.uuid, mint.uuid)) && samePlaceOf(r, mint))
  if (existing) {
    const record: AnchorRecord = {
      ...existing,
      // The full uuid wins over a prefix; a newer position fills a gap but never
      // overwrites one (the transcript is append-only, so the first was right).
      uuid: existing.uuid.length >= mint.uuid.length ? existing.uuid : mint.uuid,
      line: existing.line ?? mint.line,
      bytes: existing.bytes ?? mint.bytes,
      words: mint.words ?? existing.words,
      head: existing.head || mint.head,
      label: mint.label || existing.label,
      why: mint.why ?? existing.why,
      // A permanent mark stays permanent; a temporary one can be made permanent.
      temporary: existing.temporary && mint.temporary ? true : undefined,
      // A perma record becomes a bookmark when asked; a bookmark never drops to perma. A mark stays a mark.
      tier: existing.tier === 'mark' ? 'mark' : existing.tier === 'perma' && mint.tier !== 'bookmark' ? 'perma' : undefined,
      updatedAt: now,
      transcript: mint.transcript ?? existing.transcript,
      // Tags given replace the record's; namespaces given merge onto its `x`, each namespace whole.
      tags: mint.tags ?? existing.tags,
      x: mint.x ? { ...(existing.x ?? {}), ...mint.x } : existing.x,
    }
    // A record in memory is what the file reads back: no key sits there with an undefined value.
    for (const k of Object.keys(record) as (keyof AnchorRecord)[]) if (record[k] === undefined) delete record[k]
    return { register: bump({ ...reg, perma: reg.perma.map(r => (r === existing ? record : r)) }, now), record, added: false }
  }
  // A v2 file numbers its records; a v1 file does not, until the migration gives it nextN.
  const numbered = typeof reg.nextN === 'number'
  const record: AnchorRecord = {
    sessionId: reg.sessionId,
    ...(numbered ? { n: reg.nextN } : {}),
    uuid: mint.uuid,
    ...(mint.file !== undefined ? { file: mint.file } : {}),
    ...(mint.part !== undefined ? { part: mint.part } : {}),
    ...(mint.drawn !== undefined ? { drawn: mint.drawn } : {}),
    // A drawn id (the engine's stand-in, fifth group zeros) is kept as what it is, so the
    // real uuid can replace it when the message is found in the transcript.
    ...(isDrawnId(mint.uuid) ? { idKind: 'drawn' as const } : {}),
    owner: mint.owner,
    ...(mint.sharedFrom ? { sharedFrom: mint.sharedFrom } : {}),
    ...(mint.line !== undefined ? { line: mint.line } : {}),
    ...(mint.bytes ? { bytes: mint.bytes } : {}),
    ...(mint.words ? { words: mint.words } : {}),
    head: mint.head,
    label: mint.label,
    ...(mint.why ? { why: mint.why } : {}),
    ...(mint.temporary ? { temporary: true } : {}),
    ...(mint.tier === 'perma' || mint.tier === 'mark' ? { tier: mint.tier } : {}),
    createdAt: now,
    by: mint.by,
    source: mint.source,
    // A record in memory is whole (the hoist fills it on read), so a mint without a transcript takes the file's.
    ...(mint.transcript ?? reg.transcript ? { transcript: mint.transcript ?? reg.transcript } : {}),
    ...(mint.role ? { role: mint.role } : {}),
    ...(mint.timestamp ? { timestamp: mint.timestamp } : {}),
    ...(mint.tags && mint.tags.length > 0 ? { tags: mint.tags } : {}),
    ...(mint.x && Object.keys(mint.x).length > 0 ? { x: mint.x } : {}),
  }
  const next = { ...reg, perma: [...reg.perma, record], ...(numbered ? { nextN: (reg.nextN as number) + 1 } : {}) }
  return { register: bump(next, now), record, added: true }
}

/**
 * The record for a message on one list, or on any list when `owner` is left out. `id` is
 * what was typed or linked: a full uuid, a drawn id (the same message by its first four
 * groups), or a prefix of 8+ characters.
 */
export function findRecord(reg: Register, id: string, owner?: AnchorOwner, place?: PlaceOf): AnchorRecord | undefined {
  // A letter's record (tier `mark`) is reached through the slots, never by message: a bookmark and
  // a mark on one message are two records, and this finds the bookmark (0.5.6; the promote path met the mark first).
  // With `place`, the record at that place; without it, the message's own record before a
  // tool row's on the same uuid (the search-pane-and-links design, 2026-10-26).
  const onList = (r: AnchorRecord) => (owner === undefined || ownerOf(r) === owner) && tierOf(r) !== 'mark' && (place === undefined || samePlaceOf(r, place))
  const records = place === undefined ? [...reg.perma].sort((a, b) => Number(a.part !== undefined || a.file !== undefined) - Number(b.part !== undefined || b.file !== undefined)) : reg.perma
  return records.find(r => onList(r) && r.uuid.toLowerCase() === id.toLowerCase())
    ?? records.find(r => onList(r) && matchesPrefix(r.uuid, id))
    ?? records.find(r => onList(r) && id.length === 36 && sameMessage(r.uuid, id))
}

/** One owner's list of bookmarks and permalinks, in minted order; a letter's record (tier `mark`) is reached through the slots, not listed. */
export function listOf(reg: Register, owner: AnchorOwner): AnchorRecord[] {
  return reg.perma.filter(r => ownerOf(r) === owner && tierOf(r) !== 'mark').sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * Copies one of Claude's bookmarks onto the person's list (or the other way): same
 * message, label, why and words; `sharedFrom` names where it came from. The original
 * stays. A copy that already exists is relabelled from the source.
 */
export function share(reg: Register, uuid: string, from: AnchorOwner, to: AnchorOwner, now: number, place?: PlaceOf): AddResult | { error: string } {
  const src = findRecord(reg, uuid, from, place)
  if (!src) return { error: `no bookmark ${uuid8(uuid)} on ${from === 'claude' ? "Claude's" : "the person's"} list` }
  return addOrRelabel(
    reg,
    {
      uuid: src.uuid,
      ...placeOfRecord(src),
      ...(src.drawn !== undefined ? { drawn: src.drawn } : {}),
      owner: to,
      sharedFrom: from,
      label: src.label,
      ...(src.why ? { why: src.why } : {}),
      ...(src.words ? { words: src.words } : {}),
      ...(src.line !== undefined ? { line: src.line } : {}),
      ...(src.bytes ? { bytes: src.bytes } : {}),
      head: src.head,
      by: src.by,
      source: src.source,
      ...(src.transcript ? { transcript: src.transcript } : {}),
      ...(src.role ? { role: src.role } : {}),
      ...(src.timestamp ? { timestamp: src.timestamp } : {}),
    },
    now,
  )
}

/**
 * The person takes one of Claude's records as their own (#21, the continuum's `claim`):
 * the record moves to the person's list in place -- same message, id, label, words,
 * tier and link -- and `sharedFrom` says it came from Claude. If the person already has
 * that message, their record stands and Claude's is left as it was.
 */
export function claim(reg: Register, uuid: string, now: number, place?: PlaceOf): AddResult | { error: string } {
  const src = findRecord(reg, uuid, 'claude', place)
  if (!src) return { error: `no bookmark ${uuid8(uuid)} on Claude's list` }
  const mine = findRecord(reg, uuid, 'user', placeOfRecord(src))
  if (mine) return { register: reg, record: mine, added: false }
  const record: AnchorRecord = { ...src, owner: 'user', sharedFrom: 'claude', updatedAt: now }
  return { register: bump({ ...reg, perma: reg.perma.map(r => (r === src ? record : r)) }, now), record, added: true }
}

/**
 * Removes a bookmark from one list, on request: the record leaves `perma` and a tombstone
 * says who removed it and when. Nothing is deleted from the file's history of events.
 */
export function remove(reg: Register, uuid: string, owner: AnchorOwner, removedBy: string, now: number, place?: PlaceOf): { register: Register; removed: AnchorRecord } | { error: string } {
  const rec = findRecord(reg, uuid, owner, place)
  if (!rec) return { error: `no bookmark ${uuid8(uuid)} on ${owner === 'claude' ? "Claude's" : "the person's"} list` }
  const tomb: Tombstone = { uuid: rec.uuid, ...(rec.n !== undefined ? { n: rec.n } : {}), createdAt: rec.createdAt, owner, label: rec.label, removedAt: now, removedBy }
  return { register: bump({ ...reg, perma: reg.perma.filter(r => r !== rec), tombstones: [...reg.tombstones, tomb] }, now), removed: rec }
}

export type Retention = '7d' | '30d' | '3mo' | '1y' | 'never'

const DAY = 86_400_000
const RETENTION_MS: Record<Exclude<Retention, 'never'>, number> = { '7d': 7 * DAY, '30d': 30 * DAY, '3mo': 91 * DAY, '1y': 365 * DAY }

/** Drops temporary records older than the retention, each leaving a tombstone. */
export function prune(reg: Register, retention: Retention, now: number): { register: Register; pruned: AnchorRecord[] } {
  if (retention === 'never') return { register: reg, pruned: [] }
  const cutoff = now - RETENTION_MS[retention]
  const pruned = reg.perma.filter(r => r.temporary && (r.updatedAt ?? r.createdAt) < cutoff)
  if (pruned.length === 0) return { register: reg, pruned }
  const keep = reg.perma.filter(r => !pruned.includes(r))
  const tombstones = [...reg.tombstones, ...pruned.map(r => ({ uuid: r.uuid, ...(r.n !== undefined ? { n: r.n } : {}), createdAt: r.createdAt, owner: ownerOf(r), label: r.label, prunedAt: now }))]
  return { register: bump({ ...reg, perma: keep, tombstones }, now), pruned }
}

function bump(reg: Register, now: number): Register {
  return { ...reg, rev: reg.rev + 1, updatedAt: now }
}

// Fixed key order, so a hand edit and a program write diff cleanly.
const REGISTER_KEYS = ['version', 'format', 'sessionId', 'transcript', 'configDir', 'cwd', 'title', 'project', 'rev', 'updatedAt', 'writer', 'nextN', 'perma', 'tombstones', 'pins', 'slots', 'stars'] as const
const RECORD_KEYS = [
  'n', 'sessionId', 'uuid', 'file', 'part', 'drawn', 'idKind', 'owner', 'label', 'why', 'words', 'head', 'line', 'bytes', 'role', 'timestamp',
  'temporary', 'tier', 'createdAt', 'updatedAt', 'by', 'source', 'sharedFrom', 'transcript', 'tags', 'axes', 'rel', 'x', 'md',
] as const

/**
 * The reserved names of the register's two levels (unit 6): a key a build does not know is kept
 * (`keepUnknown`), so these are the ones that mean something to this build, in the order written.
 */
export const RESERVED = { register: REGISTER_KEYS, record: RECORD_KEYS } as const

/**
 * The export's front-matter properties, fixed before Obsidian is pointed at the folder (unit 6;
 * unit 9 makes the note an Obsidian note). Every property `exportMarkdown` writes is here, and
 * a reader may rely on these names: nothing else is written into the front matter.
 */
export const FRONT_MATTER_PROPERTIES = [
  'kind', 'version', 'bm-writer', 'session', 'uuid', 'n', 'owners', 'tier', 'tags', 'aliases', 'title', 'project',
  'role', 'timestamp', 'transcript', 'line', 'bytes', 'words', 'label', 'why', 'by', 'source', 'shared-from', 'temporary', 'created',
] as const

export function serializeRegister(reg: Register): string {
  const ordered: Record<string, unknown> = {}
  for (const k of REGISTER_KEYS) {
    if (k === 'perma') ordered.perma = reg.perma.map(r => orderRecord(r, reg))
    else if (k === 'pins' || k === 'stars') {
      const v = pinsUnder(reg, k)
      if (v !== undefined) ordered[k] = v
    } else if ((reg as Record<string, unknown>)[k] !== undefined) ordered[k] = (reg as Record<string, unknown>)[k]
  }
  keepUnknown(ordered, reg, IN_MEMORY_KEYS)
  return JSON.stringify(ordered, null, 2) + '\n'
}

/** Keys the register has in memory that are never written under their own name (`pinsV3` is written as `pins`). */
const IN_MEMORY_KEYS: readonly string[] = [...REGISTER_KEYS, 'pinsV3']

/**
 * What the file's `pins` or `stars` key holds, by the file's own version: the map (`pinsV3`)
 * under `pins` at v2 and v3, the list (`pins`) under `stars` at v4 and under `pins` from v5.
 */
function pinsUnder(reg: Register, key: 'pins' | 'stars'): unknown {
  if (key === 'stars') return reg.version === 4 ? reg.pins : undefined
  return reg.version >= 5 ? reg.pins : reg.version >= 4 ? undefined : reg.pinsV3
}

// The hoist (v2): a record's `sessionId` and `transcript` are written only when they differ
// from the file's -- an override, as djdarcy put it -- and read back filled in (parseRegister).
function orderRecord(r: AnchorRecord, reg: Register): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  const hoisted = reg.version >= 2
  for (const k of RECORD_KEYS) {
    const v = (r as Record<string, unknown>)[k]
    if (v === undefined) continue
    if (hoisted && k === 'sessionId' && v === reg.sessionId) continue
    if (hoisted && k === 'transcript' && reg.transcript !== undefined && v === reg.transcript) continue
    o[k] = v
  }
  keepUnknown(o, r, RECORD_KEYS)
  return o
}

/** Copies every key of `from` that `known` does not name onto `onto`, in `from`'s order: a newer build's fields ride through this one. */
function keepUnknown(onto: Record<string, unknown>, from: object, known: readonly string[]) {
  for (const [k, v] of Object.entries(from)) if (!known.includes(k) && v !== undefined) onto[k] = v
}

/** Reads a register file's text; undefined when it is not one (the caller then tries `.bak`). */
export function parseRegister(text: string): Register | undefined {
  let o: any
  try {
    o = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!o || typeof o !== 'object' || typeof o.sessionId !== 'string' || !Array.isArray(o.perma)) return undefined
  const version = typeof o.version === 'number' ? o.version : 1
  const transcript = typeof o.transcript === 'string' ? o.transcript : undefined
  // A record without its own sessionId or transcript takes the file's (the hoist, v2).
  const fill = (r: any) => ({
    ...r,
    ...(typeof r.sessionId === 'string' ? {} : { sessionId: o.sessionId }),
    ...(r.transcript === undefined && transcript !== undefined ? { transcript } : {}),
  })
  const reg: Register = {
    version,
    // A file from before the field reads as asking for its own version: no migration, no backup, for the field itself.
    ...(typeof o.format === 'number' ? { format: o.format } : {}),
    sessionId: o.sessionId,
    ...(transcript !== undefined ? { transcript } : {}),
    ...(typeof o.configDir === 'string' ? { configDir: o.configDir } : {}),
    ...(typeof o.cwd === 'string' ? { cwd: o.cwd } : {}),
    ...(typeof o.title === 'string' ? { title: o.title } : {}),
    ...(typeof o.project === 'string' ? { project: o.project } : {}),
    rev: typeof o.rev === 'number' ? o.rev : 0,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
    writer: typeof o.writer === 'string' ? o.writer : '?',
    ...(typeof o.nextN === 'number' ? { nextN: o.nextN } : {}),
    // Records and tombstones come through as they are in the file, unknown keys included.
    perma: o.perma.filter((r: any) => r && typeof r.uuid === 'string' && typeof r.label === 'string').map(fill),
    tombstones: Array.isArray(o.tombstones) ? o.tombstones : [],
    // `pins` by its shape: the map of v2 and v3, or the list of v5; v4 kept the list as `stars`.
    ...(o.pins && typeof o.pins === 'object' && !Array.isArray(o.pins) ? { pinsV3: o.pins } : {}),
    ...(o.slots && typeof o.slots === 'object' && !Array.isArray(o.slots) ? { slots: o.slots } : {}),
    ...(Array.isArray(o.pins) ? { pins: o.pins.filter(isPin) } : Array.isArray(o.stars) ? { pins: o.stars.filter(isPin) } : {}),
  }
  // The file's own unknown keys ride along too; `serializeRegister` writes them back after the known ones.
  keepUnknown(reg as unknown as Record<string, unknown>, o, REGISTER_KEYS)
  return reg
}

/** Of two copies of one register, the one to keep: the higher `rev`, then the newer. */
export function newer(a: Register, b: Register): Register {
  if (a.rev !== b.rev) return a.rev > b.rev ? a : b
  return a.updatedAt >= b.updatedAt ? a : b
}

// --- The export: one markdown file per bookmark ------------------------------------

/** The export's own format version, independent of the register's: 2 since the note became an Obsidian note (lists, aliases, derived tags; unit 9). */
export const EXPORT_VERSION = 2

/**
 * Every record on a message, on any list, a letter's (tier `mark`) left out: what the message's
 * note describes. With `place`, only the records at that place (a tool call's records, not its
 * reply's: the search-pane-and-links design, 2026-10-26); without it, every place on the message.
 */
export function recordsOn(reg: Register, uuid: string, place?: PlaceOf): AnchorRecord[] {
  return reg.perma.filter(r => tierOf(r) !== 'mark' && (sameMessage(r.uuid, uuid) || matchesPrefix(r.uuid, uuid)) && (place === undefined || samePlaceOf(r, place)))
}

/** Whether a record sits at a place: the same file and block, absent equal to absent (a message's record has neither). */
export function samePlaceOf(r: PlaceOf, place: PlaceOf): boolean {
  return (r.file ?? '') === (place.file ?? '') && (r.part ?? -1) === (place.part ?? -1)
}

export function exportFileName(uuid: string, place: PlaceOf = {}): string {
  return exportName(uuid, place)
}

/** Everything after this line in an export is the reader's own and survives a rewrite. */
export const EXPORT_NOTES_MARKER = '<!-- notes: everything below this line is kept when the bookmark is rewritten -->'

/** The part of an existing export the person (or Claude) wrote: after the marker. */
export function exportNotesOf(existing: string | undefined): string {
  if (!existing) return ''
  const i = existing.indexOf(EXPORT_NOTES_MARKER)
  if (i < 0) return ''
  // The notes go back under a fresh marker and a fresh `## Notes` heading, so a marker a
  // note quotes and the heading itself are dropped; otherwise every rewrite would add
  // one of each (tester sweep, 2026-10-09).
  return existing
    .slice(i + EXPORT_NOTES_MARKER.length)
    .split(EXPORT_NOTES_MARKER)
    .join('')
    .replace(/^\s*## Notes[ \t]*\n/, '')
    .replace(/^\n+/, '')
    .trimEnd()
}

/**
 * The export's text: front matter with every field, the message, a verify recipe, and a
 * notes section that a rewrite keeps (`notes`, from `exportNotesOf` of the old file).
 * One export per message, an Obsidian note (unit 9): `record` is the message's primary
 * record (core/bookmarks/note.ts), `records` every record on the message, from which come
 * `owners`, the other labels as `aliases` and the derived `bm/tier/*`, `bm/owner/*` tags.
 * `tags` and `aliases` are written as YAML lists, the form Obsidian's properties read and write.
 */
export function exportMarkdown(
  record: AnchorRecord,
  messageText: string,
  opts?: { minted?: string; owners?: AnchorOwner[]; records?: readonly AnchorRecord[]; notes?: string; writer?: string; title?: string; project?: string },
): string {
  const records = opts?.records && opts.records.length > 0 ? opts.records : [record]
  const owners = opts?.records ? noteOwners(record, records) : opts?.owners && opts.owners.length > 0 ? opts.owners : [ownerOf(record)]
  const aliases = aliasesOf(record, records)
  // Every name here is in FRONT_MATTER_PROPERTIES (tests/core/record.test.ts holds the writer to it).
  const fm: [(typeof FRONT_MATTER_PROPERTIES)[number], unknown][] = [
    ['kind', 'bookmark-anchor'],
    ['version', EXPORT_VERSION],
    ['bm-writer', opts?.writer],
    ['session', record.sessionId],
    ['uuid', record.uuid],
    ['n', record.n],
    ['owners', owners.join(', ')],
    ['tier', tierOf(record)],
    ['tags', noteTags(record, records)],
    ['aliases', aliases.length > 0 ? aliases : undefined],
    ['title', opts?.title],
    ['project', opts?.project],
    ['role', record.role],
    ['timestamp', record.timestamp],
    ['transcript', record.transcript],
    ['line', record.line],
    ['bytes', record.bytes ? `${record.bytes[0]}-${record.bytes[1]}` : undefined],
    ['words', record.words],
    ['label', record.label],
    ['why', record.why],
    ['by', record.by],
    ['source', record.source],
    ['shared-from', record.sharedFrom],
    ['temporary', record.temporary ? true : undefined],
    ['created', new Date(record.createdAt).toISOString()],
  ]
  const lines = ['---']
  for (const [k, v] of fm) {
    // A list as a YAML block list (what Obsidian writes back); an empty list, like an empty scalar, is no property.
    if (Array.isArray(v)) {
      if (v.length === 0) continue
      lines.push(`${k}:`)
      for (const item of v) lines.push(`  - ${yamlScalar(item)}`)
    } else if (v !== undefined && v !== '') lines.push(`${k}: ${yamlScalar(v)}`)
  }
  lines.push('---', '')
  lines.push(`# ${record.label}`, '')
  if (record.why) lines.push(record.why, '')
  const who = record.role === 'assistant' ? 'Claude' : 'the person'
  // No editor opens a markdown file at a position from the outside (Typora refuses a
  // `#heading` on its command line, 2026-10-09), so the words are made findable instead:
  // bold inside the quote, and for a long message a link to a heading just above them
  // that Typora follows within the document.
  const quoted = record.words && messageText.includes(record.words)
    ? messageText.replace(record.words, () => `**${record.words}**`) // a function: `$&` in the words stays literal
    : messageText
  const long = messageText.length > 1500
  if (long && record.words) lines.push(`[jump to the bookmarked words](#the-bookmarked-words)`, '')
  lines.push(`## The message (${who}${record.timestamp ? `, ${record.timestamp}` : ''})`, '')
  if (long && record.words) {
    // Split the quote at the words' paragraph so a heading can sit right above it.
    const at = quoted.indexOf(`**${record.words}**`)
    const cut = at < 0 ? 0 : Math.max(0, quoted.lastIndexOf('\n', at) + 1)
    for (const l of quoted.slice(0, cut).split('\n')) if (cut > 0) lines.push(l ? `> ${l}` : '>')
    lines.push('', '### The bookmarked words', '')
    for (const l of quoted.slice(cut).split('\n')) lines.push(l ? `> ${l}` : '>')
  } else {
    for (const l of quoted.split('\n')) lines.push(l ? `> ${l}` : '>')
  }
  lines.push('')
  if (record.line !== undefined && record.bytes) {
    lines.push('## Verify by hand', '', '```sh')
    lines.push(`F=$(ls ~/.claude/projects/*/${record.sessionId}.jsonl)`)
    lines.push(`sed -n '${record.line}p' "$F" | jq -r .uuid        # ${record.uuid}`)
    lines.push(`head -n ${record.line - 1} "$F" | wc -c                 # ${record.bytes[0]}`)
    lines.push('```', '')
  }
  if (opts?.minted) lines.push(`*Minted ${opts.minted}.*`, '')
  lines.push(EXPORT_NOTES_MARKER, '')
  lines.push('## Notes', '')
  // The marker is the writer's: one a note carries would make the next read-back
  // start too early, so it never goes into the notes section.
  const notes = opts?.notes?.split(EXPORT_NOTES_MARKER).join('').trim()
  lines.push(notes ? notes : '_Add notes, links or context here; they stay when the bookmark is relabelled._', '')
  return lines.join('\n')
}

function yamlScalar(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  const s = String(v)
  // Quote anything YAML would misread: colons followed by space, leading symbols, quotes.
  return /[:#'"\n]|^[\s\-?&*!|>%@`[\]{}]|^$/.test(s) ? JSON.stringify(s) : s
}

/**
 * The front matter of a note: the YAML subset the writer emits and Obsidian's properties
 * editor writes back -- `key: scalar`, a block list (`key:` then `  - item` lines), a flow
 * list (`key: [a, b]`), double-quoted scalars as JSON, single-quoted ones as YAML writes them.
 * Anything else on a line is kept as written; nothing nested deeper is read (the register,
 * not the note, is the record).
 */
export function parseFrontMatter(text: string): Record<string, string | string[]> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const out: Record<string, string | string[]> = {}
  if (!m) return out
  let list: string[] | undefined
  for (const line of m[1]!.split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (list && item) {
      list.push(yamlValue(item[1]!))
      continue
    }
    list = undefined
    const i = line.indexOf(':')
    if (i <= 0) continue
    const k = line.slice(0, i).trim()
    if (!k || /\s/.test(k)) continue
    const v = line.slice(i + 1).trim()
    if (v === '') {
      // A block list follows (or the property is empty, which reads as an empty list).
      list = []
      out[k] = list
    } else if (v.startsWith('[') && v.endsWith(']')) {
      out[k] = splitFlow(v.slice(1, -1)).map(yamlValue).filter(s => s !== '')
    } else out[k] = yamlValue(v)
  }
  return out
}

/** A flow list's items: split on commas outside quotes (`[one, "two, too"]` is two items). */
function splitFlow(inner: string): string[] {
  const items: string[] = []
  let cur = ''
  let quote: '"' | "'" | undefined
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!
    if (quote) {
      cur += c
      if (c === '\\' && quote === '"' && i + 1 < inner.length) cur += inner[++i]
      else if (c === quote) quote = undefined
    } else if (c === '"' || c === "'") {
      quote = c
      cur += c
    } else if (c === ',') {
      items.push(cur.trim())
      cur = ''
    } else cur += c
  }
  items.push(cur.trim())
  return items
}

function yamlValue(v: string): string {
  if (v.startsWith('"')) {
    try {
      return String(JSON.parse(v))
    } catch {
      return v // keep as written
    }
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'")
  return v
}
