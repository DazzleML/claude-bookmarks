import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Ring, clock, describeEcho, echoEnabled, echoPolicyOf, logFile, screenFile, stamped } from '../../plugin/hooks/core/log-ring.ts'

test('a ring keeps the newest cap items, oldest first', () => {
  const r = new Ring<number>(3)
  for (const n of [1, 2, 3, 4, 5]) r.push(n)
  assert.deepEqual(r.items, [3, 4, 5])
  assert.equal(r.length, 3)
})

test('a ring below its cap keeps everything', () => {
  const r = new Ring<string>(3)
  r.push('a')
  r.push('b')
  assert.deepEqual(r.items, ['a', 'b'])
})

test('after a reload the file\'s lines come first and the oldest of them go', () => {
  const r = new Ring<string>(4)
  r.push('since-1')
  r.push('since-2')
  r.prepend(['file-1', 'file-2', 'file-3'])
  assert.deepEqual(r.items, ['file-2', 'file-3', 'since-1', 'since-2'])
})

test('the stored policy, with the setting behind a missing or malformed default', () => {
  assert.deepEqual(echoPolicyOf(undefined, false), { default: false, forced: false })
  assert.deepEqual(echoPolicyOf(undefined, true), { default: true, forced: false })
  assert.deepEqual(echoPolicyOf({ default: true, forced: true }, false), { default: true, forced: true })
  assert.deepEqual(echoPolicyOf({ default: 'yes', forced: 'yes' }, false), { default: false, forced: false })
})

test('echo: a force wins, else the conversation\'s choice, else the default', () => {
  assert.equal(echoEnabled({ default: false, forced: true }, true), false)
  assert.equal(echoEnabled({ default: true, forced: true }, false), true)
  assert.equal(echoEnabled({ default: false, forced: false }, true), true)
  assert.equal(echoEnabled({ default: true, forced: false }, false), false)
  assert.equal(echoEnabled({ default: true, forced: false }, undefined), true)
  assert.equal(echoEnabled({ default: false, forced: false }, undefined), false)
})

test('the echo state in one line, in its four shapes', () => {
  assert.equal(describeEcho({ default: false, forced: true }, undefined), 'off everywhere, forced (/bm-debug default off lifts it)')
  assert.equal(
    describeEcho({ default: false, forced: true }, true),
    'off everywhere, forced (/bm-debug default off lifts it; this conversation asked for on, which applies once the force is lifted)',
  )
  assert.equal(describeEcho({ default: false, forced: false }, true), "on here only (this conversation's choice; the default is off)")
  assert.equal(describeEcho({ default: true, forced: false }, undefined), 'on, the default (every conversation without a choice of its own)')
})

test('times and paths', () => {
  const t = Date.parse('2026-10-12T18:01:22.345Z')
  assert.equal(clock(t), '18:01:22.345')
  assert.equal(stamped('[bm] hello', t), '2026-10-12T18:01:22.345Z [bm] hello')
  assert.equal(logFile('C:/u/claude', 'abc'), 'C:/u/claude/bookmarks/debug/abc.log')
  assert.equal(screenFile('C:/u/claude/bookmarks/debug/abc.log'), 'C:/u/claude/bookmarks/debug/abc.screen.log')
})
