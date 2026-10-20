import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOOKMARK_TOOL, answer, brief, describe, listActedOn, listName, parseMeta, parseToolInput, tierFor } from '../../plugin/hooks/core/bookmarks/bookmark-tool.ts'

test('the tool stays in front with every action and both lists in its schema', () => {
  assert.equal(BOOKMARK_TOOL.name, 'bookmark')
  assert.equal(BOOKMARK_TOOL.isDeferred, false)
  assert.deepEqual(BOOKMARK_TOOL.inputSchema.properties.action.enum, ['add', 'relabel', 'remove', 'share', 'claim', 'list'])
  assert.deepEqual(BOOKMARK_TOOL.inputSchema.properties.owner.enum, ['claude', 'user'])
  assert.deepEqual(BOOKMARK_TOOL.inputSchema.properties.tier.enum, ['perma', 'bookmark'])
})

test('a bare call reads as an add on Claude\'s list with nothing asked', () => {
  assert.deepEqual(parseToolInput({}), { query: '', uuid: '', label: undefined, action: 'add', tierAsked: undefined, owner: 'claude', why: undefined, words: undefined, temporary: false, tags: undefined, x: undefined })
})

test('the one meta parameter: tags trimmed and kept as strings, x as an object of namespaces, anything else ignored', () => {
  assert.deepEqual(parseMeta(undefined), {})
  assert.deepEqual(parseMeta('tags'), {})
  assert.deepEqual(parseMeta({ tags: [' design/records ', '', 3, 'kept'], x: { claude: { why: 'twice' }, 'agent:oracle': { seen: 1 }, bad: 'not an object', worse: [1] }, other: true }), {
    tags: ['design/records', 'kept'],
    x: { claude: { why: 'twice' }, 'agent:oracle': { seen: 1 } },
  })
  assert.deepEqual(parseMeta({ tags: [], x: {} }), {}, 'empty lists and objects are nothing')
  const p = parseToolInput({ meta: { tags: ['a'] } })
  assert.deepEqual(p.tags, ['a'])
  assert.equal(p.x, undefined)
  // The description carries the why rule, in those words.
  assert.ok(BOOKMARK_TOOL.description.includes('label: what the place says; why: what it decides or why it matters'))
  assert.ok('meta' in BOOKMARK_TOOL.inputSchema.properties)
})

test('fields are trimmed and typed; unknown actions, tiers and owners fall to the defaults', () => {
  const p = parseToolInput({ query: '  the words ', uuid: ' abcd1234 ', label: '  a label ', why: ' because ', words: '  ', temporary: 'yes', tier: 'gold', owner: 'robot', action: 'explode' })
  assert.deepEqual(p, { query: 'the words', uuid: 'abcd1234', label: 'a label', action: 'add', tierAsked: undefined, owner: 'claude', why: 'because', words: undefined, temporary: false, tags: undefined, x: undefined })
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
  const r = { n: 7, uuid: 'aaaaaaaa-0000-4000-8000-000000000001', sessionId: 's1', label: 'L', line: 3, bytes: [10, 20], by: 'claude', words: 'w', tags: ['t/u'] } as never
  const d = describe(r, 'C:/u/claude')
  assert.equal(d.n, 7, 'every answer carries the record\'s number')
  assert.equal(Object.keys(d)[0], 'n')
  assert.equal(d.owner, 'claude')
  assert.equal(d.tier, 'bookmark')
  assert.deepEqual(d.tags, ['t/u'])
  assert.equal(typeof d.anchor, 'string')
  assert.equal(describe(r, undefined).anchor, undefined)
  // A listing links only a record whose file exists: `linked` false leaves the link out and keeps the number.
  const unlinked = describe(r, 'C:/u/claude', false)
  assert.equal(unlinked.anchor, undefined)
  assert.equal(unlinked.markdown, undefined)
  assert.equal(unlinked.n, 7)
  const b = brief({ uuid: 'u', role: 'user', line: 7, byteStart: 1, byteEnd: 9, text: 'first line\nsecond', timestamp: 't' } as never)
  assert.deepEqual(b, { uuid: 'u', role: 'user', line: 7, bytes: [1, 9], head: 'first line second', timestamp: 't' })
})
