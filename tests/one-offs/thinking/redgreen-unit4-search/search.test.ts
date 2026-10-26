// node --test tests/core/search.test.ts
// Search's core (the 0.7 groundwork design, 2026-10-25, unit 4): the query syntax of the search
// design (2026-10-04__21-26-14, S1 and the gate's D2), the scope rules of the scope design
// (2026-10-25__20-22-46: presets as toggles, typed include and exclude rules, exclusion wins),
// and a search that streams the place reader's pieces.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inPreset, inScope, matchesTerms, parseQuery, scopeLabel, type ScopedPlace } from './query.ts'
import { piecesToRead, searchPlaces } from './search.ts'
import { addPlace, newPlaceIndex, seal, takeSealed } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/places/reader.ts'
import type { Place } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/places/place.ts'

const kinds = (text: string) => parseQuery(text).terms.map(t => t.kind)

test('words match in any order and any case; all must be there', () => {
  const q = parseQuery('loader Transcript')
  assert.deepEqual(kinds('loader Transcript'), ['word', 'word'])
  assert.equal(matchesTerms('the transcript LOADER reads pieces', q.terms), true)
  assert.equal(matchesTerms('the loader alone', q.terms), false)
})

test('a quoted phrase is that exact text, case included by default; the setting can let case go', () => {
  const q = parseQuery('"band field"')
  assert.deepEqual(kinds('"band field"'), ['phrase'])
  assert.equal(matchesTerms("the band field's keys", q.terms), true)
  assert.equal(matchesTerms('the Band Field', q.terms), false)
  assert.equal(matchesTerms('the Band Field', q.terms, false), true)
  assert.equal(matchesTerms('the band and the field', q.terms), false)
})

test('m/pattern/flags is a regex; a bare /pattern/flags only with a closing slash and valid flags', () => {
  assert.equal(matchesTerms('fieldInput here', parseQuery('m/fe[a-z]+Input/').terms), false)
  assert.equal(matchesTerms('feildInput here', parseQuery('m/fe[a-z]+Input/').terms), true)
  assert.equal(matchesTerms('CACHE', parseQuery('m/cache/i').terms), true)
  assert.deepEqual(kinds('/cach(e|ing)/i'), ['regex'])
})

test('a path is words, never a pattern', () => {
  const q = parseQuery('/c/code/thing')
  assert.deepEqual(q.terms, [{ kind: 'word', text: '/c/code/thing' }])
  assert.deepEqual(q.problems, [])
  assert.equal(matchesTerms('cd /c/code/thing && ls', q.terms), true)
})

test('an unfinished pattern is named as incomplete, and the rest of the query still applies', () => {
  for (const text of ['m/foo(', 'm/foo']) {
    const q = parseQuery(`${text} loader`)
    assert.deepEqual(q.problems, [`incomplete pattern ${text}`])
    assert.deepEqual(q.terms, [{ kind: 'word', text: 'loader' }])
  }
})

test('forms combine with AND', () => {
  const q = parseQuery('cache "exact bit" m/v\\d+/')
  assert.deepEqual(q.terms.map(t => t.kind), ['word', 'phrase', 'regex'])
  assert.equal(matchesTerms('cache and the exact bit at v2', q.terms), true)
  assert.equal(matchesTerms('cache and the exact bit', q.terms), false)
})

test('scope rules are read out of the query; one inside a quoted phrase is literal text', () => {
  const q = parseQuery('in:tools -in:thinking agent:oracle tool:Bash failed loader "in:tools"')
  assert.deepEqual(q.include, [{ on: 'in', preset: 'tools' }, { on: 'agent', name: 'oracle' }, { on: 'tool', name: 'Bash' }, { on: 'failed' }])
  assert.deepEqual(q.exclude, [{ on: 'in', preset: 'thinking' }])
  assert.deepEqual(q.terms, [{ kind: 'word', text: 'loader' }, { kind: 'phrase', text: 'in:tools' }])
  assert.deepEqual(parseQuery('in:nowhere x').problems, ['no preset named "nowhere"'])
  assert.deepEqual(parseQuery('from:claude').include, [{ on: 'in', preset: 'claude' }])
})

const person: ScopedPlace = { kind: 'prompt', author: 'person' }
const claudeReply: ScopedPlace = { kind: 'reply', author: 'claude' }
const claudeBash: ScopedPlace = { kind: 'tool-call', author: 'claude', tool: 'Bash', category: 'shell' }
const oracleReply: ScopedPlace = { kind: 'reply', author: 'agent', agent: { id: 'a1b2c3d4', type: 'oracle' } }
const helpGrep: ScopedPlace = { kind: 'tool-call', author: 'agent', agent: { id: 'f9e8', type: 'help' }, tool: 'Grep', category: 'search' }
const output: ScopedPlace = { kind: 'tool-result', author: 'tool', failed: true }
const session: ScopedPlace = { kind: 'agent-message', author: 'session' }
const thinking: ScopedPlace = { kind: 'thinking', author: 'claude' }

