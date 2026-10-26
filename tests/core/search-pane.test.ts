// node --test tests/core/search-pane.test.ts
// The search pane's model and handler (the search-pane-and-links design, 2026-10-26, unit U-S):
// the field's text (a query, `#N`, `*N`), the results numbered 1 the newest (G-b), the toggles,
// and the handler running a search over the place reader's pass with fake ports: the query
// narrows, a toggle narrows, a newer keystroke wins, a press lands by the drawn id or by uuid
// with the words, and `*N` pins a tool row with its address.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayHead, kindLabel, labelImplied, numberResults, placeOfRow, resultsLegend, searchField, shortLabel, stepResult, toggle, viewToggles, DISPLAY_CHARS, SEARCH_LIST } from '../../plugin/hooks/core/search/results.ts'
import type { IndexedPlace } from '../../plugin/hooks/core/places/reader.ts'
import { newConversation as newPlaces, startPlacesPass } from '../../plugin/hooks/handlers/places.ts'
import { firstLine, goToResult, newConversation as newSearch, openOn, pinResult, pressToggle, searchFor, searchView, wordsOf } from '../../plugin/hooks/handlers/search.ts'
import { pinPlaceKey, type PinPlace } from '../../plugin/hooks/core/bookmarks/pins.ts'
import type { SearchPorts } from '../../plugin/hooks/engine/ports.ts'

test('the field: #N names a result, *N pins one, anything else is the query', () => {
  assert.deepEqual(searchField('#12'), { op: 'number', typed: '12' })
  assert.deepEqual(searchField('#'), { op: 'number', typed: '' })
  assert.deepEqual(searchField('*3'), { op: 'pin', typed: '3' })
  assert.deepEqual(searchField('loader #12'), { op: 'query', text: 'loader #12' })
  assert.deepEqual(searchField('*nope'), { op: 'query', text: '*nope' })
  assert.deepEqual(searchField(''), { op: 'query', text: '' })
})

const row = (o: Partial<IndexedPlace> & { uuid: string; i?: number }): IndexedPlace => ({
  at: { session: 's', uuid: o.uuid, ...(o.at?.file ? { file: o.at.file } : {}), ...(o.at?.part !== undefined ? { part: o.at.part } : {}) },
  kind: o.kind ?? 'reply', author: o.author ?? 'claude', head: o.head ?? o.uuid, piece: 0, bytes: 1,
  ...(o.timestamp ? { timestamp: o.timestamp } : {}), ...(o.tool ? { tool: o.tool } : {}), ...(o.agent ? { agent: o.agent } : {}), ...(o.failed ? { failed: true } : {}),
})

test('results are numbered 1 the newest, by when each row was written, an agent file\'s rows among the transcript\'s', () => {
  const rows = [
    row({ uuid: 'p1', kind: 'prompt', author: 'person', timestamp: '2026-10-26T01:00:00Z' }),
    row({ uuid: 'c1', kind: 'tool-call', tool: 'Bash' }), // no timestamp: the row before it in its file
    row({ uuid: 'r1', timestamp: '2026-10-26T03:00:00Z' }),
    row({ uuid: 'a1', at: { session: 's', uuid: 'a1', file: 'agent:x' }, author: 'agent', agent: { id: 'x', type: 'oracle' }, timestamp: '2026-10-26T02:00:00Z' }),
  ]
  const out = numberResults(rows, [0, 1, 2, 3])
  assert.deepEqual(out.map(r => [r.n, r.i]), [[1, 2], [2, 3], [3, 1], [4, 0]], 'r1 (03:00), the agent (02:00), the call (01:00, from p1, but after it), p1')
  assert.equal(numberResults(rows, [0, 1, 2, 3], 2).length, 2, 'at most the newest `max`')
})

