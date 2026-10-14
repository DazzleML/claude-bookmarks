import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LINE_COMMANDS, bandButtons, helpLines, helpShort, lineHint, lineKeys, listHint, parseListNumber, route } from '../../plugin/hooks/core/band/keys.ts'

test('a typed list number: a prompt, an unfold, or a footnote', () => {
  assert.deepEqual(parseListNumber('3'), { n: 3 })
  assert.deepEqual(parseListNumber('3.'), { n: 3, unfold: true })
  assert.deepEqual(parseListNumber('3.12'), { n: 3, k: 12 })
  assert.deepEqual(parseListNumber(' 0.1 '), { n: 0, k: 1 })
  for (const bad of ['', '.', 'a', '3.1.2', '-1', '3..']) assert.equal(parseListNumber(bad), undefined, bad)
})

const none = { pane: 'none' as const }

test('the bar: one button per shown command, labelled once, ? last', () => {
  const bar = bandButtons({ chords: true })
  assert.deepEqual(bar.map(b => b.label), ['mark', 'jump', 'prompts', 'read', '?'])
  assert.equal(new Set(bar.map(b => b.label)).size, bar.length, 'nothing listed twice')
  for (const b of bar) assert.notEqual(route(b.key, none).operation.op, 'hint', `${b.label} presses a real command`)
})

test("a hotkey only where the engine takes one: not ', Space or ?", () => {
  const bar = bandButtons({ chords: true })
  assert.deepEqual(Object.fromEntries(bar.map(b => [b.label, b.hotkey])), { mark: 'm', jump: 'j', prompts: 'p', read: 'r', '?': undefined })
})

test('the four borrowed actions ride only while chords are on', () => {
  assert.deepEqual(bandButtons({ chords: true }).filter(b => b.chord).map(b => b.chord), ['mark', 'jump', 'prompts', 'read'])
  assert.deepEqual(bandButtons({ chords: false }).filter(b => b.chord), [])
})

test('? opens the help, and the help explains every routed key', () => {
  assert.deepEqual(route('?', none), { operation: { op: 'help' }, needsMore: false })
  const help = helpLines({ leader: 'Ctrl+]', chords: true, panes: true }).join('\n')
  for (const c of LINE_COMMANDS) assert.ok(help.includes(c.help), c.id)
  for (const k of lineKeys()) assert.ok(help.includes(k === ' ' ? 'Space' : k), k)
  assert.match(help, /Chords .*: on/)
  assert.match(helpLines({ leader: 'Ctrl+]', chords: false, panes: false }).join('\n'), /: off\. Lists in a pane: off/)
})

test('the short help still names every routed key and the switches, in four lines', () => {
  const short = helpShort({ leader: 'Ctrl+]', chords: true, panes: true })
  assert.equal(short.length, 4)
  for (const k of lineKeys()) assert.ok(short[0]!.includes(k === ' ' ? 'Space' : k), k)
  assert.ok(short[1]!.includes('s pin') && short[2]!.includes('c claim'))
  assert.match(short[3]!, /Chords .*: on\. Lists in a pane: on/)
})

test("the command line routes today's commands to the same operations", () => {
  assert.deepEqual(route("'a", none), { operation: { op: 'jump-mark', letter: 'a' }, needsMore: false })
  assert.deepEqual(route('jq', none), { operation: { op: 'jump-mark', letter: 'q' }, needsMore: false })
  assert.deepEqual(route("'", none), { operation: { op: 'open', pane: 'jump' }, needsMore: true })
  assert.deepEqual(route('m', none), { operation: { op: 'open', pane: 'mark' }, needsMore: true })
  assert.deepEqual(route(' ', none).operation, { op: 'reading' })
  assert.deepEqual(route('r', none).operation, { op: 'reading' })
  assert.deepEqual(route('p', none), { operation: { op: 'open', pane: 'list' }, needsMore: true })
  assert.deepEqual(route('b', none).operation, { op: 'open', pane: 'bookmarks' })
  assert.deepEqual(route('Pc', none).operation, { op: 'promote', letter: 'c' })
  assert.deepEqual(route('o', none).operation, { op: 'jumplist', dir: -1 })
  assert.deepEqual(route('i', none).operation, { op: 'jumplist', dir: 1 })
})

test('P alone waits for its letter; a bad letter gives a hint, not an action', () => {
  assert.deepEqual(route('P', none), { operation: { op: 'wait' }, needsMore: true })
  assert.equal(route('P9', none).operation.op, 'hint')
  assert.equal(route("'9", none).operation.op, 'hint')
})

test('an unknown first key gives the generated hint', () => {
  const r = route('z', none)
  assert.equal(r.operation.op, 'hint')
  assert.equal(r.operation.op === 'hint' && r.operation.reason, lineHint())
})

test('the hint names every routed key exactly once', () => {
  const hint = lineHint()
  for (const k of lineKeys()) {
    const shown = k === ' ' ? 'Space' : k
    const count = hint.split(/[\s()+]+/).filter(w => w === shown).length
    assert.equal(count, 1, `"${shown}" appears ${count} times in: ${hint}`)
  }
})

test('no key belongs to two commands', () => {
  const keys = lineKeys()
  assert.equal(new Set(keys).size, keys.length)
})

test('every command routes to something other than a hint', () => {
  for (const c of LINE_COMMANDS) {
    for (const k of c.keys) {
      const arg = c.then === 'letter' || c.then === 'mark-letter' ? 'a' : ''
      assert.notEqual(route(k + arg, none).operation.op, 'hint', `${k}${arg}`)
    }
  }
})

test('a list pane takes digits, j/k, Enter, and its own keys', () => {
  const list = { pane: 'list' as const }
  assert.deepEqual(route('7', list), { operation: { op: 'digit', digit: '7' }, needsMore: true })
  assert.deepEqual(route('j', list).operation, { op: 'step', dir: 1 })
  assert.deepEqual(route('Enter', list), { operation: { op: 'go' }, needsMore: false })
  assert.deepEqual(route('s', list).operation, { op: 'pin' })
  assert.equal(route('/', list).operation.op, 'hint', '`/words` belongs to the pane field, not a band key')
  assert.equal(route('h', list).operation.op, 'hint', 'groups are the bookmarks pane only')
})

test('the bookmarks pane has groups and no pin', () => {
  const bm = { pane: 'bookmarks' as const }
  assert.deepEqual(route('h', bm).operation, { op: 'group', dir: -1 })
  assert.deepEqual(route('l', bm).operation, { op: 'group', dir: 1 })
  assert.equal(route('s', bm).operation.op, 'hint')
})

test('Esc closes, in any context', () => {
  for (const pane of ['none', 'list', 'bookmarks'] as const) assert.deepEqual(route('Escape', { pane }).operation, { op: 'close' })
})

test("each list pane's hint is generated from its own keys", () => {
  assert.equal(listHint('list'), 'number + Enter jump · j next · k previous · s pin · q close · Esc close')
  assert.equal(listHint('bookmarks'), 'number + Enter jump · j next · k previous · h previous group · l next group · c claim · q close · Esc close')
})

test('q closes, at rest and in a list (Q261012-09)', () => {
  assert.deepEqual(route('q', none), { operation: { op: 'close' }, needsMore: false })
  assert.deepEqual(route('q', { pane: 'list' }).operation, { op: 'close' })
  assert.deepEqual(route('q', { pane: 'bookmarks' }).operation, { op: 'close' })
})
