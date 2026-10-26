// The search pane's handler (the search-pane-and-links design, 2026-10-26, unit U-S): runs the
// query typed in the pane's field (or the band's) over the conversation's places, keeps the
// results the pane draws, and does what a result's number asks: land on it, or pin it.
//
// A search runs per keystroke (F1), detached from the field's handler: a hook has 10 s of its
// own time (HookBudget), and a first read of a long conversation takes longer. Each keystroke
// starts a new generation; a search that finds a newer one stops at its next piece. The pieces
// are read one at a time, so a search holds one piece's text, never the conversation's. While
// the place reader is still reading, the results come from what it has, and the search runs
// again until it has caught up.
//
// The model (numbering, the field's prefixes, the toggles) is core/search/results.ts.
import { placeKey } from '../core/places/reader.ts'
import { drawnOf, textOf } from '../core/places/resolve.ts'
import { parseQuery, type Preset, type Query } from '../core/search/query.ts'
import { matchPiece, piecesToRead, searchPlaces } from '../core/search/search.ts'
import { displayHead, numberResults, resultsLegend, toggle as toggled, viewToggles, type SearchRow } from '../core/search/results.ts'
import { pickNumbered } from '../core/band/band-entry.ts'
import { pinPlaceKey } from '../core/bookmarks/pins.ts'
import { ensurePlaces, placesDone, placesIndex, placesStatus, readPlacesPiece } from './places.ts'
import type { SearchPorts } from '../engine/ports.ts'

/** How long after a keystroke the search starts: a word typed fast runs one search, not one per letter. */
export const SEARCH_DELAY_MS = 120
/** How often the search runs again while the reader is still reading. */
export const SEARCH_REFRESH_MS = 1_500

export type SearchView = {
  query: string
  toggles: Preset[]
  results: SearchRow[]
  /** The line under the field. */
  legend: string
  /** The place keys pinned in the search list (pins.ts pinPlaceKey). */
  pinned: ReadonlySet<string>
  /** A search is running for the current text. */
  running: boolean
  /** The row (its position in the place reader's rows) the person last went to from this list: drawn in yellow, as the prompts list draws the prompt nearest the view. */
  current: number | undefined
  /** The number typed after `#` or `*` in the pane's own field, not yet entered: drawn as the ▶. */
  pointing: string
}

type State = SearchView & { gen: number; matched: number; inScope: number; problems: string[]; reading?: string; /** A toggle was pressed in this conversation: the pane keeps the person's choice instead of the setting's view. */ toggled: boolean }

const fresh = (): State => ({ query: '', toggles: ['everything'], results: [], legend: '', pinned: new Set(), running: false, current: undefined, pointing: '', gen: 0, matched: 0, inScope: 0, problems: [], toggled: false })

/**
 * The pane opens: on the setting's view (the `searchView` setting), unless the person has
 * pressed a toggle in this conversation, whose choice stands.
 */
export function openOn(view: string, custom: Readonly<Record<string, unknown>> = {}): void {
  if (!state.toggled) state.toggles = viewToggles(view, custom)
}

/** `#N` or `*N` typed in the pane's field: the ▶ moves to N before Enter (djdarcy, 2026-10-26: "I'm not sure if we really went to 19"). */
export async function pointAt(ports: SearchPorts, typed: string): Promise<void> {
  if (state.pointing === typed) return
  state.pointing = typed
  await ports.redraw()
}
let state: State = fresh()

/** What the pane draws. */
export function searchView(): SearchView {
  return state
}

/** The query to search for when the pane next opens (`/bm-search words`). */
export function setQuery(query: string): void {
  state.query = query
}

/** A new conversation: the search starts empty. */
export function newConversation(): void {
  state = fresh()
}

function legendOf(s: State): string {
  return resultsLegend({ shown: s.results.length, matched: s.matched, inScope: s.inScope, query: s.query, ...(s.reading ? { reading: s.reading } : {}), problems: s.problems })
}

/**
 * The query changed (a keystroke in the field, or the pane opening): search again after
 * SEARCH_DELAY_MS unless another keystroke comes first. Returns at once.
 */
export function searchFor(ports: SearchPorts, query: string): void {
  const gen = ++state.gen
  state.query = query
  state.running = true
  ports.after(SEARCH_DELAY_MS, () => void runSearch(ports, gen).catch(err => ports.log(`[bm] search stopped: ${String(err)}`)))
}

/** A toggle pressed: the scope changes and the search runs again at once. */
export function pressToggle(ports: SearchPorts, preset: Preset): void {
  state.toggles = toggled(state.toggles, preset)
  state.toggled = true
  const gen = ++state.gen
  state.running = true
  ports.after(0, () => void runSearch(ports, gen).catch(err => ports.log(`[bm] search stopped: ${String(err)}`)))
}

/**
 * The search for generation `gen`: stops, keeping nothing, when a newer generation has begun.
 * The first run of a generation brings the places up to date (a finished pass reads on from its
 * watermarks); the runs while that read goes on only search again, or each would start another.
 */
