// The `bookmark` tool's tiers and claim (#21), as Claude calls it. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, serializeRegister } from '../hooks/core/register-file.ts'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const UUID = 'cccccccc-0000-4000-8000-000000000001'
const PATH = `C:/test-home/claude/bookmarks/sessions/${SID}.json`

function seeded(): Record<string, string> {
  const r = addOrRelabel(
    emptyRegister(SID, 'test', 1),
    { uuid: UUID, owner: 'claude', label: 'where the palette began', head: 'the message', by: 'claude', source: 'tool', tier: 'perma' },
    2,
  )
  return { [PATH]: serializeRegister(r.register) }
}

async function call($: { tool: { call: (i: never) => Promise<unknown> } }, input: Record<string, unknown>) {
  const out = (await $.tool.call({ tool: 'mcp__bookmarks__bookmark', tool_use_id: 'toolu_test', ...input } as never)) as { result?: string }
  return JSON.parse(String(out.result ?? '{}')) as Record<string, unknown>
}

test('list shows each record\'s tier', async ($, on) => {
  world(on, { session: SID, files: seeded() })
  const out = await call($ as never, { action: 'list' })
  expect((out.claudes as { tier: string }[])[0]?.tier).toBe('perma')
})

test('c in the bookmarks list claims the chosen record', async ($, on) => {
  const w = world(on, { session: SID, files: seeded() })
  type Ui = { input: (t: object) => Promise<unknown>; press: (t: object) => Promise<unknown> }
  const band = (await $.ui.mount({ plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' } as never)) as unknown as Ui
  await band.input({ key: 'band-cmd-0', text: 'b' }).catch(() => undefined)
  await band.press({ key: 'band-num-1' }).catch(() => undefined)
  await band.press({ key: 'band-num-c' })
  expect(w.file(PATH)).toContain('"owner": "user"')
  expect(w.toasts()).toContain('#1 is yours now')
})

test('claim moves Claude\'s record to the person\'s list, same id and tier', async ($, on) => {
  const w = world(on, { session: SID, files: seeded() })
  const out = await call($ as never, { action: 'claim', uuid: UUID.slice(0, 8) })
  expect(out.ok).toBe(true)
  const claimed = out.claimed as { owner: string; uuid: string; tier: string }
  expect(claimed.owner).toBe('user')
  expect(claimed.uuid).toBe(UUID)
  expect(claimed.tier).toBe('perma')
  expect(w.file(PATH)).toContain('"owner": "user"')
})