test('a row is labelled by its kind, and placed as a pin or a link names it: a message by uuid, any other row with its block', () => {
  const p = row({ uuid: 'p1', kind: 'prompt', author: 'person' })
  const c = row({ uuid: 'c1', kind: 'tool-call', tool: 'Bash', at: { session: 's', uuid: 'c1', part: 1 } })
  const o = row({ uuid: 'o1', kind: 'tool-result', failed: true })
  const a = row({ uuid: 'a1', kind: 'reply', author: 'agent', at: { session: 's', uuid: 'a1', file: 'agent:x' }, agent: { id: 'x', type: 'oracle' } })
  assert.deepEqual([kindLabel(p), kindLabel(c), kindLabel(o), kindLabel(a)], ['you', 'Bash', 'output (failed)', 'oracle · agent'])
  // The short form (the searchLabels setting): each kind word cut to its letters, 2 by default
  // ("2 is my preference"), 3 a choice; the tool's name and the agent's type kept whole.
  const t = row({ uuid: 't1', kind: 'thinking' })
  const labels = [p, c, o, a, t].map(r => kindLabel(r))
  assert.deepEqual(labels.map(l => shortLabel(l)), ['yo', 'Bash', 'ou!', 'oracle·ag', 'th'])
  assert.deepEqual(labels.map(l => shortLabel(l, 3)), ['you', 'Bash', 'out!', 'oracle·age', 'thi'])
  assert.equal(shortLabel('mid-engineer report', 2), 'mid-engineer re', 'an agent type with a hyphen is kept whole')
  assert.deepEqual(placeOfRow(p), { uuid: 'p1' })
  assert.deepEqual(placeOfRow(c), { uuid: 'c1', part: 1 })
  assert.deepEqual(placeOfRow(a), { uuid: 'a1', file: 'agent:x', part: 0 })
})

test('a step: the first lands on the newest (1, at the top); next moves down, previous up, within the list', () => {
  assert.equal(stepResult('', 5, 1), 1)
  assert.equal(stepResult('', 5, -1), 1)
  assert.equal(stepResult('1', 5, 1), 2)
  assert.equal(stepResult('2', 5, -1), 1)
  assert.equal(stepResult('5', 5, 1), 5)
  assert.equal(stepResult('1', 5, -1), 1)
})

test("a tool call's head leaves out the tool's name, which its label carries", () => {
  const r = row({ uuid: 'c1', kind: 'tool-call', tool: 'Bash', head: 'Bash: run the tests {"command":"npm test"}' })
  assert.deepEqual(numberResults([r], [0]).map(x => [x.label, x.head]), [['Bash', 'run the tests {"command":"npm test"}']])
  // A tool with no describing field: its name and a space, then the input (djdarcy's "SubagentHandback: SubagentHandback {...").
  const h = row({ uuid: 'h1', kind: 'tool-call', tool: 'SubagentHandback', head: 'SubagentHandback {"message":"done"}' })
  assert.deepEqual(numberResults([h], [0]).map(x => x.head), ['{"message":"done"}'])
  // A head that only starts with the name's letters keeps them.
  const g = row({ uuid: 'g1', kind: 'tool-call', tool: 'Grep', head: 'Grepping the tree' })
  assert.deepEqual(numberResults([g], [0]).map(x => x.head), ['Grepping the tree'])
})

test('with one toggle on, a label that only repeats it is left out; a sub-type or a name stays', () => {
  const reply = row({ uuid: 'r', kind: 'reply', author: 'claude' })
  const think = row({ uuid: 't', kind: 'thinking' })
  const you = row({ uuid: 'p', kind: 'prompt', author: 'person' })
  const bash = row({ uuid: 'b', kind: 'tool-call', tool: 'Bash' })
  const failed = row({ uuid: 'f', kind: 'tool-result', failed: true })
  const agentReply = row({ uuid: 'a', kind: 'reply', author: 'agent', at: { session: 's', uuid: 'a', file: 'agent:x' }, agent: { id: 'x', type: 'oracle' } })
  const [r, t, y, b, f, a] = numberResults([reply, think, you, bash, failed, agentReply], [0, 1, 2, 3, 4, 5]).sort((p, q) => p.i - q.i)
  // djdarcy: under "claude" alone, a reply needs no "cl:" but a thinking block keeps "th:".
  assert.deepEqual([labelImplied(r!, ['claude'], 'implied'), labelImplied(t!, ['claude'], 'implied')], [true, false])
  assert.equal(labelImplied(y!, ['user'], 'implied'), true)
  assert.equal(labelImplied(b!, ['tools'], 'implied'), false, "a tool's name is the information")
  assert.equal(labelImplied(f!, ['outputs'], 'implied'), false, 'a failed output keeps its mark')
  assert.equal(labelImplied(a!, ['agents'], 'implied'), false, "an agent's type stays")
  assert.equal(labelImplied(r!, ['user', 'claude'], 'implied'), false, 'two toggles: every label')
  assert.equal(labelImplied(r!, ['everything'], 'implied'), false)
  assert.equal(labelImplied(r!, ['claude'], 'always'), false, 'the setting keeps them')
})

