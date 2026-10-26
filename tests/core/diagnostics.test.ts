import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configListedLine, dccLine, diagLine, editLine, focusLine, idsReport, jumpTarget, keyLabel, notAppliedLine, parseDebugArgs, parseOnOff, selectionKind, settingsRows } from '../../plugin/hooks/core/log/diagnostics.ts'

// The keystroke-logging switch and the two diag lines the hooks write (moved from register.tsx, U60).
test('parseOnOff: on, off, or a toggle; editLine and focusLine say what they saw', () => {
  assert.equal(parseOnOff(' on ', false), true)
  assert.equal(parseOnOff('off', true), false)
  assert.equal(parseOnOff('', false), true)
  assert.equal(parseOnOff('', true), false)
  assert.equal(editLine('char', 12, 1, 0, 5000), '[diag] edit char: draft 12 -> +1, - ms since last')
  assert.equal(editLine('ctrl+x', 12, 0, 4000, 5000), '[diag] edit ctrl+x: draft 12 -> +0, 1000 ms since last')
  assert.equal(focusLine('AbovePrompt', 'band-num-go', 'person', undefined), '[diag] focus AbovePrompt -> band-num-go by person')
  assert.equal(focusLine('Pane', undefined, 'engine', 'that site does not hold the keyboard'), '[diag] focus Pane -> (engine stop) by engine DENY that site does not hold the keyboard')
})

test('a keystroke\'s label: modifiers, char or the key name, paste without a key', () => {
  assert.equal(keyLabel({ key: 'a' }), 'char')
  assert.equal(keyLabel({ ctrl: true, shift: true, key: 'p' }), 'ctrl+shift+char')
  assert.equal(keyLabel({ meta: true, key: 'Enter' }), 'meta+Enter')
  assert.equal(keyLabel(undefined), 'paste/burst')
})

test('the diag line says lengths and times, never the draft', () => {
  assert.equal(diagLine('p (before open)', 12, 1000, 1350, true, [{ id: 'bm-pane', isFocused: true }, { id: 'other' }]), '[diag] p (before open): draft 12 chars, last edit 350 ms ago, claude BUSY, panes bm-pane*,other')
  assert.equal(diagLine('x', 0, 0, 5, false, []), '[diag] x: draft 0 chars, last edit never ago, claude idle, panes none')
})

test('/bm-ids classifies how each prompt was drawn and lists the strays', () => {
  const list = [
    { uuid: 'aaaaaaaa-1111-4111-8111-111111111111', head: 'exact one' },
    { uuid: 'bbbbbbbb-2222-4222-8222-222222222222', head: 'prefix one' },
    { uuid: 'cccccccc-3333-4333-8333-333333333333', head: 'same text' },
    { uuid: 'dddddddd-4444-4444-8444-444444444444', head: 'never drawn' },
  ]
  const rendered = new Map([
    ['aaaaaaaa-1111-4111-8111-111111111111', 'exact one'],
    ['bbbbbbbb-2222-4222-8222-000000000000', 'prefix one'],
    ['eeeeeeee-5555-4555-8555-555555555555', 'same text'],
  ])
  const r = idsReport(list, rendered)
  assert.equal(r.summary, '[bm] ids: 1 of 4 appended prompt uuids were seen as UserMessage requestIds; 3 UserMessage ids drawn since load; 2 drawn ids not among appended prompts')
  assert.deepEqual(r.rows, ['[bm]  #1 aaaaaaaa exact exact one', '[bm]  #2 bbbbbbbb pfx   prefix one', '[bm]  #3 cccccccc text  same text', '[bm]  #4 dddddddd ----- never drawn'])
  assert.deepEqual(r.strays, ['[bm]  drawn, not appended: bbbbbbbb-2222-4222-8222-000000000000 prefix one', '[bm]  drawn, not appended: eeeeeeee-5555-4555-8555-555555555555 same text'])
})

test('/bm-ids numbers the recent rows from the whole list and caps the strays', () => {
  const list = Array.from({ length: 15 }, (_, i) => ({ uuid: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, head: `p${i + 1}` }))
  const r = idsReport(list, new Map(), 2, 1)
  assert.deepEqual(r.rows, ['[bm]  #14 00000013 ----- p14', '[bm]  #15 00000014 ----- p15'])
  assert.deepEqual(idsReport([], new Map([['x', '1'], ['y', '2']]), 12, 1).strays, ['[bm]  drawn, not appended: x 1'])
})

const ROWS = [
  { uuid: 'aaaaaaaa-0000-4000-8000-000000000001', door: 'prompt' as const },
  { uuid: 'bbbbbbbb-0000-4000-8000-000000000002', door: 'response' as const },
  { uuid: 'cccccccc-0000-4000-8000-000000000003', door: 'prompt' as const },
]

