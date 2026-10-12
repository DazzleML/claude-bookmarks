import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LINE_COMMANDS, lineHint, lineKeys, linePlaceholder, listHint, route } from './keys.ts'

test('the band placeholder names one key of every command, Space as ␣', () => {
  assert.equal(linePlaceholder(), "' m ␣ p b P o i")
  assert.equal(linePlaceholder().split(' ').length, LINE_COMMANDS.length)
})

const none = { pane: 'none' as const }

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
  assert.deepEqual(route('/', list).operation, { op: 'filter' })
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
  assert.equal(listHint('list'), 'number + Enter jump · j next · k previous · s pin · / filter · Esc close')
  assert.equal(listHint('bookmarks'), 'number + Enter jump · j next · k previous · h previous group · l next group · Esc close')
})
