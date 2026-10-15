import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pruneStore } from '../../plugin/hooks/core/store-prune.ts'

const DAY = 86_400_000
const NOW = 100 * DAY

test('a conversation unopened past the age loses only what the transcript rebuilds', () => {
  const keys = ['prompts:old', 'footnotes:old', 'backfilled6:old', 'marks:old', 'pins:old', 'readingState:old', 'jumplist:old', 'prompts:cur']
  const { drop, seen } = pruneStore(keys, { old: NOW - 31 * DAY, cur: NOW - DAY }, NOW, 30 * DAY, 'cur', 6)
  assert.deepEqual(drop.sort(), ['backfilled6:old', 'footnotes:old', 'prompts:old'])
  assert.deepEqual(seen, { cur: NOW })
})

test('within the age nothing goes', () => {
  const keys = ['prompts:a', 'backfilled6:a']
  assert.deepEqual(pruneStore(keys, { a: NOW - 29 * DAY }, NOW, 30 * DAY, 'cur', 6).drop, [])
})

test('conversations already in the store with no time are given today, not pruned', () => {
  const keys = ['prompts:a', 'footnotes:b', 'backfilled6:c']
  const { drop, seen } = pruneStore(keys, {}, NOW, 30 * DAY, 'cur', 6)
  assert.deepEqual(drop, [])
  assert.deepEqual(seen, { cur: NOW, a: NOW, b: NOW, c: NOW })
})

test('the open conversation is never pruned, however old its time', () => {
  const keys = ['prompts:cur', 'backfilled6:cur']
  assert.deepEqual(pruneStore(keys, { cur: 0 }, NOW, 30 * DAY, 'cur', 6).drop, [])
})

test('back-fill flags of other versions go at once; the current one stays', () => {
  const keys = ['backfilled:a', 'backfilled3:a', 'backfilled5:b', 'backfilled6:b', 'debug:a']
  assert.deepEqual(pruneStore(keys, {}, NOW, 30 * DAY, 'cur', 6).drop.sort(), ['backfilled3:a', 'backfilled5:b', 'backfilled:a'])
})
