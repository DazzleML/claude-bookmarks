// The search pane's model (the search-pane-and-links design, 2026-10-26, unit U-S): what the
// query field's text means, how the hits are numbered and labelled, and the toggle row's state.
//
// The field's whole text is the query (F1): it narrows the results as it is typed. Two prefixes
// act on a result instead, as the prompts list's field does: `#N` jumps to result N and `*N`
// pins it. The results are numbered in their own order, 1 the newest (G-b); a prompt keeps its
// own number in its text.
//
// Pure: the handler (handlers/search.ts) runs the search and the pane draws this.
import type { IndexedPlace } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/places/reader.ts'
import { isMessage } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/places/resolve.ts'
import type { PinPlace } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/bookmarks/pins.ts'
import { PRESETS, type Preset } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/search/query.ts'

/** The list name a pin made in the search pane carries (a pin's `from`). */
export const SEARCH_LIST = 'search'

/** At most this many results are drawn, the newest; the legend says how many matched. */
export const SHOWN_MAX = 200

/** What the search field's text says. */
export type SearchFieldStep =
  /** The text is the query. */
  | { op: 'query'; text: string }
  /** `#N`: result N (the digits so far; '' for `#` alone). The query stays as it was. */
  | { op: 'number'; typed: string }
  /** `*N`: pin result N. The query stays as it was. */
  | { op: 'pin'; typed: string }

export function searchField(typed: string): SearchFieldStep {
  const num = /^#(\d*)$/.exec(typed.trim())
  if (num) return { op: 'number', typed: num[1]! }
  const pin = /^\*(\d*)$/.exec(typed.trim())
  if (pin) return { op: 'pin', typed: pin[1]! }
  return { op: 'query', text: typed }
}

/** One result as the pane draws it. */
export type SearchRow = {
  /** Its number in this result list, 1 the newest. */
  n: number
  /** Its position in the place reader's rows. */
  i: number
  /** What kind of row it is, in a word or two ("you", "claude", "Bash", "output", "oracle · agent"); shortLabel cuts it for a narrow pane. */
  label: string
  /** The toggle this row's label would only repeat, when that toggle is the only one on (impliedBy): `claude` for a reply, `user` for your prompt, `thinking` for a thinking block. */
  impliedBy?: Preset
  head: string
  /** Where a pin on it goes: a message by its uuid alone, any other row with its file and block (as a link's record). */
  place: PinPlace
  /** A prompt or a reply: a press highlights the query's words on it. */
  message: boolean
}

/**
 * The words a row's kind is shown as ("you", "claude", "Bash", "output", "oracle · agent"). A tool
 * call shows its tool's name, as the name is what the row is found by; an agent's row its type.
 */
export function kindLabel(r: IndexedPlace): string {
  const agent = r.at.file?.startsWith('agent:') ? `${r.agent?.type ?? 'agent'} · ` : ''
  switch (r.kind) {
    case 'prompt': return `${agent}${r.author === 'person' ? 'you' : 'prompt'}`
    case 'reply': return `${agent}${r.author === 'agent' ? 'agent' : 'claude'}`
    case 'thinking': return `${agent}thinking`
    case 'tool-call': return `${agent}${r.tool ?? 'tool'}`
    case 'tool-result': return `${agent}${r.failed ? 'output (failed)' : 'output'}`
    case 'agent-message': return r.from ?? 'session'
    case 'agent-report': return `${r.agent?.type ?? 'agent'} report`
    case 'notice': return 'notice'
    case 'event': return 'event'
    default: return 'other'
  }
}

/** The kind words kindLabel writes, which a short label cuts; a tool's name or an agent's type is kept whole. */
const KIND_WORDS = new Set(['you', 'prompt', 'claude', 'agent', 'thinking', 'tool', 'output', 'session', 'report', 'notice', 'event', 'other'])

/**
 * A kind label's short form for a narrow pane (the `searchLabels` setting; djdarcy, 2026-10-26: "a
 * shorthand ... {"cl:", "th:", "to:", ...} this way it doesn't take up quite so much space"): each
 * kind word cut to its first `letters` letters ("we still need to let users choose how many
 * letters"; 2 by default: `cl`, `ou`, `th`; 3: `cla`, `out`, `thi`), a failed output marked `!`,
 * a tool's name and an agent's type kept whole.
 */
