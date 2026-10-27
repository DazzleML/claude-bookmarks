// The bookmark tool's rows folded away (0.7.5; core/bookmarks/tool-fold.ts, views/tool-fold.tsx):
// a call's row draws its one-line summary instead of Claude Code's row, its result draws nothing
// until the call is opened, ctrl+o (isExpanded) draws everything as Claude Code does, and other
// tools' rows are untouched. The turn grouping is the core suite's; here a row of no known turn
// (made before this load) draws its own line.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { world } from './harness.ts'

const SID = '11111111-2222-4333-8444-888888888888'
type Found = { type: string; key?: string; text?: string; props: Record<string, unknown> }
type Ui = { press: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]> }
const mount = async ($: unknown, target: object) => (await ($ as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount(target as never)) as Ui

const answer = JSON.stringify({ ok: true, n: 95, markdown: '[x](file:///y)' }, null, 2)
const row = (props: Record<string, unknown>, requestId = 'toolu_01Fold') => ({
  plugin: 'bookmarks', surface: 'terminal', component: 'ToolUse', requestId,
  props: { tool: 'mcp__bookmarks__bookmark', tool_use_id: requestId, input: { query: 'q', label: '#22, its first line ends at {' }, isRunning: false, isErrored: false, isInterrupted: false, output: answer, ...props },
})
const result = (props: Record<string, unknown> = {}, requestId = 'toolu_01Fold') => ({
  plugin: 'bookmarks', surface: 'terminal', component: 'ToolResult', requestId,
  props: { tool: 'mcp__bookmarks__bookmark', tool_use_id: requestId, output: answer, isErrored: false, ...props },
})
const buttons = async (ui: Ui) => (await ui.findAll({ type: 'Button' })).map(b => `${b.key}:${b.text}`)

test("a bookmark call's row draws its one line, and its result draws nothing until the line is opened", async ($, on) => {
  world(on, { session: SID })
  const ui = await mount($, row({}))
  expect(await buttons(ui)).toEqual(['bmfold-call-toolu_01Fold:  ⚓ bookmark #95: #22, its first line ends at { ▸'])
  const res = await mount($, result())
  expect((await res.findAll({})).filter(e => e.type !== 'Box')).toEqual([])
  await ui.press({ key: 'bmfold-call-toolu_01Fold' }).catch(() => undefined)
  expect(await buttons(ui)).toEqual(['bmfold-call-toolu_01Fold:  ⚓ bookmark #95: #22, its first line ends at { ▾'])
})

test('under ctrl+o (isExpanded) the row is Claude Code\'s own, with no fold line', async ($, on) => {
  world(on, { session: SID })
  const ui = await mount($, row({ isExpanded: true }, 'toolu_01Open'))
  expect(await buttons(ui)).toEqual([])
})

test("another tool's row is untouched", async ($, on) => {
  world(on, { session: SID })
  const ui = await mount($, { ...row({}, 'toolu_01Bash'), props: { ...row({}, 'toolu_01Bash').props, tool: 'Bash' } })
  expect(await buttons(ui)).toEqual([])
})
