// U59: the capability paths' spine. The chooser is pure over the signals the start hook
// reads once; stock picks the workaround (or the plain behaviour) for every gap, and the
// patcher's history marker flips exactly one. Design: 2026-10-22__21-00-54 (U59).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAPABILITIES, NO_SIGNALS, PATH_ORDER, capabilityOf, choose, chooseAll, pathsLine, versionAtLeast, type Capability } from '../../plugin/hooks/engine/select.ts'

const STOCK = { version: '2.1.309' }
const H_BUILD = { version: '2.1.308', base: '2.1.308', dccPatcher: '0.2.6', dccPatchH: 'history-v1', dccPatches: 'H' }

test('stock picks the workaround for every gap that has one, and current for the rest', () => {
  const all = chooseAll(STOCK)
  assert.deepEqual(all.map(c => `${c.gap}=${c.path}`), [
    'history.reach=workaround',
    'focus.handoff=workaround',
    'focus.leftSite=workaround',
    'keys.chord=workaround',
    'hover.multiline=current',
  ])
  for (const c of all) assert.ok(c.why.length > 0, c.gap)
})

test('the history patch flips history.reach to patched and nothing else; its why names the marker', () => {
  const all = chooseAll(H_BUILD)
  assert.deepEqual(all.find(c => c.gap === 'history.reach'), { gap: 'history.reach', path: 'patched', why: 'DCC_PATCH_H=history-v1' })
  assert.deepEqual(all.filter(c => c.path === 'patched').map(c => c.gap), ['history.reach'])
  // The launcher's list alone, without the history patch's own marker, is not the signal for H.
  assert.equal(choose(capabilityOf('history.reach'), { version: '2.1.308', dccPatches: 'H' }).path, 'workaround')
})

test('a gap whose proposed API a build has picks ideal by version, base first', () => {
  const cap: Capability = { gap: 'focus.handoff', missing: 'x', ideal: { since: '2.1.300' }, patched: null, workaround: 'w' }
  assert.equal(choose(cap, { version: '2.1.309' }).path, 'ideal')
  assert.equal(choose(cap, { version: '2.1.299' }).path, 'workaround')
  assert.equal(choose(cap, { version: '2.1.309+dcc', base: '2.1.299' }).path, 'workaround', 'base wins over the suffixed version')
  assert.equal(choose(cap, NO_SIGNALS).path, 'workaround')
  // A patch named in DCC_PATCHES supplies a route for a gap that declares it.
  const named: Capability = { ...cap, ideal: null, patched: { patch: 'F' } }
  assert.deepEqual(choose(named, { version: '2.1.308', dccPatches: 'H, F' }), { path: 'patched', why: 'DCC_PATCHES names F' })
})

test('versionAtLeast compares three numbers and ignores a suffix', () => {
  assert.equal(versionAtLeast('2.1.309', '2.1.309'), true)
  assert.equal(versionAtLeast('2.1.310', '2.1.309'), true)
  assert.equal(versionAtLeast('2.2.0', '2.1.309'), true)
  assert.equal(versionAtLeast('2.1.308', '2.1.309'), false)
  assert.equal(versionAtLeast('2.1.309+dcc0.2.6', '2.1.309'), true)
  assert.equal(versionAtLeast('3.0.0-beta', '2.9.9'), true)
})

test('the /bm-env line names every gap once with its path and why; the order is the table\'s', () => {
  const line = pathsLine(chooseAll(STOCK))
  assert.ok(line.startsWith('capability paths: history.reach=workaround (stock; '))
  for (const c of CAPABILITIES) assert.equal(line.split(`${c.gap}=`).length, 2, c.gap)
  assert.ok(line.includes('hover.multiline=current (no path; '))
  assert.deepEqual([...PATH_ORDER], ['ideal', 'patched', 'workaround'])
})
