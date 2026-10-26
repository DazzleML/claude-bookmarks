// Reading a whole conversation into places (the 0.7 groundwork design, 2026-10-25, unit 3).
//
// A conversation is more than its transcript: each agent's conversation is a file of its own
// (`<session>/subagents/agent-<id>.jsonl`, with a `.meta.json` naming its type), outputs too
// large for the transcript are files (`<session>/tool-results/*.txt`), and a conversation can
// continue in another session's file (a `continued-in` row). Measured on one conversation:
// 34.5 MB of searchable text in the transcript and 13.7 MB in 102 agent files, with tool rows
// about 70% of it.
//
// So the text is not held in memory. This module is fed each file's chunks in order (the
// engine returns at most 4 MiB per program run), classifies every record into places
// (core/places/place.ts), keeps a compact row per place in memory -- its address, kind,
// attributes and a short head -- and writes the text in pieces of PIECE_BYTES that a search
// streams (measured: a full pass over 48.9 MB of pieces in about 0.3 s). Each file keeps its
// own watermark, the byte after its last complete line, so a later pass resumes where this
// one stopped instead of reading the file again.
//
// Pure: the handler (handlers/places.ts) reads the files, writes the sealed pieces and saves
// the index this module serializes.
import { classifyRecord, type Place, type PlaceAddress, type RowContext } from './place.ts'
import { utf8Bytes } from '../prompts/text-store.ts'

/** Bytes of text per piece: under the 4 MiB a single read takes, with room for the JSON. */
export const PIECE_BYTES = 3_500_000
/** The longest line carried across chunks; past it the line is dropped and counted (as the loader does). */
export const CARRY_CAP = 8 * 1024 * 1024
/** How much of a place's text its row keeps for drawing a list. */
export const HEAD_CHARS = 160
export const PLACE_INDEX_VERSION = 1

/** One place, without its text: what a list draws and a search narrows by. The text is in piece `piece`. */
export type IndexedPlace = Omit<Place, 'text'> & { head: string; piece: number; bytes: number }

/** One file of the conversation as the reader stands in it. */
export type FileCursor = {
  /** The file's part of a place's address: '' for the main transcript, `agent:<id>`, or `tool-result:<name>`. */
  key: string
  path: string
  ctx: RowContext
  /** Bytes consumed up to the last complete line: where a resumed pass starts. */
  bytes: number
  line: number
  carry: string
  dropping: boolean
  done: boolean
}

export type PlaceIndex = {
  session: string
  rows: IndexedPlace[]
  byKey: Map<string, number>
  skipped: Record<string, number>
  unparsed: number
  dropped: number
  /** The piece being filled, and the pieces sealed since the handler last took them. */
  open: { n: number; lines: string[]; bytes: number }
  sealed: { n: number; text: string }[]
  /** Sessions this conversation continues in (`continued-in` rows), in the order seen. */
  continuedIn: string[]
}

export function newPlaceIndex(session: string): PlaceIndex {
  return { session, rows: [], byKey: new Map(), skipped: {}, unparsed: 0, dropped: 0, open: { n: 0, lines: [], bytes: 0 }, sealed: [], continuedIn: [] }
}

export function newCursor(key: string, path: string, ctx: RowContext): FileCursor {
  return { key, path, ctx, bytes: 0, line: 0, carry: '', dropping: false, done: false }
}

/** A place's key in the index: file, uuid and part, so one uuid in two files (a fork) is two places. */
export const placeKey = (at: PlaceAddress): string => `${at.file ?? ''}|${at.uuid}|${at.part ?? 0}`

const headOf = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, HEAD_CHARS)

/** Keep one place: its row in memory, its text in the open piece. A place already kept is left as it is. */
export function addPlace(idx: PlaceIndex, p: Place): boolean {
  const key = placeKey(p.at)
  if (idx.byKey.has(key)) return false
  const { text, ...rest } = p
  const line = JSON.stringify({ k: key, t: text })
  const size = utf8Bytes(line) + 1
  if (idx.open.bytes > 0 && idx.open.bytes + size > PIECE_BYTES) seal(idx)
  idx.open.lines.push(line)
  idx.open.bytes += size
  idx.byKey.set(key, idx.rows.length)
  idx.rows.push({ ...rest, head: headOf(text), piece: idx.open.n, bytes: utf8Bytes(text) })
  return true
}

