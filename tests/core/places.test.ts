// node --test tests/core/places.test.ts
// The place model (the 0.7 groundwork design, 2026-10-25, unit 2): one address and one kind
// for every row of a conversation, in every file, with the attributes a search scope reads.
// The fixtures are the shapes measured in a real transcript and its agent files
// (tests/one-offs/thinking/sample_row_shapes.py, probe_place_classifier.ts: 143,604 lines over
// 103 files reconciled, no `other`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agentFile, categoryOf, classifyRecord, samePlace, type Classified, type Place, type RowContext } from '../../plugin/hooks/core/places/place.ts'

const MAIN: RowContext = { session: 's-1' }
const AGENT: RowContext = { session: 's-1', file: agentFile('a00eb2f6'), agent: { id: 'a00eb2f6', type: 'oracle' } }
const placesOf = (c: Classified): Place[] => { assert.ok('places' in c, `expected places, got ${JSON.stringify(c)}`); return c.places }
const only = (c: Classified): Place => { const p = placesOf(c); assert.equal(p.length, 1); return p[0]! }
const user = (content: unknown, over: Record<string, unknown> = {}) => ({ type: 'user', uuid: 'u-1', timestamp: '2026-10-25T10:00:00Z', message: { role: 'user', content }, ...over })
const assistant = (content: unknown[], over: Record<string, unknown> = {}) => ({ type: 'assistant', uuid: 'a-1', message: { role: 'assistant', content }, ...over })

test('a prompt the person typed is a prompt, by the person, in the main transcript', () => {
  const p = only(classifyRecord(user('Hey Claude, look at the band', { origin: { kind: 'human' } }), MAIN))
  assert.equal(p.kind, 'prompt')
  assert.equal(p.author, 'person')
  assert.deepEqual(p.at, { session: 's-1', uuid: 'u-1' }, 'the main transcript carries no file and no part')
  assert.equal(p.timestamp, '2026-10-25T10:00:00Z')
})

test("Claude's text, thinking and tool calls are places of their own kinds; an empty thinking block is not", () => {
  assert.equal(only(classifyRecord(assistant([{ type: 'text', text: 'Here is the plan' }]), MAIN)).kind, 'reply')
  assert.equal(only(classifyRecord(assistant([{ type: 'thinking', thinking: 'weigh both' }]), MAIN)).kind, 'thinking')
  assert.deepEqual(classifyRecord(assistant([{ type: 'thinking', thinking: '', signature: 'x' }]), MAIN), { skipped: 'assistant:empty' })
  const call = only(classifyRecord(assistant([{ type: 'tool_use', id: 'toolu_01', name: 'Bash', input: { command: 'ls' } }]), MAIN))
  assert.equal(call.kind, 'tool-call')
  assert.equal(call.tool, 'Bash')
  assert.equal(call.category, 'shell')
  assert.equal(call.toolUseId, 'toolu_01')
  assert.equal(call.text, '{"command":"ls"}', 'a call is searchable by its input')
})

test('a record with several blocks yields one place per block, told apart by part', () => {
  const ps = placesOf(classifyRecord(assistant([{ type: 'thinking', thinking: 'first' }, { type: 'tool_use', id: 'toolu_02', name: 'Read', input: {} }]), MAIN))
  assert.deepEqual(ps.map(p => [p.kind, p.at.part]), [['thinking', 0], ['tool-call', 1]])
  assert.equal(samePlace(ps[0]!.at, ps[1]!.at), false)
})

test('a tool result is a place that names the call it answers, and says when the call failed', () => {
  const ok = only(classifyRecord(user([{ type: 'tool_result', tool_use_id: 'toolu_01', content: 'a.ts\nb.ts', is_error: false }]), MAIN))
  assert.equal(ok.kind, 'tool-result')
  assert.equal(ok.author, 'tool')
  assert.equal(ok.toolUseId, 'toolu_01')
  assert.equal(ok.text, 'a.ts\nb.ts')
  assert.equal(ok.failed, undefined)
  const bad = only(classifyRecord(user([{ type: 'tool_result', tool_use_id: 'toolu_03', content: [{ type: 'text', text: 'exit 1' }], is_error: true }]), MAIN))
  assert.equal(bad.failed, true)
  assert.equal(bad.text, 'exit 1')
})

