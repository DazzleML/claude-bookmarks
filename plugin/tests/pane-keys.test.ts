// The pane fields consult the key table (unit A1 of the keys design, 2026-10-20): `q`
// typed in a list pane's `#` field closes the pane through `route()`, the filter's `/`
// is the field's key in the table, and the band's number row never draws a field key.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const STORE = {
  [`prompts:${SID}`]: [
    { uuid: 'aaaaaaaa-0000-4000-8000-000000000001', head: 'first prompt: set up the plugin' },
    { uuid: 'aaaaaaaa-0000-4000-8000-000000000002', head: 'second prompt: add a band' },
    { uuid: 'aaaaaaaa-0000-4000-8000-000000000003', head: 'third prompt: the band redraw' },
  ],
  [`backfilled7:${SID}`]: true,
}
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const PANE = {
  plugin: 'bookmarks',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'bm-pane',
  props: { title: 'prompts: type #', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
}

type Found = { type: string; text?: string; label?: string }
type Mounted = { input: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]> }

async function promptsPane($: { ui: { mount: (t: never) => Promise<unknown> } }) {
  const band = (await $.ui.mount(BAND as never)) as Mounted
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  return { band, pane: (await $.ui.mount(PANE as never)) as Mounted }
}

test('q typed in the prompts pane field closes the pane, through the key table', async ($, on) => {
  const w = world(on, { session: SID, store: STORE, panes: [{ id: 'bm-pane', isFocused: true }] })
  const { pane } = await promptsPane($ as never)
  const closesBefore = w.calls.filter(c => c.event === 'ui.close').length
  await pane.input({ key: 'prompt-number', text: 'q', kind: 'change' }).catch(() => undefined)
  expect(w.calls.filter(c => c.event === 'ui.close').length).toBe(closesBefore + 1)
})

// The filter itself is pinned by filter.test.ts; this only says a routed non-key does nothing.
test('a lone letter that is not a key neither closes the pane nor narrows the list', async ($, on) => {
  const w = world(on, { session: SID, store: STORE, panes: [{ id: 'bm-pane', isFocused: true }] })
  const { pane } = await promptsPane($ as never)
  const closesBefore = w.calls.filter(c => c.event === 'ui.close').length
  await pane.input({ key: 'prompt-number', text: 'x', kind: 'change' }).catch(() => undefined)
  expect(w.calls.filter(c => c.event === 'ui.close').length).toBe(closesBefore)
  expect((await pane.findAll({ type: 'Button' })).length).toBe(3)
})

// band.test.ts pins that the row draws exactly the hint's letter keys (so no field key);
// this only pins the order: the step buttons either side of go, found by operation.
test("the band's number row draws the step keys either side of go", { options: { listInput: 'buttons' } }, async ($, on) => {
  world(on, { session: SID, store: STORE })
  const { band } = await promptsPane($ as never)
  const keys = (await band.findAll({ type: 'Button' })).map(b => (b as { key?: string }).key ?? '')
  const go = keys.indexOf('band-num-go')
  expect(go).toBeGreaterThan(0)
  expect(keys[go - 1]).toBe('band-num-k')
  expect(keys[go + 1]).toBe('band-num-j')
})

// Unit A4 of the keys design (2026-10-20): a bar button pressed on the pane it opened closes
// it, a toggle; the typed key never does, and with the lists off nothing opens to close.
// The harness answers $.ui.panes from the world's `panes` alone, so "open" is staged: the
// pane listed, with the keyboard (so the bar stays drawn), and the plugin's own pane mode
// ('list' at the start of a conversation) moved to the OTHER pane by a first press on it.
type Pressable = Mounted & { press: (t: object) => Promise<unknown> }
const PANE_OPEN = [{ id: 'bm-pane', isFocused: true }]
const closes = (w: { calls: { event: string }[] }) => w.calls.filter(c => c.event === 'ui.close').length
const titles = (w: { opened: () => unknown[] }) => (w.opened() as { title: string }[]).map(o => o.title)

