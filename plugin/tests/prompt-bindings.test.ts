// A short reference typed in a prompt is bound for Claude as context, the text left as typed (the
// bm: short-reference design, unit 5a). Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const UUID = 'cccccccc-0000-4000-8000-000000000001'
const PATH = `C:/test-home/claude/bookmarks/sessions/${SID}.json`
type Engine = { session: { start: (i: object) => Promise<unknown> }; prompt: { submit: (i: object) => Promise<unknown> } }
const settle = () => new Promise(r => setTimeout(r, 300))

function seeded(): Record<string, string> {
  const r = addOrRelabel(emptyRegister(SID, 'test', 1), { uuid: UUID, owner: 'claude', label: 'the place', head: 'the message', by: 'claude', source: 'tool' }, 2)
  return { [PATH]: serializeRegister(r.register) }
}

async function submitted($: unknown, on: unknown, text: string): Promise<{ text?: string; context?: string[] }> {
  world(on, { session: SID, files: seeded() })
  let seen: { text?: string; context?: string[] } = {}
  ;(on as (...a: unknown[]) => void)('prompt.submit', {}, async (_h: unknown, e: { text?: string; context?: string[] }) => { seen = e; return e })
  const e = $ as Engine
  await e.session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  await e.prompt.submit({ text })
  await settle()
  return seen
}

const LOOKUP = `bm:${SID.slice(0, 8)}.1~${UUID.slice(0, 8)}`

test('a lookup typed in a prompt is bound to its exact place as context, and the text is unchanged', async ($, on) => {
  const text = `what did ${LOOKUP} decide?`
  const e = await submitted($, on, text)
  expect(e.text).toBe(text)
  const ctx = (e.context ?? []).join('\n')
  expect(ctx).toContain(`bm-binding v1: ${LOOKUP} = bm:${SID.slice(0, 8)}/${UUID.slice(0, 8)} (#1)`)
})

test('an unresolvable reference is bound as unresolved; a prompt with none gets no context', async ($, on) => {
  const e = await submitted($, on, 'see bm:99999999/12345678 please')
  expect((e.context ?? []).join('\n')).toContain('bm-binding v1: bm:99999999/12345678 = unresolved (not-on-this-machine)')
})

test('a prompt with no reference gets no binding', async ($, on) => {
  const e = await submitted($, on, 'nothing to bind here')
  expect((e.context ?? []).some(c => c.includes('bm-binding'))).toBe(false)
})
