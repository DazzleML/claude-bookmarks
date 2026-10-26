// node --test hooks/core/bookmarks/register-file.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addOrRelabel,
  emptyRegister,
  EXPORT_NOTES_MARKER,
  EXPORT_VERSION,
  exportFileName,
  exportMarkdown,
  exportNotesOf,
  findRecord,
  listOf,
  newer,
  formatOf,
  newerThanBuild,
  REGISTER_FORMAT,
  parseFrontMatter,
  parseRegister,
  prune,
  remove,
  serializeRegister,
  share,
  claim,
  type Mint,
  type Register,
} from '../../plugin/hooks/core/bookmarks/register-file.ts'
import { anchorHref, tierOf } from '../../plugin/hooks/core/bookmarks/anchor.ts'

test('a perma mint stays perma until asked to be a bookmark, never the other way', () => {
  const r0 = emptyRegister('8f0f9b27-33fc-4054-806a-22a6d569dfb5', 'test', 1)
  const a = addOrRelabel(r0, { ...mintFor('12d637fb-6d1d-4c3f-bbb6-11c107d8af4e'), tier: 'perma' }, 2)
  assert.equal(tierOf(a.record), 'perma')
  const relabelled = addOrRelabel(a.register, { ...mintFor('12d637fb-6d1d-4c3f-bbb6-11c107d8af4e'), label: 'new' }, 3)
  assert.equal(tierOf(relabelled.record), 'perma')
  const promoted = addOrRelabel(relabelled.register, { ...mintFor('12d637fb-6d1d-4c3f-bbb6-11c107d8af4e'), tier: 'bookmark' }, 4)
  assert.equal(tierOf(promoted.record), 'bookmark')
  const again = addOrRelabel(promoted.register, { ...mintFor('12d637fb-6d1d-4c3f-bbb6-11c107d8af4e'), tier: 'perma' }, 5)
  assert.equal(tierOf(again.record), 'bookmark')
  assert.equal(tierOf({}), 'bookmark', 'a record from before tiers is a bookmark')
})

test('claim moves Claude\'s record to the person\'s list with the same id and link', () => {
  const r0 = emptyRegister('8f0f9b27-33fc-4054-806a-22a6d569dfb5', 'test', 1)
  const a = addOrRelabel(r0, { ...mintFor('12d637fb-6d1d-4c3f-bbb6-11c107d8af4e'), tier: 'perma' }, 2)
  const c = claim(a.register, '12d637fb', 3)
  assert.ok(!('error' in c))
  if ('error' in c) return
  assert.equal(c.record.owner, 'user')
  assert.equal(c.record.uuid, a.record.uuid)
  assert.equal(c.record.tier, 'perma')
  assert.equal(anchorHref(c.record, 'C:/d'), anchorHref(a.record, 'C:/d'))
  assert.equal(listOf(c.register, 'claude').length, 0)
  assert.equal(listOf(c.register, 'user').length, 1)
  assert.ok('error' in claim(c.register, '12d637fb', 4), 'nothing left on Claude\'s list to claim')
})

test('a perma record keeps its tier through the register file', () => {
  const r0 = emptyRegister('8f0f9b27-33fc-4054-806a-22a6d569dfb5', 'test', 1)
  const a = addOrRelabel(r0, { ...mintFor('12d637fb-6d1d-4c3f-bbb6-11c107d8af4e'), tier: 'perma' }, 2)
  const back = parseRegister(serializeRegister(a.register))
  assert.equal(back && tierOf(back.perma[0]!), 'perma')
})

function mintFor(uuid: string): Mint {
  return { uuid, owner: 'claude', label: 'a place', head: 'the message', by: 'claude', source: 'tool' }
}

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
  assert.ok(text.startsWith('{\n  "version": 4,\n  "format": 4,\n  "sessionId": "' + SESSION))
  const keys = Object.keys(JSON.parse(text).perma[0])
  // v2: the record's number first; its sessionId is the file's and so not written (the hoist).
  assert.deepEqual(keys.slice(0, 5), ['n', 'uuid', 'owner', 'label', 'why'])
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
  assert.ok(md.startsWith(`---\nkind: bookmark-anchor\nversion: ${EXPORT_VERSION}\nsession: ` + SESSION))
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

// --- The guard (0.5.1): what this build does not know, it keeps -------------------------

