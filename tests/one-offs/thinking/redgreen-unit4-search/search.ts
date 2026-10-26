// Searching a conversation's places (the 0.7 groundwork design, 2026-10-25, unit 4): the place
// reader's rows (core/places/reader.ts) narrowed by a query's scope, then the text of each row
// in scope read from the pieces it lives in and matched against the query's terms.
//
// The text is streamed, never held: a search is handed the pieces one at a time (measured: a
// full pass over 48.9 MB in 13 pieces in about 0.3 s, the first hit in 22-40 ms). Rows out of
// scope are never matched, so a narrow scope costs less than "everything". A query with no
// terms is a listing: every row in scope is a hit, with no text read at all.
//
// Pure: the caller reads the pieces (handlers, through ports) and draws the hits.
import { placeKey, type IndexedPlace } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/places/reader.ts'
import { inScope, matchesTerms, type Preset, type Query } from './query.ts'

export type SearchOptions = {
  /** The pane's toggles that are on; absent means everything. */
  toggles?: readonly Preset[]
  /** Whether a quoted phrase's case counts (the `phraseCase` setting; default true). */
  phraseCase?: boolean
  /** Stop after this many hits (0: no limit). */
  limit?: number
  /** Stop when this clock passes this time; the hits so far are kept and the result says it stopped. */
  deadline?: number
  now?: () => number
}

export type SearchResult = {
  /** The hits, as positions in `rows`, in the order of the rows. */
  hits: number[]
  /** Rows in scope (the number a listing would show). */
  inScope: number
  /** Why the search stopped early, if it did: 'limit' or 'deadline'. */
  stopped?: 'limit' | 'deadline'
}

/** The rows a search must read the text of: in scope, grouped by the piece that holds their text. */
export function piecesToRead(rows: readonly IndexedPlace[], q: Query, toggles?: readonly Preset[]): Map<number, number[]> {
  const out = new Map<number, number[]>()
  rows.forEach((r, i) => {
    if (!inScope(r, q, toggles)) return
    const list = out.get(r.piece)
    if (list) list.push(i)
    else out.set(r.piece, [i])
  })
  return out
}

/**
 * Search the places. `readPiece(n)` returns piece `n`'s text (its `{"k", "t"}` lines), or
 * undefined when it is missing; it is called only for pieces that hold a row in scope, in
 * piece order, and only when the query has terms.
 */
export function searchPlaces(rows: readonly IndexedPlace[], q: Query, readPiece: (n: number) => string | undefined, opts: SearchOptions = {}): SearchResult {
  const now = opts.now ?? Date.now
  const want = piecesToRead(rows, q, opts.toggles)
  const total = [...want.values()].reduce((s, l) => s + l.length, 0)
  if (q.terms.length === 0) {
    const all = [...want.values()].flat().sort((a, b) => a - b)
    const hits = opts.limit ? all.slice(0, opts.limit) : all
    return { hits, inScope: total, ...(opts.limit && all.length > opts.limit ? { stopped: 'limit' as const } : {}) }
  }
  const hits: number[] = []
  for (const n of [...want.keys()].sort((a, b) => a - b)) {
    if (opts.deadline !== undefined && now() > opts.deadline) return { hits: hits.sort((a, b) => a - b), inScope: total, stopped: 'deadline' }
    const text = readPiece(n)
    if (text === undefined) continue
    const keys = new Map(want.get(n)!.map(i => [placeKey(rows[i]!.at), i]))
    for (const line of text.split('\n')) {
      if (!line) continue
      let entry: { k: string; t: string }
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      const i = keys.get(entry.k)
      if (i === undefined) continue
      if (matchesTerms(entry.t, q.terms, opts.phraseCase ?? true)) {
        hits.push(i)
        if (opts.limit && hits.length >= opts.limit) return { hits: hits.sort((a, b) => a - b), inScope: total, stopped: 'limit' }
      }
    }
  }
  return { hits: hits.sort((a, b) => a - b), inScope: total }
}
