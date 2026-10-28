// node --test tests/core/ref.test.ts
// One reference to a place, from any spelling (core/bookmarks/ref.ts; the links-in-files design,
// 2026-10-27, step B1): every `file:` link the plugin has written still reads, the list marker's
// parameters are read and written, and the `bm:` grammar parses and formats both ways.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkMatches, exactRef, formatBm, formatFile, lookupRef, parseRef, shortestUniquePrefix } from '../../plugin/hooks/core/bookmarks/ref.ts'

const SID = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const UUID = 'e92204f6-1a2b-4c3d-8e9f-0123456789ab'
const ROOT = 'C:/Users/x/claude'
const BASE = `file:///C:/Users/x/claude/bookmarks/sessions/${SID}`

test('every file: spelling the plugin has written reads: v1, no v, the older # form', () => {
  assert.deepEqual(parseRef(`${BASE}/e92204f6.md?u=${UUID}&l=12&b=100-200&q=the%20words&v=1`), {
    spelling: 'file', session: SID, uuid: UUID, words: 'the words', line: 12, bytes: [100, 200], version: 1,
  })
  assert.deepEqual(parseRef(`${BASE}/e92204f6.md?u=${UUID}`), { spelling: 'file', session: SID, uuid: UUID })
  assert.deepEqual(parseRef(`${BASE}/e92204f6.md#u=${UUID}&q=old`), { spelling: 'file', session: SID, uuid: UUID, words: 'old', legacyFragment: true })
  assert.deepEqual(parseRef(`${BASE}/e92204f6.p0.md?u=${UUID}&p=0&v=1`), { spelling: 'file', session: SID, uuid: UUID, part: 0, version: 1 })
})

test('a file: link carrying list and id is a list marker; v=2', () => {
  const r = parseRef(`${BASE}/e92204f6.md?u=${UUID}&list=whats-left&id=wl-landing&v=2`)
  assert.deepEqual(r, { spelling: 'file', session: SID, uuid: UUID, list: 'whats-left', entry: 'wl-landing', version: 2 })
  assert.equal(parseRef(`${BASE}/e92204f6.md?u=${UUID}&list=whats-left`)?.list, undefined, 'a list without an id is not a marker')
})

test('the bm: grammar: a row, a block, a file, words, a marker; a record; a bare marker', () => {
  assert.deepEqual(parseRef('bm:8f0f9b27/e92204f6'), { spelling: 'bm', session: '8f0f9b27', uuid: 'e92204f6' })
  assert.deepEqual(parseRef('bm:8f0f9b27/e92204f6.p0?list=whats-left&id=wl-landing'), {
    spelling: 'bm', session: '8f0f9b27', uuid: 'e92204f6', part: 0, list: 'whats-left', entry: 'wl-landing',
  })
  assert.deepEqual(parseRef('bm:8f0f9b27/e92204f6@agent%3Aa1b2~w:the%20words'), {
    spelling: 'bm', session: '8f0f9b27', uuid: 'e92204f6', file: 'agent:a1b2', words: 'the words',
  })
  assert.deepEqual(parseRef('bm:8f0f9b27.113'), { spelling: 'bm', session: '8f0f9b27', record: 113 })
  assert.deepEqual(parseRef('bm:list/whats-left#wl-landing'), { spelling: 'bm', list: 'whats-left', entry: 'wl-landing' })
  assert.deepEqual(parseRef('<bm:8f0f9b27/e92204f6>'), { spelling: 'bm', session: '8f0f9b27', uuid: 'e92204f6' }, 'an autolink')
  assert.deepEqual(parseRef('bm:8f0f9b27/e92204f6~c:10-20'), { spelling: 'bm', session: '8f0f9b27', uuid: 'e92204f6' }, 'a range segment (~c:) is reserved and ignored until it is built')
})

// The bm: design's unit 1b (2026-10-27__14-00-02, the consultation's F3/F4/F7 and the gate's 8-hex check).
const R1 = '68b352d2-c1aa-4bbb-8ccc-000000000001'
const R2 = '68b352d2-c9ff-4ddd-8eee-000000000002'

