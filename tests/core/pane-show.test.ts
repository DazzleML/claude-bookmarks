import { test } from 'node:test'
import assert from 'node:assert/strict'
import { covering, showAction } from '../../plugin/hooks/core/band/pane-show.ts'
import { bandFieldCommand } from '../../plugin/hooks/core/band/field-input.ts'
import { DEFAULT_TABLES } from '../../plugin/hooks/core/band/keys.ts'

// djdarcy, 2026-11-01: not open -> open; open but not on it -> switch to it; on it -> close.
test('showAction: the three rules', () => {
  assert.equal(showAction([], 'bm-lists'), 'open')
  assert.equal(showAction([{ id: 'bm-pane', isShown: true }], 'bm-lists'), 'open')
  assert.equal(showAction([{ id: 'bm-pane', isShown: true }, { id: 'bm-lists', isShown: false }], 'bm-lists'), 'front')
  assert.equal(showAction([{ id: 'bm-lists', isShown: true }], 'bm-lists'), 'close')
})

test('showAction: the shared pane shown in another mode is a switch, not a close', () => {
  assert.equal(showAction([{ id: 'bm-pane', isShown: true }], 'bm-pane', false), 'front')
  assert.equal(showAction([{ id: 'bm-pane', isShown: true }], 'bm-pane', true), 'close')
})

test('showAction: a pane with no isShown counts as shown', () => {
  assert.equal(showAction([{ id: 'bm-lists' }], 'bm-lists'), 'close')
})

test('covering: the shown panes to close first, none when the target is shown', () => {
  assert.deepEqual(covering([{ id: 'bm-pane', isShown: true }, { id: 'bm-lists', isShown: false }], 'bm-lists').map(p => p.id), ['bm-pane'])
  assert.deepEqual(covering([{ id: 'bm-pane', isShown: true }], 'bm-lists').map(p => p.id), ['bm-pane'])
  assert.deepEqual(covering([{ id: 'bm-lists', isShown: true }, { id: 'bm-pane', isShown: false }], 'bm-lists'), [])
  assert.deepEqual(covering([], 'bm-lists'), [])
})

test('bandFieldCommand: a band command typed alone passes through the list field', () => {
  assert.deepEqual(bandFieldCommand('l', 'list', DEFAULT_TABLES), { op: 'lists' })
  assert.deepEqual(bandFieldCommand('b', 'list', DEFAULT_TABLES), { op: 'open', pane: 'bookmarks' })
  assert.deepEqual(bandFieldCommand('?', 'list', DEFAULT_TABLES), { op: 'help' })
})

test("bandFieldCommand: the field's own keys stay the field's", () => {
  for (const typed of ['1', '.', 'j', 'k', 's', '/', '*', 'q', 'P', 'lb', '']) assert.equal(bandFieldCommand(typed, 'list', DEFAULT_TABLES), undefined, typed)
  // In the bookmarks list h and l step between groups.
  assert.equal(bandFieldCommand('l', 'bookmarks', DEFAULT_TABLES), undefined)
  assert.deepEqual(bandFieldCommand('p', 'bookmarks', DEFAULT_TABLES), { op: 'open', pane: 'list' })
})