export function shortLabel(label: string, letters = 2): string {
  const n = Math.max(1, Math.floor(letters))
  return label
    .replace(/ · /g, '·')
    .replace(/output \(failed\)/g, `${'output'.slice(0, n)}!`)
    .replace(/[A-Za-z]+/g, w => (KIND_WORDS.has(w) ? w.slice(0, n) : w))
}

/** A row's place as a pin or a link names it: a message by uuid alone (as every record before 0.7.3), any other row with its file and block. */
export function placeOfRow(r: IndexedPlace): PinPlace {
  if (isMessage(r)) return { uuid: r.at.uuid }
  return { uuid: r.at.uuid, ...(r.at.file !== undefined ? { file: r.at.file } : {}), part: r.at.part ?? 0 }
}

/**
 * When a row was written, for ordering: its own timestamp, else the nearest earlier row's in the
 * same file (a tool call's blocks and most notices carry none), else nothing (ordered by position).
 */
function whenOf(rows: readonly IndexedPlace[], i: number): string {
  const file = rows[i]!.at.file
  for (let j = i; j >= 0 && i - j < 64; j--) {
    const r = rows[j]!
    if (r.at.file !== file) break
    if (r.timestamp) return r.timestamp
  }
  return ''
}

/**
 * The hits as the pane lists them: newest first, numbered 1 the newest (G-b), at most `max`.
 * Rows are in file order, and an agent's file comes after the whole transcript, so the order is
 * by when each row was written, then by position.
 */
export function numberResults(rows: readonly IndexedPlace[], hits: readonly number[], max = SHOWN_MAX): SearchRow[] {
  const when = new Map(hits.map(i => [i, whenOf(rows, i)]))
  const order = [...hits].sort((a, b) => {
    const wa = when.get(a)!
    const wb = when.get(b)!
    if (wa !== wb) return wa < wb ? 1 : -1
    return b - a
  })
  return order.slice(0, max).map((i, k) => {
    const r = rows[i]!
    const implied = impliedBy(r)
    return { n: k + 1, i, label: kindLabel(r), ...(implied ? { impliedBy: implied } : {}), head: displayHead(r, r.head), place: placeOfRow(r), message: isMessage(r) }
  })
}

/**
 * A row's text as a result shows it: whitespace runs made one space, at most DISPLAY_CHARS
 * characters, and a tool call's leading tool name left out ("Bash: ...", or "SubagentHandback
 * {..." where the tool has no field to describe it), which its label already says.
 */
export const DISPLAY_CHARS = 600
export function displayHead(r: IndexedPlace, text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim().slice(0, DISPLAY_CHARS)
  const named = r.kind === 'tool-call' && r.tool ? new RegExp(`^${r.tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?::\\s|\\s)`).exec(flat) : null
  return named ? flat.slice(named[0].length) : flat
}

/**
 * The one toggle a row's label only repeats (djdarcy, 2026-10-26: "When a person has only one tab
 * selected like "claude" or "you" or "agents" it's implied the main view is just that item so we
 * shouldn't need to show the implicit "you:" ... The only thing we might want to show is something
 * like "th:" which implies "thinking" when working with "claude""). A label that says more than
 * its toggle -- a tool's name, an agent's type, a session's name, a failed output, a thinking
 * block under `claude` -- has none, and stays.
 */
export function impliedBy(r: IndexedPlace): Preset | undefined {
  if (r.at.file?.startsWith('agent:')) return undefined
  switch (r.kind) {
    case 'prompt': return r.author === 'person' ? 'user' : undefined
    case 'reply': return r.author === 'claude' ? 'claude' : undefined
    case 'thinking': return 'thinking'
    case 'tool-result': return r.failed ? undefined : 'outputs'
    case 'notice': return 'notices'
    case 'other': return 'other'
    default: return undefined
  }
}

/** Whether a row's label is left out: labels are `implied`, one toggle alone is on, and the label only repeats it. */
export function labelImplied(row: Pick<SearchRow, 'impliedBy'>, toggles: readonly Preset[], mode: 'implied' | 'always'): boolean {
  return mode === 'implied' && toggles.length === 1 && toggles[0] !== 'everything' && row.impliedBy === toggles[0]
}

/**
 * Where a step moves the ▶ in the results, which are numbered 1 at the top (the newest): the
 * first step lands on the newest; then `dir` 1 (next, j by default) moves down a row, -1 up.
 * (The prompts list numbers the other way, oldest first, so core/band/band-entry.ts stepNumber
 * moves its number the other way.)
 */
