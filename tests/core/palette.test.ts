import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULTS, MARK_BAND, THEME_KEYS, brightness, isColour, resolvePalette } from '../../plugin/hooks/core/palette.ts'

// #27: register.tsx names no colour; every style comes from the palette by role.
test('register.tsx draws no colour of its own', () => {
  const source = readFileSync(new URL('../../plugin/hooks/register.tsx', import.meta.url), 'utf8')
  const code = source.split('\n').filter(l => !l.trim().startsWith('//'))
  const offenders = code.filter(
    l =>
      /\b(color|backgroundColor)=/.test(l) ||
      /['"]#[0-9a-fA-F]{6}['"]/.test(l) ||
      /['"](black|red|green|yellow|blue|magenta|cyan|white|gray|grey)(Bright)?['"]/.test(l) ||
      (/\bdimColor\b/.test(l) && !l.includes('const buttonStyle')),
  )
  assert.deepEqual(offenders, [])
})

test('defaults use theme keys for every foreground colour', () => {
  for (const [role, style] of Object.entries(DEFAULTS)) {
    if (style.color) assert.ok((THEME_KEYS as readonly string[]).includes(style.color), `${role}: ${style.color}`)
  }
})

test('search never shares the marks\' colour', () => {
  assert.notEqual(DEFAULTS.search.color, DEFAULTS.mark.color)
  assert.notEqual(DEFAULTS.search.color, DEFAULTS.here.color)
})

test('the mark band follows the theme name, dark when the name says neither', () => {
  assert.equal(resolvePalette({ theme: 'light' }).palette.markBand.backgroundColor, MARK_BAND.light)
  assert.equal(resolvePalette({ theme: 'light-daltonized' }).palette.markBand.backgroundColor, MARK_BAND.light)
  assert.equal(resolvePalette({ theme: 'dark-ansi' }).palette.markBand.backgroundColor, MARK_BAND.dark)
  assert.equal(resolvePalette({ theme: 'my-custom' }).palette.markBand.backgroundColor, MARK_BAND.dark)
  assert.equal(brightness(undefined), 'dark')
})

test('an override replaces a role\'s colour and keeps the rest of its style', () => {
  const { palette, dropped } = resolvePalette({ overrides: { here: { color: '#00AAFF' } } })
  assert.deepEqual(palette.here, { color: '#00AAFF', bold: true })
  assert.deepEqual(dropped, [])
})

test('invalid overrides are dropped and the default stands', () => {
  const { palette, dropped } = resolvePalette({
    overrides: { here: { color: 'not-a-colour', bold: 'yes' }, nonsense: { color: 'red' }, pinned: 'red' },
  })
  assert.deepEqual(palette.here, DEFAULTS.here)
  assert.deepEqual(dropped.sort(), ['here.bold', 'here.color', 'nonsense', 'pinned'])
})

test('resolving never mutates the defaults', () => {
  resolvePalette({ theme: 'light', overrides: { here: { color: 'red' } } })
  assert.equal(DEFAULTS.here.color, 'warning')
  assert.equal(DEFAULTS.markBand.backgroundColor, MARK_BAND.dark)
})

test('colours: theme keys, hex and terminal names are accepted', () => {
  for (const c of ['subtle', '#1b3754', 'cyanBright', 'grey']) assert.equal(isColour(c), true, c)
  for (const c of ['#123', 'teal', '', 7]) assert.equal(isColour(c), false, String(c))
})
