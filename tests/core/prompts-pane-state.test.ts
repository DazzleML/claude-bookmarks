import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PromptsPaneState } from '../../plugin/hooks/core/prompts/prompts-pane-state.ts'

test('the filter: set, unchanged is no change, cleared', () => {
  const p = new PromptsPaneState()
  assert.equal(p.filter, '')
  assert.equal(p.setFilter('band redraw'), true)
  assert.equal(p.filter, 'band redraw')
  assert.equal(p.setFilter('band redraw'), false)
  assert.equal(p.setFilter(''), true)
  assert.equal(p.filter, '')
})

test('footnotes unfold, fold back, and toggle', () => {
  const p = new PromptsPaneState()
  p.unfold(3)
  assert.deepEqual([...p.unfolded], [3])
  p.toggleFold(3)
  assert.deepEqual([...p.unfolded], [])
  p.toggleFold(5)
  p.refold(5)
  assert.deepEqual([...p.unfolded], [])
})

test('the prompt to centre on is taken once', () => {
  const p = new PromptsPaneState()
  assert.equal(p.takeCentre(), undefined)
  p.centreOnNextDraw('u1')
  assert.equal(p.takeCentre(), 'u1')
  assert.equal(p.takeCentre(), undefined)
})

test('a new conversation clears the filter, the unfolded footnotes and a pending centre', () => {
  const p = new PromptsPaneState()
  p.setFilter('x')
  p.unfold(2)
  p.centreOnNextDraw('old-conversation-prompt')
  p.newConversation()
  assert.equal(p.filter, '')
  assert.deepEqual([...p.unfolded], [])
  assert.equal(p.takeCentre(), undefined)
})