test("the presets cover djdarcy's list, and a place can be in more than one", () => {
  assert.equal(inPreset(person, 'user'), true)
  assert.equal(inPreset(claudeReply, 'claude'), true)
  assert.equal(inPreset(claudeBash, 'claude'), false, "Claude's tool calls are tools, not Claude's text")
  assert.equal(inPreset(helpGrep, 'agents') && inPreset(helpGrep, 'tools'), true)
  assert.equal(inPreset(session, 'sessions'), true)
  assert.equal(inPreset(output, 'outputs'), true)
  assert.equal(inPreset(thinking, 'thinking') && inPreset(thinking, 'claude'), true)
})

// From the unit 4 mutation sweep (tests/mutation/v0.7.0__sweep__unit4-search.md).
const dispatch: ScopedPlace = { kind: 'prompt', author: 'claude', agent: { id: 'a1', type: 'oracle' } }
const compaction: ScopedPlace = { kind: 'event', author: 'engine' }

test("Claude's dispatch to an agent is Claude's and the agent's; an event is a notice", () => {
  assert.equal(inPreset(dispatch, 'claude'), true, 'Claude wrote the dispatch')
  assert.equal(inPreset(dispatch, 'agents'), true, "it opens the agent's conversation")
  assert.equal(inPreset(compaction, 'notices'), true)
})

test('from:tool means the outputs; from:tools the calls', () => {
  assert.deepEqual(parseQuery('from:tool').include, [{ on: 'in', preset: 'outputs' }])
  assert.deepEqual(parseQuery('from:tools').include, [{ on: 'in', preset: 'tools' }])
})

test('a quote left open takes the rest of the query as its phrase', () => {
  assert.deepEqual(parseQuery('loader "band fie').terms, [{ kind: 'word', text: 'loader' }, { kind: 'phrase', text: 'band fie' }])
})

test('a pattern written with g or y matches every text it should, not every other one', () => {
  const q = parseQuery('m/loader/gi')
  for (const t of ['loader one', 'LOADER two', 'the loader three']) assert.equal(matchesTerms(t, q.terms), true, t)
})

test('failed takes no value: failed:yes is a word, not the rule', () => {
  const q = parseQuery('failed:yes')
  assert.deepEqual(q.include, [])
  assert.deepEqual(q.terms, [{ kind: 'word', text: 'failed:yes' }])
})

test('toggles join: a place shows when any toggle that is on admits it', () => {
  const none = { include: [], exclude: [] }
  assert.equal(inScope(person, none, ['user', 'claude']), true)
  assert.equal(inScope(claudeReply, none, ['user', 'claude']), true)
  assert.equal(inScope(claudeBash, none, ['user', 'claude']), false)
  assert.equal(inScope(claudeBash, none), true, 'no toggles given means everything')
})

test('typed rules narrow what the toggles show; rules of one kind are alternatives', () => {
  assert.equal(inScope(oracleReply, parseQuery('agent:oracle'), ['agents']), true)
  assert.equal(inScope(helpGrep, parseQuery('agent:oracle'), ['agents']), false, 'one agent type only')
  assert.equal(inScope(oracleReply, parseQuery('agent:a1b2'), ['agents']), true, 'or by the start of its id')
  assert.equal(inScope(helpGrep, parseQuery('in:tools in:outputs')), true)
  assert.equal(inScope(output, parseQuery('in:tools in:outputs')), true)
  assert.equal(inScope(person, parseQuery('in:tools in:outputs')), false)
  assert.equal(inScope(claudeBash, parseQuery('tool:bash')), true, 'a tool by name, any case')
  assert.equal(inScope(helpGrep, parseQuery('tool:search')), true, 'or by its category')
  assert.equal(inScope(output, parseQuery('failed')), true)
  assert.equal(inScope(person, parseQuery('failed')), false)
  assert.equal(inScope(claudeReply, parseQuery('in:tools'), ['user', 'claude']), false, 'a rule narrows inside the toggles, never past them')
})

test('an exclusion wins over the toggles and over every include', () => {
  assert.equal(inScope(thinking, parseQuery('in:claude -in:thinking'), ['everything']), false)
  assert.equal(inScope(oracleReply, parseQuery('-agent:oracle'), ['agents']), false)
  assert.equal(inScope(output, parseQuery('-failed'), ['outputs']), false)
})

