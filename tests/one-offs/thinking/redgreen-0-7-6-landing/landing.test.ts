// node --test tests/core/landing.test.ts
// Where a jump to a place lands (the 0.7 groundwork design, 2026-10-25, unit 5): a message is
// landed on itself; any other row lands on the message it belongs to until the capability
// table says the build can scroll to rows of its kind (`jump.toolRow`, `jump.agentRow`); an
// agent's row lands where the agent was started; nothing to land on means the export.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { landingFor, STOCK_ROUTES } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/places/landing.ts'
import { addPlace, newPlaceIndex } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/places/reader.ts'
import type { Place } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/places/place.ts'
import { capabilityOf, choose } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/engine/select.ts'
import { messageOf } from './resolve.ts'
import { jumpToRecord } from './bookmarks.ts'
import type { BookmarksPorts } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/engine/ports.ts'

const oracle = { id: 'a1', type: 'oracle', call: 'toolu_agent' }
function rows() {
  const idx = newPlaceIndex('s')
  const places: Place[] = [
    { at: { session: 's', uuid: 'p1' }, kind: 'prompt', author: 'person', text: 'find the loader' },
    { at: { session: 's', uuid: 'r1' }, kind: 'reply', author: 'claude', text: "I'll ask the oracle" },
    { at: { session: 's', uuid: 'c1' }, kind: 'tool-call', author: 'claude', tool: 'Agent', toolUseId: 'toolu_agent', text: '{}' },
    { at: { session: 's', uuid: 'o1' }, kind: 'tool-result', author: 'tool', toolUseId: 'toolu_agent', stored: 'big9.txt', text: '<persisted-output>\nOutput too large (39.9KB). Full output saved to: C:\\long\\path\\tool-results\\big9.txt' },
    { at: { session: 's', uuid: 'k1' }, kind: 'thinking', author: 'claude', text: 'weighing it' },
    { at: { session: 's', uuid: 'd1', file: 'agent:a1' }, kind: 'prompt', author: 'claude', agent: oracle, text: 'trace the loader' },
    { at: { session: 's', uuid: 'e1', file: 'agent:a1' }, kind: 'reply', author: 'agent', agent: oracle, text: 'loader.ts:51' },
    { at: { session: 's', uuid: 'big9.txt', file: 'tool-result:big9.txt' }, kind: 'tool-result', author: 'tool', text: 'the whole output' },
    { at: { session: 's', uuid: 'x1', file: 'agent:zz' }, kind: 'reply', author: 'agent', agent: { id: 'zz' }, text: 'an agent nothing started' },
  ]
  for (const p of places) addPlace(idx, p)
  return idx.rows
}
const at = (r: ReturnType<typeof rows>, uuid: string) => r.findIndex(x => x.at.uuid === uuid)

test('a prompt or a reply is landed on itself', () => {
  const r = rows()
  assert.deepEqual(landingFor(r, at(r, 'p1')), { on: 'row', uuid: 'p1' })
  assert.deepEqual(landingFor(r, at(r, 'r1')), { on: 'row', uuid: 'r1' })
})

test("a reply that is the second block of its record (thinking, then text) is still landed on itself", () => {
  const idx = newPlaceIndex('s')
  addPlace(idx, { at: { session: 's', uuid: 'p0' }, kind: 'prompt', author: 'person', text: 'go' })
  addPlace(idx, { at: { session: 's', uuid: 'm2', part: 0 }, kind: 'thinking', author: 'claude', text: 'weigh it' })
  addPlace(idx, { at: { session: 's', uuid: 'm2', part: 1 }, kind: 'reply', author: 'claude', text: 'here is the answer' })
  assert.deepEqual(landingFor(idx.rows, 2), { on: 'row', uuid: 'm2' })
})

test("on stock, a tool call, its output or a thinking block lands on the turn's last message before it, and says what the row was", () => {
  const r = rows()
  assert.deepEqual(landingFor(r, at(r, 'c1')), { on: 'message', uuid: 'r1', why: 'the Agent call, in this turn' })
  assert.equal(landingFor(r, at(r, 'o1')).on, 'message')
  assert.equal((landingFor(r, at(r, 'k1')) as { uuid: string }).uuid, 'r1')
})

