// The keymap layer (unit A2 of the keys design, 2026-10-20; #36): the person's keys over
// the key table, applied as the tables every reader of keys.ts takes. One test per
// contract the design names; the default tables' readers are pinned by keys.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyKeymap, barHotkey, parseKeymap } from '../../plugin/hooks/core/band/keymap.ts'
import { DEFAULT_TABLES, LINE_COMMANDS, bandButtons, fieldKeysFor, helpLines, lineHint, listHint, route } from '../../plugin/hooks/core/band/keys.ts'

const none = { pane: 'none' as const }
const list = { pane: 'list' as const }
const now = { leader: 'Ctrl+]', chords: true, panes: true }
const keysOf = (t: typeof DEFAULT_TABLES, id: string) => t.line.find(c => c.id === id)!.keys

test('parseKeymap keeps trimmed values and drops empty ones', () => {
  const { keymap, problems } = parseKeymap({ mark: ' m ', jump: '', prompts: undefined, list: 'j k' })
  assert.deepEqual(keymap, { mark: 'm', list: 'j k' })
  assert.deepEqual(problems, [])
})

test('an empty keymap gives tables whose hints, help and bar are the defaults, byte for byte', () => {
  const { tables, problems } = applyKeymap({})
  assert.deepEqual(problems, [])
  assert.equal(lineHint(tables), lineHint())
  assert.equal(listHint('list', tables), listHint('list'))
  assert.equal(listHint('bookmarks', tables), listHint('bookmarks'))
  assert.deepEqual(helpLines(now, tables), helpLines(now))
  assert.deepEqual(bandButtons({ chords: true }, tables), bandButtons({ chords: true }))
  for (const c of LINE_COMMANDS) assert.deepEqual(keysOf(tables, c.id), [...c.keys], c.id)
})

test("a command's value is its keys in order, Space spelled, hidden as the last word", () => {
  const { tables, problems } = applyKeymap({ mark: 'x', jump: "' g", read: 'Space r', promote: 'P hidden', bookmarks: 'b' })
  assert.deepEqual(problems, [])
  assert.deepEqual(keysOf(tables, 'mark'), ['x'])
  assert.deepEqual(keysOf(tables, 'jump'), ["'", 'g'])
  assert.deepEqual(keysOf(tables, 'read'), [' ', 'r'])
  assert.deepEqual(keysOf(tables, 'promote'), ['P'])
  assert.equal(tables.line.find(c => c.id === 'promote')!.shown, false)
  assert.equal(tables.line.find(c => c.id === 'bookmarks')!.shown, true, 'a value without hidden shows the button')
  assert.equal(route('x', none, tables).operation.op, 'open')
  assert.equal(route('m', none, tables).operation.op, 'hint', 'the old key is no longer a command')
  assert.ok(lineHint(tables).includes('x + letter (mark)') && !lineHint(tables).includes('m + letter (mark)'))
})

test('a renamed command still hints with the keymap, not the defaults', () => {
  const { tables } = applyKeymap({ jump: 'g' })
  const r = route('g!', none, tables)
  assert.equal(r.operation.op, 'hint')
  assert.equal((r.operation as { reason: string }).reason, lineHint(tables))
  assert.ok(!(r.operation as { reason: string }).reason.includes("' or j"))
})

test('an unknown command, an unusable key and a value with no usable key are named, and the default is kept', () => {
  const { tables, problems } = applyKeymap({ frobnicate: 'z', prompts: 'Left', read: 'ab' })
  assert.deepEqual(keysOf(tables, 'prompts'), ['p'])
  assert.deepEqual(keysOf(tables, 'read'), [' ', 'r'])
  assert.deepEqual(problems.map(p => [p.command, p.key, p.reason]).sort(), [
    ['frobnicate', undefined, 'not a command of this version'],
    ['prompts', 'Left', 'Left never reaches the band on a stock build'],
    ['prompts', undefined, 'no usable key; the default is kept'],
    ['read', 'ab', '"ab" is not one key'],
    ['read', undefined, 'no usable key; the default is kept'],
  ].sort())
})

