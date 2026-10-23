import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DEFAULTS, HEADING, MARK_BAND, THEME_KEYS, brightness, isColour, resolvePalette } from '../../plugin/hooks/core/palette.ts'

// #27: nothing that draws names a colour; every style comes from the palette by role.
// register.tsx and, since the split (0.4.46-0.4.69), the views and handlers it moved into
// (acceptance check 2026-10-14__16-55-20: the scan had stayed on register.tsx alone).
const DRAWING = [
  new URL('../../plugin/hooks/register.tsx', import.meta.url),
  ...['views', 'handlers'].flatMap(dir => {
    const base = new URL(`../../plugin/hooks/${dir}/`, import.meta.url)
    return readdirSync(base).filter(f => /\.tsx?$/.test(f)).map(f => new URL(f, base))
  }),
]
export function colourOffenders(source: string): string[] {
  // Comments and type declarations (a style's shape, `dimColor?: boolean`) name no colour.
  const code = source.split('\n').filter(l => !l.trim().startsWith('//') && !/^\s*(export\s+)?type\s/.test(l))
  return code.filter(
    l =>
      /\b(color|backgroundColor)=/.test(l) ||
      /['"]#[0-9a-fA-F]{6}['"]/.test(l) ||
      /['"](black|red|green|yellow|blue|magenta|cyan|white|gray|grey)(Bright)?['"]/.test(l) ||
      (/\bdimColor\b/.test(l) && !l.includes('const buttonStyle')),
  )
}
test('nothing that draws names a colour of its own (register.tsx, views, handlers)', () => {
  const offenders = DRAWING.flatMap(u => colourOffenders(readFileSync(u, 'utf8')).map(l => `${u.pathname.split('/hooks/')[1]}: ${l.trim()}`))
  assert.deepEqual(offenders, [])
})
test('the colour scan catches a named colour in a view', () => {
  assert.equal(colourOffenders('<Text color="cyan">x</Text>').length, 1)
})

test('defaults use theme keys for every foreground colour, but the headings, a dark/light pair like the band', () => {
  for (const [role, style] of Object.entries(DEFAULTS)) {
    if (role === 'heading') continue
    if (style.color) assert.ok((THEME_KEYS as readonly string[]).includes(style.color), `${role}: ${style.color}`)
  }
  assert.equal(DEFAULTS.heading.color, HEADING.dark)
})

// U71 (djdarcy, 2026-10-22: "slightly dark-gray as it's currently colored, but with a hint of
// blue ... just a test"): the group headings follow the theme's brightness and take an override.
test('the group headings are a dim blue-gray that follows the theme, and an override replaces it', () => {
  assert.deepEqual(resolvePalette({ theme: 'dark' }).palette.heading, { color: HEADING.dark, dimColor: true })
  assert.deepEqual(resolvePalette({ theme: 'light' }).palette.heading, { color: HEADING.light, dimColor: true })
  assert.deepEqual(resolvePalette({ theme: 'dark', overrides: { heading: { color: 'subtle', dimColor: false } } }).palette.heading, { color: 'subtle', dimColor: false })
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
