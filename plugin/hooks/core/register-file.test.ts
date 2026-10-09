// node --test hooks/core/register-file.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addOrRelabel,
  emptyRegister,
  EXPORT_NOTES_MARKER,
  exportFileName,
  exportMarkdown,
  exportNotesOf,
  findRecord,
  listOf,
  newer,
  parseFrontMatter,
  parseRegister,
  prune,
  remove,
  serializeRegister,
  share,
  type Mint,
} from './register-file.ts'

const SESSION = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const UUID = '12d637fb-6d1d-4c3f-bbb6-11c107d8af4e'
const T0 = 1_760_000_000_000

const mint: Mint = {
  uuid: UUID,
  owner: 'claude',
  label: 'the trigger message',
  why: 'where the anchors design started',
  words: 'jump back in time',
  line: 5768,
  bytes: [9763906, 9765751],
  head: "One thing I'd really like us to design",
  by: 'claude',
  source: 'tool',
  role: 'user',
  timestamp: '2026-10-09T10:55:00.527Z',
}

test('a mint adds a record; a second mint for the same message relabels, never duplicates or deletes', () => {
  const r0 = emptyRegister(SESSION, 'convo-bookmarks 0.2.0', T0)
  const a = addOrRelabel(r0, mint, T0 + 1)
  assert.equal(a.added, true)
  assert.equal(a.register.perma.length, 1)
  assert.equal(a.register.rev, 1)
  const b = addOrRelabel(a.register, { ...mint, label: 'renamed', why: undefined, words: undefined }, T0 + 2)
  assert.equal(b.added, false)
  assert.equal(b.register.perma.length, 1)
  assert.equal(b.record.label, 'renamed')
  assert.equal(b.record.why, mint.why, 'an absent why keeps the old one')
  assert.equal(b.record.words, mint.words)
  assert.equal(b.record.createdAt, T0 + 1)
  assert.equal(b.record.updatedAt, T0 + 2)
  assert.equal(b.register.rev, 2)
})

test('a uuid prefix finds the record and the full uuid is kept', () => {
  const r = addOrRelabel(emptyRegister(SESSION, 'w', T0), mint, T0).register
  assert.equal(findRecord(r, '12d637fb')?.uuid, UUID)
  const again = addOrRelabel(r, { ...mint, uuid: '12d637fb', label: 'by prefix' }, T0 + 5)
  assert.equal(again.added, false)
  assert.equal(again.record.uuid, UUID)
})

test('temporary: a permanent mark stays permanent; prune removes old temporaries and leaves tombstones', () => {
  let r = addOrRelabel(emptyRegister(SESSION, 'w', T0), { ...mint, temporary: true }, T0).register
  r = addOrRelabel(r, { ...mint, uuid: 'aaaaaaaa-0000-0000-0000-000000000001', label: 'keep', temporary: true }, T0).register
  r = addOrRelabel(r, { ...mint, uuid: 'bbbbbbbb-0000-0000-0000-000000000002', label: 'perm' }, T0).register
  // Re-minting the first without `temporary` makes it permanent.
  r = addOrRelabel(r, { ...mint, label: 'now permanent' }, T0 + 1).register
  assert.equal(findRecord(r, UUID)?.temporary, undefined)
  const { register: after, pruned } = prune(r, '7d', T0 + 8 * 86_400_000)
  assert.deepEqual(pruned.map(p => p.label), ['keep'])
  assert.equal(after.perma.length, 2)
  assert.equal(after.tombstones.length, 1)
  assert.equal(after.tombstones[0]!.uuid, 'aaaaaaaa-0000-0000-0000-000000000001')
  assert.equal(prune(r, 'never', T0 + 10 * 365 * 86_400_000).pruned.length, 0)
})

