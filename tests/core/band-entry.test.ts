import { test } from 'node:test'
import assert from 'node:assert/strict'
import { footnoteAt, listPosition, nextGroup, promptEntry, promptNumberComplete, stepNumber } from '../../plugin/hooks/core/band-entry.ts'

test('a number is complete when no further digit could name a prompt, and only in the complete mode', () => {
  assert.equal(promptNumberComplete('3', 25, 'complete'), true)
  assert.equal(promptNumberComplete('2', 25, 'complete'), false)
  assert.equal(promptNumberComplete('25', 25, 'complete'), true)
  assert.equal(promptNumberComplete('26', 25, 'complete'), false)
  assert.equal(promptNumberComplete('0', 25, 'complete'), false)
  assert.equal(promptNumberComplete('3.', 25, 'complete'), false)
  assert.equal(promptNumberComplete('3', 25, 'enter'), false)
  assert.equal(promptNumberComplete('3', 25), false) // the default waits for Enter
})

test('j and k: the first press lands on the newest; j goes older, k newer, clamped', () => {
  assert.equal(stepNumber('', 10, 'j'), 10)
  assert.equal(stepNumber('', 10, 'k'), 10)
  assert.equal(stepNumber('5', 10, 'j'), 4)
  assert.equal(stepNumber('5', 10, 'k'), 6)
  assert.equal(stepNumber('1', 10, 'j'), 1)
  assert.equal(stepNumber('10', 10, 'k'), 10)
  assert.equal(stepNumber('abc', 10, 'j'), 10)
})

test('a list position: in range, whole, trimmed; empty names the newest only when asked', () => {
  assert.equal(listPosition(' 3 ', 5), 3)
  assert.equal(listPosition('6', 5), undefined)
  assert.equal(listPosition('0', 5), undefined)
  assert.equal(listPosition('2.5', 5), undefined)
  assert.equal(listPosition('x', 5), undefined)
  assert.equal(listPosition('', 5), undefined)
  assert.equal(listPosition('', 5, true), 5)
})

test('what an entry in the prompts list means', () => {
  assert.deepEqual(promptEntry('*21', 30), { kind: 'pin', typed: '21' })
  assert.deepEqual(promptEntry('*', 30), { kind: 'pin', typed: '' })
  assert.deepEqual(promptEntry('/band redraw', 30), { kind: 'filter', words: 'band redraw' })
  assert.deepEqual(promptEntry('3.', 30), { kind: 'unfold', n: 3 })
  assert.deepEqual(promptEntry('3.1', 30), { kind: 'footnote', n: 3, k: 1 })
  assert.deepEqual(promptEntry(' 7 ', 30), { kind: 'jump', n: 7 })
  assert.deepEqual(promptEntry('31', 30), { kind: 'invalid', typed: '31' })
  assert.deepEqual(promptEntry('zz', 30), { kind: 'invalid', typed: 'zz' })
})

test('the footnote numbered n.k, if kept', () => {
  const kept = [
    { kind: 'command', label: '/a', uuid: 'f1', after: 'p1' },
    { kind: 'command', label: '/b', uuid: 'f2', after: 'p1' },
    { kind: 'command', label: '/c', uuid: 'f3', after: 'p2' },
  ] as never[]
  assert.equal((footnoteAt(['p1', 'p2'], kept, 1, 2) as { uuid: string } | undefined)?.uuid, 'f2')
  assert.equal((footnoteAt(['p1', 'p2'], kept, 2, 1) as { uuid: string } | undefined)?.uuid, 'f3')
  assert.equal(footnoteAt(['p1', 'p2'], kept, 2, 2), undefined)
})

test('the next group wraps both ways', () => {
  assert.equal(nextGroup(0, 1, 3), 1)
  assert.equal(nextGroup(2, 1, 3), 0)
  assert.equal(nextGroup(0, -1, 3), 2)
})
