import { test } from 'node:test'
import assert from 'node:assert/strict'
import { since } from '../../plugin/hooks/core/time/since.ts'
import { age } from '../../plugin/hooks/core/prompts/list-model.ts'

const s = 1000, m = 60 * s, h = 60 * m, d = 24 * h
const now = 1000 * d

// The 11 spans (brainstorm's table, round 2 of the bundles consultation, with djdarcy's two answers
// of 2026-11-02 14:58: the zero shown, weeks as wk). Columns: depth 0, 1, 2; then quarters on at 0, 1, 2.
const TABLE: ReadonlyArray<readonly [string, number, readonly string[], readonly string[]]> = [
  ['nothing', 0, ['0s', '0s', '0s'], ['0s', '0s', '0s']],
  ['45 s', 45 * s, ['45s', '45s', '45s'], ['45s', '45s', '45s']],
  ['2h 30m 10s', 2 * h + 30 * m + 10 * s, ['2h', '2h 30m', '2h 30m 10s'], ['2h', '2h 30m', '2h 30m 10s']],
  ['23h 59m', 23 * h + 59 * m, ['23h', '23h 59m', '23h 59m 0s'], ['23h', '23h 59m', '23h 59m 0s']],
  ['a day exactly', d, ['1d', '1d 0h', '1d 0h 0m'], ['1d', '1d 0h', '1d 0h 0m']],
  ['1d 2h 5m', d + 2 * h + 5 * m, ['1d', '1d 2h', '1d 2h 5m'], ['1d', '1d 2h', '1d 2h 5m']],
  ['9d 3h', 9 * d + 3 * h, ['1wk', '1wk 2d', '1wk 2d 3h'], ['1wk', '1wk 2d', '1wk 2d 3h']],
  ['29 d', 29 * d, ['4wk', '4wk 1d', '4wk 1d 0h'], ['4wk', '4wk 1d', '4wk 1d 0h']],
  ['39 d', 39 * d, ['1mo', '1mo 1wk', '1mo 1wk 2d'], ['1mo', '1mo 1wk', '1mo 1wk 2d']],
  ['100 d', 100 * d, ['3mo', '3mo 1wk', '3mo 1wk 3d'], ['1q', '1q 0mo', '1q 0mo 1wk']],
  ['400 d', 400 * d, ['1y', '1y 1mo', '1y 1mo 0wk'], ['1y', '1y 0q', '1y 0q 1mo']],
]

for (const [name, span, plain, withQuarters] of TABLE) {
  test(`since: ${name}, at depths 0, 1, 2, quarters off and on`, () => {
    for (const depth of [0, 1, 2]) {
      assert.equal(since(now, now - span, { depth }), plain[depth], `depth ${depth}`)
      assert.equal(since(now, now - span, { depth, quarters: true }), withQuarters[depth], `depth ${depth}, quarters`)
    }
  })
}

test('since: depth 1 by default; a time after now is nothing, never negative', () => {
  assert.equal(since(now, now - (d + 2 * h)), '1d 2h')
  assert.equal(since(now, now + 5 * m), '0s')
})

test('since: every rung floors, never rounds', () => {
  assert.equal(since(now, now - (2 * h + 59 * m + 59 * s), { depth: 0 }), '2h')
  assert.equal(since(now, now - (6 * d + 23 * h), { depth: 0 }), '6d')
})

test('since: a floor stops the ladder at that unit, and a span under it reads as zero of it', () => {
  assert.equal(since(now, now - 45 * s, { depth: 0, floor: 'm' }), '0m')
  assert.equal(since(now, now - (2 * h + 30 * m + 10 * s), { depth: 2, floor: 'm' }), '2h 30m')
  assert.equal(since(now, now - 3 * d, { depth: 1, floor: 'd' }), '3d')
})

// The bookmarks pane's age is the ladder at depth 0 with minutes the smallest unit. Three texts
// read differently from the old rounding three-rung age: just under an hour or a day, and a week on.
test('age: the bookmarks pane, one rung, minutes the floor', () => {
  assert.equal(age(now, now - 5 * m), '5m')
  assert.equal(age(now, now - 3 * h), '3h')
  assert.equal(age(now, now - 2 * d), '2d')
  assert.equal(age(now, now - 30 * s), '0m')
  assert.equal(age(now, now - (23 * h + 59 * m)), '23h')
  assert.equal(age(now, now - 9 * d), '1wk')
  assert.equal(age(now, now - 400 * d), '1y')
})