test('a build that can scroll to tool rows lands on the row itself', () => {
  const r = rows()
  assert.deepEqual(landingFor(r, at(r, 'c1'), { toolRow: true, agentRow: false }), { on: 'row', uuid: 'c1' })
})

test("an agent's row lands on the message that started the agent, through the Agent call its meta names", () => {
  const r = rows()
  assert.deepEqual(landingFor(r, at(r, 'e1')), { on: 'message', uuid: 'r1', why: "inside the oracle agent's conversation, started here" })
  assert.deepEqual(landingFor(r, at(r, 'e1'), { toolRow: false, agentRow: true }), { on: 'row', uuid: 'e1' })
})

test("an agent with no call found lands on its report when there is one, else outside", () => {
  const r = rows()
  assert.deepEqual(landingFor(r, at(r, 'x1')), { on: 'outside', why: "inside an agent's conversation, which has no message here to land on" })
  // Another agent's report first, then this agent's: the jump takes this agent's own report
  // (found by the unit 5 mutation sweep, M7).
  const withReport = [...r,
    { ...r[0]!, at: { session: 's', uuid: 'other-rep' }, kind: 'agent-report' as const, author: 'agent' as const, agent: { id: 'yy' } },
    { ...r[0]!, at: { session: 's', uuid: 'rep' }, kind: 'agent-report' as const, author: 'agent' as const, agent: { id: 'zz' } },
  ]
  assert.deepEqual(landingFor(withReport, at(withReport, 'x1')), { on: 'row', uuid: 'rep' })
})

test('a stored tool output lands where the tool result that refers to it would', () => {
  const r = rows()
  assert.deepEqual(landingFor(r, at(r, 'big9.txt')), { on: 'message', uuid: 'r1', why: 'a stored tool output: the output of a tool call, in this turn' })
  // One an agent's tool result refers to lands where the agent was started.
  const agentOut = [...r,
    { ...r[at(r, 'e1')]!, at: { session: 's', uuid: 'ar', file: 'agent:a1' }, kind: 'tool-result' as const, author: 'tool' as const, stored: 'ag7.txt', head: 'saved' },
    { ...r[at(r, 'big9.txt')]!, at: { session: 's', uuid: 'ag7.txt', file: 'tool-result:ag7.txt' } },
  ]
  assert.deepEqual(landingFor(agentOut, at(agentOut, 'ag7.txt')), { on: 'message', uuid: 'r1', why: "a stored tool output: inside the oracle agent's conversation, started here" })
})

test('a row before any message, or no row at all, lands outside', () => {
  const idx = newPlaceIndex('s')
  addPlace(idx, { at: { session: 's', uuid: 'n1' }, kind: 'event', author: 'engine', text: 'an event first' })
  assert.deepEqual(landingFor(idx.rows, 0), { on: 'outside', why: 'an event before the first message' })
  assert.equal(landingFor(idx.rows, 5).on, 'outside')
})

// --- The landing fallback (0.7.6): a record's drawn id refused, then its uuid, then its message ---
// Claude Code draws a Bash call under its tool_use id but had nothing drawn under an
// AskUserQuestion call's ("nothing drawn under that requestId", 2026-10-26).

test('messageOf: a record found by uuid, by tool_use id, or by an agent address lands on its message', () => {
  const r = rows()
  assert.deepEqual(messageOf(r, { uuid: 'c1' }), { uuid: 'r1', why: 'the Agent call, in this turn' })
  assert.equal(messageOf(r, { uuid: 'toolu_agent' })?.uuid, 'r1')
  assert.equal(messageOf(r, { uuid: 'e1', file: 'agent:a1', part: 0 })?.uuid, 'r1')
  assert.deepEqual(messageOf(r, { uuid: 'p1' }), { uuid: 'p1' })
  assert.equal(messageOf(r, { uuid: 'nowhere' }), undefined)
})

