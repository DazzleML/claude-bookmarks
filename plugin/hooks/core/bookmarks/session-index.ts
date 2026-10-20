// The index of every conversation with bookmarks (unit 10 of the record-format goal; the
// data design's "findable without renames"): `sessions/index.json`, one entry per register
// with its records, and `sessions/INDEX.md`, the same as an Obsidian map a person opens --
// a heading per conversation, a line per bookmark linking its note. Both are generated:
// an upsert of the conversation's entry after every save, a rebuild from every register at
// a session's start (which also heals a missing or stale index). Edits to either file are
// overwritten; the register is the record, the index a view of it.
//
// Pure: no I/O. The handler (handlers/bookmarks.ts refreshIndex, rebuildIndex) lists the
// folders, reads the registers and writes the two files.

import { ownerOf, tierOf, uuid8, type AnchorOwner, type AnchorTier } from './anchor.ts'
import type { Register } from './register-file.ts'

export const INDEX_VERSION = 1
export const INDEX_JSON = 'index.json'
export const INDEX_MD = 'INDEX.md'

/** One bookmark as the index knows it: enough to list and link it, never the message text. */
export type IndexRecord = {
  n?: number
  uuid8: string
  label: string
  owner: AnchorOwner
  tier: AnchorTier
  /** Whether the record's note (`<sid>/<uuid8>.md`) exists, so the map links only what opens. */
  note: boolean
  createdAt: number
}

export type IndexEntry = {
  sessionId: string
  title?: string
  project?: string
  rev: number
  updatedAt: number
  records: IndexRecord[]
}

export type SessionIndex = {
  version: number
  generatedAt: number
  writer: string
  sessions: IndexEntry[]
}

const INDEX_KEYS = ['version', 'generatedAt', 'writer', 'sessions'] as const
const ENTRY_KEYS = ['sessionId', 'title', 'project', 'rev', 'updatedAt', 'records'] as const

export function emptyIndex(writer: string, now: number): SessionIndex {
  return { version: INDEX_VERSION, generatedAt: now, writer, sessions: [] }
}

/**
 * A register's entry. `notes` holds the uuid8 of every note file in the conversation's folder.
 * A letter's mark is not a bookmark and is left out; the records come in number order.
 */
export function entryOf(reg: Register, notes: ReadonlySet<string>): IndexEntry {
  const records: IndexRecord[] = reg.perma
    .filter(r => tierOf(r) !== 'mark')
    .map(r => ({
      ...(r.n !== undefined ? { n: r.n } : {}),
      uuid8: uuid8(r.uuid),
      label: r.label,
      owner: ownerOf(r),
      tier: tierOf(r),
      note: notes.has(uuid8(r.uuid)),
      createdAt: r.createdAt,
    }))
    .sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity) || a.createdAt - b.createdAt)
  return {
    sessionId: reg.sessionId,
    ...(reg.title ? { title: reg.title } : {}),
    ...(reg.project ? { project: reg.project } : {}),
    rev: reg.rev,
    updatedAt: reg.updatedAt,
    records,
  }
}

/**
 * The index with `entry` in place of the conversation's old entry (or added); a conversation
 * with no bookmark left is dropped. Newest first (`updatedAt`, then the id, so the order is
 * stable). `generatedAt` and `writer` are this write's.
 */
export function upsert(index: SessionIndex, entry: IndexEntry, writer: string, now: number): SessionIndex {
  const rest = index.sessions.filter(e => e.sessionId !== entry.sessionId)
  const sessions = entry.records.length > 0 ? [...rest, entry] : rest
  return { ...index, version: INDEX_VERSION, generatedAt: now, writer, sessions: sortEntries(sessions) }
}

/** The index built whole from every register (a session's start). */
export function buildIndex(entries: readonly IndexEntry[], writer: string, now: number): SessionIndex {
  return { version: INDEX_VERSION, generatedAt: now, writer, sessions: sortEntries(entries.filter(e => e.records.length > 0)) }
}

