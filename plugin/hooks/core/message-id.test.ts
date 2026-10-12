import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findByMessage, firstFour, sameMessage } from './message-id.ts'

const stored = '70f2a222-23f8-4828-b57e-837f3571b5cf'
const drawn = '70f2a222-23f8-4828-b57e-000000000000'

test('a drawn id and its stored uuid are the same message', () => {
  assert.equal(firstFour(drawn), '70f2a222-23f8-4828-b57e')
  assert.ok(sameMessage(stored, drawn))
  assert.ok(sameMessage(stored, stored))
})

test('messages differing in the first four groups are different', () => {
  assert.ok(!sameMessage(stored, '70f2a222-23f8-4828-b57f-837f3571b5cf'))
})

test('an exact id wins over a first-four match, and a drawn id still finds its row', () => {
  const rows = [{ uuid: '70f2a222-23f8-4828-b57e-111111111111', n: 1 }, { uuid: stored, n: 2 }]
  assert.equal(findByMessage(rows, stored)?.n, 2)
  assert.equal(findByMessage(rows, drawn)?.n, 1)
  assert.equal(findByMessage(rows, 'ffffffff-0000-0000-0000-000000000000'), undefined)
})
