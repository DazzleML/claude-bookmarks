// node --test tests/core/tool-fold.test.ts
// The bookmark tool's calls folded away (0.7.5): calls grouped by the turn they were made in, the
// two levels of opening, which results show, and the one-line summary of a call from its input
// and its answer (core/bookmarks/tool-fold.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOOKMARK_TOOL_NAME, FOLDED_TOOLS, LISTS_TOOL_NAME, ToolFold, callLine, compactLine, foldLine, foldsTool, listsLine, resultObject } from '../../plugin/hooks/core/bookmarks/tool-fold.ts'

test("the tool's rows are matched by the name the probe showed Claude Code draws them under", () => {
  assert.equal(BOOKMARK_TOOL_NAME, 'mcp__bookmarks__bookmark')
})

test("calls group by their turn: the first draws the fold's line and knows the count", () => {
  const f = new ToolFold()
  f.newTurn()
  f.noteCall('a')
  f.noteCall('b')
  f.noteCall('c')
  f.newTurn()
  f.noteCall('d')
  assert.deepEqual(f.placeOf('a'), { turn: 1, first: true, count: 3 })
  assert.deepEqual(f.placeOf('b'), { turn: 1, first: false, count: 3 })
  assert.deepEqual(f.placeOf('d'), { turn: 2, first: true, count: 1 })
  assert.deepEqual(f.placeOf('never-seen'), { turn: undefined }, 'a call from before this load has no turn')
  f.noteCall('a')
  assert.deepEqual(f.placeOf('a'), { turn: 1, first: true, count: 3 }, 'a call noted twice counts once')
})

test("two levels: a call's result shows only with the call open, and its turn open too", () => {
  const f = new ToolFold()
  f.newTurn()
  f.noteCall('a')
  assert.equal(f.resultShown('a'), false)
  f.toggleCall('a')
  assert.equal(f.resultShown('a'), false, 'the call is open but its turn is closed')
  f.toggleTurn(1)
  assert.equal(f.resultShown('a'), true)
  f.toggleCall('a')
  assert.equal(f.resultShown('a'), false)
  // A call of no known turn opens on its own.
  f.toggleCall('old')
  assert.equal(f.resultShown('old'), true)
  f.newConversation()
  assert.deepEqual([f.placeOf('a'), f.callOpen('old'), f.turnOpen(1)], [{ turn: undefined }, false, false])
})

test("the tool's answer is found wherever the stored output keeps it", () => {
  const body = JSON.stringify({ ok: true, n: 95 })
  assert.deepEqual(resultObject(body), { ok: true, n: 95 })
  assert.deepEqual(resultObject({ result: body }), { ok: true, n: 95 })
  assert.deepEqual(resultObject([{ type: 'text', text: body }]), { ok: true, n: 95 })
  assert.deepEqual(resultObject({ content: [{ type: 'text', text: body }] }), { ok: true, n: 95 })
  assert.deepEqual(resultObject({ ok: true, n: 3 }), { ok: true, n: 3 })
  assert.equal(resultObject('not json'), undefined)
  assert.equal(resultObject(undefined), undefined)
})

test("a call's line says what it did: the number and label, an ambiguity, an error, an action", () => {
  assert.equal(compactLine({ label: '#22, its first line ends at {' }, JSON.stringify({ ok: true, n: 95 })), '⚓ bookmark #95: #22, its first line ends at {')
  assert.equal(compactLine({ label: 'x' }, JSON.stringify({ ambiguous: true, candidates: [{}, {}] })), '⚓ bookmark: 2 places hold that fragment')
  assert.equal(compactLine({}, JSON.stringify({ error: 'give `query` or `uuid`' })), '⚓ bookmark: give `query` or `uuid`')
  assert.equal(compactLine({ action: 'relabel', label: 'new' }, JSON.stringify({ ok: true, n: 7 })), '⚓ bookmark relabel #7: new')
  assert.equal(compactLine({ action: 'list' }, JSON.stringify({ records: [] })), '⚓ bookmark list')
  assert.equal(compactLine({ label: 'pending' }, undefined, { running: true }), '⚓ bookmark: pending …')
  assert.equal(compactLine({}, 'refused', { errored: true }), '⚓ bookmark: failed')
  assert.equal(compactLine({ label: 'y'.repeat(100) }, JSON.stringify({ ok: true, n: 1 })).length, '⚓ bookmark #1: '.length + 60, 'a long label is cut')
})