test('/bm-jump: nothing or last, first, a number, r<N>, a uuid prefix', () => {
  assert.deepEqual(jumpTarget('', ROWS), { kind: 'row', uuid: ROWS[2]!.uuid, label: 'last prompt' })
  assert.deepEqual(jumpTarget('last', ROWS), { kind: 'row', uuid: ROWS[2]!.uuid, label: 'last prompt' })
  assert.deepEqual(jumpTarget('first', ROWS), { kind: 'row', uuid: ROWS[0]!.uuid, label: 'first prompt' })
  assert.deepEqual(jumpTarget('2', ROWS), { kind: 'row', uuid: ROWS[2]!.uuid, label: 'prompt #2' })
  assert.deepEqual(jumpTarget('r1', ROWS), { kind: 'row', uuid: ROWS[1]!.uuid, label: 'reply #1' })
  assert.deepEqual(jumpTarget('bbbbbbbb', ROWS), { kind: 'row', uuid: ROWS[1]!.uuid, label: 'bbbbbbbb' })
})

test('/bm-jump: a full uuid nobody captured is tried raw; anything else is nothing', () => {
  assert.deepEqual(jumpTarget('ffffffff-0000-4000-8000-000000000009', ROWS), { kind: 'raw', uuid: 'ffffffff-0000-4000-8000-000000000009' })
  assert.deepEqual(jumpTarget('9', ROWS), { kind: 'none', prompts: 2 })
  assert.deepEqual(jumpTarget('r7', ROWS), { kind: 'none', prompts: 2 })
  assert.deepEqual(jumpTarget('zzz', ROWS), { kind: 'none', prompts: 2 })
  // The ids Claude Code draws a tool row and a folded tool group under are tried raw too (the jump.toolRow live check).
  assert.deepEqual(jumpTarget('toolu_01AbCdEf234', ROWS), { kind: 'raw', uuid: 'toolu_01AbCdEf234' })
  assert.deepEqual(jumpTarget('collapsed-ffffffff-0000-4000-8000-000000000009', ROWS), { kind: 'raw', uuid: 'collapsed-ffffffff-0000-4000-8000-000000000009' })
  assert.deepEqual(jumpTarget('toolu_', ROWS), { kind: 'none', prompts: 2 })
  assert.deepEqual(jumpTarget('', []), { kind: 'none', prompts: 0 })
})

test('/bm-sel: what the selected row is to the plugin', () => {
  assert.equal(selectionKind(undefined, undefined, false), 'no row (spans rows / outside transcript)')
  assert.equal(selectionKind('id', 'prompt', true), 'saved prompt row')
  assert.equal(selectionKind('id', undefined, true), 'drawn id only (not a saved uuid)')
  assert.equal(selectionKind('id', undefined, false), 'unknown id (maybe a tool_use_id or a reply)')
})

test('/bm-debug\'s words', () => {
  assert.deepEqual(parseDebugArgs(' enable screen,held '), { kind: 'channels', action: 'enable', rest: ' screen,held' })
  assert.deepEqual(parseDebugArgs('channels'), { kind: 'channels', action: 'channels', rest: '' })
  assert.deepEqual(parseDebugArgs('ON'), { kind: 'echo', choice: true })
  assert.deepEqual(parseDebugArgs('off'), { kind: 'echo', choice: false })
  assert.deepEqual(parseDebugArgs('reset'), { kind: 'echo', choice: undefined })
  assert.deepEqual(parseDebugArgs('default on'), { kind: 'policy', policy: { default: true, forced: false } })
  assert.deepEqual(parseDebugArgs('force off'), { kind: 'policy', policy: { default: false, forced: true } })
  assert.deepEqual(parseDebugArgs('force'), { kind: 'status' })
  assert.deepEqual(parseDebugArgs(''), { kind: 'status' })
  assert.deepEqual(parseDebugArgs('status'), { kind: 'status' })
})

test('/bm-config lines', () => {
  assert.deepEqual(settingsRows({ a: 1, b: 'x' }, { a: 'machine', b: 'default' }), ['a=1 (/config)', 'b="x" (default)'])
  assert.equal(configListedLine(['bookmarks.a'], 15), "[bm] /config lists 1 of this plugin's 15 fields (bookmarks.a)")
  assert.equal(configListedLine([], 15), "[bm] /config lists 0 of this plugin's 15 fields")
  assert.equal(notAppliedLine([], []), undefined)
  assert.equal(notAppliedLine(['a'], ['zz']), '[bm] settings not applied: a (does not fit); zz (no such setting)')
})

test('/bm-env dcc line', () => {
  assert.equal(dccLine(undefined, undefined, undefined, 'off, the default'), '[bm] dcc-patcher: none seen; DCC_PATCH_H=(unset); DCC_PATCHES=(unset); log echo off, the default')
  assert.equal(dccLine('1.2', '1', 'H,K', 'on here only'), '[bm] dcc-patcher: v1.2; DCC_PATCH_H=1; DCC_PATCHES=H,K; log echo on here only')
})
