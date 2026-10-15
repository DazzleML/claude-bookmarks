import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOOKMARK_TOOL, answer, brief, describe, listActedOn, listName, parseToolInput, tierFor } from '../../plugin/hooks/core/bookmarks/bookmark-tool.ts'

test('the tool stays in front with every action and both lists in its schema', () => {
  assert.equal(BOOKMARK_TOOL.name, 'bookmark')
  assert.equal(BOOKMARK_TOOL.isDeferred, false)
  assert.deepEqual(BOOKMARK_TOOL.inputSchema.properties.action.enum, ['add', 'relabel', 'remove', 'share', 'claim', 'list'])
  assert.deepEqual(BOOKMARK_TOOL.inputSchema.properties.owner.enum, ['claude', 'user'])
  assert.deepEqual(BOOKMARK_TOOL.inputSchema.properties.tier.enum, ['perma', 'bookmark'])
})

test('a bare call reads as an add on Claude\'s list with nothing asked', () => {
  assert.deepEqual(parseToolInput({}), { query: '', uuid: '', label: undefined, action: 'add', tierAsked: undefined, owner: 'claude', why: undefined, words: undefined, temporary: false })
})

test('fields are trimmed and typed; unknown actions, tiers and owners fall to the defaults', () => {
  const p = parseToolInput({ query: '  the words ', uuid: ' abcd1234 ', label: '  a label ', why: ' because ', words: '  ', temporary: 'yes', tier: 'gold', owner: 'robot', action: 'explode' })
  assert.deepEqual(p, { query: 'the words', uuid: 'abcd1234', label: 'a label', action: 'add', tierAsked: undefined, owner: 'claude', why: 'because', words: undefined, temporary: false })
  const q = parseToolInput({ label: '   ', action: 'claim', tier: 'bookmark', owner: 'user', temporary: true, words: ' hi ' })
  assert.equal(q.label, undefined)
  assert.equal(q.action, 'claim')
  assert.equal(q.tierAsked, 'bookmark')
  assert.equal(q.owner, 'user')
  assert.equal(q.temporary, true)
  assert.equal(q.words, 'hi')
})

test('the tier: as asked, else perma for Claude and bookmark for the person', () => {
  assert.equal(tierFor(undefined, 'claude'), 'perma')
  assert.equal(tierFor(undefined, 'user'), 'bookmark')
  assert.equal(tierFor('bookmark', 'claude'), 'bookmark')
  assert.equal(tierFor('perma', 'user'), 'perma')
})

test('a claim acts on Claude\'s list whatever owner says; the others on owner\'s', () => {
  assert.equal(listActedOn('claim', 'user'), 'claude')
  assert.equal(listActedOn('remove', 'user'), 'user')
  assert.equal(listActedOn('share', 'claude'), 'claude')
  assert.equal(listName('user'), "the person's")
  assert.equal(listName('claude'), "Claude's")
})

test('answers are strings; a record and a row are described with their link and head', () => {
  assert.deepEqual(answer({ ok: true }), { result: '{\n  "ok": true\n}' })
  const r = { uuid: 'aaaaaaaa-0000-4000-8000-000000000001', sessionId: 's1', label: 'L', line: 3, bytes: [10, 20], by: 'claude', words: 'w' } as never
  const d = describe(r, 'C:/u/claude')
  assert.equal(d.owner, 'claude')
  assert.equal(d.tier, 'bookmark')
  assert.equal(typeof d.anchor, 'string')
  assert.equal(describe(r, undefined).anchor, undefined)
  const b = brief({ uuid: 'u', role: 'user', line: 7, byteStart: 1, byteEnd: 9, text: 'first line\nsecond', timestamp: 't' } as never)
  assert.deepEqual(b, { uuid: 'u', role: 'user', line: 7, bytes: [1, 9], head: 'first line second', timestamp: 't' })
})