test('the file is stable-ordered JSON that reads back equal', () => {
  const r = addOrRelabel(emptyRegister(SESSION, 'w', T0, { configDir: 'C:/Users/x/.claude', cwd: 'C:/code/p' }), mint, T0).register
  const text = serializeRegister(r)
  assert.ok(text.startsWith('{\n  "version": 1,\n  "sessionId": "' + SESSION))
  const keys = Object.keys(JSON.parse(text).perma[0])
  assert.deepEqual(keys.slice(0, 5), ['sessionId', 'uuid', 'owner', 'label', 'why'])
  assert.deepEqual(parseRegister(text), r)
  assert.equal(parseRegister('not json'), undefined)
  assert.equal(parseRegister('{"perma": 3}'), undefined)
  assert.equal(serializeRegister(parseRegister(text)!), text, 'idempotent')
})

test('two lists: the same message can be on both; share copies, remove tombstones', () => {
  let r = addOrRelabel(emptyRegister(SESSION, 'w', T0), mint, T0).register
  // The person's own bookmark of the same message is a second record, not a relabel.
  const mine = addOrRelabel(r, { ...mint, owner: 'user', by: 'user', source: 'promote', label: 'my copy' }, T0 + 1)
  r = mine.register
  assert.equal(mine.added, true)
  assert.equal(r.perma.length, 2)
  assert.equal(listOf(r, 'claude').length, 1)
  assert.equal(listOf(r, 'user')[0]!.label, 'my copy')
  assert.equal(findRecord(r, UUID, 'claude')?.label, 'the trigger message')
  // Share: Claude's second bookmark is copied onto the person's list; the original stays.
  r = addOrRelabel(r, { ...mint, uuid: 'aaaaaaaa-0000-0000-0000-000000000001', label: 'from Claude' }, T0 + 2).register
  const shared = share(r, 'aaaaaaaa', 'claude', 'user', T0 + 3)
  assert.ok(!('error' in shared))
  if (!('error' in shared)) {
    r = shared.register
    assert.equal(shared.added, true)
    assert.equal(shared.record.owner, 'user')
    assert.equal(shared.record.sharedFrom, 'claude')
    assert.equal(shared.record.label, 'from Claude')
    assert.equal(listOf(r, 'claude').length, 2)
    assert.equal(listOf(r, 'user').length, 2)
  }
  assert.ok('error' in share(r, 'deadbeef', 'claude', 'user', T0 + 4))
  // Remove from one list only, with a tombstone naming who.
  const gone = remove(r, UUID, 'user', 'claude (asked by djdarcy)', T0 + 5)
  assert.ok(!('error' in gone))
  if (!('error' in gone)) {
    assert.equal(gone.removed.label, 'my copy')
    assert.equal(listOf(gone.register, 'user').length, 1)
    assert.equal(listOf(gone.register, 'claude').length, 2, "Claude's copy of the same message stays")
    const t = gone.register.tombstones.at(-1)!
    assert.equal(t.owner, 'user')
    assert.equal(t.removedBy, 'claude (asked by djdarcy)')
    assert.equal(t.removedAt, T0 + 5)
  }
  // A record from before `owner` existed belongs to whoever minted it.
  const old = parseRegister(serializeRegister(r).replace(/"owner": "claude",\n\s*/g, ''))!
  assert.equal(listOf(old, 'claude').length, 2)
})

test('newer: higher rev wins, then the later write', () => {
  const a = { ...emptyRegister(SESSION, 'a', T0), rev: 3, updatedAt: T0 }
  const b = { ...emptyRegister(SESSION, 'b', T0), rev: 2, updatedAt: T0 + 100 }
  assert.equal(newer(a, b), a)
  const c = { ...b, rev: 3 } // same rev as a, written later
  assert.equal(newer(a, c), c)
  assert.equal(newer(c, a), c)
})

