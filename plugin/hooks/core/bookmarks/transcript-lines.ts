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
import { forwardSlashes } from '../kit/paths.ts'
import { holdsPlain } from '../kit/fragment.ts'

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
  /**
   * A row found among the places rather than by the loader or a grep (the search-pane-and-links
   * design, 2026-10-26): its file and block when it is not a prompt or a reply, the id it is drawn
   * under, and `line` 0 with no byte range, since the place reader keeps neither.
   */
  file?: string
  part?: number
  drawn?: string
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
 *   guess (#19: never jump somewhere wrong). When no row holds it exactly, the rows that hold
 *   it once Markdown's marks are dropped from both (core/kit/fragment.ts: a quote of
 *   `**bold**` words leaves the stars out).
 */
export function resolveRows(rows: TranscriptRow[], want: { uuid?: string; fragment?: string }): Resolution {
  let hits = rows
  if (want.uuid) {
    const u = want.uuid.toLowerCase()
    hits = hits.filter(r => r.uuid.toLowerCase() === u || (u.length >= 8 && r.uuid.toLowerCase().startsWith(u)))
  }
  if (want.fragment) {
    const f = want.fragment
    const exact = hits.filter(r => r.text.includes(f))
    hits = exact.length > 0 ? exact : hits.filter(r => holdsPlain(r.text, f))
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

/** What the transcript grep looks for when a request names a message: its uuid (full or prefix), else a fragment of its text as the JSON line holds it, else nothing. (register.tsx's resolveTarget chose it inline until U60.) */
export function targetPattern(want: { uuid?: string; fragment?: string }): string | undefined {
  return want.uuid ? uuidPattern(want.uuid) : want.fragment ? jsonEscaped(want.fragment) : undefined
}

/** A message's text as one line: runs of whitespace (newlines included) become one space. A pane row draws this and lets the terminal cut it at the pane's edge (U64). */
export const lineOf = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** A short head of a message: that line, 60 characters. The fallback a row draws when no fuller text is kept. */
export const headOf = (text: string): string => lineOf(text).slice(0, 60)

/** A line fitted to `width` columns: whole when it fits, else cut with an ellipsis as its last character. A pane row is cut this way to the pane's own width (`bodyColumns`, which the engine hands the pane at draw time), so a widened pane shows more and a narrow one never wraps (U64; live, a long Button label wraps and a Text's `truncate-end` inside a Button is not honoured, 2026-10-22). */
export const fitLine = (text: string, width: number): string => fitLines(text, width, 1)

/** A line fitted to `lines` rows of `width` columns (the rowLines setting, U70). The result carries hard lines (`\n`), each at most `width` characters, so the terminal's word wrap can never add a row; continuation lines are indented by `indent` columns to sit under the text (a plain prompts row's number column, the `a: ` the engine draws before a hotkey row). A line breaks at a space when the word straddling its edge would fit on a line of its own (djdarcy, 2026-10-22: "Feel fre / e" is hard to read), and cuts the word when it would not (a long token such as a path or a slug: "if it's not so large that it's effectively never going to properly fit on any line"). The last line is cut hard with an ellipsis as its last character, so `fitLines(t, w, 1)` is the one-line cut of 0.6.10. */
export const fitLines = (text: string, width: number, lines: number, indent = 0): string => {
  if (width <= 0 || lines <= 0) return ''
  const out: string[] = []
  let rest = text
  for (let i = 0; i < lines && rest.length > 0; i++) {
    let line: string
    if (rest.length <= width) {
      line = rest
      rest = ''
    } else if (i === lines - 1) {
      line = `${rest.slice(0, width - 1)}…`
      rest = ''
    } else if (rest[width] === ' ') {
      // The edge falls between words: the line is whole words, the space goes.
      line = rest.slice(0, width)
      rest = rest.slice(width + 1).trimStart()
    } else {
      const space = rest.lastIndexOf(' ', width - 1)
      const wordEnd = rest.indexOf(' ', width)
      const wordLength = (wordEnd === -1 ? rest.length : wordEnd) - (space + 1)
      if (space > 0 && wordLength <= width) {
        line = rest.slice(0, space).trimEnd()
        rest = rest.slice(space + 1).trimStart()
      } else {
        line = rest.slice(0, width)
        rest = rest.slice(width)
      }
    }
    out.push(i === 0 ? line : `${' '.repeat(indent)}${line}`)
  }
  return out.join('\n')
}

/** What a bookmark takes from the transcript row it points at: where the row is, its head, the transcript's path (forward slashes) and who wrote it. Each mint from a row (a prose link, a promoted mark, the model's tool) starts from this. */
export function rowPlace(row: TranscriptRow, transcript: string | undefined) {
  return {
    uuid: row.uuid,
    ...(row.file !== undefined ? { file: row.file } : {}),
    ...(row.part !== undefined ? { part: row.part } : {}),
    ...(row.drawn !== undefined ? { drawn: row.drawn } : {}),
    // A row from the places has no line or byte range: the record gets none rather than zeros.
    ...(row.line > 0 ? { line: row.line, bytes: [row.byteStart, row.byteEnd] as [number, number] } : {}),
    head: headOf(row.text),
    transcript: transcript === undefined ? undefined : forwardSlashes(transcript),
    role: row.role,
    ...(row.timestamp ? { timestamp: row.timestamp } : {}),
  }
}
