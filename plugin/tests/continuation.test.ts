// A conversation continued under a new session id (U83 unit 3): every address that names one of
// its earlier ids still leads to the place here, since the messages came along with their ids --
// a bookmark link in the copied history, an exact `bm:` reference, a lookup through the earlier
// id's bookmark file. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { DATA_ROOT, world } from './harness.ts'

const SID = '432b5fd1-2af8-4008-8baf-c8e33f495795'
const OLD = 'fe8a1041-3a7a-4754-8741-443af6e189f7'
const U = 'cccccccc-0000-4000-8000-0000000000aa'
const TRANSCRIPT = `C:/test-home/.claude/projects/C--test-project/${SID}.jsonl`
// The copied row: born in the earlier session, held by this one.
const ROW = JSON.stringify({ type: 'assistant', uuid: U, sessionId: SID, session_id: OLD, message: { role: 'assistant', content: 'the decision we made' }, timestamp: '2026-10-28T00:00:00.000Z' })
const REPLY_ID = 'eeeeeeee-0000-4000-8000-0000000000bb'
const reply = (text: string) => ({ plugin: 'bookmarks', surface: 'terminal', component: 'AssistantMessage', requestId: REPLY_ID, props: { text, onScreen: { first: 0, last: 4, of: 5 } } })
// The grep answers for the row by its whole id or by its 8-character prefix (an exact reference
// carries only the prefix); a miss would fall into the place reader's wait, which the kit never ends.
const grepFinds = (argv: readonly string[]) => (argv.some(a => a.includes(U.slice(0, 8))) ? { exitCode: 0, stdout: `1:0:${ROW}\n` } : { exitCode: 1, stdout: '' })

type Found = { type: string; key?: string; props: Record<string, unknown> }
type Ui = { press: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]> }
type Engine = { session: { start: (i: object) => Promise<unknown> }; ui: { mount: (t: never) => Promise<unknown> } }
const settle = () => new Promise(r => setTimeout(r, 300))

async function drawn($: unknown, text: string): Promise<{ ui: Ui; links: string[] }> {
  const e = $ as Engine
  await e.session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  const ui = (await e.ui.mount(reply(text) as never)) as Ui
  const links = (await ui.findAll({ type: 'Markdown' })).flatMap(m => (m.props.pressableLinks as readonly string[] | undefined) ?? [])
  return { ui, links }
}

test('a bookmark link in the copied history, naming the earlier id, still jumps here', async ($, on) => {
  world(on, { session: SID, files: { [TRANSCRIPT]: `${ROW}\n` }, process: grepFinds })
  const anchor = `file:///C:/test-home/claude/bookmarks/sessions/${OLD}/cccccccc.md?u=${U}&v=1`
  const { ui, links } = await drawn($, `First.\n\nAs we decided [then](${anchor}), go on.\n\nLast.`)
  expect(links).toContain(anchor)
  // The jump is the plugin's own $.ui.scroll, which the kit never routes: reaching it is the evidence.
  const md = (await ui.findAll({ type: 'Markdown' })).find(m => ((m.props.pressableLinks as string[] | undefined) ?? []).includes(anchor))
  const pressed = await ui.press({ key: md!.key, link: { href: anchor } } as never).then(() => 'no scroll', err => String(err))
  expect(pressed).toContain('no implementation for ui.scroll')
})

test('an exact bm: reference naming the earlier id is drawn as a link to the place here', async ($, on) => {
  world(on, { session: SID, files: { [TRANSCRIPT]: `${ROW}\n` }, process: grepFinds })
  const { links } = await drawn($, `First.\n\nSee bm:${OLD.slice(0, 8)}/${U.slice(0, 8)} for it.\n\nLast.`)
  expect(links.some(h => h.includes(`/sessions/${SID}/cccccccc.md?u=${U}`))).toBe(true)
})

test("a bm: lookup through the earlier id's bookmark file is drawn as a link to the place here", async ($, on) => {
  const r = addOrRelabel(emptyRegister(OLD, 'test', 1), { uuid: U, owner: 'claude', label: 'the decision', head: 'h', by: 'claude', source: 'tool' }, 2)
  world(on, {
    session: SID,
    files: { [TRANSCRIPT]: `${ROW}\n`, [`${DATA_ROOT}/sessions/${OLD}.json`]: serializeRegister(r.register), [`C:/test-home/.claude/projects/C--test-project/${OLD}.jsonl`]: '{}\n' },
    process: grepFinds,
  })
  const { links } = await drawn($, `First.\n\nSee bm:${OLD.slice(0, 8)}.1~${U.slice(0, 8)} for it.\n\nLast.`)
  expect(links.some(h => h.includes(`/sessions/${SID}/cccccccc.md?u=${U}`))).toBe(true)
})