test("a result's text is the row's own, whitespace made one space, up to DISPLAY_CHARS, without its tool's name", () => {
  const long = row({ uuid: 'r', kind: 'reply', head: 'short head' })
  const text = 'word '.repeat(300)
  assert.equal(displayHead(long, text).length, DISPLAY_CHARS)
  assert.equal(displayHead(long, 'a\n\n  b'), 'a b')
  assert.equal(displayHead(row({ uuid: 'c', kind: 'tool-call', tool: 'Bash' }), 'Bash: run it\n{"command":"x"}'), 'run it {"command":"x"}')
})

test('the toggles: all alone, any other replaces it, and turning off the last leaves all', () => {
  assert.deepEqual(toggle(['everything'], 'tools'), ['tools'])
  assert.deepEqual(toggle(['tools'], 'user'), ['user', 'tools'], "in the presets' order")
  assert.deepEqual(toggle(['user', 'tools'], 'tools'), ['user'])
  assert.deepEqual(toggle(['user'], 'user'), ['everything'])
  assert.deepEqual(toggle(['user', 'tools'], 'everything'), ['everything'])
})

test('the legend says how many matched, of how many, and that the conversation is still being read', () => {
  assert.equal(resultsLegend({ shown: 0, matched: 0, inScope: 1200, query: '' }), '1,200 places; type to search')
  assert.equal(resultsLegend({ shown: 3, matched: 3, inScope: 1200, query: 'loader' }), '3 of 1,200 places')
  assert.equal(resultsLegend({ shown: 200, matched: 950, inScope: 1200, query: 'a' }), '950 of 1,200 places, the newest 200 shown')
  assert.equal(resultsLegend({ shown: 0, matched: 0, inScope: 1, query: 'x', reading: '3 of 5 files' }), 'reading the conversation (3 of 5 files) · no match in 1 place')
})

test("a row's own words are its first line, so a highlight can find them on one drawn line", () => {
  // djdarcy's #22: a prompt whose first line ends at `{` and whose paste starts on the next line.
  assert.equal(firstLine('The exact top-left spot it jumps me to is:{\n❯ Where did you move star.ts\'s content?'), 'The exact top-left spot it jumps me to is:{')
  assert.equal(firstLine('\n\n   indented first line  \nsecond'), 'indented first line')
  assert.equal(firstLine('x'.repeat(80))?.length, 60)
  assert.equal(firstLine(''), undefined)
  assert.equal(firstLine(undefined), undefined)
})

test("the words a press highlights are the query's phrase or first word, never a pattern", () => {
  assert.equal(wordsOf('loader "the pane"'), 'the pane')
  assert.equal(wordsOf('loader m/x+/'), 'loader')
  assert.equal(wordsOf('m/x+/'), undefined)
})

// The handler, over the place reader's pass with fake files (as tests/core/places-reader.test.ts).
const line = (o: unknown) => JSON.stringify(o)
const prompt = (uuid: string, text: string, ts: string) => line({ type: 'user', uuid, timestamp: ts, origin: { kind: 'human' }, message: { role: 'user', content: text } })
const reply = (uuid: string, text: string, ts: string) => line({ type: 'assistant', uuid, timestamp: ts, message: { role: 'assistant', content: [{ type: 'text', text }] } })
const call = (uuid: string, id: string, command: string, ts: string) => line({ type: 'assistant', uuid, timestamp: ts, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } })
const result = (uuid: string, id: string, text: string, ts: string) => line({ type: 'user', uuid, timestamp: ts, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] } })

