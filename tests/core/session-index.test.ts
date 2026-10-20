// node --test tests/core/session-index.test.ts
// The index of every conversation with bookmarks (unit 10 of the record-format goal):
// an entry per register, the upsert that keeps it newest first and drops an emptied one,
// the round trip with unknown keys, and INDEX.md as a map that links only notes that exist.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addOrRelabel, emptyRegister, type Mint, type Register } from '../../plugin/hooks/core/bookmarks/register-file.ts'
import { applyOp } from '../../plugin/hooks/core/bookmarks/register-ops.ts'
import {
  buildIndex, emptyIndex, entryOf, INDEX_VERSION, parseIndex, renderIndexMarkdown, serializeIndex, upsert, type SessionIndex,
} from '../../plugin/hooks/core/bookmarks/session-index.ts'

const A = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const B = '11111111-2222-4333-8444-555555555555'
const T0 = 1_760_000_000_000
const U1 = '12d637fb-6d1d-4c3f-bbb6-11c107d8af4e'
const U2 = 'aaaaaaaa-0000-4000-8000-000000000002'
const U3 = 'bbbbbbbb-0000-4000-8000-000000000003'
const mint = (uuid: string, label: string, extra: Partial<Mint> = {}): Mint => ({ uuid, owner: 'user', label, head: label, by: 'user', source: 'promote', ...extra })

/** A register with two bookmarks, one of Claude's permas and a letter's mark. */
function regA(): Register {
  let reg: Register = { ...emptyRegister(A, 'w', T0), title: 'the record [format]', project: 'claude-bookmarks' }
  reg = addOrRelabel(reg, mint(U1, 'first'), T0 + 1).register
  reg = addOrRelabel(reg, mint(U2, 'second', { owner: 'claude', by: 'claude', source: 'tool', tier: 'perma' }), T0 + 2).register
  reg = addOrRelabel(reg, mint(U3, '#third'), T0 + 3).register
  const m = applyOp(reg, { op: 'setMark', owner: 'user', letter: 'a', place: { uuid: U1, head: 'first' }, at: T0 + 4 }, T0 + 4)
  if ('error' in m) throw new Error(m.error)
  return m.register
}

test('an entry carries the header and every bookmark in number order, a mark left out, the note flag from the folder', () => {
  const e = entryOf(regA(), new Set(['12d637fb', 'bbbbbbbb']))
  assert.equal(e.sessionId, A)
  assert.equal(e.title, 'the record [format]')
  assert.equal(e.project, 'claude-bookmarks')
  assert.equal(e.records.length, 3, 'the mark is not a bookmark')
  assert.deepEqual(e.records.map(r => [r.n, r.label, r.owner, r.tier, r.note]), [
    [1, 'first', 'user', 'bookmark', true],
    [2, 'second', 'claude', 'perma', false],
    [3, '#third', 'user', 'bookmark', true],
  ])
  assert.equal(e.rev, regA().rev)
  assert.equal(e.updatedAt, T0 + 4)
  // Unnumbered (v1-shaped) records sort after the numbered ones, by createdAt (two of them, so the tie-break is exercised: mutation sweep v0.5.10, M3).
  const v1 = entryOf({ ...regA(), perma: [
    { sessionId: A, uuid: U2, owner: 'user', label: 'old', head: 'old', createdAt: T0, by: 'user', source: 'promote' },
    { sessionId: A, uuid: U3, owner: 'claude', label: 'older', head: 'older', createdAt: T0 - 5, by: 'claude', source: 'tool' },
    ...regA().perma,
  ] }, new Set())
  assert.deepEqual(v1.records.map(r => r.label), ['first', 'second', '#third', 'older', 'old'])
})

