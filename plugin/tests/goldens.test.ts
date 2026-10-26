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
const STORE = { [`prompts:${SID}`]: PROMPTS, [`backfilled7:${SID}`]: true }

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

// The bar is drawn from the router's table (core/band/keys.ts bandButtons): each shown command
// once, `?` for the rest; the field has no placeholder (it listed keys without saying
// what they did). Slice 5, 2026-10-12.
test('the idle band: the command field, the labelled commands, and ?', async ($, on) => {
  world(on, { store: STORE, session: SID })
  const ui = await $.ui.mount(BAND as never)
  expect(leaves(await ui.findAll({}))).toEqual([
    'Input:band-cmd-0:',
    'Button:chord-mark:mark',
    'Button:chord-jump:jump',
    'Button:chord-read:read',
    'Button:chord-prompts:prompts',
    'Button:chord-search:/search',
    'Button:chord-help:?',
  ])
  const input = await ui.find({ type: 'Input' })
  expect(input?.props).toEqual({ key: 'band-cmd-0', label: 'bm', placeholder: '', submitLabel: 'run', autoFocus: true })
  const mark = await ui.find({ type: 'Button', key: 'chord-mark' })
  expect([mark?.props.hotkey, mark?.props.action]).toEqual(['m', 'app:toggleDiffNoiseFilter'])
  const help = await ui.find({ type: 'Button', key: 'chord-help' })
  expect([help?.props.hotkey, help?.props.action]).toEqual([undefined, undefined])
})

test('p in the band opens the prompts pane and the band takes a number', { options: { listInput: 'buttons' } }, async ($, on) => {
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
    'Button:band-num-q:q close',
    'Text::(Esc)',
  ])
  const pane = await $.ui.mount(PANE as never)
  // A row is cut to the pane's width (60 body columns here; U64), so these short rows draw whole.
  expect(leaves(await pane.findAll({}))).toEqual([
    'Input:prompt-number:',
    'Text::or Tab / Shift+Tab, Enter; *N pins',
    `Button:p-${PROMPTS[2]!.uuid}: 3) third prompt: list the prompts`,
    `Button:p-${PROMPTS[1]!.uuid}: 2) second prompt: add a band`,
    `Button:p-${PROMPTS[0]!.uuid}: 1) first prompt: set up the plugin`,
  ])
})

// A notice queued into a running turn was kept as a prompt by the live capture before
// 0.4.27 (djdarcy, 2026-10-12: "The whole point of the "prompts" panel is it is showing
// genuine user inputs, full stop"). Such a kept row drops out, and the numbers close up.
test('a kept notice is not listed, and the prompts keep their numbers', async ($, on) => {
  const notice = { uuid: 'bbbbbbbb-0000-4000-8000-000000000009', head: '[SYSTEM NOTIFICATION - NOT USER INPUT] This is an automated' }
  world(on, { store: { ...STORE, [`prompts:${SID}`]: [PROMPTS[0], notice, PROMPTS[1], PROMPTS[2]] }, session: SID })
  const band = await $.ui.mount(BAND as never)
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  const pane = await $.ui.mount(PANE as never)
  expect(leaves(await pane.findAll({ type: 'Button' }))).toEqual([
    `Button:p-${PROMPTS[2]!.uuid}: 3) third prompt: list the prompts`,
    `Button:p-${PROMPTS[1]!.uuid}: 2) second prompt: add a band`,
    `Button:p-${PROMPTS[0]!.uuid}: 1) first prompt: set up the plugin`,
  ])
})

test('/bm-config prints every setting with its source', async ($, on) => {
  const w = world(on, { store: STORE, session: SID })
  await $.command.run({ command: 'bm-config', args: '' } as never)
  expect(w.logs()).toEqual([
    '[bm] settings: settingsShown=false (default); listOpensAt="nearest" (default); followHere="when-idle" (default); closeShare=0.6 (default); paneAfterJump="close" (default); paneWhileTyping="stay" (default); afterActionFocus="input" (default); palette="" (default); footnotes="folded" (default); promptTextBudget=2000000 (default); band="full" (default); chords="on" (default); panes="on" (default); listInput="auto" (default); pinScope="here" (default); searchShown=false (default); searchToggles="shown" (default); searchView="all" (default); searchWithYou=true (default); searchWithClaude=true (default); searchWithAgents=false (default); searchWithSessions=true (default); searchWithTools=true (default); searchWithOutputs=true (default); searchWithThinking=false (default); searchWithNotices=false (default); searchWithOther=false (default); searchLabels="words" (default); searchShortLength=2 (default); searchLayout="stacked" (default); searchImplied="implied" (default); rowLines=2 (default); keysShown=false (default); keyMark="" (default); keyJump="" (default); keyPrompts="" (default); keyRead="" (default); keyBookmarks="" (default); keySearch="" (default); keyPromote="" (default); keyDelete="" (default); keyForget="" (default); keyBack="" (default); keyForward="" (default); keyClose="" (default); keyHelp="" (default); keyList="" (default); keyLeader="" (default); debugShown=false (default); debugDefault="off" (default); debugText="auto" (default); debugTextLength="reference" (default)',
    '[bm] this build is loaded from a folder, so debugText="auto" means always; change any of these in /config',
    // The kit draws no /config menu; live, all rows are listed (screenshot 2026-10-12, 15 then).
    // 31 since the keymap rows (0.6.23): 16 settings, the fold row, 12 command rows, the list row, the Leader row;
    // 33 since the Bookmarks fold over all of them and the debug fold (0.6.26); 34 with listInput; 35 with starScope (0.7.1);
    // 52 in 0.7.4: the search fold, searchToggles, searchView, its 9 custom rows, searchLabels, searchShortLength, searchLayout, searchImplied, and the search command's key row.
    "[bm] /config lists 0 of this plugin's 52 fields",
  ])
})
