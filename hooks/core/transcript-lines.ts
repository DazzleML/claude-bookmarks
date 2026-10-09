// Transcript lines: turning `grep -bn` output over a session's JSONL into message rows
// with their line number and byte range, and picking the row a fragment or uuid names.
//
// Pure: the shell pass that produces the grep output lives in the mod (it needs
// `$.process.run`); everything here runs under `node --test`.
//
// Each transcript line is one JSON object. Only `user` and `assistant` rows that carry
// message text count as places; `last-prompt`, `system`, meta and sidechain rows, and
// tool results, are bookkeeping. A fragment usually matches many lines (a later message
// quoting it, the `last-prompt` rows); the earliest real row is where it was said.

import { utf8ByteLength } from './anchor.ts'

export type TranscriptRow = {
  /** 1-based line in the file, as `grep -n` counts. */
  line: number
  /** Byte offset of the line's first byte, and of the byte after its last (the newline). */
  byteStart: number
  byteEnd: number
  uuid: string
  role: 'user' | 'assistant'
  text: string
  timestamp?: string
}

export type GrepLine = { line: number; byteStart: number; json: string }

/** One `grep -bn` output line: `<line>:<byteoffset>:<text>`. */
export function parseGrepLine(s: string): GrepLine | undefined {
  // A trailing CR is the process runner's line ending on Windows, not the file's
  // (the transcript has none): it must not count toward the line's bytes.
  const m = /^(\d+):(\d+):(.*?)\r?$/s.exec(s)
  if (!m) return undefined
  return { line: Number(m[1]), byteStart: Number(m[2]), json: m[3]! }
}

/** The text a person or the model wrote in a row; undefined for everything else. */
export function messageTextOf(o: any): { role: 'user' | 'assistant'; text: string } | undefined {
  if (!o || o.isMeta || o.isSidechain) return undefined
  // A message typed while Claude was working is not a `user` row: it is an `attachment`
  // row of type `queued_command`, drawn as a user message, with the text in `prompt`
  // (seen 2026-10-09; the `user` rows around it hold only that turn's tool results).
  if (o.type === 'attachment') {
    const a = o.attachment
    if (a?.type === 'queued_command' && typeof a.prompt === 'string' && a.prompt.trim()) return { role: 'user', text: a.prompt }
    return undefined
  }
  if (o.type !== 'user' && o.type !== 'assistant') return undefined
  const content = o.message?.content
  if (typeof content === 'string') return content ? { role: o.type, text: content } : undefined
  if (!Array.isArray(content)) return undefined
  // A message typed while Claude was working is stored beside that turn's tool result,
  // in one user row: the text blocks are the message, the tool_result blocks are not.
  const texts = content.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? ''))
  const text = texts.join('\n').trim()
  return text ? { role: o.type, text } : undefined
}

/** A grep line as a message row, or undefined when it is not a message. */
export function rowFromGrepLine(g: GrepLine): TranscriptRow | undefined {
  let o: any
  try {
    o = JSON.parse(g.json)
  } catch {
    return undefined // a line cut off at the output cap
  }
  const m = messageTextOf(o)
  if (!m || typeof o.uuid !== 'string') return undefined
  return {
    line: g.line,
    byteStart: g.byteStart,
    byteEnd: g.byteStart + utf8ByteLength(g.json),
    uuid: o.uuid,
    role: m.role,
    text: m.text,
    ...(typeof o.timestamp === 'string' ? { timestamp: o.timestamp } : {}),
  }
}

/** Every message row in a grep output, in file order. */
export function rowsFromGrep(output: string): TranscriptRow[] {
  const rows: TranscriptRow[] = []
  for (const s of output.split('\n')) {
    if (!s.trim()) continue
    const g = parseGrepLine(s)
    const r = g && rowFromGrepLine(g)
    if (r) rows.push(r)
  }
  return rows.sort((a, b) => a.line - b.line)
}

export type Resolution =
  | { kind: 'one'; row: TranscriptRow }
  | { kind: 'many'; rows: TranscriptRow[]; earliest: TranscriptRow }
  | { kind: 'none' }

/**
 * The row a request names, from the rows a grep returned.
 * - by `uuid`: the row with that uuid (a prefix of 8+ characters is accepted);
 * - by `fragment`: rows whose text contains it, earliest first. One match is the answer;
 *   several are returned together with the earliest, so the caller can ask rather than
 *   guess (#19: never jump somewhere wrong).
 */
export function resolveRows(rows: TranscriptRow[], want: { uuid?: string; fragment?: string }): Resolution {
  let hits = rows
  if (want.uuid) {
    const u = want.uuid.toLowerCase()
    hits = hits.filter(r => r.uuid.toLowerCase() === u || (u.length >= 8 && r.uuid.toLowerCase().startsWith(u)))
  }
  if (want.fragment) {
    const f = want.fragment
    hits = hits.filter(r => r.text.includes(f))
  }
  if (hits.length === 0) return { kind: 'none' }
  if (hits.length === 1) return { kind: 'one', row: hits[0]! }
  return { kind: 'many', rows: hits, earliest: hits[0]! }
}

/** The grep pattern for a fragment: as JSON escapes it inside the line. */
export function jsonEscaped(fragment: string): string {
  return JSON.stringify(fragment).slice(1, -1)
}

/** The grep pattern for a uuid. */
export function uuidPattern(uuid: string): string {
  return `"uuid":"${uuid}`
}

/** A short head of a message: one line, 60 characters. */
export const headOf = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, 60)
