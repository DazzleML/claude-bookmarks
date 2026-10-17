// node --test tests/core/spans.test.ts
// The read-state file's shape (unit 8 of the record-format goal): keyed through the prompt
// store's filter, per owner, axes by name, a capped history; the file round-trips with its
// unknown keys. No UI reads it yet (#34 is 0.6.x).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AXIS_HISTORY_CAP, clearAxis, emptyReadState, isReadStateKey, parseReadState, readStatePath, serializeReadState, setAxis, standingOf, STATE_VERSION,
} from '../../plugin/hooks/core/bookmarks/read-state.ts'

const SESSION = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const T0 = 1_760_000_000_000
const U = 'aaaaaaaa-0000-4000-8000-000000000001'

test('a key is a user row whose content is text that the prompts pane would list: never a tool_result, a command record or a notice', () => {
  assert.ok(isReadStateKey({ type: 'user', uuid: U, message: { role: 'user', content: 'what does the cache do?' } }))
  assert.ok(isReadStateKey({ type: 'user', uuid: U, message: { role: 'user', content: [{ type: 'text', text: 'a block of text' }] } }))
  assert.ok(!isReadStateKey({ type: 'user', uuid: U, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } }), 'a tool result is a user row too, and is not a key')
  assert.ok(!isReadStateKey({ type: 'user', uuid: U, message: { role: 'user', content: '<command-message>bm-env</command-message>' } }))
  assert.ok(!isReadStateKey({ type: 'user', uuid: U, message: { role: 'user', content: '[SYSTEM NOTIFICATION - NOT USER INPUT]\nx' } }))
  assert.ok(!isReadStateKey({ type: 'assistant', uuid: U, message: { role: 'assistant', content: 'a reply' } }), 'a reply is not a prompt')
  assert.ok(!isReadStateKey(null))
})

test('axes are set by name per owner and prompt; a repeat changes nothing; two axes hold at once', () => {
  const s0 = emptyReadState(SESSION, 'bookmarks 0.5.8', T0)
  const a = setAxis(s0, U, 'user', 'attention', 'read', T0 + 1)
  assert.equal(a.changed, true)
  assert.deepEqual(standingOf(a.state, U, 'user')?.axes, { attention: 'read' })
  assert.equal(a.state.rev, 1)
  const again = setAxis(a.state, U, 'user', 'attention', 'read', T0 + 2)
  assert.equal(again.changed, false)
  assert.equal(again.state.rev, 1, 'a repeat is not a change')
  const b = setAxis(a.state, U, 'user', 'processing', 'wip', T0 + 3)
  assert.deepEqual(standingOf(b.state, U, 'user')?.axes, { attention: 'read', processing: 'wip' }, '"read" and "WIP" at once: two axes, not one ladder')
  const c = setAxis(b.state, U, 'claude', 'attention', 'unread', T0 + 4)
  assert.deepEqual(standingOf(c.state, U, 'claude')?.axes, { attention: 'unread' }, 'per owner')
  assert.deepEqual(standingOf(c.state, U, 'user')?.axes, { attention: 'read', processing: 'wip' })
  assert.equal(standingOf(c.state, 'bbbbbbbb-0000-4000-8000-000000000002', 'user'), undefined)
})

test('the history keeps past values, newest first, capped; clearing an axis keeps its history', () => {
  let s = emptyReadState(SESSION, 'w', T0)
  const values = ['new', 'unread', 'read', 'unread', 'read']
  values.forEach((v, i) => { s = setAxis(s, U, 'user', 'attention', v, T0 + i).state })
  assert.deepEqual(standingOf(s, U, 'user')?.history.attention.map(h => h.value), ['read', 'unread', 'read', 'unread', 'new'])
  for (let i = 0; i < AXIS_HISTORY_CAP + 3; i++) s = setAxis(s, U, 'user', 'processing', `step${i}`, T0 + 100 + i).state
  assert.equal(standingOf(s, U, 'user')?.history.processing.length, AXIS_HISTORY_CAP)
  assert.equal(standingOf(s, U, 'user')?.history.processing[0]?.value, `step${AXIS_HISTORY_CAP + 2}`)
  const cleared = clearAxis(s, U, 'user', 'attention', T0 + 500)
  assert.equal(cleared.changed, true)
  assert.equal(standingOf(cleared.state, U, 'user')?.axes.attention, undefined)
  assert.equal(standingOf(cleared.state, U, 'user')?.axes.processing, `step${AXIS_HISTORY_CAP + 2}`)
  assert.equal(standingOf(cleared.state, U, 'user')?.history.attention.length, 5, 'the history stays')
  assert.equal(clearAxis(cleared.state, U, 'user', 'attention', T0 + 501).changed, false)
})

test('the file round-trips in a fixed key order with unknown keys kept, and sits beside the register', () => {
  const s = setAxis(emptyReadState(SESSION, 'w', T0), U, 'user', 'attention', 'read', T0 + 1).state
  const text = serializeReadState(s)
  assert.deepEqual(Object.keys(JSON.parse(text)), ['version', 'sessionId', 'rev', 'updatedAt', 'writer', 'entries'])
  assert.equal(JSON.parse(text).version, STATE_VERSION)
  assert.deepEqual(parseReadState(text), s)
  const o = JSON.parse(text)
  o.lens = { ladder: 'default' }
  o.entries[U].user.note = 'kept too'
  const back = parseReadState(JSON.stringify(o))!
  assert.deepEqual((back as Record<string, unknown>).lens, { ladder: 'default' })
  assert.equal((back.entries[U]?.user as Record<string, unknown>)?.note, 'kept too')
  assert.ok(serializeReadState(back).endsWith('"lens": {\n    "ladder": "default"\n  }\n}\n'), 'the unknown key after the known ones')
  assert.equal(parseReadState('not json'), undefined)
  assert.equal(parseReadState('{"entries": []}'), undefined)
  // A minimal file reads with the defaults a fresh state has: version current, rev 0, writer unknown (mutation sweep v0.5.8, M8 and M9).
  const minimal = parseReadState(JSON.stringify({ sessionId: SESSION, entries: {} }))!
  assert.equal(minimal.version, STATE_VERSION)
  assert.equal(minimal.rev, 0)
  assert.equal(minimal.writer, '?')
  assert.equal(minimal.updatedAt, 0)
  assert.equal(readStatePath('C:\\Users\\x\\claude\\', SESSION), `C:/Users/x/claude/bookmarks/sessions/${SESSION}.state.json`)
})
