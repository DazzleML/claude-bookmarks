import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterPrompts, matchLegend, matches, queryWords } from '../../plugin/hooks/core/filter.ts'

const rows = [
  { n: 1, text: 'Set up the plugin and its Band' },
  { n: 2, text: 'the band redraw from the key table' },
  { n: 3, text: 'palette by role on light themes' },
]
const textOf = (r: (typeof rows)[number]) => r.text

test('words in any order, case-insensitive, each a substring', () => {
  assert.deepEqual(filterPrompts(rows, 'BAND the', textOf).shown.map(r => r.n), [1, 2])
  assert.deepEqual(filterPrompts(rows, 'table band', textOf).shown.map(r => r.n), [2])
  assert.deepEqual(filterPrompts(rows, 'them', textOf).shown.map(r => r.n), [3], 'a substring of a word')
})

test('rows keep their numbers and order; the count is of all rows', () => {
  const r = filterPrompts(rows, 'the', textOf)
  assert.deepEqual(r.shown.map(x => x.n), [1, 2, 3])
  assert.equal(r.of, 3)
})

test('an empty query matches everything and shows no legend', () => {
  assert.equal(filterPrompts(rows, '   ', textOf).shown.length, 3)
  assert.equal(matchLegend(3, 3, '  '), undefined)
  assert.equal(matchLegend(1, 3, 'band'), '1 of 3 match')
})

test('query words are split on whitespace and lower-cased', () => {
  assert.deepEqual(queryWords('  Foo   BAR '), ['foo', 'bar'])
  assert.equal(matches('xFOOxBARx', ['foo', 'bar']), true)
  assert.equal(matches('foo only', ['foo', 'bar']), false)
})