function harness() {
  const files = new Map<string, string>([
    ['C:/proj/s1.jsonl', [
      prompt('p1', 'find the loader please', '2026-10-26T01:00:00Z'),
      call('c1', 'toolu_1', 'grep -rn loader src', '2026-10-26T01:01:00Z'),
      result('t1', 'toolu_1', 'src/loader.ts:51', '2026-10-26T01:02:00Z'),
      reply('r1', 'The loader is in src/loader.ts', '2026-10-26T01:03:00Z'),
      prompt('p2', 'thanks, now the pane', '2026-10-26T01:04:00Z'),
    ].join('\n') + '\n'],
  ])
  const queue: (() => void)[] = []
  const arrived: { uuid: string; drawn?: string; words?: string }[] = []
  const toasts: string[] = []
  let pins = new Set<string>()
  const pinCalls: { place: PinPlace; on: boolean }[] = []
  let redraws = 0
  // What each redraw showed, and a hook run the next time a piece of text is read from disk
  // (a keystroke that arrives while a search is still reading).
  const shown: { query: string; results: number }[] = []
  const hook: { onPieceRead?: () => void } = {}
  const ports: SearchPorts = {
    sessionId: async () => 's1',
    transcriptPath: async () => 'C:/proj/s1.jsonl',
    fileSize: async p => (files.has(p) ? Buffer.byteLength(files.get(p)!) : undefined),
    readChunk: async (p, offset) => {
      const bytes = Buffer.from(files.get(p) ?? '')
      return { stdout: bytes.subarray(offset, offset + 4_000_000).toString(), via: 'sh' }
    },
    fsList: async dir => [...files.keys()].filter(k => k.startsWith(dir + '/') && !k.slice(dir.length + 1).includes('/')).map(k => ({ name: k.slice(dir.length + 1), kind: 'file' })),
    dataRoot: async () => 'C:/data',
    fsExists: async p => files.has(p) || [...files.keys()].some(k => k.startsWith(p + '/')),
    fsRead: async p => {
      if (p.includes('/places/') && /\/text\.\d+\.jsonl$/.test(p) && hook.onPieceRead) {
        const f = hook.onPieceRead
        hook.onPieceRead = undefined
        f()
      }
      return files.get(p) ?? ''
    },
    fsWrite: async (p, t) => { files.set(p, t) },
    after: (_ms, fn) => { queue.push(fn); return { cancel: () => {} } },
    log: () => {},
    redraw: async () => { redraws += 1; shown.push({ query: searchView().query, results: searchView().results.length }) },
    arrive: async t => { arrived.push({ uuid: t.uuid, ...(t.drawn ? { drawn: t.drawn } : {}), ...(t.words ? { words: t.words } : {}) }); return undefined },
    setPin: async (place, on) => {
      pinCalls.push({ place, on })
      pins = new Set(pins)
      if (on) pins.add(pinPlaceKey(place))
      else pins.delete(pinPlaceKey(place))
      return { pinned: pins }
    },
    pinned: async () => pins,
    toast: t => toasts.push(t),
    phraseCase: () => true,
  }
  const drain = async () => {
    for (let ticks = 0; queue.length; ticks++) {
      if (ticks > 500) throw new Error('did not settle within 500 ticks')
      queue.shift()!()
      await new Promise(r => setTimeout(r, 0))
    }
  }
  return { ports, drain, arrived, toasts, pinCalls, redraws: () => redraws, shown, hook }
}

async function ready() {
  newPlaces()
  newSearch()
  const h = harness()
  await startPlacesPass(h.ports)
  await h.drain()
  return h
}

test('an empty query lists every place, newest first; typing narrows it', async () => {
  const h = await ready()
  searchFor(h.ports, '')
  await h.drain()
  assert.deepEqual(searchView().results.map(r => r.label), ['you', 'claude', 'output', 'Bash', 'you'])
  searchFor(h.ports, 'loader')
  await h.drain()
  assert.deepEqual(searchView().results.map(r => [r.n, r.label]), [[1, 'claude'], [2, 'output'], [3, 'Bash'], [4, 'you']])
  assert.match(searchView().legend, /^4 of 5 places$/)
  assert.ok(h.redraws() >= 2, 'each search redraws the pane')
})