function sortEntries(entries: readonly IndexEntry[]): IndexEntry[] {
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt || (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0))
}

export function serializeIndex(index: SessionIndex): string {
  const o: Record<string, unknown> = {}
  for (const k of INDEX_KEYS) if (k === 'sessions') o.sessions = index.sessions.map(orderEntry)
  else o[k] = (index as Record<string, unknown>)[k]
  keep(o, index, INDEX_KEYS)
  return JSON.stringify(o, null, 2) + '\n'
}

function orderEntry(e: IndexEntry): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  for (const k of ENTRY_KEYS) if ((e as Record<string, unknown>)[k] !== undefined) o[k] = (e as Record<string, unknown>)[k]
  keep(o, e, ENTRY_KEYS)
  return o
}

/** A newer build's keys ride through this one, at both levels (the register's rule, unit 1). */
function keep(onto: Record<string, unknown>, from: object, known: readonly string[]) {
  for (const [k, v] of Object.entries(from)) if (!known.includes(k) && v !== undefined) onto[k] = v
}

/** The index file's text read back; undefined when it is not one (the handler then starts empty). */
export function parseIndex(text: string): SessionIndex | undefined {
  let o: any
  try {
    o = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!o || typeof o !== 'object' || !Array.isArray(o.sessions)) return undefined
  const sessions: IndexEntry[] = o.sessions
    .filter((e: any) => e && typeof e.sessionId === 'string' && Array.isArray(e.records))
    .map((e: any) => ({ ...e, rev: typeof e.rev === 'number' ? e.rev : 0, updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : 0 }))
  const index: SessionIndex = {
    ...o,
    version: typeof o.version === 'number' ? o.version : INDEX_VERSION,
    generatedAt: typeof o.generatedAt === 'number' ? o.generatedAt : 0,
    writer: typeof o.writer === 'string' ? o.writer : '?',
    sessions,
  }
  return index
}

/**
 * `INDEX.md`: a map of every conversation with bookmarks, newest first, for Obsidian or any
 * Markdown viewer. Each bookmark links its note by a relative path (`<sid>/<uuid8>.md`, the
 * file beside this one) when the note exists, and is plain text when it does not.
 */
export function renderIndexMarkdown(index: SessionIndex): string {
  const lines = [
    '---',
    'kind: bookmarks-index',
    `version: ${index.version}`,
    `generated: ${new Date(index.generatedAt).toISOString()}`,
    `conversations: ${index.sessions.length}`,
    '---',
    '',
    '# Bookmarks',
    '',
    `${index.sessions.length} conversation${index.sessions.length === 1 ? '' : 's'} with bookmarks, newest first. Generated by ${index.writer} from the bookmark files beside it; what is written here is overwritten on the next save.`,
    '',
  ]
  for (const e of index.sessions) {
    const name = e.title ? e.title : e.sessionId.slice(0, 8)
    lines.push(`## ${mdText(name)}${e.project ? ` -- ${mdText(e.project)}` : ''}`, '')
    lines.push(`\`${e.sessionId}\` · updated ${new Date(e.updatedAt).toISOString().slice(0, 10)} · ${e.records.length} bookmark${e.records.length === 1 ? '' : 's'}`, '')
    for (const r of e.records) {
      const num = r.n !== undefined ? `#${r.n} ` : ''
      const who = r.owner === 'user' ? 'yours' : r.owner === 'claude' ? "Claude's" : r.owner
      const label = r.note ? `[${mdText(r.label)}](${e.sessionId}/${r.uuid8}.md)` : mdText(r.label)
      lines.push(`- ${num}${label} · ${who} · ${r.tier}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** A label as Markdown text: square brackets and a leading `#` would read as syntax. */
const mdText = (s: string) => s.replace(/[[\]]/g, m => `\\${m}`).replace(/^#/, '\\#')
