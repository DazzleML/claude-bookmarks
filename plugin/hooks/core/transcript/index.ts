// The transcript index, pure (slice F, U65): what a finished or interrupted pass of the
// loader leaves on disk so the next load resumes from a byte watermark instead of reading
// the whole file again (a dev reload happens at every save; a whole pass costs 5-9 s on a
// large transcript, measured 2026-10-22). The rows are kept without their text (the texts
// live in the prompttext and replytext pieces, under their budgets); the header carries the
// version, the conversation, the watermark, the line count and the file size the pass saw.
// Sharded like core/prompts/text-store.ts, since one $.fs.read takes 4 MiB at most.
//
// An index is trusted only when its version and conversation match and its watermark is
// at or under the file's current size; anything else rebuilds from byte 0. The transcript
// is append-only as far as the plugin knows (the blackbox's B11: nothing promises it), so a
// file shorter than the watermark is the one rewrite the rule catches.
import { newLoader, type LoadedRow, type LoaderState } from './loader.ts'
import { utf8Bytes } from '../prompts/text-store.ts'

export const INDEX_VERSION = 1
/** A piece's JSON stays under this, as the text pieces do (one `$.fs.read` takes 4 MiB). */
export const INDEX_PIECE_BYTES = 3_500_000

export type IndexRow = Omit<LoadedRow, 'text'>
export type IndexHeader = { version: number; sessionId: string; bytesRead: number; lines: number; size: number; prompts: string[]; pieces: number }
export type TranscriptIndex = { header: IndexHeader; rows: IndexRow[] }

export const indexBase = (dataRoot: string, sessionId: string): string => `${dataRoot.replace(/\\/g, '/').replace(/\/$/, '')}/bookmarks/transcript/${sessionId}`

/** The index a loader state becomes, for the file size the pass saw. */
export function indexOf(s: LoaderState, sessionId: string, size: number): TranscriptIndex {
  const rows: IndexRow[] = s.rows.map(({ text: _text, ...rest }) => rest)
  return { header: { version: INDEX_VERSION, sessionId, bytesRead: s.bytes, lines: s.line, size, prompts: [...s.prompts], pieces: 0 }, rows }
}

/** The header and the row pieces as JSON strings: `pieces[0]` is the header (its `pieces` says how many row pieces follow). */
export function serializeIndex(ix: TranscriptIndex, pieceBytes = INDEX_PIECE_BYTES): string[] {
  const pieces: IndexRow[][] = []
  let piece: IndexRow[] = []
  let bytes = 2
  for (const r of ix.rows) {
    const b = utf8Bytes(JSON.stringify(r)) + 1
    if (piece.length > 0 && bytes + b > pieceBytes) {
      pieces.push(piece)
      piece = []
      bytes = 2
    }
    piece.push(r)
    bytes += b
  }
  if (piece.length > 0) pieces.push(piece)
  const header: IndexHeader = { ...ix.header, pieces: pieces.length }
  return [JSON.stringify(header), ...pieces.map(p => JSON.stringify(p))]
}

export type IndexRead = { kind: 'ok'; index: TranscriptIndex } | { kind: 'rebuild'; why: string }

/** Read an index back; `size` is the file's size now. Anything that does not fit says why it is rebuilt. */
export function parseIndex(header: string | undefined, pieces: readonly (string | undefined)[], sessionId: string, size: number): IndexRead {
  if (header === undefined) return { kind: 'rebuild', why: 'no index' }
  let h: any
  try {
    h = JSON.parse(header)
  } catch {
    return { kind: 'rebuild', why: 'the header is not JSON' }
  }
  if (h?.version !== INDEX_VERSION) return { kind: 'rebuild', why: `version ${String(h?.version)} is not ${INDEX_VERSION}` }
  if (h.sessionId !== sessionId) return { kind: 'rebuild', why: 'another conversation' }
  if (typeof h.bytesRead !== 'number' || typeof h.lines !== 'number' || !Array.isArray(h.prompts) || typeof h.pieces !== 'number') return { kind: 'rebuild', why: 'the header is incomplete' }
  if (h.bytesRead > size) return { kind: 'rebuild', why: `the watermark ${h.bytesRead} is past the file's ${size} bytes` }
  if (pieces.length < h.pieces) return { kind: 'rebuild', why: `${h.pieces} pieces expected, ${pieces.length} present` }
  const rows: IndexRow[] = []
  for (let i = 0; i < h.pieces; i++) {
    let p: any
    try {
      p = JSON.parse(pieces[i] ?? '')
    } catch {
      return { kind: 'rebuild', why: `piece ${i} is not JSON` }
    }
    if (!Array.isArray(p)) return { kind: 'rebuild', why: `piece ${i} is not a list` }
    for (const r of p) {
      if (typeof r?.uuid !== 'string' || typeof r.line !== 'number' || typeof r.byteStart !== 'number' || typeof r.byteEnd !== 'number') return { kind: 'rebuild', why: `piece ${i} holds a bad row` }
      rows.push(r)
    }
  }
  return { kind: 'ok', index: { header: { ...h, size: typeof h.size === 'number' ? h.size : size }, rows } }
}

/** A loader state seeded from an index: the rows with empty text (the text pieces fill them), the watermark as the place to resume. */
export function seedLoader(ix: TranscriptIndex, texts: ReadonlyMap<string, string> = new Map()): LoaderState {
  const s = newLoader()
  for (const r of ix.rows) {
    s.byUuid.set(r.uuid, s.rows.length)
    s.rows.push({ ...r, text: texts.get(r.uuid) ?? '' })
  }
  s.prompts = [...ix.header.prompts]
  s.line = ix.header.lines
  s.bytes = ix.header.bytesRead
  return s
}
