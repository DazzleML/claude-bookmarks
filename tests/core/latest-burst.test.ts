import { test } from 'node:test'
import assert from 'node:assert/strict'
import { latestBurst, reportTime } from '../../plugin/hooks/core/kit/latest-burst.ts'

const FRESH = 1500
const at = (entries: [string, number][]) => new Map(entries.map(([id, t]) => [id, { at: t }]))

test('with no other rows, the latest message reports are the burst', () => {
  assert.deepEqual(latestBurst(at([['a', 10_000], ['b', 9_000], ['old', 1_000]]), 0, FRESH), ['a', 'b'])
})

// The 2026-10-12 03:19:29 log: after a jump from the bottom to #324, #358's two replies
// were last reported 27 s earlier and never reported gone; a tool result in #324's
// exchange was reporting fresh lines. Nothing the pane can place is on screen now.
test('a screen of tool rows leaves no leftover message in the burst', () => {
  const messages = at([['reply358a', 2_000], ['reply358b', 2_000]])
  assert.deepEqual(latestBurst(messages, 29_700, FRESH), [])
})

test('a message reported alongside the tool rows stays in the burst', () => {
  const messages = at([['prompt324', 29_500], ['reply358a', 2_000]])
  assert.deepEqual(latestBurst(messages, 29_700, FRESH), ['prompt324'])
})

test('an older tool report does not push out newer messages', () => {
  assert.deepEqual(latestBurst(at([['a', 10_000]]), 5_000, FRESH), ['a'])
})

test('a tool row counts as news on its first report and on a change of lines only', () => {
  const before = { first: 0, last: 12, of: 65, at: 1_000 }
  assert.equal(reportTime(undefined, { first: 0, last: 4, of: 65 }, 5_000), 5_000)
  assert.equal(reportTime(before, { first: 0, last: 21, of: 65 }, 5_000), 5_000)
  assert.equal(reportTime(before, { first: 0, last: 12, of: 65 }, 5_000), 1_000, 'a repeat is a redraw')
  assert.equal(reportTime(before, { first: 0, last: 12, of: 70 }, 5_000), 1_000, 'growth is output streaming in')
})
