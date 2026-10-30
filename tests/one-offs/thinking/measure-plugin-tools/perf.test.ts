// The cost of a call to the plugin's own tools through the engine's tool.call hooks, measured in the
// kit on a scratch copy of plugin/ (copied into <copy>/tests/ to run). Each tool is called N times
// with an action that reads and answers without writing: bookmark `list`, lists `lists`.
// Warm-up calls first, so the first-call setup is reported apart from the steady rate.
// Run: claude plugin test <copy>   (never on the live plugin/: it hot-reloads)
import { expect, test } from 'claude-code/testing'
import { world } from './harness.ts'

const SID = '11111111-2222-4333-8444-777777777777'
const N = 200

type Caller = { tool: { call: (i: never) => Promise<unknown> } }
const call = ($: Caller, tool: string, input: Record<string, unknown>, id: string) =>
  $.tool.call({ tool, tool_use_id: id, ...input } as never)

async function timed($: Caller, tool: string, input: Record<string, unknown>) {
  const t0 = performance.now()
  const first = await call($, tool, input, 'toolu_warm')
  const firstMs = performance.now() - t0
  for (let i = 0; i < 5; i++) await call($, tool, input, `toolu_w${i}`)
  const t1 = performance.now()
  for (let i = 0; i < N; i++) await call($, tool, input, `toolu_${i}`)
  const perCall = (performance.now() - t1) / N
  return { first, firstMs, perCall }
}

test('timing: bookmark list and lists lists, N calls each', async ($, on) => {
  world(on, { session: SID })
  const b = await timed($ as never, 'mcp__bookmarks__bookmark', { action: 'list' })
  const l = await timed($ as never, 'mcp__bookmarks__lists', { action: 'lists' })
  // Known answer: each tool reached its own handler, so the timing is of real calls, not refusals:
  // bookmark `list` answers with a tombstone count; lists `lists` answers yours/claudes without one.
  expect(JSON.stringify(b.first)).toContain('tombstones')
  expect(JSON.stringify(l.first)).toContain('yours')
  expect(JSON.stringify(l.first)).not.toContain('tombstones')
  console.log(`PERF bookmark first=${b.firstMs.toFixed(2)}ms per-call=${b.perCall.toFixed(3)}ms | lists first=${l.firstMs.toFixed(2)}ms per-call=${l.perCall.toFixed(3)}ms (N=${N})`)
})