test('a newer keystroke wins: the older search keeps nothing', async () => {
  const h = await ready()
  searchFor(h.ports, 'pane')
  searchFor(h.ports, 'loader')
  await h.drain()
  assert.equal(searchView().query, 'loader')
  assert.equal(searchView().results.length, 4)
})

test('a keystroke while a search is still reading: the older search stops, and nothing ever shows its results under the new text', async () => {
  const h = await ready()
  h.shown.length = 0
  // While the search for "loader" reads its piece, the person types "thanks".
  h.hook.onPieceRead = () => searchFor(h.ports, 'thanks')
  searchFor(h.ports, 'loader')
  await h.drain()
  assert.equal(searchView().query, 'thanks')
  assert.deepEqual(searchView().results.map(r => r.head), ['thanks, now the pane'])
  assert.deepEqual(h.shown.filter(s => s.query === 'thanks' && s.results !== 1), [], "no redraw showed the older search's 4 results under the new query")
})

test("the pane opens on the setting's view, until the person presses a toggle in this conversation", async () => {
  assert.deepEqual(viewToggles('you+claude+sessions+tools+outputs'), ['user', 'claude', 'sessions', 'tools', 'outputs'])
  assert.deepEqual(viewToggles('you+claude+sessions'), ['user', 'claude', 'sessions'])
  assert.deepEqual(viewToggles('no such view'), ['everything'])
  // custom: the on/off rows, in the presets' order; none on is everything.
  assert.deepEqual(viewToggles('custom', { searchWithThinking: true, searchWithYou: true }), ['user', 'thinking'])
  assert.deepEqual(viewToggles('custom', {}), ['everything'])
  const h = await ready()
  openOn('you+claude+sessions')
  assert.deepEqual(searchView().toggles, ['user', 'claude', 'sessions'])
  pressToggle(h.ports, 'tools')
  await h.drain()
  openOn('all')
  assert.deepEqual(searchView().toggles, ['user', 'claude', 'sessions', 'tools'], 'not reset: the person chose')
})

test('a toggle narrows the scope and searches again', async () => {
  const h = await ready()
  searchFor(h.ports, 'loader')
  await h.drain()
  pressToggle(h.ports, 'tools')
  await h.drain()
  assert.deepEqual(searchView().toggles, ['tools'])
  assert.deepEqual(searchView().results.map(r => r.label), ['Bash'])
  pressToggle(h.ports, 'tools')
  await h.drain()
  assert.deepEqual(searchView().toggles, ['everything'])
  assert.equal(searchView().results.length, 4)
})

test('#N lands on a tool row by the id it is drawn under, and on a message by uuid with the words', async () => {
  const h = await ready()
  searchFor(h.ports, 'loader')
  await h.drain()
  await goToResult(h.ports, '3', 'test') // the Bash call
  await goToResult(h.ports, '1', 'test') // the reply
  // The call's head goes with it only as the phrase a refused jump copies; the reply highlights the query's word.
  assert.deepEqual(h.arrived, [{ uuid: 'c1', drawn: 'toolu_1', words: 'Bash: grep -rn loader src' }, { uuid: 'r1', words: 'loader' }])
  // With no words in the query, a prompt carries its own head (djdarcy, 2026-10-26: a refused
  // jump to #35 had nothing to search for).
  searchFor(h.ports, '')
  await h.drain()
  await goToResult(h.ports, '1', 'test')
  assert.deepEqual(h.arrived.at(-1), { uuid: 'p2', words: 'thanks, now the pane' })
  await goToResult(h.ports, '9', 'test')
  assert.match(h.toasts.at(-1)!, /no result #9 \(1-5\)/)
})

test('*N pins a tool row in the search list with its block, and again unpins it', async () => {
  const h = await ready()
  searchFor(h.ports, 'loader')
  await h.drain()
  await pinResult(h.ports, '3')
  assert.deepEqual(h.pinCalls, [{ place: { uuid: 'c1', part: 0 }, on: true }])
  assert.ok(searchView().pinned.has(pinPlaceKey({ uuid: 'c1', part: 0 })))
  await pinResult(h.ports, '3')
  assert.deepEqual(h.pinCalls.at(-1), { place: { uuid: 'c1', part: 0 }, on: false })
  assert.equal(SEARCH_LIST, 'search')
})