test('a tool result too large for the transcript names the file that holds it whole', () => {
  const p = only(classifyRecord(user([{ type: 'tool_result', tool_use_id: 'toolu_5', content: '<persisted-output>\nOutput too large (39.9KB). Full output saved to: C:\\x\\y\\tool-results\\b0hs7p25m.txt' }], {
    toolUseResult: { persistedOutputPath: 'C:\\x\\y\\tool-results\\b0hs7p25m.txt', persistedOutputSize: 40873 },
  }), MAIN))
  assert.equal(p.stored, 'b0hs7p25m.txt')
  assert.equal(only(classifyRecord(user([{ type: 'tool_result', tool_use_id: 'toolu_6', content: 'short' }]), MAIN)).stored, undefined)
  // The record's field is enough on its own: the text need not repeat the path.
  const fieldOnly = only(classifyRecord(user([{ type: 'tool_result', tool_use_id: 'toolu_8', content: 'Preview (first 2KB): ...' }], {
    toolUseResult: { persistedOutputPath: 'C:/x/tool-results/bk2.txt' },
  }), MAIN))
  assert.equal(fieldOnly.stored, 'bk2.txt')
  // The older form names the file only in the text.
  const older = only(classifyRecord(user([{ type: 'tool_result', tool_use_id: 'toolu_7', content: 'Output too large (53.2KB). Full output saved to: C:\\a\\b\\tool-results\\toolu_01QEK.txt\n\nPreview (first 2KB):' }]), MAIN))
  assert.equal(older.stored, 'toolu_01QEK.txt')
})

test("another session's message and an agent's report are places, not prompts, with who sent them", () => {
  const cross = only(classifyRecord(user('Another Claude session sent a message:\n<cross-session-message from="uds:x">hi', { isMeta: true, origin: { kind: 'peer', from: 'uds:x', name: 'CCBookmarksTest' } }), MAIN))
  assert.equal(cross.kind, 'agent-message')
  assert.equal(cross.author, 'session')
  assert.equal(cross.from, 'CCBookmarksTest')
  const report = only(classifyRecord(user('Another Claude session sent a message:\n<agent-message from="a54b">done', { isMeta: true, origin: { kind: 'peer', from: 'a54b', name: 'help', handback: true } }), MAIN))
  assert.equal(report.kind, 'agent-report')
  assert.equal(report.author, 'agent')
  assert.deepEqual(report.agent, { id: 'a54b' })
})

test('notices and events are places; bookkeeping is skipped with its reason', () => {
  assert.equal(only(classifyRecord(user('<task-notification>\n<task-id>b0</task-id>'), MAIN)).kind, 'notice')
  const compact = only(classifyRecord({ type: 'system', subtype: 'compact_boundary', uuid: 'y-1', content: 'Conversation compacted' }, MAIN))
  assert.deepEqual([compact.kind, compact.event, compact.author], ['event', 'compact_boundary', 'engine'])
  const edited = only(classifyRecord({ type: 'attachment', uuid: 'y-2', attachment: { type: 'edited_text_file', filename: 'C:/x/a.ts' } }, MAIN))
  assert.deepEqual([edited.event, edited.text], ['edited_text_file', 'C:/x/a.ts'])
  const shell = only(classifyRecord(user('<bash-stdout>ok</bash-stdout><bash-stderr></bash-stderr>'), MAIN))
  assert.deepEqual([shell.kind, shell.event], ['event', 'shell-output'])
  assert.deepEqual(classifyRecord({ type: 'attachment', uuid: 'y-3', attachment: { type: 'hook_success' } }, MAIN), { skipped: 'attachment:hook_success' })
  assert.deepEqual(classifyRecord({ type: 'system', subtype: 'informational', uuid: 'y-4' }, MAIN), { skipped: 'system:informational' })
  assert.deepEqual(classifyRecord({ type: 'api-request-blob', hash: 'h', message: { content: [{ type: 'text', text: 'a copy' }] } }, MAIN), { skipped: 'type:api-request-blob' }, 'a request copy is never read as a message')
  assert.deepEqual(classifyRecord(user('<system-reminder>skill body</system-reminder>', { isMeta: true }), MAIN), { skipped: 'user:meta' })
})

