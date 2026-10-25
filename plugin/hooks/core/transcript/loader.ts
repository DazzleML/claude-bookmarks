// The whole-conversation loader, pure (slice F, U65; the design of 2026-10-22 21:35).
//
// The transcript is a JSON-lines file that can run to hundreds of MB, and the engine hands
// a program's output back in chunks of at most 4 MiB. This module is fed those chunks in
// order and keeps, in memory, one row for every message the person or the model wrote:
// its uuid (the identity), its line and byte range in the file (hints, for links and the
// verify recipe), its role, its text and its timestamp. A chunk ends wherever 4 MiB ends,
// so the partial last line is carried into the next chunk (the poc of 2026-10-22: without
// the carry one line breaks at every boundary). Which rows are prompts, footnotes or
// replies is decided by the same functions the live capture and the old back-fill use
// (core/prompts/prompt-rows.ts, core/bookmarks/transcript-lines.ts), so the three never
// disagree; this is also what fixes the back-fill's hole, measured at 7% of one
// conversation's prompts: queued prompts whose pasted text quoted a marker string the grep
// filter excluded. A JSON parse never drops a row for what its text says.
import { messageTextOf, resolveRows, type Resolution, type TranscriptRow } from '../bookmarks/transcript-lines.ts'
import { footnoteOf, promptTextOf, type Footnote } from '../prompts/prompt-rows.ts'
import { utf8Bytes, withinBudget, type PromptText } from '../prompts/text-store.ts'

/** The longest partial line carried across chunks; past it the line is dropped and counted (a paste of many MB). */
export const CARRY_CAP = 8 * 1024 * 1024
/** How much of the replies' text is kept when the loader's texts are saved, newest first; 0 is unlimited. An open value: a setting once #20 search ships (the design's ledger). */
export const REPLY_TEXT_BUDGET = 4_000_000

export type RowKind = 'prompt' | 'reply' | 'compaction' | 'other'
export type LoadedRow = TranscriptRow & { kind: RowKind }
export type FootnoteRow = Footnote & { uuid: string; after: string | null }

export type LoaderState = {
  /** The partial last line of the previous chunk. */
  carry: string
  /** Lines and bytes consumed so far; `bytes` is the watermark a resumed pass starts from. */
  line: number
  bytes: number
  rows: LoadedRow[]
  byUuid: Map<string, number>
  /** The prompts' uuids in file order (the read state's order, #34). */
  prompts: string[]
  footnotes: FootnoteRow[]
  /** Lines dropped at the carry cap, and lines that were not JSON. */
  dropped: number
  unparsed: number
  /** A line over the cap is being swallowed up to its newline, so the file's line count stays right. */
  dropping: boolean
}

export function newLoader(): LoaderState {
  return { carry: '', line: 0, bytes: 0, rows: [], byUuid: new Map(), prompts: [], footnotes: [], dropped: 0, unparsed: 0, dropping: false }
}

/** What a parsed line is to the plugin, or undefined when it is not a message. */
export function classifyLine(o: any): { kind: RowKind; role: 'user' | 'assistant'; text: string } | undefined {
  const prompt = promptTextOf(o)
  if (prompt !== undefined) return { kind: 'prompt', role: 'user', text: prompt }
  if (o?.type === 'user' && o.isCompactSummary) {
    const m = messageTextOf({ ...o, isMeta: false })
    return { kind: 'compaction', role: 'user', text: m?.text ?? '' }
  }
  const m = messageTextOf(o)
  if (!m) return undefined
  return { kind: m.role === 'assistant' ? 'reply' : 'other', role: m.role, text: m.text }
}

