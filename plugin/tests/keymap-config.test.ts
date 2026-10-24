// The keymap's /config rows behind a fold (#36; the keys design, unit 3; the fold look of
// 2026-10-24): a row's keys move the band's button, a clash or an unusable key is refused
// with its reason, a bad stored value keeps the default and is named, the fold hides the
// rows, and the Leader row says where the leader is bound.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-777777777777'
const LOG = `C:/test-home/claude/bookmarks/debug/${SID}.log`
const STORE = {
  [`prompts:${SID}`]: [
    { uuid: 'aaaaaaaa-0000-4000-8000-000000000001', head: 'first prompt' },
    { uuid: 'aaaaaaaa-0000-4000-8000-000000000002', head: 'second prompt' },
  ],
  [`backfilled7:${SID}`]: true,
}
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const PROVIDER = { plugin: 'bookmarks', tier: 'mod' }
type Found = { type: string; key?: string; text?: string; props: Record<string, unknown> }
type Band = { input: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]> }
type Engine = {
  session: { start: (i: object) => Promise<unknown> }
  config: { set: (i: object) => Promise<{ value?: unknown; deny?: string }>; describe: (i: object) => Promise<{ isHidden: boolean; description?: string }> }
  ui: { mount: (t: never) => Promise<unknown> }
}
const mount = async ($: unknown) => (await ($ as Engine).ui.mount(BAND as never)) as Band
const hotkeyOf = async (band: Band, id: string) => (await band.findAll({ type: 'Button' })).find(b => b.key === `chord-${id}`)?.props.hotkey
const settle = () => new Promise(r => setTimeout(r, 300))
const set = ($: unknown, field: string, value: string) =>
  ($ as Engine).config.set({ key: `bookmarks.${field}`, value, previous: '', provider: PROVIDER, origin: { kind: 'composer' } })
const describe = ($: unknown, field: string) =>
  ($ as Engine).config.describe({ key: `bookmarks.${field}`, label: field, description: 'd', isHidden: false, provider: PROVIDER })
const answerBase = (on: unknown) => {
  const o = on as (event: string, m: object, h: (h: unknown, e: Record<string, unknown>) => unknown) => void
  o('config.set', {}, async (_h, e) => ({ value: e.value }))
  o('config.describe', {}, async (_h, e) => ({ label: e.label, description: e.description, isHidden: e.isHidden }))
}

test('a key row moves its button: mark set to x presses with x', { options: { keyMark: 'x' } }, async ($, on) => {
  world(on, { store: STORE, session: SID })
  expect(await hotkeyOf(await mount($), 'mark')).toBe('x')
})

test('a stored value the band cannot use keeps the default, and the start names it', { options: { keyMark: 'Up' } }, async ($, on) => {
  const w = world(on, { store: STORE, session: SID })
  await ($ as unknown as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  expect(await hotkeyOf(await mount($), 'mark')).toBe('m')
  expect((w.file(LOG) ?? '').includes('[bm] keymap: mark "Up": Up never reaches the band')).toBe(true)
})

test('a clash is refused with its reason, and the keys stay as they were', async ($, on) => {
  world(on, { store: STORE, session: SID })
  answerBase(on)
  const r = await set($, 'keyMark', 'j')
  expect(r.deny?.includes("j is already")).toBe(true)
  expect(await hotkeyOf(await mount($), 'mark')).toBe('m')
})

test('a free key is taken, and the band follows it', async ($, on) => {
  world(on, { store: STORE, session: SID })
  answerBase(on)
  const r = await set($, 'keyMark', 'x')
  expect(r.deny).toBe(undefined)
  expect(await hotkeyOf(await mount($), 'mark')).toBe('x')
})

test('the Leader row is refused with where the leader is bound', async ($, on) => {
  world(on, { store: STORE, session: SID })
  answerBase(on)
  const r = await set($, 'keyLeader', 'ctrl+k')
  expect(r.deny?.includes('keybindings.json')).toBe(true)
  expect(r.deny?.includes('abovePrompt:focus')).toBe(true)
})

test('by default every row is folded behind Bookmarks, and Bookmarks itself shows', async ($, on) => {
  world(on, { store: STORE, session: SID })
  answerBase(on)
  expect((await describe($, 'settingsShown')).isHidden).toBe(false)
  expect((await describe($, 'rowLines')).isHidden).toBe(true)
  expect((await describe($, 'keysShown')).isHidden).toBe(true)
  expect((await describe($, 'keyMark')).isHidden).toBe(true)
})

test('Bookmarks open, keys folded: the settings show, the key rows do not', { options: { settingsShown: true } }, async ($, on) => {
  world(on, { store: STORE, session: SID })
  answerBase(on)
  expect((await describe($, 'rowLines')).isHidden).toBe(false)
  expect((await describe($, 'keysShown')).isHidden).toBe(false)
  expect((await describe($, 'keyMark')).isHidden).toBe(true)
  expect((await describe($, 'keyList')).isHidden).toBe(true)
})

test('an open fold leads with ▾, a closed one with ▸, and the debug rows wait behind theirs', { options: { settingsShown: true } }, async ($, on) => {
  world(on, { store: STORE, session: SID })
  answerBase(on)
  const d = $ as unknown as { config: { describe: (i: object) => Promise<{ isHidden: boolean; label: string }> } }
  const row = (field: string) => d.config.describe({ key: `bookmarks.${field}`, label: field, description: 'd', isHidden: false, provider: PROVIDER })
  expect((await row('settingsShown')).label.startsWith('▾')).toBe(true)
  expect((await row('debugShown')).label.startsWith('▸')).toBe(true)
  expect((await row('debugText')).isHidden).toBe(true)
  expect((await row('rowLines')).label).toBe('rowLines')
})

test('unfolded: the key rows show, and the Leader row names the chord in keybindings.json', { options: { settingsShown: true, keysShown: true } }, async ($, on) => {
  const bindings = JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'ctrl+]': 'abovePrompt:focus' } }] })
  world(on, { store: STORE, session: SID, files: { 'C:/test-home/.claude/keybindings.json': bindings } })
  answerBase(on)
  expect((await describe($, 'keyMark')).isHidden).toBe(false)
  const leader = await describe($, 'keyLeader')
  expect(leader.isHidden).toBe(false)
  expect(leader.description?.includes('Bound to ctrl+]')).toBe(true)
})

test('the list keys follow their row: n and p step the prompts list', { options: { keyList: 'n p' } }, async ($, on) => {
  world(on, { store: STORE, session: SID })
  const band = await mount($)
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  const labels = (await band.findAll({ type: 'Button' })).map(b => b.text ?? '')
  expect(labels.some(l => l.includes('n↓'))).toBe(true)
  expect(labels.some(l => l.includes('j↓'))).toBe(false)
})
