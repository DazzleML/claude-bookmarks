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
test("the band's number row draws the step keys either side of go", async ($, on) => {
  world(on, { session: SID, store: STORE })
  const { band } = await promptsPane($ as never)
  const keys = (await band.findAll({ type: 'Button' })).map(b => (b as { key?: string }).key ?? '')
  const go = keys.indexOf('band-num-go')
  expect(go).toBeGreaterThan(0)
  expect(keys[go - 1]).toBe('band-num-k')
  expect(keys[go + 1]).toBe('band-num-j')
})
