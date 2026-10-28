// A bm: reference in a reply is drawn as a pressable link to the place it names (the bm:
// short-reference design, unit 4; graduated from tests/one-offs/thinking/poc-bm-reply-expansion).
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const UUID = 'cccccccc-0000-4000-8000-000000000001'
const U = 'eeeeeeee-0000-4000-8000-000000000001'
const PATH = `C:/test-home/claude/bookmarks/sessions/${SID}.json`
const reply = (text: string) => ({ plugin: 'bookmarks', surface: 'terminal', component: 'AssistantMessage', requestId: U, props: { text, onScreen: { first: 0, last: 4, of: 5 } } })

type Found = { type: string; props: Record<string, unknown> }
type Ui = { findAll: (q: object) => Promise<Found[]> }
type Engine = { session: { start: (i: object) => Promise<unknown> }; ui: { mount: (t: never) => Promise<unknown> } }
const settle = () => new Promise(r => setTimeout(r, 300))

function seeded(): Record<string, string> {
  const r = addOrRelabel(emptyRegister(SID, 'test', 1), { uuid: UUID, owner: 'claude', label: 'the place', head: 'the message', by: 'claude', source: 'tool' }, 2)
  return { [PATH]: serializeRegister(r.register) }
}

async function pressable($: unknown, on: unknown, text: string): Promise<string[]> {
  world(on, { session: SID, files: seeded() })
  const e = $ as Engine
  await e.session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  const ui = (await e.ui.mount(reply(text) as never)) as Ui
  return (await ui.findAll({ type: 'Markdown' })).flatMap(m => (m.props.pressableLinks as readonly string[] | undefined) ?? [])
}

const LOOKUP = `bm:${SID.slice(0, 8)}.1~${UUID.slice(0, 8)}`
const ANCHOR = `/sessions/${SID}/cccccccc.md?u=${UUID}`

test('a [label](bm:...) link to a bookmark is drawn pressable, as its file: anchor', async ($, on) => {
  const links = await pressable($, on, `First.\n\nSee [that place](${LOOKUP}) for more.\n\nLast.`)
  expect(links.some(h => h.startsWith('file:///') && h.includes(ANCHOR))).toBe(true)
})

test('a bare bm: reference in a reply is drawn pressable', async ($, on) => {
  const links = await pressable($, on, `First.\n\nSee ${LOOKUP}, then the rest.\n\nLast.`)
  expect(links.some(h => h.includes(ANCHOR))).toBe(true)
})

test('a reply with no reference gets no pressable link from the plugin', async ($, on) => {
  expect((await pressable($, on, 'First.\n\nSee the docs for more.\n\nLast.')).length).toBe(0)
})

test('a wrong check, an unknown conversation, a malformed reference and one inside code all stay text', async ($, on) => {
  const text = `First.\n\nA bm:${SID.slice(0, 8)}.1~dddddddd, bm:99999999/12345678, bm:zz/123 and \`${LOOKUP}\`.\n\nLast.`
  expect((await pressable($, on, text)).length).toBe(0)
})