/** One complete line of the file: counted always, kept as a row when it is a message. */
function takeLine(s: LoaderState, raw: string, newline: boolean): void {
  const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
  const byteStart = s.bytes
  const byteEnd = byteStart + utf8Bytes(raw) + (newline ? 1 : 0)
  s.line += 1
  s.bytes = byteEnd
  if (!line.trim()) return
  let o: any
  try {
    o = JSON.parse(line)
  } catch {
    s.unparsed += 1
    return
  }
  if (typeof o?.uuid !== 'string') return
  const c = classifyLine(o)
  const fn = c?.kind === 'prompt' ? undefined : footnoteOf(o)
  if (fn) s.footnotes.push({ ...fn, uuid: o.uuid, after: s.prompts.at(-1) ?? null })
  if (!c) return
  const row: LoadedRow = { uuid: o.uuid, line: s.line, byteStart, byteEnd, role: c.role, text: c.text, kind: c.kind, ...(typeof o.timestamp === 'string' ? { timestamp: o.timestamp } : {}) }
  const at = s.byUuid.get(o.uuid)
  if (at !== undefined) {
    // Seen live before the pass reached it: the file fills the hints, and the longer text
    // wins (the live capture keeps a cut of a reply; the file holds it whole).
    const have = s.rows[at]!
    s.rows[at] = { ...have, line: row.line, byteStart: row.byteStart, byteEnd: row.byteEnd, text: row.text.length >= have.text.length ? row.text : have.text, ...(row.timestamp ? { timestamp: row.timestamp } : {}) }
    return
  }
  s.byUuid.set(o.uuid, s.rows.length)
  s.rows.push(row)
  if (c.kind === 'prompt') s.prompts.push(o.uuid)
}

/**
 * Feed the next chunk of the file, in order. `done` says the file ended with this chunk, so
 * a last line without a newline is taken too. The carry holds a partial line across calls;
 * one longer than `carryCap` is dropped and counted.
 */
export function feed(s: LoaderState, chunk: string, done = false, carryCap = CARRY_CAP): void {
  const data = s.carry + chunk
  const parts = data.split('\n')
  const last = parts.pop() ?? ''
  for (const p of parts) {
    if (s.dropping) {
      // The rest of a line dropped at the cap: its bytes and its newline count, nothing else.
      s.bytes += utf8Bytes(p) + 1
      s.line += 1
      s.dropping = false
      continue
    }
    takeLine(s, p, true)
  }
  if (s.dropping) {
    s.bytes += utf8Bytes(last)
    s.carry = ''
  } else if (last.length > carryCap) {
    s.dropped += 1
    s.bytes += utf8Bytes(last)
    s.carry = ''
    s.dropping = true
  } else {
    s.carry = last
  }
  if (done) {
    if (s.dropping) {
      s.line += 1
      s.dropping = false
    } else if (s.carry) {
      takeLine(s, s.carry, false)
    }
    s.carry = ''
  }
}

/** A message the live capture saw: kept now with its hints unknown (line 0, bytes 0-0) until the pass reads it; a uuid already known is left alone. */
export function append(s: LoaderState, row: { uuid: string; role: 'user' | 'assistant'; text: string; timestamp?: string }, kind: RowKind = row.role === 'assistant' ? 'reply' : 'prompt'): boolean {
  if (s.byUuid.has(row.uuid)) return false
  s.byUuid.set(row.uuid, s.rows.length)
  s.rows.push({ uuid: row.uuid, line: 0, byteStart: 0, byteEnd: 0, role: row.role, text: row.text, kind, ...(row.timestamp ? { timestamp: row.timestamp } : {}) })
  if (kind === 'prompt') s.prompts.push(row.uuid)
  return true
}

/** The row a request names, by uuid (full or an 8+ prefix) or by a fragment of its text, with resolveRows's meaning: one, many (ask), or none. */
export function resolve(s: LoaderState, want: { uuid?: string; fragment?: string }): Resolution {
  return resolveRows(s.rows, want)
}

/** The texts of one kind, newest first, under a byte budget (0 unlimited): what the saved pieces hold. */
export function textsWithin(s: LoaderState, kind: RowKind, budget: number): PromptText[] {
  const newestFirst: PromptText[] = []
  for (let i = s.rows.length - 1; i >= 0; i--) {
    const r = s.rows[i]!
    if (r.kind === kind && r.text) newestFirst.push({ uuid: r.uuid, text: r.text })
  }
  return withinBudget(newestFirst, budget)
}

/** One line for /bm-env and the log. */
export function loaderLine(s: LoaderState, size: number | undefined, chunks: number, ms: number, running: boolean): string {
  const of = size !== undefined ? ` of ${size}` : ''
  return `loader: ${s.rows.length} rows (${s.prompts.length} prompts), ${s.bytes}${of} bytes read in ${ms} ms over ${chunks} chunk(s), ${running ? 'running' : 'done'}${s.dropped ? `; ${s.dropped} line(s) over the carry cap` : ''}${s.unparsed ? `; ${s.unparsed} not JSON` : ''}`
}
