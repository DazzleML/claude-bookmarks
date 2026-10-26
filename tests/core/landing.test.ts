// node --test tests/core/landing.test.ts
// Where a jump to a place lands (the 0.7 groundwork design, 2026-10-25, unit 5): a message is
// landed on itself; any other row lands on the message it belongs to until the capability
// table says the build can scroll to rows of its kind (`jump.toolRow`, `jump.agentRow`); an
// agent's row lands where the agent was started; nothing to land on means the export.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { landingFor, STOCK_ROUTES } from '../../plugin/hooks/core/places/landing.ts'
import { addPlace, newPlaceIndex } from '../../plugin/hooks/core/places/reader.ts'
import type { Place } from '../../plugin/hooks/core/places/place.ts'
import { capabilityOf, choose } from '../../plugin/hooks/engine/select.ts'

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

test('the capability rows exist, stock takes their workaround, and the stock routes match it', () => {
  for (const gap of ['jump.toolRow', 'jump.agentRow'] as const) {
    const cap = capabilityOf(gap)
    assert.ok(cap.workaround)
    assert.equal(choose(cap, { version: '2.1.310' }).path, 'workaround')
  }
  assert.deepEqual(STOCK_ROUTES, { toolRow: false, agentRow: false })
})
