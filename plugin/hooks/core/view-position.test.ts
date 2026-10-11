import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promptNearView, type VisibleMessage } from './view-position.ts'

// Five prompts p0..p4, each followed by one reply r0..r4. Order: p_i = i*1000, r_i = i*1000+1.
const prompts = ['p0', 'p1', 'p2', 'p3', 'p4']
const orderOf = (u: string) => {
  const m = /^([pr])(\d)$/.exec(u)
  if (!m) return undefined
  return Number(m[2]) * 1000 + (m[1] === 'r' ? 1 : 0)
}
const v = (...pairs: [string, number][]): VisibleMessage[] => pairs.map(([id, lines]) => ({ id, lines }))

test('the exchange taking most of the screen wins', () => {
  // The tail of reply 2 (3 lines), all of prompt 3 and 30 lines of its reply.
  assert.equal(promptNearView(prompts, v(['r2', 3], ['p3', 2], ['r3', 30]), 'r2', orderOf), 3)
})

test('a prompt showing at the foot of a long earlier reply loses to that reply', () => {
  // 2026-10-11: reply 2 fills the screen, prompt 3 shows at the bottom.
  assert.equal(promptNearView(prompts, v(['r2', 38], ['p3', 2]), 'r2', orderOf), 2)
})

test('when two exchanges are close, the earlier one wins', () => {
  assert.equal(promptNearView(prompts, v(['r2', 18], ['p3', 2], ['r3', 20]), 'r2', orderOf), 2)
})

test('a sliver of the earlier exchange does not win', () => {
  // 1 line of reply 2 at the top, 39 lines of exchange 3: clearly 3.
  assert.equal(promptNearView(prompts, v(['r2', 1], ['p3', 2], ['r3', 37]), 'r2', orderOf), 3)
})

test('at the bottom of the conversation the newest exchange wins when it fills the screen', () => {
  assert.equal(promptNearView(prompts, v(['p4', 3], ['r4', 20]), 'p4', orderOf), 4)
  assert.equal(promptNearView(prompts, v(['r4', 40]), 'r4', orderOf), 4)
})

test('with nothing placeable on screen, the last prompt at or above the top wins', () => {
  assert.equal(promptNearView(prompts, v(['x9', 10]), 'r2', orderOf), 2)
})

test('nothing is chosen when nothing on screen can be placed', () => {
  assert.equal(promptNearView(prompts, v(['x9', 10]), 'x9', orderOf), undefined)
  assert.equal(promptNearView(prompts, [], undefined, orderOf), undefined)
})

test('above the first prompt, nothing is chosen rather than a wrong one', () => {
  const o = (u: string) => (u === 'intro' ? -5 : orderOf(u))
  assert.equal(promptNearView(prompts, v(['intro', 12]), 'intro', o), undefined)
})

test('an empty prompt list chooses nothing', () => {
  assert.equal(promptNearView([], v(['r2', 10]), 'r2', orderOf), undefined)
})

test('a message with no line count still counts as one line', () => {
  assert.equal(promptNearView(prompts, v(['p1', 0]), 'p1', orderOf), 1)
})
