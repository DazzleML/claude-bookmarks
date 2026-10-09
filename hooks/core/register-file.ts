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

import { type AnchorOwner, type AnchorRecord, ownerOf, uuid8 } from './anchor.ts'

export const REGISTER_VERSION = 1

/** What is left when a record goes: pruned (temporary, aged out) or removed (on request). */
export type Tombstone = { uuid: string; owner?: AnchorOwner; label?: string; prunedAt?: number; removedAt?: number; removedBy?: string }

export type Register = {
  version: number
  sessionId: string
  /** Where Claude Code kept its config when the file was written (never used to find anything). */
  configDir?: string
  cwd?: string
  /** Bumped on every write; the higher wins when two copies meet (#6). */
  rev: number
  updatedAt: number
  writer: string
  perma: AnchorRecord[]
  tombstones: Tombstone[]
}

export function emptyRegister(sessionId: string, writer: string, now: number, env?: { configDir?: string; cwd?: string }): Register {
  return { version: REGISTER_VERSION, sessionId, ...(env ?? {}), rev: 0, updatedAt: now, writer, perma: [], tombstones: [] }
}

/** What a mint supplies; the register fills the rest. */
export type Mint = {
  uuid: string
  /** Whose list: the person's or Claude's. */
  owner: AnchorOwner
  sharedFrom?: AnchorOwner
  label: string
  why?: string
  words?: string
  temporary?: boolean
  line?: number
  bytes?: [number, number]
  head: string
  by: AnchorRecord['by']
  source: AnchorRecord['source']
  transcript?: string
  role?: 'user' | 'assistant'
  timestamp?: string
}

export type AddResult = { register: Register; record: AnchorRecord; added: boolean }

/**
 * Adds a bookmark for a message to one owner's list, or relabels the one that exists
 * there. Never removes. A record is found by uuid (full match, or either side an 8+
 * prefix of the other) within the owner's list: the two lists may hold the same message.
 */
export function addOrRelabel(reg: Register, mint: Mint, now: number): AddResult {
  const existing = reg.perma.find(r => ownerOf(r) === mint.owner && sameUuid(r.uuid, mint.uuid))
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
      updatedAt: now,
      transcript: mint.transcript ?? existing.transcript,
    }
    if (record.temporary === undefined) delete record.temporary
    return { register: bump({ ...reg, perma: reg.perma.map(r => (r === existing ? record : r)) }, now), record, added: false }
  }
  const record: AnchorRecord = {
    sessionId: reg.sessionId,
    uuid: mint.uuid,
    owner: mint.owner,
    ...(mint.sharedFrom ? { sharedFrom: mint.sharedFrom } : {}),
    ...(mint.line !== undefined ? { line: mint.line } : {}),
    ...(mint.bytes ? { bytes: mint.bytes } : {}),
    ...(mint.words ? { words: mint.words } : {}),
    head: mint.head,
    label: mint.label,
    ...(mint.why ? { why: mint.why } : {}),
    ...(mint.temporary ? { temporary: true } : {}),
    createdAt: now,
    by: mint.by,
    source: mint.source,
    ...(mint.transcript ? { transcript: mint.transcript } : {}),
    ...(mint.role ? { role: mint.role } : {}),
    ...(mint.timestamp ? { timestamp: mint.timestamp } : {}),
  }
  return { register: bump({ ...reg, perma: [...reg.perma, record] }, now), record, added: true }
}

export function sameUuid(a: string, b: string): boolean {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short.length >= 8 && long.startsWith(short)
}

/** The record for a message on one list, or on any list when `owner` is left out. */
export function findRecord(reg: Register, uuid: string, owner?: AnchorOwner): AnchorRecord | undefined {
  return reg.perma.find(r => (owner === undefined || ownerOf(r) === owner) && sameUuid(r.uuid, uuid))
}

