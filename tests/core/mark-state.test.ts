import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MarkState } from '../../plugin/hooks/core/marks/mark-state.ts'

const timer = (log: string[], name: string) => () => ({ cancel: () => log.push(`cancel ${name}`) })

test('a restarted clear cancels the one before; stopping cancels and forgets it', () => {
  const log: string[] = []
  const m = new MarkState()
  m.restartClear(timer(log, 'c1'))
  m.restartClear(timer(log, 'c2'))
  m.stopClear()
  m.stopClear()
  assert.deepEqual(log, ['cancel c1', 'cancel c2'])
})

test('the selection at the chord is read once, then forgotten', () => {
  const m = new MarkState()
  m.setAtChord({ requestId: 'r1', text: 'words' })
  assert.deepEqual(m.takeAtChord(), { requestId: 'r1', text: 'words' })
  assert.equal(m.takeAtChord(), undefined)
})

test('a new conversation forgets a chord selection never used', () => {
  const m = new MarkState()
  m.setAtChord({ requestId: 'old', text: 'from the conversation that ended' })
  m.newConversation()
  assert.equal(m.takeAtChord(), undefined)
})

test('stopping the poll cancels it and forgets what was seen; a new one starts clean', () => {
  const log: string[] = []
  const m = new MarkState()
  m.startPoll(timer(log, 'p1'))
  m.see('r1|words', 0)
  m.see('r2|other', 5)
  assert.deepEqual(m.seen, { key: 'r2|other', at: 5 })
  m.stopPoll()
  assert.equal(m.seen, undefined)
  m.startPoll(timer(log, 'p2'))
  m.stopPoll()
  assert.deepEqual(log, ['cancel p1', 'cancel p2'])
})