test('the export carries every field in front matter and the message as a quote; it reads back', () => {
  const rec = addOrRelabel(emptyRegister(SESSION, 'w', T0), { ...mint, transcript: 'C:/x/projects/p/s.jsonl' }, T0).record
  const md = exportMarkdown(rec, 'One thing: a message\n\nwith "quotes" and a: colon', { minted: 'by the bookmark tool' })
  assert.equal(exportFileName(rec.uuid), '12d637fb.md')
  assert.ok(md.startsWith('---\nkind: bookmark-anchor\nversion: 1\nsession: ' + SESSION))
  assert.ok(md.includes('\nbytes: 9763906-9765751\n'))
  assert.ok(md.includes('\n> One thing: a message\n>\n> with "quotes" and a: colon\n'))
  // The bookmarked words are bold inside the quote; a long message gets a heading and link.
  const withWords = exportMarkdown({ ...rec, words: 'a message' }, 'One thing: a message\n\nmore')
  assert.ok(withWords.includes('> One thing: **a message**'))
  assert.ok(!withWords.includes('#the-bookmarked-words'), 'short message: no jump link')
  const longText = 'x'.repeat(1600) + '\n\nthe words here\n\nafter'
  const longMd = exportMarkdown({ ...rec, words: 'the words here' }, longText)
  assert.ok(longMd.includes('[jump to the bookmarked words](#the-bookmarked-words)'))
  assert.ok(longMd.includes('### The bookmarked words\n\n> **the words here**'))
  assert.ok(md.includes("sed -n '5768p'"))
  const fm = parseFrontMatter(md)
  assert.equal(fm.uuid, UUID)
  assert.equal(fm.words, 'jump back in time')
  assert.equal(fm.line, '5768')
  assert.equal(fm.transcript, 'C:/x/projects/p/s.jsonl', 'a value with a colon round-trips through quoting')
  assert.equal(fm.label, 'the trigger message')
  assert.equal(fm.owners, 'claude')
})

test('notes written under the marker survive a rewrite of the export', () => {
  const rec = addOrRelabel(emptyRegister(SESSION, 'w', T0), mint, T0).record
  const first = exportMarkdown(rec, 'the message')
  assert.ok(first.includes(EXPORT_NOTES_MARKER))
  const edited = first.replace(/## Notes\n\n[^\n]*/, '## Notes\n\nMy own note.\n\n- a link I added')
  const kept = exportNotesOf(edited)
  assert.equal(kept, 'My own note.\n\n- a link I added', 'the heading is the writer\'s, not part of the notes')
  const rewritten = exportMarkdown({ ...rec, label: 'relabelled' }, 'the message', { notes: kept, owners: ['claude', 'user'] })
  assert.ok(rewritten.includes('# relabelled'))
  assert.ok(rewritten.endsWith('## Notes\n\nMy own note.\n\n- a link I added\n'))
  assert.equal(rewritten.split('## Notes').length - 1, 1, 'one heading after a rewrite, not two')
  assert.equal(exportNotesOf(rewritten), kept, 'a second rewrite keeps the same notes')
  assert.equal(parseFrontMatter(rewritten).owners, 'claude, user')
  assert.equal(exportNotesOf(undefined), '')
  assert.equal(exportNotesOf('no marker here'), '')
})

test('a note that quotes the marker does not grow the export on rewrite (tester sweep, 2026-10-09)', () => {
  const rec = addOrRelabel(emptyRegister(SESSION, 'w', T0), mint, T0).record
  const notes = 'mine\n' + EXPORT_NOTES_MARKER + '\nmore'
  const once = exportMarkdown(rec, 'm', { notes })
  const twice = exportMarkdown(rec, 'm', { notes: exportNotesOf(once) })
  const count = (s: string) => s.split(EXPORT_NOTES_MARKER).length - 1
  assert.equal(count(twice), 1)
  assert.ok(twice.includes('## Notes\n\nmine\n\nmore'), 'both halves of the note are kept under one heading')
  assert.equal(exportNotesOf(twice), 'mine\n\nmore', 'stable from then on')
})

test('words with $ replacement patterns are bolded literally (tester sweep, 2026-10-09)', () => {
  const rec = addOrRelabel(emptyRegister(SESSION, 'w', T0), { ...mint, words: 'cost $& more' }, T0).record
  const md = exportMarkdown(rec, 'intro cost $& more outro')
  assert.ok(md.includes('> intro **cost $& more** outro'), md)
  const dollars = exportMarkdown({ ...rec, words: "$$ and $'" }, "pay $$ and $' now")
  assert.ok(dollars.includes("> pay **$$ and $'** now"), dollars)
})