type Call = { uuid: string; quiet: boolean }
function fakePorts(drawnUnder: string[], msg?: { uuid: string; why?: string }) {
  const calls: Call[] = []
  const toasts: string[] = []
  const ports = {
    log: () => {},
    toast: (t: string) => void toasts.push(t),
    messageOf: () => msg,
    jumpTo: async (uuid: string, _via: string, _label: string, _words?: string, quiet?: boolean) => {
      calls.push({ uuid, quiet: !!quiet })
      if (drawnUnder.includes(uuid)) return undefined
      if (!quiet) toasts.push(`refused ${uuid}`)
      return 'nothing drawn under that requestId'
    },
  } as unknown as BookmarksPorts
  return { ports, calls, toasts }
}

test('jumpToRecord: the drawn id first, quietly, and no toast when it lands', async () => {
  const f = fakePorts(['toolu_bash'])
  assert.deepEqual(await jumpToRecord(f.ports, { uuid: 'u', drawn: 'toolu_bash' }, 'test', 'l'), { landedOn: 'toolu_bash' })
  assert.deepEqual(f.calls, [{ uuid: 'toolu_bash', quiet: true }])
  assert.deepEqual(f.toasts, [])
})

test('jumpToRecord: nothing drawn under the drawn id -> the record uuid, with one toast', async () => {
  const f = fakePorts(['u'])
  assert.deepEqual(await jumpToRecord(f.ports, { uuid: 'u', drawn: 'toolu_ask' }, 'test', 'l'), { landedOn: 'u' })
  assert.deepEqual(f.calls.map(c => c.uuid), ['toolu_ask', 'u'])
  assert.equal(f.toasts.length, 1)
  assert.match(f.toasts[0]!, /no row of its own/)
})

test('jumpToRecord: neither id drawn -> the message it belongs to, with one toast that says what it was', async () => {
  const f = fakePorts(['r1'], { uuid: 'r1', why: 'the AskUserQuestion call, in this turn' })
  assert.deepEqual(await jumpToRecord(f.ports, { uuid: 'u', drawn: 'toolu_ask' }, 'test', 'l'), { landedOn: 'r1' })
  assert.deepEqual(f.calls, [{ uuid: 'toolu_ask', quiet: true }, { uuid: 'u', quiet: true }, { uuid: 'r1', quiet: false }])
  assert.equal(f.toasts.length, 1)
  assert.match(f.toasts[0]!, /AskUserQuestion call.*message it belongs to/)
})

test('jumpToRecord: nothing drawn anywhere and no index -> the refusal, reported once', async () => {
  const f = fakePorts([])
  assert.match((await jumpToRecord(f.ports, { uuid: 'u', drawn: 'toolu_ask' }, 'test', 'l')).deny ?? '', /nothing drawn/)
  assert.deepEqual(f.toasts, ['refused u'])
})

test("jumpToRecord: an agent's row skips its own uuid (not in the main transcript) for its message", async () => {
  const f = fakePorts(['r1'], { uuid: 'r1' })
  assert.deepEqual(await jumpToRecord(f.ports, { uuid: 'e1', drawn: 'toolu_agent', file: 'agent:a1', part: 0 }, 'test', 'l'), { landedOn: 'r1' })
  assert.deepEqual(f.calls.map(c => c.uuid), ['toolu_agent', 'r1'])
})

test('jumpToRecord: a prompt or a reply jumps by its uuid alone, as before', async () => {
  const f = fakePorts(['p1'])
  assert.deepEqual(await jumpToRecord(f.ports, { uuid: 'p1' }, 'test', 'l'), { landedOn: 'p1' })
  assert.deepEqual(f.calls, [{ uuid: 'p1', quiet: false }])
})

test('the capability rows exist, stock takes their workaround, and the stock routes match it', () => {
  for (const gap of ['jump.toolRow', 'jump.agentRow'] as const) {
    const cap = capabilityOf(gap)
    assert.ok(cap.workaround)
    assert.equal(choose(cap, { version: '2.1.310' }).path, 'workaround')
  }
  assert.deepEqual(STOCK_ROUTES, { toolRow: false, agentRow: false })
})
