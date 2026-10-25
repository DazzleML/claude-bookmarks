// The delete gesture through the band (the keys design, 2026-10-20, unit 5; djdarcy: d/D, no
// confirmation): `d a` clears a (the slot's current is null, its history and record stay);
// `D a` forgets a (one entry, nothing refers to it: the record and the slot go, no tombstone);
// `d` after a number in the bookmarks list removes that bookmark (a tombstone keeps its place).
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, parseRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { BAND_PROPS, DATA_ROOT, registerWithMarks, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const U = 'eeeeeeee-0000-4000-8000-000000000001'
// Two messages: ids that agree on their first four groups count as one message (core/kit/message-id.ts), so b's differs early.
const U2 = 'ffffffff-0000-4000-8000-000000000002'
const REG = `${DATA_ROOT}/sessions/${SID}.json`
const FILES = registerWithMarks(SID, { a: { uuid: U, head: 'first', markedAt: 1, snippet: 'first' }, b: { uuid: U2, head: 'second', markedAt: 2, snippet: 'second' } })
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }

type Band = { input: (t: object) => Promise<unknown>; press: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<{ key?: string }[]> }
const mount = async ($: unknown) => (await ($ as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount(BAND as never)) as Band
const register = (w: { file: (p: string) => string | undefined }) => parseRegister(w.file(REG) ?? '')!

test('d a clears the letter: it points at nothing, its history and its record stay', async ($, on) => {
  const w = world(on, { session: SID, files: FILES })
  const band = await mount($)
  await band.input({ key: 'band-cmd-0', text: 'da' }).catch(() => undefined)
  const reg = register(w)
  expect(reg.slots?.user?.a?.current).toBe(null)
  expect(reg.slots?.user?.a?.history.length).toBe(1)
  expect(reg.perma.filter(r => r.tier === 'mark').length).toBe(2)
  expect(reg.tombstones.length).toBe(0)
  expect(w.toasts().at(-1)).toBe('mark a cleared; its history is kept')
})

test('D a forgets the letter: one entry and nothing referring to it, so the record and the slot go without a tombstone', async ($, on) => {
  const w = world(on, { session: SID, files: FILES })
  const band = await mount($)
  await band.input({ key: 'band-cmd-0', text: 'Da' }).catch(() => undefined)
  const reg = register(w)
  expect(reg.slots?.user?.a).toBe(undefined)
  expect(reg.perma.filter(r => r.tier === 'mark').length).toBe(1)
  expect(reg.tombstones.length).toBe(0)
  expect(reg.slots?.user?.b?.current).not.toBe(null)
  expect(w.toasts().at(-1)).toBe('mark a forgotten')
  // Like every action from the band, it owes the Esc reminder: the next key the band does not know says so.
  const field = (await band.findAll({ type: 'Input' }))[0]?.key ?? 'band-cmd-1'
  await band.input({ key: field, text: 'z' }).catch(() => undefined)
  expect(w.toasts().at(-1)?.startsWith('Press Esc to type in the input box')).toBe(true)
})

const PANE = {
  plugin: 'bookmarks',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'bm-pane',
  props: { title: 'jump: press a-z', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
}
type Mounted = { findAll: (q: object) => Promise<{ key?: string }[]> }

test('after d a, the jump pane no longer lists a: the marks the panes draw follow the file', async ($, on) => {
  world(on, { session: SID, files: FILES })
  const band = await mount($)
  await band.input({ key: 'band-cmd-0', text: 'da' }).catch(() => undefined)
  const field = (await (band as unknown as Mounted).findAll({ type: 'Input' }))[0]?.key ?? 'band-cmd-1'
  await band.input({ key: field, text: "'" }).catch(() => undefined)
  const pane = (await ($ as unknown as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount(PANE as never)) as Mounted
  const keys = (await pane.findAll({ type: 'Button' })).map(b => b.key)
  expect(keys.includes('jump-b')).toBe(true)
  expect(keys.includes('jump-a')).toBe(false)
})

test('D on a letter that is not set says so and changes no file', async ($, on) => {
  const w = world(on, { session: SID, files: FILES })
  const band = await mount($)
  const before = w.file(REG)
  await band.input({ key: 'band-cmd-0', text: 'Dz' }).catch(() => undefined)
  expect(w.toasts().at(-1)).toBe('mark z is not set')
  expect(w.file(REG)).toBe(before)
})

function registerWithBookmark() {
  let reg = emptyRegister(SID, 'bookmarks test', 0)
  reg = addOrRelabel(reg, { uuid: U, owner: 'user', label: 'the one bookmark', head: 'first', by: 'user', source: 'tool' }, 10).register
  return { [REG]: serializeRegister(reg) }
}

// The same through the band's own field (input routing, 2026-10-25, unit 4): `1d` typed.
test('1d typed in the band field removes that bookmark: a tombstone keeps its place, and the field starts fresh', async ($, on) => {
  const w = world(on, { session: SID, files: registerWithBookmark() })
  const band = await mount($)
  await band.input({ key: 'band-cmd-0', text: 'b' }).catch(() => undefined)
  const field = () => band.findAll({ type: 'Input' }).then(f => f.find(i => (i.key ?? '').startsWith('band-num-field'))?.key)
  const before = await field()
  expect(before).toBe('band-num-field-0')
  await band.input({ key: before, text: '1d', kind: 'change' }).catch(() => undefined)
  const reg = register(w)
  expect(reg.perma.length).toBe(0)
  expect(reg.tombstones.length).toBe(1)
  expect(w.toasts().at(-1)).toBe('removed bookmark: the one bookmark')
  expect(await field()).not.toBe(before)
})

test('d after a number in the bookmarks row removes that bookmark: a tombstone keeps its place', { options: { listInput: 'buttons' } }, async ($, on) => {
  const w = world(on, { session: SID, files: registerWithBookmark() })
  const band = await mount($)
  await band.input({ key: 'band-cmd-0', text: 'b' }).catch(() => undefined)
  await band.press({ key: 'band-num-1' }).catch(() => undefined)
  await band.press({ key: 'band-num-d' }).catch(() => undefined)
  const reg = register(w)
  expect(reg.perma.length).toBe(0)
  expect(reg.tombstones.length).toBe(1)
  expect(reg.tombstones[0]?.removedBy).toBe('user')
  expect(w.toasts().at(-1)).toBe('removed bookmark: the one bookmark')
  // The number is spent: the row's typed field reads `_` again, not the removed bookmark's number.
  const texts = (await band.findAll({ type: 'Text' })).map(t => (t as { text?: string }).text ?? '')
  expect(texts.includes('_')).toBe(true)
  expect(texts.includes('1')).toBe(false)
})