test("the fold's line: how many calls, and whether it is open", () => {
  assert.equal(foldLine(5, false), '⚓ 5 bookmark calls ▸')
  assert.equal(foldLine(1, true), '⚓ 1 bookmark call ▾')
})

// The lists tool's calls fold as the bookmark tool's do (0.7.9): every tool of the plugin's own is
// one class, read from FOLDED_TOOLS.
test("every tool of the plugin's own folds, by the table; no other tool does", () => {
  assert.equal(LISTS_TOOL_NAME, 'mcp__bookmarks__lists')
  assert.deepEqual(Object.keys(FOLDED_TOOLS).sort(), [BOOKMARK_TOOL_NAME, LISTS_TOOL_NAME].sort())
  assert.equal(foldsTool(BOOKMARK_TOOL_NAME), true)
  assert.equal(foldsTool(LISTS_TOOL_NAME), true)
  for (const other of ['Bash', 'mcp__bookmarks__other', 'toString', undefined, 3]) assert.equal(foldsTool(other), false, String(other))
  assert.equal(callLine(BOOKMARK_TOOL_NAME, { label: 'x' }, JSON.stringify({ ok: true, n: 2 })), '⚓ bookmark #2: x')
  assert.equal(callLine(LISTS_TOOL_NAME, { action: 'add', label: 'Push dev' }, JSON.stringify({ ok: true })), '☰ lists add: Push dev')
})

test("a turn counts its calls by tool, and the fold's line names them", () => {
  const f = new ToolFold()
  f.newTurn()
  f.noteCall('a', BOOKMARK_TOOL_NAME)
  f.noteCall('b', LISTS_TOOL_NAME)
  f.noteCall('c', LISTS_TOOL_NAME)
  f.noteCall('b', LISTS_TOOL_NAME)
  assert.deepEqual(f.placeOf('b'), { turn: 1, first: false, count: 3 })
  assert.deepEqual(f.toolsIn(1), { [BOOKMARK_TOOL_NAME]: 1, [LISTS_TOOL_NAME]: 2 })
  assert.equal(foldLine(3, false, f.toolsIn(1)), '⚓ 3 calls: 1 bookmark, 2 lists ▸')
  f.newTurn()
  f.noteCall('d', LISTS_TOOL_NAME)
  assert.equal(foldLine(1, true, f.toolsIn(2)), '☰ 1 lists call ▾')
  f.newConversation()
  assert.deepEqual(f.toolsIn(1), {})
})

test("a lists call's line says the action and what it named, or the error", () => {
  const ok = JSON.stringify({ ok: true })
  assert.equal(listsLine({}, JSON.stringify({ yours: [], claudes: [] })), '☰ lists')
  assert.equal(listsLine({ action: 'show', list: "What's left" }, ok), "☰ lists show: What's left")
  assert.equal(listsLine({ action: 'create', name: 'Tests to run' }, ok), '☰ lists create: Tests to run')
  assert.equal(listsLine({ action: 'rename', list: '2', name: 'Later' }, ok), '☰ lists rename: 2 -> Later')
  assert.equal(listsLine({ action: 'move', list: '1', item: 3, to: 1 }, ok), '☰ lists move: item 3 to 1')
  assert.equal(listsLine({ action: 'done', item: '4' }, ok), '☰ lists done: item 4')
  assert.equal(listsLine({ action: 'add', label: 'pending' }, undefined, { running: true }), '☰ lists add: pending …')
  assert.equal(listsLine({ action: 'add' }, JSON.stringify({ error: 'add needs `label`' })), '☰ lists: add needs `label`')
  assert.equal(listsLine({ action: 'add' }, 'refused', { errored: true }), '☰ lists: failed')
  assert.equal(listsLine({ action: 'add', label: 'z'.repeat(100) }, ok).length, '☰ lists add: '.length + 60, 'a long label is cut')
})
