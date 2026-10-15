// The after-action rule as the person meets it (#24): after a band action that leaves
// the band holding the keyboard, the first key the band does not know says "press Esc",
// once. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }

type Ui = { find: (q: object) => Promise<{ key?: string } | undefined>; input: (t: { key: string; text: string }) => Promise<unknown> }
// The band's field is redrawn under a new key after each command, so it starts empty.
async function type(band: Ui, text: string) {
  const field = await band.find({ type: 'Input' })
  await band.input({ key: String(field?.key), text }).catch(() => undefined)
}
const reminders = (toasts: string[]) => toasts.filter(t => t.startsWith('Press Esc to type in the input box'))

test('after o, the first stray key reminds the person to press Esc, once', async ($, on) => {
  const w = world(on, { session: SID })
  const band = (await $.ui.mount(BAND as never)) as unknown as Ui
  await type(band, 'o')
  await type(band, 'h')
  expect(reminders(w.toasts())).toHaveLength(1)
  await type(band, 'x')
  expect(reminders(w.toasts())).toHaveLength(1)
})

test('a stray key with no action before it gives the usual hint', async ($, on) => {
  const w = world(on, { session: SID })
  const band = (await $.ui.mount(BAND as never)) as unknown as Ui
  await type(band, 'h')
  expect(reminders(w.toasts())).toHaveLength(0)
  expect(w.toasts().length).toBeGreaterThan(0)
})

test('with the keyboard set to stay in the band, no reminder', { options: { afterActionFocus: 'band' } }, async ($, on) => {
  const w = world(on, { session: SID })
  const band = (await $.ui.mount(BAND as never)) as unknown as Ui
  await type(band, 'o')
  await type(band, 'h')
  expect(reminders(w.toasts())).toHaveLength(0)
  // Control: `h` did run, and gave the usual hint in place of the reminder.
  expect(w.toasts().some(t => t.startsWith('bm:'))).toBe(true)
})
