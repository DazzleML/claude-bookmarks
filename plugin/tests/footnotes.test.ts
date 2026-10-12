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
  [`backfilled5:${SID}`]: true,
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

test('hidden: no footnote rows', { options: { footnotes: 'hidden' } }, async ($, on) => {
  world(on, { session: SID, store: STORE })
  const rows = await paneButtons($ as never)
  expect(rows).toEqual([' 2) second prompt', ' 1) first prompt'])
})
