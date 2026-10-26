// What a search query says (the 0.7 groundwork design, 2026-10-25, unit 4): the words, phrases
// and patterns to match, and the scope -- which places to look in.
//
// The match syntax is the one the search design settled (2026-10-04__21-26-14, S1, with the
// gate's D2 answer of 2026-10-05):
//   words            every word, in any order, any case
//   "a phrase"       that exact text; case counts by default (a setting: `phraseCase`)
//   m/pattern/flags  a JavaScript regular expression (djdarcy's `m/<word>/i`)
//   /pattern/flags   the same, only with a closing slash and valid flags, so a path such as
//                    /c/code/thing is words, never a pattern
//   an unfinished pattern (m/foo( or m/foo) is reported as incomplete, never silently dropped
//   all of them combine with AND
//
// The scope syntax is the scope design's (2026-10-25__20-22-46, F1 + F2 + F7, after
// claude-session-logger's include/exclude model): a place carries attributes (kind, author,
// agent, tool, category, failed), a preset names a set of them, and typed rules narrow:
//   in:tools  from:claude  agent:oracle  tool:Bash  failed     -- include, narrowing
//   -in:thinking  -agent:help  -failed                         -- exclude; an exclusion wins
// A rule inside a quoted phrase is literal text. The on/off toggles a pane draws are the same
// presets, joined: a place shows when any toggle that is on admits it, the typed rules agree,
// and no exclusion refuses it.
//
// Pure: no engine, no state.
import type { Author, PlaceKind, ToolCategory } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/places/place.ts'

/** The attributes of a place a scope reads (an IndexedPlace has all of them). */
export type ScopedPlace = { kind: PlaceKind; author: Author; agent?: { id: string; type?: string }; tool?: string; category?: ToolCategory; failed?: boolean }

/** The shipped presets: djdarcy's list (2026-10-25: "everything, user, claude, ai agents, tools, outputs, ...") plus where an unknown kind lands. */
export const PRESETS = ['everything', 'user', 'claude', 'agents', 'sessions', 'tools', 'outputs', 'thinking', 'notices', 'other'] as const
export type Preset = (typeof PRESETS)[number]

/** Which places a preset admits. A place may be in several (an agent's tool call is `agents` and `tools`). */
export function inPreset(p: ScopedPlace, preset: Preset): boolean {
  switch (preset) {
    case 'everything': return true
    case 'user': return p.author === 'person'
    case 'claude': return p.author === 'claude' && (p.kind === 'reply' || p.kind === 'thinking' || p.kind === 'prompt')
    case 'agents': return p.author === 'agent' || p.agent !== undefined
    case 'sessions': return p.kind === 'agent-message'
    case 'tools': return p.kind === 'tool-call'
    case 'outputs': return p.kind === 'tool-result'
    case 'thinking': return p.kind === 'thinking'
    case 'notices': return p.kind === 'notice' || p.kind === 'event'
    case 'other': return p.kind === 'other'
  }
}

/** `from:` names who wrote it, the same groups as the presets that are about authors. */
const FROM: Readonly<Record<string, Preset>> = { user: 'user', you: 'user', person: 'user', claude: 'claude', agent: 'agents', agents: 'agents', session: 'sessions', sessions: 'sessions', tool: 'outputs', tools: 'tools' }

export type Term =
  | { kind: 'word'; text: string }
  | { kind: 'phrase'; text: string }
  | { kind: 'regex'; re: RegExp; source: string }

export type Rule =
  | { on: 'in'; preset: Preset }
  | { on: 'agent'; name: string }
  | { on: 'tool'; name: string }
  | { on: 'failed' }

export type Query = {
  terms: Term[]
  include: Rule[]
  exclude: Rule[]
  /** What could not be read, named: an incomplete pattern, an unknown preset. The rest of the query still applies. */
  problems: string[]
}

const FLAGS = /^[dgimsuyv]*$/

/** The query's tokens: quoted phrases kept whole (a rule inside one is literal), the rest split on whitespace. An unclosed quote takes the rest as its phrase. */
function tokens(text: string): { text: string; quoted: boolean }[] {
  const out: { text: string; quoted: boolean }[] = []
  const re = /"([^"]*)"?|(\S+)/g
  for (const m of text.matchAll(re)) {
    if (m[1] !== undefined) out.push({ text: m[1], quoted: true })
    else out.push({ text: m[2]!, quoted: false })
  }
  return out
}

function regexOf(token: string): { re: RegExp; source: string } | { incomplete: string } | undefined {
  const m = /^m\/(.*)$/s.exec(token)
  const body = m ? m[1]! : token.startsWith('/') ? token.slice(1) : undefined
  if (body === undefined) return undefined
  const close = body.lastIndexOf('/')
  if (close < 0) return m ? { incomplete: token } : undefined
  const pattern = body.slice(0, close)
  const flags = body.slice(close + 1)
  if (!FLAGS.test(flags)) return m ? { incomplete: token } : undefined
  if (!m && pattern === '') return undefined
  try {
    return { re: new RegExp(pattern, flags.replace(/[gy]/g, '')), source: token }
  } catch {
    return { incomplete: token }
  }
}

