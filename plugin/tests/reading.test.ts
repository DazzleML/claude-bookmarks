// Setting the reading position from a selection must not move the view (Q261015-01; djdarcy,
// 2026-10-15: "If a user is SETTING a read point it shouldn't simultaneously jump them back").
// Seen live: a prompts pane opened from the band and left open kept its opening position as
// the "put the view back" target; 34 minutes later, <leader><space> over a fresh selection
// scrolled there (his debug log, 16:18:15Z, "view restored after highlight -> ok | c077c9a7").
// The kit cannot see a scroll (a plugin's own $.ui.scroll throws "no implementation"), so the
// test reads the scroll's shadow: on today's code the set path scrolls, the scroll throws, and
// the "reading position set" toast, which comes after it, never appears.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const LOG = `C:/test-home/claude/bookmarks/debug/${SID}.log`
const OLD = '0bd0bd01-0000-4000-8000-000000000001' // on screen when the pane opened
const NOW = 'cafe5e1f-0000-4000-8000-000000000002' // where the person scrolled to and selected
const STORE = {
  [`prompts:${SID}`]: [{ uuid: OLD, head: 'the old place' }, { uuid: NOW, head: 'the new place' }],
  [`backfilled7:${SID}`]: true,
}
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
type Ui = { input: (t: object) => Promise<unknown> }
type Mount = { ui: { mount: (t: never) => Promise<unknown> } }
type Engine = Record<string, Record<string, (i: object) => Promise<unknown>>>
const settle = () => new Promise(r => setTimeout(r, 300))

const drawn = (id: string, text: string, onScreen: { first: number; last: number; of: number } | null) =>
  ({ plugin: 'bookmarks', surface: 'terminal', component: 'UserMessage', requestId: id, props: { text, onScreen } })

// followHere 'never': the pane's own row-following scrolls the pane, which the kit cannot run
// (a rejection nothing in the plugin catches); it is not what this test is about.
test('setting the reading position after scrolling away from a kept-open pane does not jump back (Q261015-01)', { options: { followHere: 'never' } }, async ($, on) => {
  let selection: { requestId: string; text: string } | undefined
  const panes: { id: string }[] = []
  const w = world(on, { session: SID, store: STORE, selection: () => selection, panes })
  on('prompt.submit' as never, {} as never, (async (_h: unknown, e: object) => e) as never)
  await ($ as unknown as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  const mount = ($ as unknown as Mount).ui.mount

  // The old place is on screen; the prompts pane opens from the band and stays open.
  const oldRow = (await mount(drawn(OLD, 'the old place', { first: 0, last: 3, of: 4 }) as never)) as { unmount: () => Promise<void> }
  const band = (await mount(BAND as never)) as Ui & { unmount: () => Promise<void> }
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  panes.push({ id: 'bm-pane' }) // the engine now reports the pane as open
  await settle()
  // The person goes on typing: the band stops waiting for a number, the pane stays open
  // (live: "prompt edited while the band waited for a key: band ended, pane kept").
  await ($ as unknown as Engine).prompt.submit({ text: 'going on reading' })
  await settle()

  // Much later the person has scrolled on: the new place is on screen, the old one is not.
  w.clock.advance(30 * 60_000)
  await oldRow.unmount()
  await mount({ ...drawn(OLD, 'the old place', null), requestId: OLD } as never)
  await mount(drawn(NOW, 'the new place', { first: 0, last: 5, of: 6 }) as never)

  // They select words in the new place (the poll stamps it), then press <leader><space>.
  selection = { requestId: NOW, text: 'new place' }
  w.clock.advance(1_000)
  await settle()
  await band.unmount()
  const band2 = (await mount(BAND as never)) as Ui
  await band2.input({ key: 'band-cmd-1', text: ' ' }).catch(() => undefined)
  await settle()

  const log = w.file(LOG) ?? ''
  expect(log.includes('reading position set')).toBe(true)
  expect(log.includes('view restored after highlight')).toBe(false)
  expect(w.toasts().some(t => t.startsWith('reading position set'))).toBe(true)
})
