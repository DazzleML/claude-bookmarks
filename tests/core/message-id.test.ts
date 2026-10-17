import { test } from 'node:test'
import assert from 'node:assert/strict'
import { byFirstFour, findByMessage, firstFour, isDrawnId, matchesPrefix, sameMessage } from '../../plugin/hooks/core/kit/message-id.ts'

test('matchesPrefix is for typed input: the whole id or an 8+ prefix, either way round, any case', () => {
  const id = '70f2a222-23f8-4828-b57e-837f3571b5cf'
  assert.ok(matchesPrefix(id, id))
  assert.ok(matchesPrefix(id, '70f2a222'))
  assert.ok(matchesPrefix(id, '70F2A222-23F8'))
  assert.ok(matchesPrefix('70f2a222', id), 'a stored 8-character prefix matches the full id')
  assert.ok(!matchesPrefix(id, '70f2a22'), 'seven characters are not enough')
  assert.ok(!matchesPrefix(id, '70f2a222-23f8-4828-b57e-000000000000'), 'a drawn id is not a prefix; that is sameMessage\'s job')
})

test('a drawn id has its fifth group all zeros', () => {
  assert.ok(isDrawnId('70f2a222-23f8-4828-b57e-000000000000'))
  assert.ok(!isDrawnId('70f2a222-23f8-4828-b57e-837f3571b5cf'))
  assert.ok(!isDrawnId('70f2a222'))
})

test('a position map keyed by first four groups finds a drawn id', () => {
  const m = byFirstFour(new Map([['70f2a222-23f8-4828-b57e-837f3571b5cf', 324000]]))
  assert.equal(m.get(firstFour('70f2a222-23f8-4828-b57e-000000000000')), 324000)
})

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
