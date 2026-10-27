// Finding a place for a link (the search-pane-and-links design, 2026-10-26, unit U-L): the rows
// the bookmark tool cannot find through the transcript loader -- a tool call or its output, an
// agent's message or report, a notice -- found in the place reader's index by uuid, by the
// `tool_use` id Claude Code draws a tool row under, by address, or by a fragment of their text.
//
// Pure: the handler reads the pieces (handlers/places.ts resolveInPlaces).
import { placeKey, type IndexedPlace } from './reader.ts'
import { landingFor } from './landing.ts'
import type { Query } from '../search/query.ts'

/** A prompt or a reply in the main transcript: a message, addressed by its uuid alone, as every record before 0.7.3. */
export const isMessage = (r: IndexedPlace): boolean => r.at.file === undefined && (r.kind === 'prompt' || r.kind === 'reply')

/** What a request names: a uuid (full, an 8+ prefix, or a `tool_use` id), and the file and block when a link carried them. */
export type PlaceWant = { uuid: string; file?: string; part?: number }

/** The rows a request names, in index order. With `file` or `part`, only the row at that address. */
export function findPlaces(rows: readonly IndexedPlace[], want: PlaceWant): number[] {
  const id = want.uuid.toLowerCase()
  const addressed = want.file !== undefined || want.part !== undefined
  const out: number[] = []
  rows.forEach((r, i) => {
    const byUuid = r.at.uuid.toLowerCase() === id || (id.length >= 8 && r.at.uuid.toLowerCase().startsWith(id))
    const byCall = r.toolUseId !== undefined && r.toolUseId === want.uuid
    if (!byUuid && !byCall) return
    if (addressed && ((r.at.file ?? '') !== (want.file ?? '') || (r.at.part ?? 0) !== (want.part ?? 0))) return
    out.push(i)
  })
  // A `tool_use` id names a call and its result: the call is the row.
  if (!addressed && out.length > 1 && out.some(i => rows[i]!.toolUseId === want.uuid && rows[i]!.kind === 'tool-call')) {
    return out.filter(i => rows[i]!.kind === 'tool-call' || rows[i]!.at.uuid.toLowerCase() === id)
  }
  return out
}

/**
 * The id Claude Code draws a row under, when a jump should not use the row's uuid: a tool row's
 * `tool_use` id (measured 2026-10-26: a scroll to it lands on the row, or on its folded group);
 * for any row in an agent's file, the Agent call that started the agent (the agent's place in the
 * chat window); for a stored output, the drawn id of the row that names it. A prompt, a reply, a
 * thinking block or a notice in the main transcript: undefined (its uuid is drawn).
 */
export function drawnOf(rows: readonly IndexedPlace[], i: number, seen = new Set<number>()): string | undefined {
  const r = rows[i]
  if (!r || seen.has(i)) return undefined
  seen.add(i)
  if (r.at.file?.startsWith('agent:')) return r.agent?.call
  if (r.at.file?.startsWith('tool-result:')) {
    const name = r.at.file.slice('tool-result:'.length)
    const by = rows.findIndex(x => x.stored === name && !x.at.file?.startsWith('tool-result:'))
    return by >= 0 ? drawnOf(rows, by, seen) : undefined
  }
  if (r.kind === 'tool-call' || r.kind === 'tool-result') return r.toolUseId
  return undefined
}

/**
 * The message a row belongs to, by the record's address: core/places/landing.ts's stock landing
 * (the last prompt or reply before it; for an agent's row, before the Agent call that started
 * it). Where a jump goes when Claude Code draws nothing under the row's own ids (the landing
 * fallback, 0.7.6). `why` says what the row was, for the toast.
 */
export function messageOf(rows: readonly IndexedPlace[], want: PlaceWant): { uuid: string; why?: string } | undefined {
  const l = landingFor(rows, findPlaces(rows, want)[0] ?? -1)
  return l.on === 'outside' ? undefined : l.on === 'message' ? { uuid: l.uuid, why: l.why } : { uuid: l.uuid }
}

/** A row's text, from the piece that holds it (its `{"k", "t"}` line), or undefined when the piece does not have it. */
export function textOf(r: IndexedPlace, piece: string | undefined): string | undefined {
  if (piece === undefined) return undefined
  const key = JSON.stringify(placeKey(r.at))
  for (const line of piece.split('\n')) {
    if (!line.startsWith(`{"k":${key},`)) continue
    try {
      return (JSON.parse(line) as { t: string }).t
    } catch {
      return undefined
    }
  }
  return undefined
}

/** A query for one verbatim fragment: the phrase, case kept, over every kind of row. */
export function fragmentQuery(fragment: string): Query {
  return { terms: [{ kind: 'phrase', text: fragment }], include: [], exclude: [], problems: [] }
}

/** What a found place becomes for the tool: its address (none for a message), the id it is drawn under, its text and who wrote it. */
export type FoundPlace = { uuid: string; file?: string; part?: number; drawn?: string; role: 'user' | 'assistant'; text: string; timestamp?: string; kind: IndexedPlace['kind'] }

export function foundPlace(rows: readonly IndexedPlace[], i: number, text: string): FoundPlace {
  const r = rows[i]!
  const drawn = drawnOf(rows, i)
  return {
    uuid: r.at.uuid,
    // A message keeps the uuid-only address every record before 0.7.3 has; any other row has its block too, 0 when single.
    ...(isMessage(r) ? {} : { ...(r.at.file !== undefined ? { file: r.at.file } : {}), part: r.at.part ?? 0 }),
    ...(drawn !== undefined ? { drawn } : {}),
    role: r.author === 'person' ? 'user' : 'assistant',
    text,
    ...(r.timestamp ? { timestamp: r.timestamp } : {}),
    kind: r.kind,
  }
}