test("the pane's title shows the scope in effect", () => {
  assert.equal(scopeLabel(parseQuery('agent:oracle -in:thinking'), ['tools']), 'tools · agent:oracle · -in:thinking')
  assert.equal(scopeLabel(parseQuery(''), ['everything']), 'everything')
  assert.equal(scopeLabel(parseQuery(''), ['user', 'claude']), 'user+claude')
})

// A small index with its text in pieces, as the place reader leaves it.
function corpus() {
  const idx = newPlaceIndex('s')
  const places: Place[] = [
    { at: { session: 's', uuid: 'p1' }, kind: 'prompt', author: 'person', text: 'find the transcript loader' },
    { at: { session: 's', uuid: 'r1' }, kind: 'reply', author: 'claude', text: 'The loader is core/transcript/loader.ts' },
    { at: { session: 's', uuid: 't1' }, kind: 'tool-call', author: 'claude', tool: 'Grep', category: 'search', text: '{"pattern":"loader"}' },
    { at: { session: 's', uuid: 'e1', file: 'agent:a1' }, kind: 'reply', author: 'agent', agent: { id: 'a1', type: 'oracle' }, text: 'the loader was designed on 2026-10-22' },
    { at: { session: 's', uuid: 'zq' }, kind: 'reply', author: 'claude', text: 'zqxjvbrkwm, the known answer' },
  ]
  // A tiny piece size is not available here, so seal by hand after the third place to make two pieces.
  places.forEach((p, i) => { addPlace(idx, p); if (i === 2) seal(idx) })
  seal(idx)
  const pieces = new Map(takeSealed(idx).map(s => [s.n, s.text]))
  return { rows: idx.rows, pieces }
}

test('a search finds the rows whose text matches, in row order, reading only pieces that hold a row in scope', () => {
  const { rows, pieces } = corpus()
  const read: number[] = []
  const r = searchPlaces(rows, parseQuery('loader'), n => { read.push(n); return pieces.get(n) })
  assert.deepEqual(r.hits.map(i => rows[i]!.at.uuid), ['p1', 'r1', 't1', 'e1'])
  assert.equal(r.inScope, 5)
  assert.deepEqual(read, [0, 1])
  const agentsOnly: number[] = []
  const a = searchPlaces(rows, parseQuery('loader agent:oracle'), n => { agentsOnly.push(n); return pieces.get(n) })
  assert.deepEqual(a.hits.map(i => rows[i]!.at.uuid), ['e1'])
  assert.deepEqual(agentsOnly, [1], 'the first piece holds no row in scope, so it is never read')
})

test('the known answer: a word that occurs once is found once; a word that never occurs finds nothing', () => {
  const { rows, pieces } = corpus()
  assert.deepEqual(searchPlaces(rows, parseQuery('zqxjvbrkwm'), n => pieces.get(n)).hits.map(i => rows[i]!.at.uuid), ['zq'])
  assert.deepEqual(searchPlaces(rows, parseQuery('nothingmatchesthis'), n => pieces.get(n)).hits, [])
})

test('a query with no words is a listing of the rows in scope, and reads no text', () => {
  const { rows } = corpus()
  let reads = 0
  const r = searchPlaces(rows, parseQuery('in:tools'), () => { reads++; return '' })
  assert.deepEqual(r.hits.map(i => rows[i]!.at.uuid), ['t1'])
  assert.equal(reads, 0)
  assert.deepEqual([...piecesToRead(rows, parseQuery(''), ['user']).values()].flat().map(i => rows[i]!.at.uuid), ['p1'])
})

test('a search stops at its limit or its deadline and says which, keeping the hits so far', () => {
  const { rows, pieces } = corpus()
  const limited = searchPlaces(rows, parseQuery('loader'), n => pieces.get(n), { limit: 2 })
  assert.deepEqual([limited.hits.length, limited.stopped], [2, 'limit'])
  let t = 0
  const late = searchPlaces(rows, parseQuery('loader'), n => { t += 100; return pieces.get(n) }, { deadline: 50, now: () => t })
  assert.equal(late.stopped, 'deadline')
  assert.ok(late.hits.length >= 1 && late.hits.length < 4, `${late.hits.length} hit(s) before the deadline`)
})

test('a missing piece is skipped, not fatal', () => {
  const { rows, pieces } = corpus()
  const r = searchPlaces(rows, parseQuery('loader'), n => (n === 0 ? undefined : pieces.get(n)))
  assert.deepEqual(r.hits.map(i => rows[i]!.at.uuid), ['e1'])
})