/** Close the open piece, so the handler can write it; a new one opens after it. */
export function seal(idx: PlaceIndex): void {
  if (idx.open.lines.length === 0) return
  idx.sealed.push({ n: idx.open.n, text: idx.open.lines.join('\n') })
  idx.open = { n: idx.open.n + 1, lines: [], bytes: 0 }
}

/** The pieces sealed since the last call, for the handler to write; they leave memory here. */
export function takeSealed(idx: PlaceIndex): { n: number; text: string }[] {
  const out = idx.sealed
  idx.sealed = []
  return out
}

function takeLine(idx: PlaceIndex, cur: FileCursor, raw: string, newline: boolean): void {
  const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
  cur.line += 1
  cur.bytes += utf8Bytes(raw) + (newline ? 1 : 0)
  if (!line.trim()) return
  let o: any
  try {
    o = JSON.parse(line)
  } catch {
    idx.unparsed += 1
    return
  }
  if (o?.type === 'continued-in' && typeof o.continuedInSessionId === 'string') {
    if (!idx.continuedIn.includes(o.continuedInSessionId)) idx.continuedIn.push(o.continuedInSessionId)
  }
  const c = classifyRecord(o, cur.ctx)
  if ('skipped' in c) {
    idx.skipped[c.skipped] = (idx.skipped[c.skipped] ?? 0) + 1
    return
  }
  for (const p of c.places) addPlace(idx, p)
}

/**
 * Feed a file's next chunk, in order. `done` says the file ended with this chunk, so a last
 * line without a newline is taken too. A partial line is carried to the next call; one longer
 * than `carryCap` is dropped and counted, its bytes still advancing the watermark.
 */
export function feedFile(idx: PlaceIndex, cur: FileCursor, chunk: string, done = false, carryCap = CARRY_CAP): void {
  const parts = (cur.carry + chunk).split('\n')
  const last = parts.pop() ?? ''
  for (const p of parts) {
    if (cur.dropping) {
      cur.bytes += utf8Bytes(p) + 1
      cur.line += 1
      cur.dropping = false
      continue
    }
    takeLine(idx, cur, p, true)
  }
  if (cur.dropping) {
    cur.bytes += utf8Bytes(last)
    cur.carry = ''
  } else if (last.length > carryCap) {
    idx.dropped += 1
    cur.bytes += utf8Bytes(last)
    cur.carry = ''
    cur.dropping = true
  } else {
    cur.carry = last
  }
  if (done) {
    if (cur.dropping) {
      cur.line += 1
      cur.dropping = false
    } else if (cur.carry) {
      takeLine(idx, cur, cur.carry, false)
    }
    cur.carry = ''
    cur.done = true
  }
}

/** A stored tool output (`tool-results/<name>`): one place, addressed by the file's name, since the file has no uuid. */
export function addToolResultFile(idx: PlaceIndex, name: string, text: string, timestamp?: string): boolean {
  return addPlace(idx, { at: { session: idx.session, uuid: name, file: `tool-result:${name}` }, kind: 'tool-result', author: 'tool', text, ...(timestamp ? { timestamp } : {}) })
}