test('the lookup carries an 8-hex check of its record, and reads with or without one', () => {
  assert.equal(lookupRef({ sessionId: SID, n: 122, uuid: R1 }), 'bm:8f0f9b27.122~68b352d2')
  assert.deepEqual(parseRef('bm:8f0f9b27.122~68b352d2'), { spelling: 'bm', session: '8f0f9b27', record: 122, check: '68b352d2' })
  assert.deepEqual(parseRef('bm:8f0f9b27.122~68B3'), { spelling: 'bm', session: '8f0f9b27', record: 122, check: '68b3' }, 'a typed check of any length, lower-cased')
  assert.deepEqual(parseRef('bm:8f0f9b27.122~w:the%20words~68b352d2'), { spelling: 'bm', session: '8f0f9b27', record: 122, check: '68b352d2', words: 'the words' })
  assert.equal(formatBm(parseRef('bm:8f0f9b27.122~68b352d2')!), 'bm:8f0f9b27.122~68b352d2', 'round trip')
})

test('the tilde rule: tagged segments, at most one bare hex check, and only on a lookup', () => {
  assert.equal(parseRef('bm:8f0f9b27.122~68b352d2~1234'), undefined, 'two bare segments')
  assert.equal(parseRef('bm:8f0f9b27.122~zz'), undefined, 'a bare segment that is not hex')
  assert.equal(parseRef('bm:8f0f9b27/e92204f6~68b352d2'), undefined, 'a check on the exact form, which names its row already')
  assert.equal(parseRef('bm:8f0f9b27/e92204f6~c10-20'), undefined, 'an untagged range')
  assert.deepEqual(parseRef('bm:8f0f9b27.122~x:later~68b352d2'), { spelling: 'bm', session: '8f0f9b27', record: 122, check: '68b352d2' }, 'an unknown tag is ignored, kept for later builds')
})

test('the check compares as a prefix of the record\'s uuid, and survives a drawn id swapped for the real one', () => {
  assert.equal(checkMatches('68b352d2', R1), true)
  assert.equal(checkMatches('68b3', R1), true)
  assert.equal(checkMatches('68b352d2c1', R1), true, 'a check past the dash compares without dashes')
  assert.equal(checkMatches('68b352d3', R1), false)
  assert.equal(checkMatches('68b352d2', '68b352d2-c1aa-4bbb-8ccc-000000000000'), true, 'a drawn id (fifth group zeros) shares the check')
})

test('prefixes lengthen only when another id shares them, as prefixes of the dashed id, never ending on a dash', () => {
  assert.equal(shortestUniquePrefix(R1, [R1, '12345678-0000-4000-8000-000000000000']), '68b352d2', 'unique at 8')
  assert.equal(shortestUniquePrefix(R1, [R1, R2]), '68b352d2-c1', 'shares 8 and 10 characters: the first unique prefix past the dash')
  assert.equal(shortestUniquePrefix('68b352d2-a000-4000-8000-000000000000', [R1]), '68b352d2-a', 'one more than the dash')
  assert.equal(shortestUniquePrefix(R1, ['68b352d2']), '68b352d2-c', 'an 8-character id among the others: never stop on the dash')
  const exact = exactRef({ sessionId: SID, uuid: R1, part: 0 }, { rowChars: shortestUniquePrefix(R1, [R1, R2]).length })
  assert.equal(exact, 'bm:8f0f9b27/68b352d2-c1.p0')
  assert.deepEqual(parseRef(exact), { spelling: 'bm', session: '8f0f9b27', uuid: '68b352d2-c1', part: 0 })
  assert.equal(lookupRef({ sessionId: SID, n: 3, uuid: R1 }, { sessionChars: 10 }), 'bm:8f0f9b27-3.3~68b352d2', 'a lengthened session prefix')
})

