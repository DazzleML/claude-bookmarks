// POC (not a product test): a bm: reference in a reply drawn as a pressable link.
// Copied into each arm's plugin/tests/ by run.py. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const U = 'eeeeeeee-0000-4000-8000-000000000001'
const reply = (text: string) => ({ plugin: 'bookmarks', surface: 'terminal', component: 'AssistantMessage', requestId: U, props: { text, onScreen: { first: 0, last: 4, of: 5 } } })

type Found = { type: string; text?: string; props: Record<string, unknown> }
type Ui = { findAll: (q: object) => Promise<Found[]> }
type Engine = { session: { start: (i: object) => Promise<unknown> }; ui: { mount: (t: never) => Promise<unknown> } }
const settle = () => new Promise(r => setTimeout(r, 300))

async function drawn($: unknown, on: unknown, text: string): Promise<string[]> {
  world(on, { session: SID })
  const e = $ as Engine
  await e.session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  const ui = (await e.ui.mount(reply(text) as never)) as Ui
  const mds = await ui.findAll({ type: 'Markdown' })
  return mds.flatMap(m => (m.props.pressableLinks as readonly string[] | undefined) ?? [])
}

const ROW = '/sessions/11111111-2222-4333-8444-555555555555/eeeeeeee.md?u=eeeeeeee'

test('POC P1: a [label](bm:...) link in a reply is drawn pressable, as its file: anchor', async ($, on) => {
  const pressable = await drawn($, on, 'First.\n\nSee [that place](bm:11111111/eeeeeeee) for more.\n\nLast.')
  expect(pressable.some(h => h.startsWith('file:///') && h.includes(ROW))).toBe(true)
})

test('POC P2: a bare bm: token in a reply is drawn pressable', async ($, on) => {
  const pressable = await drawn($, on, 'First.\n\nSee bm:11111111/eeeeeeee for more.\n\nLast.')
  expect(pressable.some(h => h.includes(ROW))).toBe(true)
})

test('POC P3: a reply with no reference gets no pressable link from the plugin', async ($, on) => {
  const pressable = await drawn($, on, 'First.\n\nSee the docs for more.\n\nLast.')
  expect(pressable.length).toBe(0)
})

test('POC P4: a malformed reference, and one naming another session, stay text', async ($, on) => {
  const pressable = await drawn($, on, 'First.\n\nSee bm:zz/123 and bm:22222222/eeeeeeee for more.\n\nLast.')
  expect(pressable.length).toBe(0)
})
