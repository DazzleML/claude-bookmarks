import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ECHO_POLICY_KEY, SEEN_KEY, jumplistKey, marksKey, pinsKey, readingStateKey } from '../../plugin/hooks/core/store-keys.ts'

// The keys are the store's on-disk names: a change here orphans what people already have.
test('the store key families keep their on-disk names', () => {
  assert.equal(marksKey('s1'), 'marks:s1')
  assert.equal(pinsKey('s1'), 'pins:s1')
  assert.equal(jumplistKey('s1'), 'jumplist:s1')
  assert.equal(readingStateKey('s1'), 'readingState:s1')
  assert.equal(SEEN_KEY, 'seen')
  assert.equal(ECHO_POLICY_KEY, 'debug:echo')
})
