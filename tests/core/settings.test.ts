import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULTS, FIELDS, debugTextMode, fit, installedFromCache, manifestUserConfig, resolve } from '../../plugin/hooks/core/settings.ts'

test('with no layers every field is its default, from the default', () => {
  const r = resolve()
  assert.deepEqual(r.values, DEFAULTS)
  assert.ok(Object.values(r.sources).every(s => s === 'default'))
  assert.deepEqual([r.rejected, r.unknown], [[], []])
})

test('the machine layer overrides the defaults', () => {
  const r = resolve({ followHere: 'never', closeShare: 0.8 })
  assert.equal(r.values.followHere, 'never')
  assert.equal(r.values.closeShare, 0.8)
  assert.equal(r.sources.followHere, 'machine')
  assert.equal(r.sources.listOpensAt, 'default')
})

test('the conversation layer overrides the machine', () => {
  const r = resolve({ debugDefault: 'off' }, { debugDefault: 'on' })
  assert.equal(r.values.debugDefault, 'on')
  assert.equal(r.sources.debugDefault, 'conversation')
})

test('a value that does not fit is rejected and the layer below stands', () => {
  const r = resolve({ followHere: 'sometimes', closeShare: 7 }, { listOpensAt: 3 })
  assert.equal(r.values.followHere, DEFAULTS.followHere)
  assert.equal(r.values.closeShare, DEFAULTS.closeShare)
  assert.equal(r.values.listOpensAt, DEFAULTS.listOpensAt)
  assert.deepEqual(r.rejected, ['machine.followHere="sometimes"', 'machine.closeShare=7', 'conversation.listOpensAt=3'])
})

test('a bad conversation value leaves the machine value in place', () => {
  const r = resolve({ paneAfterJump: 'stay' }, { paneAfterJump: 'maybe' })
  assert.equal(r.values.paneAfterJump, 'stay')
  assert.equal(r.sources.paneAfterJump, 'machine')
})

test('unknown keys are reported, not applied', () => {
  const r = resolve({ oldName: 'x' })
  assert.deepEqual(r.unknown, ['machine.oldName'])
  assert.deepEqual(r.values, DEFAULTS)
})

test('numbers and booleans given as text are accepted when they fit', () => {
  assert.deepEqual(fit(FIELDS.closeShare, '0.5'), { ok: true, value: 0.5 })
  assert.deepEqual(fit(FIELDS.closeShare, ''), { ok: false })
  assert.deepEqual(fit({ kind: 'boolean', default: false, title: '', description: '' }, 'true'), { ok: true, value: true })
})

test('every key is an identifier, as userConfig requires', () => {
  for (const k of Object.keys(FIELDS)) assert.match(k, /^[A-Za-z_]\w*$/, k)
})

test('every default fits its own field', () => {
  for (const [k, f] of Object.entries(FIELDS)) assert.equal(fit(f, f.default).ok, true, k)
})

test('the generated userConfig block carries every field, enums as pickers', () => {
  const m = manifestUserConfig()
  assert.deepEqual(Object.keys(m).sort(), Object.keys(FIELDS).sort())
  assert.deepEqual(m.followHere, {
    type: 'string',
    title: FIELDS.followHere.title,
    description: FIELDS.followHere.description,
    default: 'when-idle',
    options: ['when-idle', 'always', 'never'],
  })
  assert.equal(m.closeShare?.type, 'number')
  assert.equal(m.closeShare?.min, 0)
})

test('plugin.json carries exactly the generated userConfig block', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../plugin/.claude-plugin/plugin.json', import.meta.url), 'utf8'))
  assert.deepEqual(manifest.userConfig, manifestUserConfig())
})

test('a machine value equal to the default reads as the default', () => {
  // Claude Code fills every declared default into the options it hands the plugin.
  const r = resolve({ followHere: 'when-idle', closeShare: 0.6, paneAfterJump: 'stay' })
  assert.equal(r.sources.followHere, 'default')
  assert.equal(r.sources.closeShare, 'default')
  assert.equal(r.sources.paneAfterJump, 'machine')
})

test('debugText auto is off in an installed plugin and always in a folder build', () => {
  assert.equal(debugTextMode('auto', false), 'off')
  assert.equal(debugTextMode('auto', true), 'always')
  assert.equal(debugTextMode('with-debug', true), 'with-debug')
  assert.equal(debugTextMode('off', true), 'off')
})

test('a plugin under Claude Code\'s plugin cache is an installed one', () => {
  assert.equal(installedFromCache('C:\\Users\\me\\.claude\\plugins\\cache\\dazzle-claude-plugins\\bookmarks\\0.4.16'), true)
  assert.equal(installedFromCache('/home/me/.claude/plugins/cache/m/bookmarks'), true)
  assert.equal(installedFromCache('C:/code/claude-projects/claude-bookmarks/plugin'), false)
})