test("in an agent's file every place carries the file and the agent; its opening row is Claude's dispatch", () => {
  const dispatch = only(classifyRecord(user('You are a mutation generator', { isSidechain: true, agentId: 'a00eb2f6' }), AGENT))
  assert.deepEqual([dispatch.kind, dispatch.author], ['prompt', 'claude'])
  assert.deepEqual(dispatch.at, { session: 's-1', uuid: 'u-1', file: 'agent:a00eb2f6' })
  assert.deepEqual(dispatch.agent, { id: 'a00eb2f6', type: 'oracle' })
  const reply = only(classifyRecord(assistant([{ type: 'text', text: 'four callers' }], { isSidechain: true }), AGENT))
  assert.deepEqual([reply.kind, reply.author, reply.agent?.type], ['reply', 'agent', 'oracle'])
  assert.deepEqual(classifyRecord(user('<system-reminder>handback</system-reminder>', { isSidechain: true, isMeta: true }), AGENT), { skipped: 'user:meta' })
})

test('a message block of a kind this module does not know is a place of kind other, never dropped', () => {
  const p = only(classifyRecord(assistant([{ type: 'server_tool_result', text: 'something new' }]), MAIN))
  assert.equal(p.kind, 'other')
})

test('every record is classified or skipped with a reason: the parts sum to the whole', () => {
  const records = [
    user('a prompt', { origin: { kind: 'human' } }),
    assistant([{ type: 'text', text: 'a reply' }]),
    assistant([{ type: 'thinking', thinking: '' }]),
    user([{ type: 'tool_result', tool_use_id: 't', content: 'x' }]),
    { type: 'attachment', uuid: 'b', attachment: { type: 'total_tokens_reminder' } },
    { type: 'last-prompt', sessionId: 's-1' },
    { type: 'system', subtype: 'turn_duration', uuid: 'c', durationMs: 5 },
  ]
  let placed = 0, skipped = 0
  for (const r of records) ('skipped' in classifyRecord(r, MAIN)) ? skipped++ : placed++
  assert.equal(placed + skipped, records.length)
  assert.deepEqual([placed, skipped], [4, 3])
})

test('tool categories: known names, MCP tools, and anything else as other', () => {
  assert.equal(categoryOf('Edit'), 'files')
  assert.equal(categoryOf('Grep'), 'search')
  assert.equal(categoryOf('Agent'), 'agents')
  assert.equal(categoryOf('mcp__bookmarks__bookmark'), 'mcp')
  assert.equal(categoryOf('SomeToolShippedTomorrow'), 'other')
})

// From the unit 2 mutation sweep (tests/mutation/v0.7.0__sweep__unit2-places.md): each test
// below kills a mutant the first eleven let through.
test('a record with one tool result carries no part, so a link minted from it stays the plain address', () => {
  const p = only(classifyRecord(user([{ type: 'tool_result', tool_use_id: 'toolu_09', content: 'ok' }]), MAIN))
  assert.deepEqual(p.at, { session: 's-1', uuid: 'u-1' })
})

test('a goal set or checked is an event carrying its condition', () => {
  const goal = only(classifyRecord({ type: 'attachment', uuid: 'g-1', attachment: { type: 'goal_status', met: false, condition: 'ship the band field' } }, MAIN))
  assert.deepEqual([goal.kind, goal.event, goal.text], ['event', 'goal_status', 'ship the band field'])
})

test('a user row with nothing but whitespace is skipped as empty, in the main file and in an agent file', () => {
  assert.deepEqual(classifyRecord(user('   \n  '), MAIN), { skipped: 'user:empty' })
  assert.deepEqual(classifyRecord(user('  ', { isSidechain: true }), AGENT), { skipped: 'user:empty' })
})

test('two addresses with no part both mean the first block, and match', () => {
  assert.equal(samePlace({ session: 's', uuid: 'u' }, { session: 's', uuid: 'u' }), true)
})

test('two addresses are the same place only with the same file and part; an absent file is the main transcript', () => {
  assert.equal(samePlace({ session: 's', uuid: 'u' }, { session: 's', uuid: 'u', part: 0 }), true)
  assert.equal(samePlace({ session: 's', uuid: 'u' }, { session: 's', uuid: 'u', file: 'agent:a' }), false, 'a fork can put one uuid in two files')
  assert.equal(samePlace({ session: 's', uuid: 'u', part: 0 }, { session: 's', uuid: 'u', part: 1 }), false)
})