export async function runSearch(ports: SearchPorts, gen: number, catchUp = true): Promise<void> {
  if (gen !== state.gen) return
  if (catchUp) await ensurePlaces(ports)
  const idx = placesIndex()
  if (gen !== state.gen) return
  const reading = placesDone() ? undefined : placesStatus().replace(/^places: /, '')
  const q: Query = parseQuery(state.query)
  const rows = idx?.rows ?? []
  const toggles = state.toggles
  let hits: number[] = []
  let inScope = 0
  if (q.terms.length === 0) {
    const r = searchPlaces(rows, q, () => undefined, { toggles })
    hits = r.hits
    inScope = r.inScope
  } else {
    // One piece at a time: read it, match the rows it holds, let it go.
    const want = piecesToRead(rows, q, toggles)
    inScope = [...want.values()].reduce((s, l) => s + l.length, 0)
    for (const n of [...want.keys()].sort((a, b) => a - b)) {
      const text = await readPlacesPiece(ports, n)
      if (gen !== state.gen) return
      if (text === undefined) continue
      hits.push(...matchPiece(rows, want.get(n)!, q, text, ports.phraseCase()))
    }
  }
  // The shown results' own text, from their pieces, so a row fills the lines it is allowed
  // (djdarcy, 2026-10-26: "we're not importing as much text as we could for each item": the
  // index's 160-character head ran out on a three-line row).
  const results = numberResults(rows, hits)
  const byPiece = new Map<number, SearchRow[]>()
  for (const s of results) {
    const n = rows[s.i]!.piece
    byPiece.set(n, [...(byPiece.get(n) ?? []), s])
  }
  for (const [n, list] of byPiece) {
    const piece = await readPlacesPiece(ports, n)
    if (gen !== state.gen) return
    for (const s of list) {
      const text = textOf(rows[s.i]!, piece)
      if (text !== undefined) s.head = displayHead(rows[s.i]!, text)
    }
  }
  const pinned = await ports.pinned()
  if (gen !== state.gen) return
  state.results = results
  state.matched = hits.length
  state.inScope = inScope
  state.problems = q.problems
  state.pinned = pinned
  state.reading = reading
  state.running = false
  state.legend = legendOf(state)
  await ports.redraw()
  // Still reading: search again on what has been read since, until the reader has caught up.
  if (reading) ports.after(SEARCH_REFRESH_MS, () => void (gen === state.gen ? runSearch(ports, gen, false) : undefined)?.catch(() => undefined))
}

/** A row's first non-blank line, trimmed and cut to 60 characters: words that sit on one drawn line, so a highlight can find them. */
export function firstLine(text: string | undefined): string | undefined {
  const line = text?.split(/\r?\n/).map(l => l.trim()).find(l => l !== '')
  return line ? line.slice(0, 60) : undefined
}

/** The words a press highlights on a message: the query's words and phrases, never a pattern. */
export function wordsOf(query: string): string | undefined {
  const q = parseQuery(query)
  const t = q.terms.find(t => t.kind === 'phrase') ?? q.terms.find(t => t.kind === 'word')
  return t?.text
}

/** Land on result `typed` (its number; empty: the newest). */
export async function goToResult(ports: SearchPorts, typed: string, via: string): Promise<void> {
  const pick = pickNumbered(typed, state.results, 'result', true)
  if ('error' in pick) return void ports.toast(pick.error)
  await landOn(ports, pick.target, via)
}

/** Land on a result row (a press, or its number): by the id it is drawn under, else its uuid with the query's words highlighted. */
export async function landOn(ports: SearchPorts, row: SearchRow, via: string): Promise<string | undefined> {
  const rows = placesIndex()?.rows ?? []
  const r = rows[row.i]
  if (!r) return void ports.toast('That result is gone: search again')
  const drawn = row.message ? undefined : drawnOf(rows, row.i)
  // The words go with the jump for two things: the highlight on a message, and the phrase a
  // refused jump copies for the person to search with (a row from before the last compaction
  // is not drawn: djdarcy's #35 and #37, 2026-10-26, refused with nothing to search for). A
  // message highlights the query's words, else its own head, as the prompts list does; a row
  // drawn under another id is never highlighted (arriveAtBookmark), so its head is only the phrase.
  // The row's own words are its first line, from its text: the index's head has its line breaks
  // made spaces, so a head that ran past a line end matched nothing on screen and highlighted
  // nothing (djdarcy, 2026-10-26: #22 "The exact top-left spot it jumps me to is:{" with a paste
  // on the next line stayed plain, while #21, one line, was coloured).
  const head = firstLine(textOf(r, await readPlacesPiece(ports, r.piece))) ?? row.head.slice(0, 60)
  const words = row.message ? (wordsOf(state.query) ?? head) : drawn !== undefined ? head : undefined
  ports.log(`[bm] search: result #${row.n} (${row.label}, ${placeKey(r.at)}) -> ${drawn ?? r.at.uuid}`)
  // The row is drawn in yellow from now on, so a person who went to it can see which it was.
  state.current = row.i
  state.pointing = ''
  await ports.redraw()
  return ports.arrive({ uuid: r.at.uuid, ...(drawn !== undefined ? { drawn } : {}), ...(words !== undefined ? { words } : {}), label: `search result #${row.n}` }, via)
}

/** Pin or unpin result `typed` (its number; empty: the newest) in the search list. */
export async function pinResult(ports: SearchPorts, typed: string): Promise<void> {
  const pick = pickNumbered(typed, state.results, 'result', true)
  if ('error' in pick) return void ports.toast(pick.error)
  const on = !state.pinned.has(pinPlaceKey(pick.target.place))
  const r = await ports.setPin(pick.target.place, on)
  if ('error' in r) return void ports.toast(r.error, 8000)
  state.pinned = r.pinned
  ports.toast(`${on ? 'pinned' : 'unpinned'} result #${pick.n}`)
  await ports.redraw()
}