for (const [button, title, first] of [
  ['chord-prompts', 'prompts: type #', ['chord-mark', 'mark: press a-z']],
  ['chord-mark', 'mark: press a-z', undefined],
] as const) {
  test(`the ${button} button pressed twice opens its pane, then closes it`, async ($, on) => {
    const w = world(on, { session: SID, store: STORE, panes: PANE_OPEN })
    const band = (await $.ui.mount(BAND as never)) as Pressable
    const before: string[] = []
    if (first) {
      await band.press({ key: first[0] }).catch(() => undefined)
      before.push(first[1])
    }
    await band.press({ key: button }).catch(() => undefined)
    expect(titles(w)).toEqual([...before, title])
    expect(closes(w)).toBe(0)
    await band.press({ key: button }).catch(() => undefined)
    expect(titles(w)).toEqual([...before, title])
    expect(closes(w)).toBe(1)
  })
}

// The mode alone is not "open": a fresh conversation's mode is 'list' with no pane on screen.
test('a fresh conversation: the prompts button opens the list and closes nothing', async ($, on) => {
  const w = world(on, { session: SID, store: STORE })
  const band = (await $.ui.mount(BAND as never)) as Pressable
  await band.press({ key: 'chord-prompts' }).catch(() => undefined)
  expect(w.opened().length).toBe(1)
  expect(closes(w)).toBe(0)
})

// djdarcy's three rules (2026-11-01, core/band/pane-show.ts), for the typed key as for the
// button: on the pane, close it; open but behind, bring it to the front; not open, open it in
// front. `trackPanes`: the harness follows the opens and closes, a new pane going behind a
// shown one, as Claude Code does.
const closed = (w: { calls: { event: string; input?: unknown }[] }) =>
  w.calls.filter(c => c.event === 'ui.close').map(c => (c.input as { id?: string } | undefined)?.id)
const openedIds = (w: { opened: () => unknown[] }) => (w.opened() as { id: string }[]).map(o => o.id)

test('rule 3: p typed on the prompts pane closes it, and only it', async ($, on) => {
  const w = world(on, { session: SID, store: STORE, panes: [...PANE_OPEN, { id: 'bm-lists', isShown: false }] })
  const band = (await $.ui.mount(BAND as never)) as Pressable
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  expect(closed(w)).toEqual(['bm-pane'])
})

test('rule 2: l with the lists pane behind the prompts pane brings it to the front', async ($, on) => {
  const w = world(on, { session: SID, store: STORE, trackPanes: true, panes: [...PANE_OPEN, { id: 'bm-lists', isShown: false }] })
  const band = (await $.ui.mount(BAND as never)) as Pressable
  await band.input({ key: 'band-cmd-0', text: 'l' }).catch(() => undefined)
  // Claude Code raises only a pane opened anew without a keyboard request: Lists is closed and
  // opened again; the prompts pane is left as it is.
  expect(closed(w)).toEqual(['bm-lists'])
  expect(openedIds(w)).toEqual(['bm-lists'])
  expect(w.shownPanes()).toEqual(['bm-lists'])
})

test('rule 3: l with the lists pane in front closes it', async ($, on) => {
  const w = world(on, { session: SID, store: STORE, panes: [{ id: 'bm-lists' }] })
  const band = (await $.ui.mount(BAND as never)) as Pressable
  await band.input({ key: 'band-cmd-0', text: 'l' }).catch(() => undefined)
  expect(closed(w)).toEqual(['bm-lists'])
  expect(w.opened().length).toBe(0)
})

test('rule 1: p with the lists pane in front opens the prompts list in front of it', async ($, on) => {
  const w = world(on, { session: SID, store: STORE, trackPanes: true, panes: [{ id: 'bm-lists' }] })
  const band = (await $.ui.mount(BAND as never)) as Pressable
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  // Opened without the keyboard request, which the band would refuse and which would leave it behind.
  expect(closed(w)).toEqual([])
  expect(openedIds(w)).toEqual(['bm-pane'])
  expect((w.opened() as { focus?: boolean }[])[0]?.focus).toBe(undefined)
  expect(w.shownPanes()).toEqual(['bm-pane'])
})

test('with the lists off, the prompts button pressed twice opens nothing and closes nothing', { options: { panes: 'off' } }, async ($, on) => {
  const w = world(on, { session: SID, store: STORE, panes: PANE_OPEN })
  const band = (await $.ui.mount(BAND as never)) as Pressable
  await band.press({ key: 'chord-prompts' }).catch(() => undefined)
  await band.press({ key: 'chord-prompts' }).catch(() => undefined)
  expect(w.opened().length).toBe(0)
  expect(closes(w)).toBe(0)
})
