import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BandState } from '../../plugin/hooks/core/band/band-state.ts'

const timer = (log: string[], name: string) => () => ({ cancel: () => log.push(`cancel ${name}`) })

test('a restarted wait cancels the one before; stopping cancels and forgets it', () => {
  const log: string[] = []
  const b = new BandState()
  b.restartWait(timer(log, 'w1'))
  b.restartWait(timer(log, 'w2'))
  b.stopWaiting()
  b.stopWaiting()
  assert.deepEqual(log, ['cancel w1', 'cancel w2'])
})

test('the watch likewise, and ending the mode stops both and drops the ring', () => {
  const log: string[] = []
  const b = new BandState()
  b.restartWait(timer(log, 'w'))
  b.startWatch(timer(log, 'a'))
  b.startWatch(timer(log, 'b'))
  b.ringMoved('band-num-go')
  b.ended()
  assert.deepEqual(log, ['cancel a', 'cancel w', 'cancel b'])
  assert.equal(b.ring, undefined)
})

test('a new conversation drops the reminder and the ring, keeps the band id', () => {
  const b = new BandState()
  b.drawn('band-1')
  b.oweReminder(true)
  b.ringMoved('chord-mark')
  b.newConversation()
  assert.equal(b.reminderOwed, false)
  assert.equal(b.ring, undefined)
  assert.equal(b.id, 'band-1')
})