/** A file as a newer build would write it: fields this build has never heard of at every level. */
function newerBuildFile(version = 2, format?: number): string {
  const r = addOrRelabel(emptyRegister(SESSION, 'bookmarks 0.9', T0), mint, T0).register
  const removed = remove(r, mint.uuid, 'claude', 'test', T0 + 1)
  assert.ok(!('error' in removed))
  const withNew = addOrRelabel(removed.register, { ...mint, uuid: 'dddddddd-0000-4000-8000-000000000002' }, T0 + 2).register
  const o = JSON.parse(serializeRegister(withNew))
  o.version = version
  // A file from before 0.5.12 has no `format`; a later one names the reader it needs.
  if (format === undefined) delete o.format
  else o.format = format
  // Keys this build does not know (nextN and n became known in 0.5.3, so the unknowns are the slots and the rest).
  o.slots = { user: { a: [{ n: 2, at: T0 + 2 }] } }
  o.reading = null // a cleared value is a value: null rides through too (mutation sweep v0.5.1, N6)
  o.perma[0].tags = ['design/records', 'kept']
  o.perma[0].x = { claude: { why: 'nested, and not ours' } }
  o.tombstones[0].n = 1
  // Canonical text: the known keys in the writer's order, the unknown ones after, as the newer build would have written it.
  return serializeRegister(parseRegister(JSON.stringify(o))!)
}

test('unknown keys survive a round trip at the file, record and tombstone level, after the known keys in their own order', () => {
  const text = newerBuildFile()
  const reg = parseRegister(text)!
  assert.ok(reg, 'a v2 file reads')
  assert.equal(reg.perma.length, 1)
  assert.deepEqual((reg as Record<string, unknown>).slots, { user: { a: [{ n: 2, at: T0 + 2 }] } })
  assert.equal((reg as Record<string, unknown>).reading, null)
  assert.deepEqual((reg.perma[0] as Record<string, unknown>).tags, ['design/records', 'kept'])
  assert.equal((reg.tombstones[0] as Record<string, unknown>).n, 1)
  // Byte for byte: the file came from a writer that put known keys first, so this writer agrees with it.
  assert.equal(serializeRegister(reg), text)
  assert.ok(text.includes('"slots"') && text.includes('"reading": null'), text)
  // Order: known keys first, then the file's own, as it had them.
  const keys = Object.keys(JSON.parse(serializeRegister(reg)))
  assert.deepEqual(keys.slice(-2), ['slots', 'reading'])
  assert.ok(keys.indexOf('tombstones') < keys.indexOf('slots'))
  const recordKeys = Object.keys(JSON.parse(serializeRegister(reg)).perma[0])
  assert.deepEqual(recordKeys.slice(-2), ['tags', 'x'])
})

test('unknown keys survive the operations this build performs: relabel, share, claim, remove, prune', () => {
  const reg = parseRegister(newerBuildFile(1))!
  const id = reg.perma[0]!.uuid
  const slots = { user: { a: [{ n: 2, at: T0 + 2 }] } }
  const relabelled = addOrRelabel(reg, { ...mint, uuid: id, label: 'renamed' }, T0 + 5).register
  assert.deepEqual((relabelled.perma[0] as Record<string, unknown>).tags, ['design/records', 'kept'], 'relabel keeps the record\'s unknown keys')
  assert.deepEqual((relabelled as Record<string, unknown>).slots, slots, 'relabel keeps the file\'s unknown keys')
  const shared = share(relabelled, id, 'claude', 'user', T0 + 6)
  assert.ok(!('error' in shared))
  assert.deepEqual((shared.register as Record<string, unknown>).slots, slots)
  const claimed = claim(parseRegister(newerBuildFile(1))!, id, T0 + 7)
  assert.ok(!('error' in claimed))
  assert.deepEqual((claimed.record as Record<string, unknown>).tags, ['design/records', 'kept'], 'claim moves the record with its unknown keys')
  const removed = remove(reg, id, 'claude', 'test', T0 + 8)
  assert.ok(!('error' in removed))
  assert.equal((removed.register.tombstones[0] as Record<string, unknown>).n, 1, 'the older tombstone keeps its n')
  assert.deepEqual((removed.register as Record<string, unknown>).slots, slots)
  const pruned = prune({ ...reg, perma: [{ ...reg.perma[0]!, temporary: true, updatedAt: 0 }] }, '7d', T0 + 10 * 86_400_000).register
  assert.deepEqual((pruned as Record<string, unknown>).slots, slots, 'prune keeps the file\'s unknown keys')
})

