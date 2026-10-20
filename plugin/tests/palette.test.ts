// The palette (#27) as drawn: a role's style reaches the element, and an override from
// the `palette` setting replaces it. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, registerWithMarks, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const FILES = registerWithMarks(SID, { a: { uuid: 'bbbbbbbb-0000-4000-8000-000000000001', head: 'the marked message', markedAt: 0 } })
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const PANE = {
  plugin: 'bookmarks',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'bm-pane',
  props: { title: 'mark', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
}

type Found = { type: string; text?: string; props: Record<string, unknown> }
async function takenLetter($: { ui: { mount: (t: never) => Promise<unknown> }; session: { start: (e: object) => Promise<unknown> } }) {
  // The panes draw the marks from the cache, which a conversation's start fills from the register (0.5.5).
  await $.session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  const band = (await $.ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: 'm' }).catch(() => undefined)
  const pane = (await $.ui.mount(PANE as never)) as { findAll: (q: object) => Promise<Found[]> }
  return (await pane.findAll({ type: 'Text' })).find(t => t.text === 'a')
}

test('a mark letter in use is drawn in the `used` role', async ($, on) => {
  world(on, { session: SID, files: FILES })
  const a = await takenLetter($ as never)
  expect(a?.props.color).toBe('inactive')
  expect(a?.props.bold).toBe(true)
})

test('an override from the palette setting replaces the role', { options: { palette: '{"used": {"color": "red"}}' } }, async ($, on) => {
  world(on, { session: SID, files: FILES })
  const a = await takenLetter($ as never)
  expect(a?.props.color).toBe('red')
})

test('an override that is not JSON leaves the defaults', { options: { palette: 'not json' } }, async ($, on) => {
  world(on, { session: SID, files: FILES })
  const a = await takenLetter($ as never)
  expect(a?.props.color).toBe('inactive')
})
