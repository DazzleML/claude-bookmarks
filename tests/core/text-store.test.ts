import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shard, utf8Bytes, withinBudget } from '../../plugin/hooks/core/text-store.ts'

test('bytes are counted as UTF-8', () => {
  assert.equal(utf8Bytes('abc'), 3)
  assert.equal(utf8Bytes('é'), 2)
  assert.equal(utf8Bytes('★'), 3)
  assert.equal(utf8Bytes('😀'), 4)
})

test('the budget keeps the newest whole, cuts the one that straddles it, drops the rest', () => {
  const texts = [
    { uuid: 'new', text: 'abcd' },
    { uuid: 'mid', text: 'efgh' },
    { uuid: 'old', text: 'ijkl' },
  ]
  assert.deepEqual(withinBudget(texts, 6), [{ uuid: 'new', text: 'abcd' }, { uuid: 'mid', text: 'ef' }])
  assert.deepEqual(withinBudget(texts, 0), texts, '0 is unlimited')
  assert.deepEqual(withinBudget(texts, 8), texts.slice(0, 2))
})

test('a cut never splits a character', () => {
  assert.deepEqual(withinBudget([{ uuid: 'a', text: 'ab★' }], 4), [{ uuid: 'a', text: 'ab' }])
})

test('shards stay under the cap and keep the order', () => {
  const texts = Array.from({ length: 50 }, (_, i) => ({ uuid: `u${i}`, text: 'x'.repeat(100) }))
  const pieces = shard(texts, 1000)
  assert.ok(pieces.length > 1)
  for (const p of pieces) assert.ok(utf8Bytes(JSON.stringify(p)) <= 1000, String(utf8Bytes(JSON.stringify(p))))
  assert.deepEqual(pieces.flat(), texts)
})