test('upsert replaces the conversation\'s entry, keeps newest first, drops a conversation with no bookmark left, and stamps the write', () => {
  const idx0 = emptyIndex('bookmarks 0.5.10', T0)
  const a = entryOf(regA(), new Set())
  const b = entryOf(addOrRelabel({ ...emptyRegister(B, 'w', T0), title: 'later' }, mint(U1, 'b1'), T0 + 10).register, new Set())
  let idx = upsert(idx0, a, 'bookmarks 0.5.10', T0 + 5)
  idx = upsert(idx, b, 'bookmarks 0.5.10', T0 + 11)
  assert.deepEqual(idx.sessions.map(s => s.sessionId), [B, A], 'newest first')
  assert.equal(idx.generatedAt, T0 + 11)
  assert.equal(idx.writer, 'bookmarks 0.5.10')
  // A's entry replaced, not duplicated; its newer updatedAt puts it first.
  idx = upsert(idx, { ...a, updatedAt: T0 + 20, rev: 9 }, 'w', T0 + 21)
  assert.deepEqual(idx.sessions.map(s => [s.sessionId, s.rev]), [[A, 9], [B, b.rev]])
  // Emptied (every bookmark removed): gone from the index.
  idx = upsert(idx, { ...a, records: [] }, 'w', T0 + 22)
  assert.deepEqual(idx.sessions.map(s => s.sessionId), [B])
  // Equal updatedAt: the id decides, so two builds agree.
  const same = buildIndex([{ ...b, updatedAt: T0 }, { ...a, updatedAt: T0 }, { ...a, sessionId: 'zzzz', records: [] }], 'w', T0)
  assert.deepEqual(same.sessions.map(s => s.sessionId), [B, A])
  assert.equal(same.version, INDEX_VERSION)
})

test('the file round-trips in a fixed key order with unknown keys kept at both levels; a non-index reads as undefined', () => {
  const idx = upsert(emptyIndex('w', T0), entryOf(regA(), new Set(['12d637fb'])), 'w', T0 + 1)
  const text = serializeIndex(idx)
  assert.deepEqual(Object.keys(JSON.parse(text)), ['version', 'generatedAt', 'writer', 'sessions'])
  assert.deepEqual(Object.keys(JSON.parse(text).sessions[0]), ['sessionId', 'title', 'project', 'rev', 'updatedAt', 'records'])
  assert.deepEqual(parseIndex(text), idx)
  const o = JSON.parse(text)
  o.lens = 'future'
  o.sessions[0].archived = false
  const back = parseIndex(JSON.stringify(o))!
  assert.equal((back as Record<string, unknown>).lens, 'future')
  assert.equal((back.sessions[0] as Record<string, unknown>).archived, false)
  const again = serializeIndex(back)
  assert.ok(again.endsWith('"lens": "future"\n}\n'), 'the unknown key after the known ones')
  assert.ok(again.includes('"archived": false'))
  assert.equal(parseIndex('not json'), undefined)
  assert.equal(parseIndex('{"version": 1}'), undefined)
  // Defaults for a minimal file.
  const minimal = parseIndex('{"sessions": [{"sessionId": "x", "records": []}]}')!
  assert.equal(minimal.version, INDEX_VERSION)
  assert.equal(minimal.writer, '?')
  assert.equal(minimal.sessions[0]!.rev, 0)
})

test('INDEX.md is a map: a heading per conversation (title else the id\'s start), a line per bookmark, a link only where the note exists, brackets escaped', () => {
  const a = entryOf(regA(), new Set(['12d637fb']))
  const b = entryOf(addOrRelabel(emptyRegister(B, 'w', T0), mint(U1, 'b1'), T0 + 10).register, new Set(['12d637fb']))
  const idx: SessionIndex = buildIndex([a, b], 'bookmarks 0.5.10', T0 + 11)
  const md = renderIndexMarkdown(idx)
  assert.ok(md.startsWith('---\nkind: bookmarks-index\nversion: 1\n'), md.slice(0, 80))
  assert.ok(md.includes('\nconversations: 2\n'))
  assert.ok(md.includes('\n# Bookmarks\n'))
  assert.ok(md.includes('\n## 11111111\n'), 'no title: the id\'s first eight characters')
  assert.ok(md.includes('\n## the record \\[format\\] -- claude-bookmarks\n'))
  assert.ok(md.indexOf('## 11111111') < md.indexOf('## the record'), 'newest first')
  assert.ok(md.includes(`- #1 [first](${A}/12d637fb.md) · yours · bookmark\n`), md)
  assert.ok(md.includes('- #2 second · Claude\'s · perma\n'), 'no note, no link')
  assert.ok(md.includes('- #3 \\#third · yours · bookmark\n'))
  assert.ok(md.includes(`\`${A}\` · updated 2025-10-09 · 3 bookmarks\n`))
  assert.ok(md.includes('Generated by bookmarks 0.5.10'))
  assert.equal(renderIndexMarkdown(idx), md, 'deterministic')
  const none = renderIndexMarkdown(emptyIndex('w', T0))
  assert.ok(none.includes('0 conversations with bookmarks'))
})
