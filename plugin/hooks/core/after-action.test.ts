import { test } from 'node:test'
import assert from 'node:assert/strict'
import { afterAction, type AfterActionSettings } from './after-action.ts'

const defaults: AfterActionSettings = { paneAfterJump: 'close', paneWhileTyping: 'stay', afterActionFocus: 'input' }

test("a jump from a list closes it by default (today's behaviour) and sends the keyboard back", () => {
  assert.deepEqual(afterAction({ pane: 'list', cause: 'jump', settings: defaults }), { pane: 'close', band: 'end', focus: 'input', view: 'leave' })
  assert.deepEqual(afterAction({ pane: 'bookmarks', cause: 'row-press', settings: defaults }), { pane: 'close', band: 'end', focus: 'input', view: 'leave' })
})

test('paneAfterJump: stay keeps a list open after a jump', () => {
  const s = { ...defaults, paneAfterJump: 'stay' as const }
  assert.equal(afterAction({ pane: 'list', cause: 'row-press', settings: s }).pane, 'stay')
  assert.equal(afterAction({ pane: 'jump', cause: 'jump', settings: s }).pane, 'close', 'the jump pane is not a list')
})

test('typing or clicking in the input box leaves a list open and ends the band', () => {
  for (const cause of ['prompt-edit', 'focus-left'] as const) {
    assert.deepEqual(afterAction({ pane: 'list', cause, settings: defaults }), { pane: 'stay', band: 'end', focus: 'input', view: 'leave' })
    assert.equal(afterAction({ pane: 'mark', cause, settings: defaults }).pane, 'close', 'the mark pane was waiting for a letter')
  }
})

test('paneWhileTyping: close closes a list when the person types', () => {
  assert.equal(afterAction({ pane: 'list', cause: 'prompt-edit', settings: { ...defaults, paneWhileTyping: 'close' } }).pane, 'close')
})

test('an operation still waiting for a key keeps everything where it is', () => {
  assert.deepEqual(afterAction({ pane: 'list', cause: 'jump', needsMore: true, settings: defaults }), { pane: 'stay', band: 'keep', focus: 'pane', view: 'leave' })
  assert.deepEqual(afterAction({ pane: 'none', cause: 'band-command', needsMore: true, settings: defaults }), { pane: 'stay', band: 'keep', focus: 'band', view: 'leave' })
})

test('the need yields to Esc and to the person typing elsewhere', () => {
  assert.equal(afterAction({ pane: 'mark', cause: 'esc', needsMore: true, settings: defaults }).pane, 'close')
  assert.equal(afterAction({ pane: 'mark', cause: 'prompt-edit', needsMore: true, settings: defaults }).band, 'end')
})

test('pinning stays in the list', () => {
  assert.deepEqual(afterAction({ pane: 'list', cause: 'pin', settings: defaults }), { pane: 'stay', band: 'keep', focus: 'pane', view: 'leave' })
})

test('afterActionFocus: band keeps the keyboard in the band after an action', () => {
  const s = { ...defaults, afterActionFocus: 'band' as const }
  assert.equal(afterAction({ pane: 'none', cause: 'band-command', settings: s }).focus, 'band')
  assert.equal(afterAction({ pane: 'list', cause: 'jump', settings: s }).focus, 'band')
})

test('Esc always closes and returns to the input box', () => {
  for (const pane of ['none', 'list', 'mark', 'jump', 'bookmarks'] as const) {
    assert.deepEqual(afterAction({ pane, cause: 'esc', settings: defaults }), { pane: 'close', band: 'end', focus: 'input', view: 'return' })
  }
})

test('the view goes back after a close that did not move it, and stays after a jump', () => {
  assert.equal(afterAction({ pane: 'list', cause: 'esc', settings: defaults }).view, 'return')
  assert.equal(afterAction({ pane: 'mark', cause: 'mark-set', settings: defaults }).view, 'return')
  assert.equal(afterAction({ pane: 'mark', cause: 'prompt-edit', settings: defaults }).view, 'return')
  assert.equal(afterAction({ pane: 'list', cause: 'jump', settings: defaults }).view, 'leave')
  assert.equal(afterAction({ pane: 'none', cause: 'band-command', settings: defaults }).view, 'leave')
})

test('nothing to return when the pane stays open', () => {
  assert.equal(afterAction({ pane: 'list', cause: 'prompt-edit', settings: defaults }).view, 'leave')
  assert.equal(afterAction({ pane: 'list', cause: 'row-press', settings: { ...defaults, paneAfterJump: 'stay' } }).view, 'leave')
})

test("the plugin's own close defers the return to the person's next input", () => {
  assert.deepEqual(afterAction({ pane: 'jump', cause: 'timer', settings: defaults }), { pane: 'close', band: 'end', focus: 'input', view: 'defer' })
  assert.equal(afterAction({ pane: 'mark', cause: 'timer', needsMore: true, settings: defaults }).view, 'defer')
})
