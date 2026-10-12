// Goldens: what the band and the prompts pane draw today, pinned so a refactor (the
// register.tsx split, the band redraw) cannot change them unnoticed. A deliberate
// change updates the expectation in the same commit. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const PROMPTS = [
  { uuid: 'aaaaaaaa-0000-4000-8000-000000000001', head: 'first prompt: set up the plugin' },
  { uuid: 'aaaaaaaa-0000-4000-8000-000000000002', head: 'second prompt: add a band' },
  { uuid: 'aaaaaaaa-0000-4000-8000-000000000003', head: 'third prompt: list the prompts' },
]
const STORE = { [`prompts:${SID}`]: PROMPTS, [`backfilled6:${SID}`]: true }

const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const PANE = {
  plugin: 'bookmarks',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'bm-pane',
  props: { title: 'prompts: type #', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
}

type Found = { type: string; key: string | undefined; text?: string }
// The leaf elements, as type:key:text, in drawing order (the Box roll-ups left out).
const leaves = (els: unknown[]) =>
  (els as Found[]).filter(e => e.type !== 'Box').map(e => `${e.type}:${e.key ?? ''}:${e.text ?? ''}`)

// The bar is drawn from the router's table (core/keys.ts bandButtons): each shown command
// once, `?` for the rest; the field has no placeholder (it listed keys without saying
// what they did). Slice 5, 2026-10-12.
test('the idle band: the command field, the labelled commands, and ?', async ($, on) => {
  world(on, { store: STORE, session: SID })
  const ui = await $.ui.mount(BAND as never)
  expect(leaves(await ui.findAll({}))).toEqual([
    'Input:band-cmd-0:',
    'Button:chord-mark:mark',
    'Button:chord-jump:jump',
    'Button:chord-prompts:prompts',
    'Button:chord-read:read',
    'Button:chord-help:?',
  ])
  const input = await ui.find({ type: 'Input' })
  expect(input?.props).toEqual({ key: 'band-cmd-0', label: 'bm', placeholder: '', submitLabel: 'run', autoFocus: true })
  const mark = await ui.find({ type: 'Button', key: 'chord-mark' })
  expect([mark?.props.hotkey, mark?.props.action]).toEqual(['m', 'app:toggleDiffNoiseFilter'])
  const help = await ui.find({ type: 'Button', key: 'chord-help' })
  expect([help?.props.hotkey, help?.props.action]).toEqual([undefined, undefined])
})

test('p in the band opens the prompts pane and the band takes a number', async ($, on) => {
  const w = world(on, { store: STORE, session: SID })
  const band = await $.ui.mount(BAND as never)
  // The plugin then moves the band's focus ring onto "go"; the kit does not route a
  // plugin's own $.ui.focus to test hooks (docs/engine-quirks.md), so that last step
  // throws after everything this test checks has happened.
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  expect(w.opened()).toEqual([{ id: 'bm-pane', title: 'prompts: type #', focus: true, closeOnEscape: true, rows: 4, columns: 16 }])
  expect(leaves(await band.findAll({}))).toEqual([
    'Text::bm',
    'Text::prompt #',
    'Text::_',
    'Text::(1-3)',
    ...[...'0123456789'].map(d => `Button:band-num-${d}:${d}`),
    'Button:band-num-dot:.',
    'Button:band-num-k:k↑',
    'Button:band-num-go:go (Enter)',
    'Button:band-num-j:j↓',
    'Button:band-num-s:s★ pin',
    'Text::(Esc)',
  ])
  const pane = await $.ui.mount(PANE as never)
  expect(leaves(await pane.findAll({}))).toEqual([
    'Input:prompt-number:',
    'Text::or Tab / Shift+Tab, Enter; *N pins',
    `Button:p-${PROMPTS[2]!.uuid}: 3) third prompt: list the prompts`,
    `Button:p-${PROMPTS[1]!.uuid}: 2) second prompt: add a band`,
    `Button:p-${PROMPTS[0]!.uuid}: 1) first prompt: set up the plugin`,
  ])
})

test('/bm-config prints every setting with its source', async ($, on) => {
  const w = world(on, { store: STORE, session: SID })
  await $.command.run({ command: 'bm-config', args: '' } as never)
  expect(w.logs()).toEqual([
    '[bm] settings: listOpensAt="nearest" (default); followHere="when-idle" (default); closeShare=0.6 (default); paneAfterJump="close" (default); paneWhileTyping="stay" (default); afterActionFocus="input" (default); debugDefault="off" (default); debugText="auto" (default); debugTextLength="reference" (default); palette="" (default); footnotes="folded" (default); promptTextBudget=2000000 (default); band="full" (default); chords="on" (default); panes="on" (default)',
    '[bm] this build is loaded from a folder, so debugText="auto" means always; change any of these in /config',
  ])
})
