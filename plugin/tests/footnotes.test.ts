// Footnotes (#33) in the prompts pane: the person's slash commands, `!` shell commands and
// interruptions as N.k rows under their prompt -- folded, shown or hidden by the
// `footnotes` setting. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const P2 = 'aaaaaaaa-0000-4000-8000-000000000002'
const STORE = {
  [`prompts:${SID}`]: [
    { uuid: P1, head: 'first prompt' },
    { uuid: P2, head: 'second prompt' },
  ],
  [`footnotes:${SID}`]: [
    { uuid: 'f0000000-0000-4000-8000-000000000001', kind: 'command', label: '/compact', after: P1 },
    { uuid: 'f0000000-0000-4000-8000-000000000002', kind: 'shell', label: '!git status', after: P1 },
  ],
  [`backfilled7:${SID}`]: true,
}
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const PANE = {
  plugin: 'bookmarks',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'bm-pane',
  props: { title: 'prompts: type #', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
}

type Found = { type: string; text?: string; props: Record<string, unknown> }
async function paneButtons($: { ui: { mount: (t: never) => Promise<unknown> } }) {
  const band = (await $.ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  const pane = (await $.ui.mount(PANE as never)) as { findAll: (q: object) => Promise<Found[]> }
  return (await pane.findAll({ type: 'Button' })).map(b => b.text ?? '')
}

test('folded by default: a prompt with footnotes shows an ellipsis row, dim', async ($, on) => {
  world(on, { session: SID, store: STORE })
  const rows = await paneButtons($ as never)
  expect(rows).toEqual([' 2) second prompt', ' 1) first prompt', '      … 2 footnotes'])
})

test('shown: the footnotes are listed N.k under their prompt', { options: { footnotes: 'shown' } }, async ($, on) => {
  world(on, { session: SID, store: STORE })
  const rows = await paneButtons($ as never)
  expect(rows).toEqual([' 2) second prompt', ' 1) first prompt', '   1.1 /compact', '   1.2 !git status'])
})

// The jump itself is a plugin's own $.ui.scroll, which the kit does not route to test
// hooks (like $.ui.focus; docs/engine-quirks.md), so these check that the footnote is
// found -- and, as the control, that a missing one is reported.
async function typeInBand($: { ui: { mount: (t: never) => Promise<unknown> } }, keys: string[]) {
  type Ui = { input: (t: object) => Promise<unknown>; press: (t: object) => Promise<unknown> }
  const band = (await $.ui.mount(BAND as never)) as unknown as Ui
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  for (const key of keys) await band.press({ key }).catch(() => undefined)
}

test('in the band, 1 . 1 then go finds footnote 1.1', async ($, on) => {
  const w = world(on, { session: SID, store: STORE })
  await typeInBand($ as never, ['band-num-1', 'band-num-dot', 'band-num-1', 'band-num-go'])
  expect(w.toasts().some(t => t.startsWith('no footnote'))).toBe(false)
})

test('a footnote number that does not exist says so', { options: { listInput: 'buttons' } }, async ($, on) => {
  const w = world(on, { session: SID, store: STORE })
  await typeInBand($ as never, ['band-num-1', 'band-num-dot', 'band-num-9', 'band-num-go'])
  expect(w.toasts()).toContain('no footnote 1.9')
})

test('in the band, 1 . then go unfolds #1', { options: { listInput: 'buttons' } }, async ($, on) => {
  world(on, { session: SID, store: STORE })
  type Ui = { input: (t: object) => Promise<unknown>; press: (t: object) => Promise<unknown> }
  const band = (await $.ui.mount(BAND as never)) as unknown as Ui
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  for (const key of ['band-num-1', 'band-num-dot', 'band-num-go']) await band.press({ key }).catch(() => undefined)
  const pane = (await $.ui.mount(PANE as never)) as { findAll: (q: object) => Promise<Found[]> }
  const rows = (await pane.findAll({ type: 'Button' })).map(b => b.text ?? '')
  expect(rows).toContain('   1.1 /compact')
})

// Opened by hand, the footnotes can be folded again (djdarcy, 2026-10-12). The unfolded set
// lives in the module, so the test opens #1 itself if an earlier test has not.
test('unfolded footnotes fold again from their ▴ fold row', async ($, on) => {
  world(on, { session: SID, store: STORE })
  type Pane = { press: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]> }
  const band = (await $.ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  const pane = (await $.ui.mount(PANE as never)) as Pane
  const texts = async () => (await pane.findAll({ type: 'Button' })).map(b => b.text ?? '')
  if ((await texts()).includes('      … 2 footnotes')) await pane.press({ key: 'fn-fold-1' })
  expect(await texts()).toEqual([' 2) second prompt', ' 1) first prompt', '   1.1 /compact', '   1.2 !git status', '      ▴ fold'])
  await pane.press({ key: 'fn-refold-1' })
  expect(await texts()).toEqual([' 2) second prompt', ' 1) first prompt', '      … 2 footnotes'])
})

// Hidden rows, working keys (djdarcy, 2026-10-12: "Rows hidden, keys work"): `N.k` still
// finds the footnote; `N.` cannot show anything, so it says where the setting is.
test('hidden: 1 . 1 go still finds the footnote; 1 . go says footnotes are hidden', { options: { footnotes: 'hidden', listInput: 'buttons' } }, async ($, on) => {
  const w = world(on, { session: SID, store: STORE })
  type Ui = { input: (t: object) => Promise<unknown>; press: (t: object) => Promise<unknown> }
  const band = (await $.ui.mount(BAND as never)) as unknown as Ui
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  for (const key of ['band-num-1', 'band-num-dot', 'band-num-1', 'band-num-go']) await band.press({ key }).catch(() => undefined)
  expect(w.toasts().some(t => t.includes('no footnote'))).toBe(false)
  for (const key of ['band-num-1', 'band-num-dot', 'band-num-go']) await band.press({ key }).catch(() => undefined)
  expect(w.toasts().some(t => t.startsWith('Footnotes are hidden'))).toBe(true)
})

test('hidden: no footnote rows', { options: { footnotes: 'hidden' } }, async ($, on) => {
  world(on, { session: SID, store: STORE })
  const rows = await paneButtons($ as never)
  expect(rows).toEqual([' 2) second prompt', ' 1) first prompt'])
})
