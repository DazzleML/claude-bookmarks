// Where a list number is typed (plugin/hooks/core/band/routes.ts; the input-routing design
// of 2026-10-25, unit 2): the situation, the listInput setting and the capability path pick
// the band's field, its digit buttons, or the pane's field. Run: node --test tests/core/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listInputTarget } from '../../plugin/hooks/core/band/routes.ts'
import { CAPABILITIES, choose, NO_SIGNALS } from '../../plugin/hooks/engine/select.ts'
import { FIELDS } from '../../plugin/hooks/core/settings.ts'

const band = { paneHasKeyboard: false }

test('a pane that already holds the keyboard keeps it, whatever the setting', () => {
  for (const s of ['auto', 'field', 'buttons'] as const) assert.equal(listInputTarget({ paneHasKeyboard: true }, s, 'workaround').target, 'pane-field', s)
})

test('on stock, auto and field give the band its own field; buttons gives the digit buttons', () => {
  assert.equal(listInputTarget(band, 'auto', 'workaround').target, 'band-field')
  assert.equal(listInputTarget(band, 'field', 'workaround').target, 'band-field')
  assert.equal(listInputTarget(band, 'buttons', 'workaround').target, 'band-buttons')
})

test('a build that hands the band its pane the keyboard sends the keys to the pane', () => {
  assert.equal(listInputTarget(band, 'auto', 'patched').target, 'pane-field')
  assert.equal(listInputTarget(band, 'auto', 'ideal').target, 'pane-field')
})

test('on stock the hand-off row chooses the workaround, so the band field is what runs', () => {
  const row = CAPABILITIES.find(c => c.gap === 'focus.paneFromBand')!
  const path = choose(row, NO_SIGNALS).path
  assert.equal(path, 'workaround')
  assert.equal(listInputTarget(band, 'auto', path).target, 'band-field')
})

test('listInput is a new choice row defaulting to auto', () => {
  const f = FIELDS.listInput
  assert.equal(f.kind, 'enum')
  assert.deepEqual(f.kind === 'enum' ? f.values : [], ['auto', 'field', 'buttons'])
  assert.equal(f.default, 'auto')
})
