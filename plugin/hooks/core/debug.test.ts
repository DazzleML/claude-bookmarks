import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CHANNELS, formatChannels, formatDebugEnv, parseChannels, parseDebugEnv, screenMirror } from './debug.ts'

// 0.4.7 renamed [bm-poc] to [bm] and dropped the space after it in 55 log lines, so
// "[bm]nearest prompt moved" no longer matched the screen mirror. Read the real file.
test('every [bm] log prefix in register.tsx is followed by a space', () => {
  const source = readFileSync(new URL('../register.tsx', import.meta.url), 'utf8')
  const glued = source.split('\n').filter(l => /\[bm\][^ '`"]/.test(l))
  assert.deepEqual(glued, [])
})

test('the screen log mirrors the yellow row lines whole, without the prefix', () => {
  assert.equal(screenMirror('[bm] nearest prompt moved: 70f2a222 -> 59ec5ce8'), 'nearest prompt moved: 70f2a222 -> 59ec5ce8')
  assert.equal(screenMirror('[bm] held by a redraw: kept 70f2a222'), 'held by a redraw: kept 70f2a222')
  assert.equal(screenMirror('[bm] bookmark added: 70f2a222'), undefined)
  assert.equal(screenMirror('[bm-poc] nearest prompt moved: a -> b'), undefined)
  assert.equal(screenMirror(`[bm] pane follow ${'x'.repeat(200)}`)?.length, 110)
})

// PRIVACY.md names one variable, CONVO_BOOKMARKS_DEBUG; the channels share it with the echo.
test('the echo values from before channels read as they did', () => {
  assert.deepEqual(parseDebugEnv('1'), { echo: true, channels: [], unknown: [] })
  assert.deepEqual(parseDebugEnv('OFF'), { echo: false, channels: [], unknown: [] })
  assert.deepEqual(parseDebugEnv(undefined), { echo: undefined, channels: [], unknown: [] })
})

test('echo and channels share the one variable, in either order', () => {
  assert.deepEqual(parseDebugEnv('screen,1,held'), { echo: true, channels: ['screen', 'held'], unknown: [] })
  assert.deepEqual(parseDebugEnv('screen'), { echo: undefined, channels: ['screen'], unknown: [] })
  assert.deepEqual(parseDebugEnv('screem'), { echo: undefined, channels: [], unknown: ['screem'] })
})

test('the stored value keeps the echo choice and the channels, and is dropped when both are empty', () => {
  assert.equal(formatDebugEnv(true, ['held', 'screen']), '1,screen,held')
  assert.equal(formatDebugEnv(undefined, ['screen']), 'screen')
  assert.equal(formatDebugEnv(false, []), '0')
  assert.equal(formatDebugEnv(undefined, []), undefined)
  assert.deepEqual(parseDebugEnv(formatDebugEnv(true, ['screen'])), { echo: true, channels: ['screen'], unknown: [] })
})

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
