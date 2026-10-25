// The prompts filter (#28): `/words` in the prompts pane's number field narrows the list,
// numbers kept, with `N of M match`. Run: claude plugin test plugin
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

type Found = { type: string; text?: string }
type Pane = { input: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]> }

async function filteredPane($: { ui: { mount: (t: never) => Promise<unknown> } }, query: string) {
  const band = (await $.ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  const pane = (await $.ui.mount(PANE as never)) as Pane
  await pane.input({ key: 'prompt-number', text: query, kind: 'change' }).catch(() => undefined)
  return pane
}

test('/words narrows the list, numbers kept, words in any order', async ($, on) => {
  world(on, { session: SID, store: STORE })
  const pane = await filteredPane($ as never, '/BAND redraw')
  expect((await pane.findAll({ type: 'Button' })).map(b => b.text)).toEqual([' 3) third prompt: the band redraw'])
  expect((await pane.findAll({ type: 'Text' })).some(t => t.text === '/BAND redraw: 1 of 3 match')).toBe(true)
})

// Esc clearing the filter before closing is a live look: the kit offers no way for a
// test to raise the pane's close (tests/checklists).

// The text lives in files under the data root, not the plugin store, whose 4 MiB is shared
// by every conversation's marks and pins.
const TEXT_BASE = `C:/test-home/claude/bookmarks/prompttext/${SID}`
const TEXT_FILES = {
  [`${TEXT_BASE}.json`]: JSON.stringify({ pieces: 1 }),
  [`${TEXT_BASE}.0.json`]: JSON.stringify([{ uuid: 'aaaaaaaa-0000-4000-8000-000000000001', text: 'first prompt: set up the plugin, and much later a zebra' }]),
}

test('the kept text is searched past the excerpt, and a smaller budget drops it at once', async ($, on) => {
  const w = world(on, { session: SID, store: STORE, files: TEXT_FILES })
  on('config.set', {}, async (_h, e) => ({ value: e.value }))
  const pane = await filteredPane($ as never, '/zebra')
  // The row draws the kept text whole (U64), so the match shows the zebra too.
  expect((await pane.findAll({ type: 'Button' })).map(b => b.text)).toEqual([' 1) first prompt: set up the plugin, and much later a zebra'])
  await $.config.set({ key: 'bookmarks.promptTextBudget', value: 10, previous: 2_000_000, provider: { plugin: 'bookmarks', tier: 'mod' }, origin: { kind: 'composer' } } as never)
  await pane.input({ key: 'prompt-number', text: '/zebr', kind: 'change' }).catch(() => undefined)
  expect((await pane.findAll({ type: 'Text' })).map(t => t.text).filter(t => t?.startsWith('/'))).toEqual(['/zebr: 0 of 3 match'])
  expect((await pane.findAll({ type: 'Button' })).length).toBe(0)
  expect(JSON.parse(w.file(`${TEXT_BASE}.0.json`)!)).toEqual([{ uuid: 'aaaaaaaa-0000-4000-8000-000000000001', text: 'first prom' }])
})

test('text a development build kept in the plugin store is removed from it', async ($, on) => {
  const deleted: string[] = []
  on('store.delete', {}, async (_h, e, next) => {
    deleted.push(e.key)
    return next(e)
  })
  world(on, { session: SID, store: { ...STORE, [`prompttext:${SID}:0`]: [{ uuid: 'x', text: 'y' }], [`prompttext:${SID}:n`]: 1 }, files: TEXT_FILES })
  await filteredPane($ as never, '/zebra')
  expect(deleted.sort()).toEqual([`prompttext:${SID}:0`, `prompttext:${SID}:n`])
})

test('without the slash the list is whole', async ($, on) => {
  world(on, { session: SID, store: STORE })
  const pane = await filteredPane($ as never, '/band')
  expect((await pane.findAll({ type: 'Button' })).length).toBe(2)
  await pane.input({ key: 'prompt-number', text: '', kind: 'change' }).catch(() => undefined)
  expect((await pane.findAll({ type: 'Button' })).length).toBe(3)
})
