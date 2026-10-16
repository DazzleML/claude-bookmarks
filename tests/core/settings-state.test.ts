import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SettingsState } from '../../plugin/hooks/core/settings-state.ts'
import { DEFAULTS } from '../../plugin/hooks/core/settings.ts'

test('the settings resolve once per change: the same answer until /config changes a field', () => {
  const s = new SettingsState()
  s.loaded({})
  const first = s.current()
  assert.equal(first, s.current())
  assert.equal(first.followHere, DEFAULTS.followHere)
  s.changed('followHere', 'never')
  assert.notEqual(s.current(), first)
  assert.equal(s.current().followHere, 'never')
})

test('loading replaces every value; the resolution reports where each came from', () => {
  const s = new SettingsState()
  s.loaded({ followHere: 'always' })
  assert.equal(s.current().followHere, 'always')
  assert.equal(s.resolved().sources.followHere, 'machine')
  s.loaded({})
  assert.equal(s.current().followHere, DEFAULTS.followHere)
})

test('the palette follows the theme and the palette setting, and is kept between them', () => {
  const s = new SettingsState()
  s.loaded({})
  const dark = s.palette()
  assert.equal(dark, s.palette())
  s.themeIs('light')
  assert.notEqual(s.palette(), dark)
  const light = s.palette()
  s.changed('palette', '{"here":{"dimColor":true}}')
  assert.notEqual(s.palette(), light)
  assert.equal(s.palette().here.dimColor, true)
  s.changed('palette', 'not json')
  assert.equal(s.palette().here.dimColor, light.here.dimColor)
})
