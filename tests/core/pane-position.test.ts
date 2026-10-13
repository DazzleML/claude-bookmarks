import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PanePosition } from '../../plugin/hooks/core/pane-position.ts'

test('after a pane: the view before it, with its edge, and cleared once read', () => {
  const p = new PanePosition()
  p.opened('a', { uuid: 'b', block: 'end' })
  assert.equal(p.anchor, 'a')
  assert.deepEqual(p.view, { uuid: 'b', block: 'end' })
  assert.deepEqual(p.takeRestore(), { here: 'b', block: 'end', fromPane: true })
  assert.deepEqual(p.takeRestore(), { here: undefined, block: 'start', fromPane: false })
  assert.equal(p.anchor, undefined)
})

test('after a pane with no view spot: the anchor, at the start', () => {
  const p = new PanePosition()
  p.opened('a', undefined)
  assert.deepEqual(p.takeRestore(), { here: 'a', block: 'start', fromPane: true })
})

test('a jump drops the way back to before the pane', () => {
  const p = new PanePosition()
  p.opened('a', { uuid: 'b', block: 'start' })
  p.jumped()
  assert.equal(p.anchor, undefined)
  assert.deepEqual(p.takeRestore(), { here: undefined, block: 'start', fromPane: false })
})

test('a highlight with no pane remembers the top; with a pane up, the pane anchor', () => {
  const p = new PanePosition()
  p.noteRestore('top')
  assert.deepEqual(p.takeRestore(), { here: 'top', block: 'start', fromPane: false })
  p.opened('anchor', undefined)
  p.noteRestore('top')
  assert.deepEqual(p.takeRestore(), { here: 'anchor', block: 'start', fromPane: true })
})