/** One owner's list, in minted order. */
export function listOf(reg: Register, owner: AnchorOwner): AnchorRecord[] {
  return reg.perma.filter(r => ownerOf(r) === owner).sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * Copies one of Claude's bookmarks onto the person's list (or the other way): same
 * message, label, why and words; `sharedFrom` names where it came from. The original
 * stays. A copy that already exists is relabelled from the source.
 */
export function share(reg: Register, uuid: string, from: AnchorOwner, to: AnchorOwner, now: number): AddResult | { error: string } {
  const src = findRecord(reg, uuid, from)
  if (!src) return { error: `no bookmark ${uuid8(uuid)} on ${from === 'claude' ? "Claude's" : "the person's"} list` }
  return addOrRelabel(
    reg,
    {
      uuid: src.uuid,
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
 * Removes a bookmark from one list, on request: the record leaves `perma` and a tombstone
 * says who removed it and when. Nothing is deleted from the file's history of events.
 */
export function remove(reg: Register, uuid: string, owner: AnchorOwner, removedBy: string, now: number): { register: Register; removed: AnchorRecord } | { error: string } {
  const rec = findRecord(reg, uuid, owner)
  if (!rec) return { error: `no bookmark ${uuid8(uuid)} on ${owner === 'claude' ? "Claude's" : "the person's"} list` }
  const tomb: Tombstone = { uuid: rec.uuid, owner, label: rec.label, removedAt: now, removedBy }
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
  const tombstones = [...reg.tombstones, ...pruned.map(r => ({ uuid: r.uuid, owner: ownerOf(r), label: r.label, prunedAt: now }))]
  return { register: bump({ ...reg, perma: keep, tombstones }, now), pruned }
}

function bump(reg: Register, now: number): Register {
  return { ...reg, rev: reg.rev + 1, updatedAt: now }
}

// Fixed key order, so a hand edit and a program write diff cleanly.
const REGISTER_KEYS = ['version', 'sessionId', 'configDir', 'cwd', 'rev', 'updatedAt', 'writer', 'perma', 'tombstones'] as const
const RECORD_KEYS = [
  'sessionId', 'uuid', 'owner', 'label', 'why', 'words', 'head', 'line', 'bytes', 'role', 'timestamp',
  'temporary', 'createdAt', 'updatedAt', 'by', 'source', 'sharedFrom', 'transcript',
] as const

export function serializeRegister(reg: Register): string {
  const ordered: Record<string, unknown> = {}
  for (const k of REGISTER_KEYS) {
    if (k === 'perma') ordered.perma = reg.perma.map(orderRecord)
    else if ((reg as Record<string, unknown>)[k] !== undefined) ordered[k] = (reg as Record<string, unknown>)[k]
  }
  return JSON.stringify(ordered, null, 2) + '\n'
}

function orderRecord(r: AnchorRecord): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  for (const k of RECORD_KEYS) if ((r as Record<string, unknown>)[k] !== undefined) o[k] = (r as Record<string, unknown>)[k]
  return o
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
  return {
    version: typeof o.version === 'number' ? o.version : REGISTER_VERSION,
    sessionId: o.sessionId,
    ...(typeof o.configDir === 'string' ? { configDir: o.configDir } : {}),
    ...(typeof o.cwd === 'string' ? { cwd: o.cwd } : {}),
    rev: typeof o.rev === 'number' ? o.rev : 0,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
    writer: typeof o.writer === 'string' ? o.writer : '?',
    perma: o.perma.filter((r: any) => r && typeof r.uuid === 'string' && typeof r.label === 'string'),
    tombstones: Array.isArray(o.tombstones) ? o.tombstones : [],
  }
}

/** Of two copies of one register, the one to keep: the higher `rev`, then the newer. */
export function newer(a: Register, b: Register): Register {
  if (a.rev !== b.rev) return a.rev > b.rev ? a : b
  return a.updatedAt >= b.updatedAt ? a : b
}

// --- The export: one markdown file per bookmark ------------------------------------

export function exportFileName(uuid: string): string {
  return `${uuid8(uuid)}.md`
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
 * One export per message; `owners` lists every list the message is on.
 */
export function exportMarkdown(
  record: AnchorRecord,
  messageText: string,
  opts?: { minted?: string; owners?: AnchorOwner[]; notes?: string },
): string {
  const owners = opts?.owners && opts.owners.length > 0 ? opts.owners : [ownerOf(record)]
  const fm: [string, unknown][] = [
    ['kind', 'bookmark-anchor'],
    ['version', REGISTER_VERSION],
    ['session', record.sessionId],
    ['uuid', record.uuid],
    ['owners', owners.join(', ')],
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
  for (const [k, v] of fm) if (v !== undefined && v !== '') lines.push(`${k}: ${yamlScalar(v)}`)
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

/** The front matter of an export, as flat strings (enough to recover `words` and the position). */
export function parseFrontMatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  const out: Record<string, string> = {}
  if (!m) return out
  for (const line of m[1]!.split('\n')) {
    const i = line.indexOf(': ')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 2).trim()
    if (v.startsWith('"')) {
      try {
        v = JSON.parse(v)
      } catch {
        // keep as written
      }
    }
    out[k] = v
  }
  return out
}
