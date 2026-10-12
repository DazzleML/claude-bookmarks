import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHANNELS, formatChannels, parseChannels } from './debug.ts'

test('channel names parse from commas or spaces, case-insensitively, once each', () => {
  assert.deepEqual(parseChannels('screen, HELD  screen'), { known: ['screen', 'held'], unknown: [] })
})

test('names that are not channels come back apart, so a typo is reported, not ignored', () => {
  assert.deepEqual(parseChannels('screem,held'), { known: ['held'], unknown: ['screem'] })
})

test('nothing set means no channel on', () => {
  assert.deepEqual(parseChannels(undefined), { known: [], unknown: [] })
  assert.deepEqual(parseChannels(' , '), { known: [], unknown: [] })
})

test('the stored value lists channels in table order and is empty when none is on', () => {
  assert.equal(formatChannels(['held', 'screen']), 'screen,held')
  assert.equal(formatChannels([]), '')
  assert.deepEqual(parseChannels(formatChannels(['held', 'screen'])).known, ['screen', 'held'])
})

test('every channel says what it records', () => {
  for (const [name, what] of Object.entries(CHANNELS)) assert.ok(what.length > 20, name)
})
