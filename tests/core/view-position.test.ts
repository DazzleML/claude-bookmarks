import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exchangeIndex, looksLikeRedraw, pickViewAnchor, promptNearView, type ScreenReport, type VisibleMessage } from '../../plugin/hooks/core/prompts/view-position.ts'

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

// The 2026-10-11 20:50 case. Prompts #315..#323 as p-indices 0..8 (orders i*1000); the
// person reads under prompt 8 (#323); a 39-line reply under prompt 1 (#316) is redrawn
// off screen and reports its whole range.
const promptsLong = ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8']
const longOrders = promptsLong.map((_, i) => i * 1000)
const exchangeOfLong = (id: string) => {
  const m = /^m(\d)(\d+)$/.exec(id) // m<prompt><offset>: a message `offset` rows after prompt <prompt>
  return m ? exchangeIndex(longOrders, Number(m[1]) * 1000 + Number(m[2])) : undefined
}
const rep = (id: string, first: number, last: number, of: number): ScreenReport => ({ id, first, last, of })
const trusted = new Set(['q8', 'm81', 'm82'])

test('exchangeIndex places an order under the last prompt at or before it', () => {
  assert.equal(exchangeIndex(longOrders, 1016), 1)
  assert.equal(exchangeIndex(longOrders, 8000), 8)
  assert.equal(exchangeIndex(longOrders, -5), undefined)
  assert.equal(exchangeIndex([undefined, 1000], 1500), 1)
})

test('a lone whole-range report far from the person, unseen before, is a redraw', () => {
  assert.equal(looksLikeRedraw([rep('m116', 0, 38, 39)], trusted, 8, exchangeOfLong), true)
})

test('a cut-off report is a view, however far away (a jump landed there)', () => {
  assert.equal(looksLikeRedraw([rep('m116', 5, 38, 39)], trusted, 8, exchangeOfLong), false)
})

test('a whole-range report of a neighbouring exchange is a view (a new prompt at the bottom)', () => {
  assert.equal(looksLikeRedraw([rep('q8', 0, 1, 2)], new Set(['m71', 'm72']), 7, exchangeOfLong), false)
})

test('a report of a message already trusted is a view', () => {
  assert.equal(looksLikeRedraw([rep('m81', 0, 2, 3)], trusted, 8, exchangeOfLong), false)
})

test('a burst with one cut-off message is a view even if the rest are whole', () => {
  assert.equal(looksLikeRedraw([rep('m116', 0, 38, 39), rep('m117', 3, 10, 11)], trusted, 8, exchangeOfLong), false)
})

test('with no previous position nothing is a redraw', () => {
  assert.equal(looksLikeRedraw([rep('m116', 0, 38, 39)], trusted, undefined, exchangeOfLong), false)
})

test('a view whose top message starts at the top returns to it exactly', () => {
  assert.deepEqual(pickViewAnchor([rep('m1', 0, 9, 30), rep('m2', 0, 5, 20)]), { id: 'm1', block: 'start', drift: 0 })
})

test('when little of the top message shows, the next message start drifts least', () => {
  // 25 rows of m1 are hidden above, 2 show; m2 starts right after.
  assert.deepEqual(pickViewAnchor([rep('m1', 25, 26, 27), rep('m2', 0, 20, 40)]), { id: 'm2', block: 'start', drift: 2 })
})

test("when most of the top message shows, its own start drifts least", () => {
  assert.deepEqual(pickViewAnchor([rep('m1', 2, 26, 27), rep('m2', 0, 3, 40)]), { id: 'm1', block: 'start', drift: 2 })
})

test('at the bottom of the conversation the last message end is exact', () => {
  assert.deepEqual(pickViewAnchor([rep('m1', 12, 19, 20), rep('m2', 0, 9, 10)]), { id: 'm2', block: 'end', drift: 0 })
})

test('no reports, no anchor', () => {
  assert.equal(pickViewAnchor([]), undefined)
})