function ruleOf(token: string): { rule: Rule; negated: boolean } | { problem: string } | undefined {
  const m = /^(-?)(in|from|agent|tool|failed)(?::(.*))?$/i.exec(token)
  if (!m) return undefined
  const negated = m[1] === '-'
  const key = m[2]!.toLowerCase()
  const value = (m[3] ?? '').trim()
  if (key === 'failed') return value === '' ? { rule: { on: 'failed' }, negated } : undefined
  if (value === '') return undefined
  if (key === 'in') {
    const preset = PRESETS.find(p => p === value.toLowerCase())
    return preset ? { rule: { on: 'in', preset }, negated } : { problem: `no preset named "${value}"` }
  }
  if (key === 'from') {
    const preset = FROM[value.toLowerCase()]
    return preset ? { rule: { on: 'in', preset }, negated } : { problem: `no author named "${value}"` }
  }
  return { rule: { on: key as 'agent' | 'tool', name: value }, negated }
}

/** Read a query. Never throws: what cannot be read is named in `problems`. */
export function parseQuery(text: string): Query {
  const q: Query = { terms: [], include: [], exclude: [], problems: [] }
  for (const t of tokens(text)) {
    if (t.quoted) {
      if (t.text !== '') q.terms.push({ kind: 'phrase', text: t.text })
      continue
    }
    const rule = ruleOf(t.text)
    if (rule && 'problem' in rule) { q.problems.push(rule.problem); continue }
    if (rule) { (rule.negated ? q.exclude : q.include).push(rule.rule); continue }
    const rx = regexOf(t.text)
    if (rx && 'incomplete' in rx) { q.problems.push(`incomplete pattern ${rx.incomplete}`); continue }
    if (rx) { q.terms.push({ kind: 'regex', ...rx }); continue }
    q.terms.push({ kind: 'word', text: t.text })
  }
  return q
}

function ruleAdmits(p: ScopedPlace, r: Rule): boolean {
  switch (r.on) {
    case 'in': return inPreset(p, r.preset)
    case 'agent': {
      const name = r.name.toLowerCase()
      return p.agent !== undefined && (p.agent.type?.toLowerCase() === name || p.agent.id.toLowerCase().startsWith(name))
    }
    case 'tool': {
      const name = r.name.toLowerCase()
      return p.tool?.toLowerCase() === name || p.category === name
    }
    case 'failed': return p.failed === true
  }
}

/**
 * Whether a place is in scope: some toggle that is on admits it (no toggles means everything),
 * every kind of typed include rule agrees (rules of one kind are alternatives: `in:tools in:outputs`
 * is either), and no exclusion refuses it. An exclusion wins over everything.
 */
export function inScope(p: ScopedPlace, q: Pick<Query, 'include' | 'exclude'>, toggles: readonly Preset[] = ['everything']): boolean {
  if (q.exclude.some(r => ruleAdmits(p, r))) return false
  if (!toggles.some(t => inPreset(p, t))) return false
  const byKind = new Map<string, Rule[]>()
  for (const r of q.include) byKind.set(r.on, [...(byKind.get(r.on) ?? []), r])
  for (const rules of byKind.values()) if (!rules.some(r => ruleAdmits(p, r))) return false
  return true
}

/** Whether a place's text matches every term. `phraseCase` false makes a quoted phrase ignore case. */
export function matchesTerms(text: string, terms: readonly Term[], phraseCase = true): boolean {
  let lower: string | undefined
  for (const t of terms) {
    if (t.kind === 'word') {
      lower ??= text.toLowerCase()
      if (!lower.includes(t.text.toLowerCase())) return false
    } else if (t.kind === 'phrase') {
      if (phraseCase ? !text.includes(t.text) : !(lower ??= text.toLowerCase()).includes(t.text.toLowerCase())) return false
    } else if (!t.re.test(text)) return false
  }
  return true
}

/** The scope in effect, for the pane's title: the toggles that are on, then the typed rules (`tools · agent:oracle · -in:thinking`). */
export function scopeLabel(q: Pick<Query, 'include' | 'exclude'>, toggles: readonly Preset[]): string {
  const rule = (r: Rule) => (r.on === 'in' ? `in:${r.preset}` : r.on === 'failed' ? 'failed' : `${r.on}:${r.name}`)
  const parts = [toggles.includes('everything') ? 'everything' : toggles.join('+'), ...q.include.map(rule), ...q.exclude.map(r => `-${rule(r)}`)]
  return parts.join(' · ')
}