test('a file from a newer build is recognised by its format, not its version; this build\'s own and older files are not', () => {
  // No `format` (a file from before 0.5.12): the version stands in for it.
  assert.equal(newerThanBuild(parseRegister(newerBuildFile(5))!), true)
  assert.equal(newerThanBuild(parseRegister(newerBuildFile(4))!), false)
  assert.equal(newerThanBuild(parseRegister(newerBuildFile(3))!), false)
  assert.equal(newerThanBuild(parseRegister(newerBuildFile(2))!), false)
  assert.equal(newerThanBuild(parseRegister(newerBuildFile(1))!), false)
  assert.equal(newerThanBuild(emptyRegister(SESSION, 'w', T0)), false)
  // With `format`: a later version this build can still handle is NOT refused (djdarcy, 2026-10-17: never
  // force an upgrade when nothing needs upgrading); a format above this build's is, whatever the version.
  assert.equal(newerThanBuild(parseRegister(newerBuildFile(9, REGISTER_FORMAT))!), false)
  assert.equal(newerThanBuild(parseRegister(newerBuildFile(9, REGISTER_FORMAT - 1))!), false)
  assert.equal(newerThanBuild(parseRegister(newerBuildFile(3, REGISTER_FORMAT + 1))!), true)
  assert.equal(formatOf(parseRegister(newerBuildFile(9, 3))!), 3)
  assert.equal(formatOf(parseRegister(newerBuildFile(2))!), 2)
  // The field rides through a save unchanged, after `version`.
  const kept = serializeRegister(parseRegister(newerBuildFile(9, 3))!)
  assert.ok(kept.startsWith('{\n  "version": 9,\n  "format": 3,\n'), kept.slice(0, 40))
  assert.equal(emptyRegister(SESSION, 'w', T0).format, REGISTER_FORMAT)
  // A file with no version at all is read as version 1 (the proof-of-concept files had none), older than this build.
  const o = JSON.parse(newerBuildFile(1))
  delete o.version
  const unversioned = parseRegister(JSON.stringify(o))!
  assert.equal(unversioned.version, 1)
  assert.equal(newerThanBuild(unversioned), false)
})

test('the hoist (v2): a record\'s sessionId and transcript are written only when they differ from the file\'s, and read back filled in', () => {
  const reg: Register = { ...emptyRegister(SESSION, 'w', T0), transcript: 'C:/Users/x/.claude/projects/p/s.jsonl' }
  const a = addOrRelabel(reg, { ...mint, transcript: 'C:/Users/x/.claude/projects/p/s.jsonl' }, T0 + 1).register
  const b = addOrRelabel(a, { ...mint, uuid: 'eeeeeeee-0000-4000-8000-000000000003', transcript: 'C:/elsewhere/other.jsonl' }, T0 + 2).register
  const text = serializeRegister(b)
  const own = JSON.parse(text).perma[0]
  const other = JSON.parse(text).perma[1]
  assert.equal(own.sessionId, undefined, 'the file\'s own record carries no sessionId')
  assert.equal(own.transcript, undefined, 'nor the file\'s transcript')
  assert.equal(other.transcript, 'C:/elsewhere/other.jsonl', 'a different transcript is an override and stays')
  const back = parseRegister(text)!
  assert.equal(back.perma[0]?.sessionId, SESSION)
  assert.equal(back.perma[0]?.transcript, 'C:/Users/x/.claude/projects/p/s.jsonl')
  assert.equal(back.perma[1]?.transcript, 'C:/elsewhere/other.jsonl')
  assert.deepEqual(back, b, 'the file reads back as the register that wrote it')
  // A v1 file is written whole: nothing hoisted, so an older reader sees every field.
  const v1: Register = { ...a, version: 1 }
  assert.equal(JSON.parse(serializeRegister(v1)).perma[0].sessionId, SESSION)
})

test('parse normalises what it keeps: a record without a label is dropped, a missing rev is 0, a version that is not a number is this build\'s (mutation sweep v0.5.1, M4-M6)', () => {
  const o = JSON.parse(newerBuildFile(1))
  o.perma.push({ uuid: 'eeeeeeee-0000-4000-8000-000000000003', head: 'no label here' })
  delete o.rev
  o.version = '2'
  const reg = parseRegister(JSON.stringify(o))!
  assert.equal(reg.perma.length, 1, 'the label-less record is not a record')
  assert.equal(reg.rev, 0)
  assert.equal(reg.version, 1)
  assert.equal(newerThanBuild(reg), false)
})