/** The files of a conversation besides its transcript, from the listings of `<session>/subagents` and `<session>/tool-results`: agents' files with their meta paths, and the stored outputs. */
export function conversationFiles(sessionDir: string, agentsListing: readonly { name: string; kind: string }[], resultsListing: readonly { name: string; kind: string }[]): { agents: { id: string; path: string; meta: string }[]; results: { name: string; path: string }[] } {
  const dir = sessionDir.replace(/\\/g, '/').replace(/\/$/, '')
  const agents = agentsListing
    .filter(e => e.kind === 'file' && /^agent-[^/]+\.jsonl$/.test(e.name))
    .map(e => {
      const id = e.name.slice('agent-'.length, -'.jsonl'.length)
      return { id, path: `${dir}/subagents/${e.name}`, meta: `${dir}/subagents/agent-${id}.meta.json` }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  const results = resultsListing
    .filter(e => e.kind === 'file')
    .map(e => ({ name: e.name, path: `${dir}/tool-results/${e.name}` }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { agents, results }
}

/** An agent's type from its `.meta.json` (`agentType`), or undefined when the file is missing or unreadable. */
export function agentTypeOf(metaText: string | undefined): string | undefined {
  return agentMetaOf(metaText).type
}

/** What an agent's `.meta.json` says: its type, and the id of the Agent call that started it (`toolUseId`); either may be absent. */
export function agentMetaOf(metaText: string | undefined): { type?: string; call?: string } {
  if (!metaText) return {}
  try {
    const m = JSON.parse(metaText)
    return {
      ...(typeof m?.agentType === 'string' && m.agentType ? { type: m.agentType } : {}),
      ...(typeof m?.toolUseId === 'string' && m.toolUseId ? { call: m.toolUseId } : {}),
    }
  } catch {
    return {}
  }
}

/** What a pass leaves on disk to resume from: each file's watermark, and the rows in pieces. */
export type SavedIndex = {
  version: number
  session: string
  files: Record<string, { path: string; bytes: number; line: number; done: boolean }>
  rowPieces: number
  /** The piece of text that was open when saved, and how many lines it held. */
  open: { n: number; lines: number }
}

/** The index as files: a header, then the rows as JSON lines in pieces under PIECE_BYTES. */
export function serializePlaceIndex(idx: PlaceIndex, cursors: readonly FileCursor[]): string[] {
  const pieces: string[] = []
  let cur: string[] = []
  let size = 0
  for (const r of idx.rows) {
    const line = JSON.stringify(r)
    const n = utf8Bytes(line) + 1
    if (size > 0 && size + n > PIECE_BYTES) {
      pieces.push(cur.join('\n'))
      cur = []
      size = 0
    }
    cur.push(line)
    size += n
  }
  if (cur.length) pieces.push(cur.join('\n'))
  const files: SavedIndex['files'] = {}
  for (const c of cursors) files[c.key] = { path: c.path, bytes: c.bytes, line: c.line, done: c.done }
  const header: SavedIndex = { version: PLACE_INDEX_VERSION, session: idx.session, files, rowPieces: pieces.length, open: { n: idx.open.n, lines: idx.open.lines.length } }
  return [JSON.stringify(header), ...pieces]
}

/** A saved index read back, or why it cannot be used (another conversation, another version, a missing piece). The open piece's text is passed in so the next places append to it. */
export function parsePlaceIndex(header: string | undefined, rowPieces: readonly (string | undefined)[], openPieceText: string | undefined, session: string): { kind: 'ok'; idx: PlaceIndex; saved: SavedIndex } | { kind: 'rebuild'; why: string } {
  if (!header) return { kind: 'rebuild', why: 'no index' }
  let saved: SavedIndex
  try {
    saved = JSON.parse(header)
  } catch {
    return { kind: 'rebuild', why: 'the header is not JSON' }
  }
  if (saved.version !== PLACE_INDEX_VERSION) return { kind: 'rebuild', why: `version ${saved.version}, this build reads ${PLACE_INDEX_VERSION}` }
  if (saved.session !== session) return { kind: 'rebuild', why: 'another conversation' }
  if (rowPieces.length !== saved.rowPieces || rowPieces.some(p => p === undefined)) return { kind: 'rebuild', why: 'a piece of the rows is missing' }
  const idx = newPlaceIndex(session)
  try {
    for (const piece of rowPieces) for (const line of piece!.split('\n')) if (line) {
      const r: IndexedPlace = JSON.parse(line)
      idx.byKey.set(placeKey(r.at), idx.rows.length)
      idx.rows.push(r)
    }
  } catch {
    return { kind: 'rebuild', why: 'a row is not JSON' }
  }
  const openLines = openPieceText ? openPieceText.split('\n').filter(Boolean) : []
  if (openLines.length < saved.open.lines) return { kind: 'rebuild', why: 'the open piece of text is shorter than the index says' }
  idx.open = { n: saved.open.n, lines: openLines.slice(0, saved.open.lines), bytes: openLines.slice(0, saved.open.lines).reduce((s, l) => s + utf8Bytes(l) + 1, 0) }
  return { kind: 'ok', idx, saved }
}

/** One line for /bm-env and the log. */
export function placesLine(idx: PlaceIndex, files: number, ms: number, running: boolean): string {
  const skipped = Object.values(idx.skipped).reduce((s, n) => s + n, 0)
  return `places: ${idx.rows.length} places from ${files} file(s), ${skipped} bookkeeping line(s) skipped, ${idx.open.n + (idx.open.lines.length ? 1 : 0)} piece(s) of text, ${ms} ms, ${running ? 'running' : 'done'}${idx.dropped ? `; ${idx.dropped} line(s) over the carry cap` : ''}${idx.unparsed ? `; ${idx.unparsed} not JSON` : ''}`
}