test('a clash on the command line goes to the first command in table order; the line and a list may share a key', () => {
  const { tables, problems } = applyKeymap({ mark: 'x', jump: 'x' })
  assert.deepEqual(keysOf(tables, 'mark'), ['x'])
  assert.deepEqual(keysOf(tables, 'jump'), ["'", 'j'], 'jump keeps its default')
  assert.deepEqual(problems, [{ command: 'jump', key: 'x', reason: 'already mark' }])
  const shared = applyKeymap({ jump: 'j', list: 'j k s h l c d q' })
  assert.deepEqual(shared.problems, [], 'j on the line and j in a list are different contexts')
  // A command whose every key clashes falls back to its defaults -- minus any default an
  // earlier command now holds (sweep v0.6.2, M6: mark took j, so jump keeps only ').
  const fallback = applyKeymap({ mark: 'j', jump: 'j' })
  assert.deepEqual(keysOf(fallback.tables, 'mark'), ['j'])
  assert.deepEqual(keysOf(fallback.tables, 'jump'), ["'"])
  assert.equal(new Set(fallback.tables.line.flatMap(c => c.keys)).size, fallback.tables.line.flatMap(c => c.keys).length, 'no key on two commands')
})

test('the bar hotkey is the first key the engine takes: one digit or one lowercase letter', () => {
  assert.equal(barHotkey(['P']), undefined)
  assert.equal(barHotkey(["'", 'j']), 'j')
  assert.equal(barHotkey([' ', 'r']), 'r')
  assert.equal(barHotkey(['?']), undefined)
  assert.equal(barHotkey(['m']), 'm')
  assert.equal(barHotkey(['5']), '5')
  const { tables } = applyKeymap({ mark: 'M' })
  assert.equal(bandButtons({ chords: false }, tables).find(b => b.id === 'mark')!.hotkey, undefined, 'an uppercase key is type-only')
})

test('the list keys are renamed by position; a digit, a field prefix and a clash are refused', () => {
  // The list value is positional in the table's order: j k s h l c d q (d is the bookmarks list's remove, unit 5).
  const { tables, problems } = applyKeymap({ list: 'j k s h l c d x' })
  assert.deepEqual(problems, [])
  assert.equal(route('x', list, tables).operation.op, 'close')
  assert.equal(route('q', list, tables).operation.op, 'hint')
  assert.ok(listHint('list', tables).includes('x close') && !listHint('list', tables).includes('q close'))
  assert.deepEqual(fieldKeysFor('list', tables).map(k => k.key), ['/', '*'], 'the field prefixes are not renamed')
  const bad = applyKeymap({ list: '7 / x' })
  assert.deepEqual(bad.problems.map(p => p.key), ['7', '/'])
  assert.equal(route('j', list, bad.tables).operation.op, 'step', 'next keeps j')
  assert.equal(route('k', list, bad.tables).operation.op, 'step', 'previous keeps k: / is the filter prefix in the field')
  assert.equal(route('x', list, bad.tables).operation.op, 'pin')
  const clash = applyKeymap({ list: 'j j' })
  assert.equal(clash.problems.length, 1)
  assert.equal(route('k', list, clash.tables).operation.op, 'step', 'previous keeps k after the clash')
  // The kept default counts as taken after a clash (sweep v0.6.2, M12): pin cannot take k.
  const chained = applyKeymap({ list: 'j j k' })
  assert.equal(chained.problems.length, 2)
  assert.equal(route('s', list, chained.tables).operation.op, 'pin', 'pin keeps s')
  assert.equal(route('k', list, chained.tables).operation.op, 'step')
  assert.equal(new Set(chained.tables.list.filter(l => !l.field).map(l => l.key)).size, chained.tables.list.filter(l => !l.field).length, 'no list key twice')
  // 0 is a digit too (sweep v0.6.2, M9).
  assert.deepEqual(applyKeymap({ list: '0' }).problems.map(p => p.key), ['0'])
  const extra = applyKeymap({ list: 'j k s h l c d q z' })
  assert.equal(extra.problems[0]!.reason, '9 keys for 8 list commands; the extra are ignored')
})
