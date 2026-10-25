// Slice B (2026-10-21): a marked line of a reply that carries a link is drawn as Markdown inside
// the band's Box, the words tagged in the bold «a» form, the link intact; a marked line with no
// link is drawn as Text, as before. The highlight is reached the way a person reaches it: the
// reply is drawn, words on it are selected, and <leader> Space sets the reading position there
// (reading.test.ts's path); the redraw then carries the highlight. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const U = 'eeeeeeee-0000-4000-8000-000000000001'
const LINKED = 'First paragraph.\n\nSee [the docs](https://example.com/docs) for the rest of it.\n\nLast line.'
const PLAIN = 'First paragraph.\n\nSee the docs for the rest of it.\n\nLast line.'
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const reply = (text: string) => ({ plugin: 'bookmarks', surface: 'terminal', component: 'AssistantMessage', requestId: U, props: { text, onScreen: { first: 0, last: 4, of: 5 } } })

type Found = { type: string; text?: string; props: Record<string, unknown> }
type Ui = { findAll: (q: object) => Promise<Found[]>; unmount: () => Promise<void> }
type Engine = { session: { start: (i: object) => Promise<unknown> }; ui: { mount: (t: never) => Promise<unknown> } }
const settle = () => new Promise(r => setTimeout(r, 300))

/** The reply drawn, `words` on it selected, the reading position set there; the reply drawn again, now highlighted. */
async function highlighted($: unknown, on: unknown, text: string, words: string) {
  let selection: { requestId: string; text: string } | undefined
  const w = world(on, { session: SID, selection: () => selection })
  const e = $ as Engine
  await e.session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  const first = (await e.ui.mount(reply(text) as never)) as Ui
  const band = (await e.ui.mount(BAND as never)) as Ui & { input: (t: object) => Promise<unknown> }
  selection = { requestId: U, text: words }
  w.clock.advance(1_000)
  await settle()
  await band.input({ key: 'band-cmd-0', text: ' ' }).catch(() => undefined)
  await settle()
  await first.unmount()
  const ui = (await e.ui.mount(reply(text) as never)) as Ui
  return { w, ui }
}

test('a marked line that carries a link is drawn as Markdown in the band: the words tagged, the link intact', async ($, on) => {
  const { w, ui } = await highlighted($, on, LINKED, 'for the rest')
  expect(w.toasts().some(t => t.startsWith('reading position set'))).toBe(true)
  const mds = (await ui.findAll({ type: 'Markdown' })).map(m => String(m.props.text))
  expect(mds.some(t => t.includes('[the docs](https://example.com/docs)') && t.includes('**«`» for the rest**'))).toBe(true)
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.backgroundColor !== undefined)).toBe(true)
  expect((await ui.findAll({ type: 'Text' })).some(t => (t.text ?? '').includes('«`»'))).toBe(false)
})

test("words that are a link's own text: the link wins, tagged inside its label", async ($, on) => {
  const { ui } = await highlighted($, on, LINKED, 'the docs')
  const mds = (await ui.findAll({ type: 'Markdown' })).map(m => String(m.props.text))
  expect(mds.some(t => t.includes('[**«`» the docs**](https://example.com/docs)'))).toBe(true)
})

// A reply carrying one of the plugin's own bookmark links takes the anchored path: the marked
// line's Markdown keeps that link pressable (a click jumps) and its label's kind marker.
const ANCHOR = `file:///C:/test-home/claude/bookmarks/sessions/${SID}/eeeeeeee.md?u=eeeeeeee`
const ANCHORED = `First paragraph.\n\nSee [that place](${ANCHOR}) for the rest of it.\n\nLast line.`

test("a marked line on an anchored reply keeps the bookmark link pressable, with the label's marker", async ($, on) => {
  const { ui } = await highlighted($, on, ANCHORED, 'for the rest')
  const line = (await ui.findAll({ type: 'Markdown' })).find(m => String(m.props.text).includes('**«`» for the rest**'))
  expect(line !== undefined).toBe(true)
  expect(((line?.props.pressableLinks as readonly string[] | undefined) ?? []).includes(ANCHOR)).toBe(true)
  expect(/⚓|\[bm\]/.test(String(line?.props.text))).toBe(true)
})

test('a marked line with no link is still drawn as Text', async ($, on) => {
  const { w, ui } = await highlighted($, on, PLAIN, 'for the rest')
  expect(w.toasts().some(t => t.startsWith('reading position set'))).toBe(true)
  expect((await ui.findAll({ type: 'Markdown' })).some(m => String(m.props.text).includes('«`»'))).toBe(false)
  expect((await ui.findAll({ type: 'Text' })).some(t => (t.text ?? '').includes('for the rest'))).toBe(true)
})