test('anything else is undefined, never a throw', () => {
  for (const bad of ['', 'https://example.com', 'bm:', 'bm:xyz/e92204f6', 'bm:8f0f9b27/short', 'bm:list/whats-left', 'bm:list/a b#c', 'file:///C:/x.md', `${BASE}/e92204f6.md?u=nothex`, `${BASE}/aaaaaaaa.md?u=${UUID}`, 'bm:8f0f9b27/e92204f6@%E0%A4%A']) {
    assert.doesNotThrow(() => parseRef(bad))
  }
  for (const bad of ['', 'https://example.com', 'bm:', 'bm:xyz/e92204f6', 'bm:8f0f9b27/short', 'bm:list/whats-left', 'file:///C:/x.md', `${BASE}/aaaaaaaa.md?u=${UUID}`]) {
    assert.equal(parseRef(bad), undefined, bad)
  }
})

test('formatBm writes the short spelling; parse(format(x)) is x', () => {
  const place = { spelling: 'file' as const, session: SID, uuid: UUID, part: 0, words: 'the landing fix', list: 'whats-left', entry: 'wl-landing' }
  const bm = formatBm(place)
  assert.equal(bm, 'bm:8f0f9b27/e92204f6.p0~w:the%20landing%20fix?list=whats-left&id=wl-landing')
  assert.deepEqual(parseRef(bm!), { spelling: 'bm', session: '8f0f9b27', uuid: 'e92204f6', part: 0, words: 'the landing fix', list: 'whats-left', entry: 'wl-landing' })
  assert.equal(formatBm({ ...place, list: undefined, entry: undefined, words: undefined }, { fullRow: true }), `bm:8f0f9b27/${UUID}.p0`)
  assert.equal(formatBm({ spelling: 'bm', session: '8f0f9b27', record: 113 }), 'bm:8f0f9b27.113')
  assert.equal(formatBm({ spelling: 'bm', list: 'whats-left', entry: 'wl-landing' }), 'bm:list/whats-left#wl-landing')
  assert.equal(formatBm({ spelling: 'bm', uuid: UUID }), undefined, 'a row needs its session')
})

test('formatFile writes the pressable spelling, a marker as v=2; it reads back the same', () => {
  const ref = { spelling: 'bm' as const, session: SID, uuid: UUID, words: 'the words', list: 'whats-left', entry: 'wl-landing' }
  const href = formatFile(ref, ROOT)
  assert.equal(href, `${BASE}/e92204f6.md?u=${UUID}&q=the%20words&list=whats-left&id=wl-landing&v=2`)
  assert.deepEqual(parseRef(href!), { ...ref, spelling: 'file', version: 2 })
  assert.equal(formatFile({ ...ref, list: undefined, entry: undefined }, ROOT), `${BASE}/e92204f6.md?u=${UUID}&q=the%20words&v=1`, 'no marker: today\'s v1 link')
  assert.equal(formatFile({ ...ref, session: '8f0f9b27' }, ROOT), undefined, 'a session prefix cannot make a path')
})

// The bm: design's unit 1a (consultation F1): a `~` in the words was left raw, so the parser's
// tilde split cut them short and a tie-break on words would have used the wrong words.
test('words and a file name with ~ ( ) ! * and quotes survive the bm: spelling whole', () => {
  for (const words of ['a~b', 'a)b (c)', "it's ~ *really*!", 'über Straße', '100% & #3 ? yes']) {
    const bm = formatBm({ spelling: 'bm', session: SID, uuid: UUID, words })!
    assert.doesNotMatch(bm.slice(3), /[~][^w]|[()!*'\s]/, bm)
    assert.equal(parseRef(bm)?.words, words, bm)
  }
  const file = 'agent:a(1)~x'
  const bm = formatBm({ spelling: 'bm', session: SID, uuid: UUID, file, words: 'w' })!
  assert.equal(parseRef(bm)?.file, file, bm)
  assert.equal(parseRef(bm)?.words, 'w', bm)
})