export function stepResult(typed: string, count: number, dir: -1 | 1): number {
  const cur = Number(typed)
  return !typed || !cur ? 1 : Math.min(count, Math.max(1, cur + dir))
}

/** The toggle row: the presets, in PRESETS's order, with the short word each is drawn as. */
export const TOGGLE_LABELS: Readonly<Record<Preset, string>> = {
  everything: 'all', user: 'you', claude: 'claude', agents: 'agents', sessions: 'sessions',
  tools: 'tools', outputs: 'outputs', thinking: 'thinking', notices: 'notices', other: 'other',
}
export const TOGGLES: readonly Preset[] = PRESETS

/**
 * The views the search pane can open on (the `searchView` setting; djdarcy, 2026-10-26: "We'll
 * let search be default "all" but I suspect many people will want to make a combination of
 * "you+claude+tools+output" as the default ... we might even have a template for a more narrow
 * view as "you+claude+sessions""). Each is a set of the toggles; the setting's values are
 * these names, so /config lists them.
 */
export const SEARCH_VIEWS: Readonly<Record<string, readonly Preset[]>> = {
  all: ['everything'],
  // djdarcy: "We should change the second option to "you+claude+sessions+tools+outputs""
  'you+claude+sessions+tools+outputs': ['user', 'claude', 'sessions', 'tools', 'outputs'],
  'you+claude+sessions': ['user', 'claude', 'sessions'],
}

/** The view a person builds (djdarcy: "make it a list where users can pick the items they want to "build""): one on/off /config row per kind, read when the view is `custom`. */
export const CUSTOM_VIEW = 'custom'
export const CUSTOM_FIELDS: Readonly<Record<Exclude<Preset, 'everything'>, string>> = {
  user: 'searchWithYou', claude: 'searchWithClaude', agents: 'searchWithAgents', sessions: 'searchWithSessions',
  tools: 'searchWithTools', outputs: 'searchWithOutputs', thinking: 'searchWithThinking', notices: 'searchWithNotices', other: 'searchWithOther',
}

/** The toggles a view name stands for; `custom` reads the on/off rows (none on: everything); an unknown name is everything. */
export function viewToggles(name: string, custom: Readonly<Record<string, unknown>> = {}): Preset[] {
  if (name === CUSTOM_VIEW) {
    const on = (Object.keys(CUSTOM_FIELDS) as Exclude<Preset, 'everything'>[]).filter(p => custom[CUSTOM_FIELDS[p]] === true)
    return on.length ? PRESETS.filter(p => (on as readonly Preset[]).includes(p)) : ['everything']
  }
  return [...(SEARCH_VIEWS[name] ?? ['everything'])]
}

/**
 * A toggle pressed: `everything` on is everything alone; any other turned on replaces
 * `everything`; the last one turned off leaves `everything`, so the scope is never empty.
 */
export function toggle(on: readonly Preset[], preset: Preset): Preset[] {
  if (preset === 'everything') return ['everything']
  const rest = on.filter(p => p !== 'everything')
  const next = rest.includes(preset) ? rest.filter(p => p !== preset) : [...rest, preset]
  return next.length === 0 ? ['everything'] : PRESETS.filter(p => (next as readonly Preset[]).includes(p))
}

/** The line under the field: how many matched, and whether the conversation is still being read or the search stopped early. */
export function resultsLegend(r: { shown: number; matched: number; inScope: number; query: string; reading?: string; stopped?: 'limit' | 'deadline'; problems?: readonly string[] }): string {
  const parts: string[] = []
  if (r.reading) parts.push(`reading the conversation (${r.reading})`)
  const of = `${r.inScope.toLocaleString('en-US')} ${r.inScope === 1 ? 'place' : 'places'}`
  if (r.query.trim() === '') parts.push(`${of}; type to search`)
  else parts.push(r.matched === 0 ? `no match in ${of}` : `${r.matched.toLocaleString('en-US')} of ${of}${r.shown < r.matched ? `, the newest ${r.shown} shown` : ''}`)
  if (r.stopped === 'deadline') parts.push('stopped early: keep typing to narrow it')
  for (const p of r.problems ?? []) parts.push(p)
  return parts.join(' · ')
}
