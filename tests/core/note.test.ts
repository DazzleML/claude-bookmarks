// node --test tests/core/note.test.ts
// The Markdown as an Obsidian note (unit 9 of the record-format goal): the primary record,
// the note's lists (tags with the derived ones, the other labels as aliases), the YAML-subset
// parser, the ingest guard and the base a write leaves behind.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addOrRelabel, emptyRegister, EXPORT_VERSION, exportMarkdown, FRONT_MATTER_PROPERTIES, parseFrontMatter, parseRegister, recordsOn, serializeRegister,
  type Mint, type Register,
} from '../../plugin/hooks/core/bookmarks/register-file.ts'
import { applyOp } from '../../plugin/hooks/core/bookmarks/register-ops.ts'
import {
  aliasesOf, atOrAbove, baseOf, ingest, NOTE_WRITER_FLOOR, noteOwners, noteTags, primaryRecord, sameBase, userTags, writerVersion,
} from '../../plugin/hooks/core/bookmarks/note.ts'
import type { AnchorRecord } from '../../plugin/hooks/core/bookmarks/anchor.ts'

const SESSION = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const T0 = 1_760_000_000_000
const U = '12d637fb-6d1d-4c3f-bbb6-11c107d8af4e'
const base: Mint = { uuid: U, owner: 'claude', label: 'what the place says', head: 'the message', by: 'claude', source: 'tool' }

/** A register with Claude's perma record, the person's bookmark and a letter's mark, all on one message. */
function threeOnOne(): Register {
  let reg = emptyRegister(SESSION, 'w', T0)
  reg = addOrRelabel(reg, { ...base, tier: 'perma', tags: ['design/records'] }, T0 + 1).register
  reg = addOrRelabel(reg, { ...base, owner: 'user', by: 'user', source: 'promote', label: 'the person\'s name for it', why: 'because' }, T0 + 2).register
  const marked = applyOp(reg, { op: 'setMark', owner: 'user', letter: 'a', place: { uuid: U, head: 'the message' }, at: T0 + 3 }, T0 + 3)
  if ('error' in marked) throw new Error(marked.error)
  return marked.register
}

test('the primary record is the person\'s warmest, else Claude\'s; a letter\'s mark is never the primary and never an alias', () => {
  const reg = threeOnOne()
  const on = recordsOn(reg, U)
  assert.equal(on.length, 2, 'the mark is left out')
  const primary = primaryRecord(reg.perma)!
  assert.equal(primary.owner, 'user')
  assert.deepEqual(aliasesOf(primary, reg.perma), ['what the place says'])
  assert.deepEqual(noteOwners(primary, reg.perma), ['user', 'claude'])
  assert.deepEqual(noteTags(primary, reg.perma), ['bm/tier/bookmark', 'bm/tier/perma', 'bm/owner/user', 'bm/owner/claude'], 'the primary\'s own tags first (it has none), then one derived tag per tier and owner')
  // Claude's two records: the warmer one is primary.
  let two = emptyRegister(SESSION, 'w', T0)
  two = addOrRelabel(two, { ...base, tier: 'perma' }, T0).register
  two = addOrRelabel(two, { ...base, uuid: 'aaaaaaaa-0000-4000-8000-000000000001', label: 'another message' }, T0).register
  assert.equal(primaryRecord(two.perma.filter(r => r.uuid === U))!.tier, 'perma')
  assert.equal(primaryRecord([]), undefined)
  assert.equal(primaryRecord(reg.perma.filter(r => r.tier === 'mark')), undefined)
  // Among equals -- two open owners at one tier -- the earliest record is primary (mutation sweep v0.5.9, M2).
  let open = emptyRegister(SESSION, 'w', T0)
  open = addOrRelabel(open, { ...base, owner: 'agent:late', label: 'later' }, T0 + 5).register
  open = addOrRelabel(open, { ...base, owner: 'person:early', label: 'earlier' }, T0 + 4).register
  assert.equal(primaryRecord(open.perma)!.label, 'earlier')
})

test('the note writes tags and aliases as YAML lists, version 2, only reserved names; the parser reads them back', () => {
  const reg = threeOnOne()
  const primary = primaryRecord(reg.perma)!
  const md = exportMarkdown(primary, 'the message text', { records: recordsOn(reg, U), writer: 'claude-bookmarks 0.5.9', title: 'a title' })
  const fm = parseFrontMatter(md)
  for (const k of Object.keys(fm)) assert.ok((FRONT_MATTER_PROPERTIES as readonly string[]).includes(k), `${k} is not a reserved front-matter property`)
  assert.equal(fm.version, String(EXPORT_VERSION))
  assert.equal(EXPORT_VERSION, 2)
  assert.equal(fm.owners, 'user, claude')
  assert.deepEqual(fm.aliases, ['what the place says'])
  assert.deepEqual(fm.tags, ['bm/tier/bookmark', 'bm/tier/perma', 'bm/owner/user', 'bm/owner/claude'])
  assert.ok(md.includes('\ntags:\n  - bm/tier/bookmark\n  - bm/tier/perma\n'), md)
  assert.equal(fm.label, 'the person\'s name for it')
  assert.equal(fm.why, 'because')
  // Without `records`, the record alone: its tier and owner derived, no aliases line.
  const alone = exportMarkdown(reg.perma[0]!, 'text', {})
  assert.deepEqual(parseFrontMatter(alone).tags, ['design/records', 'bm/tier/perma', 'bm/owner/claude'])
  assert.ok(!alone.includes('\naliases:'))
})

test('the YAML subset: block lists, flow lists, quoted scalars, an empty property, CRLF; nothing nested is read', () => {
  const text = [
    '---', 'kind: bookmark-anchor', 'label: "a: colon, \\"quotes\\""', "why: 'it''s'", 'tags:', '  - a/b', '  - "c: d"', 'aliases: [one, "two, too", three]',
    'empty:', 'nested:', '  key: value', 'n: 7', 'no colon here', 'two words: not a key', 'flow: [a, , b]', '---', '', '# body', 'tags: not front matter',
  ].join('\r\n')
  const fm = parseFrontMatter(text)
  // A line whose "key" has a space is prose, not a property (M8); an empty flow item is no item (M10).
  assert.equal(fm['two words'], undefined)
  assert.deepEqual(fm.flow, ['a', 'b'])
  assert.equal(fm.label, 'a: colon, "quotes"')
  assert.equal(fm.why, "it's")
  assert.deepEqual(fm.tags, ['a/b', 'c: d'])
  assert.deepEqual(fm.aliases, ['one', 'two, too', 'three'])
  assert.deepEqual(fm.empty, [])
  assert.deepEqual(fm.nested, [], 'a nested map is not read: its key is not an item')
  assert.equal(fm.n, '7')
  assert.equal(fm['no colon here'], undefined)
  assert.equal(Object.keys(fm).includes('body'), false)
  assert.deepEqual(parseFrontMatter('no front matter'), {})
})

test('ingest adopts a field that differs from the base, never one that is absent, never from a writer below the floor; bm/* tags are stripped', () => {
  const b = { label: 'what the place says', why: 'because', tags: ['design/records'] }
  const edited = { 'bm-writer': `claude-bookmarks ${NOTE_WRITER_FLOOR}`, label: 'renamed in Obsidian', why: 'because', tags: ['design/records', 'todo', 'bm/tier/perma', 'bm/owner/claude'] }
  const got = ingest(edited, b)
  assert.deepEqual(got.changes, { label: 'renamed in Obsidian', tags: ['design/records', 'todo'] }, 'why equals its base and is not a change')
  // Equal to the base: nothing, even though the register may have moved on since (the register wins).
  assert.equal(ingest({ ...edited, label: b.label, tags: ['design/records', 'bm/tier/perma'] }, b).changes, undefined)
  // Absent from the note: not adopted, so a note without `why` or `tags` is not a deletion of them.
  assert.equal(ingest({ 'bm-writer': 'x 0.5.9', label: b.label }, b).changes, undefined)
  // Present and emptied: that is an edit (tags cleared), and a why made empty is too; an empty label is not (a note needs a title).
  assert.deepEqual(ingest({ 'bm-writer': 'x 0.5.9', tags: [] }, b).changes, { tags: [] })
  assert.deepEqual(ingest({ 'bm-writer': 'x 0.5.9', why: '' }, b).changes, { why: '' })
  assert.equal(ingest({ 'bm-writer': 'x 0.5.9', label: '' }, b).changes, undefined)
  // A hand-written scalar for tags splits on commas, as Obsidian reads it.
  assert.deepEqual(ingest({ 'bm-writer': 'x 0.5.9', tags: 'design/records, todo' }, b).changes, { tags: ['design/records', 'todo'] })
  // The guards: no writer, an older writer, no base.
  assert.equal(ingest({ label: 'renamed' }, b).changes, undefined)
  assert.equal(ingest({ 'bm-writer': 'claude-bookmarks 0.5.8', label: 'renamed' }, b).changes, undefined)
  assert.equal(ingest({ 'bm-writer': 'claude-bookmarks 0.6.0', label: 'renamed' }, b).changes?.label, 'renamed')
  assert.equal(ingest(edited, undefined).changes, undefined)
  assert.deepEqual(writerVersion('claude-bookmarks 0.5.9'), [0, 5, 9])
  assert.equal(writerVersion('bookmarks test'), undefined)
  assert.equal(atOrAbove([0, 10, 0], [0, 5, 9]), true)
  assert.equal(atOrAbove([0, 5, 8], [0, 5, 9]), false)
  assert.deepEqual(userTags(['a', 'bm/tier/perma', 'bmx']), ['a', 'bmx'])
})

test('the base: baseOf strips derived tags and an empty why; the noteBase op sets md.base by id, is unchanged when equal, round-trips after x', () => {
  const reg = threeOnOne()
  const primary = primaryRecord(reg.perma)!
  const b = baseOf({ ...primary, tags: ['a', 'bm/owner/user'] } as AnchorRecord)
  assert.deepEqual(b, { label: 'the person\'s name for it', why: 'because', tags: ['a'] })
  assert.ok(sameBase(b, { label: b.label, why: 'because', tags: ['a'] }))
  assert.ok(!sameBase(b, { ...b, tags: [] }))
  assert.ok(!sameBase(b, undefined))
  const set = applyOp(reg, { op: 'noteBase', id: { uuid: U, owner: 'user', n: primary.n }, base: b }, T0 + 9)
  if ('error' in set) throw new Error(set.error)
  assert.equal(set.register.rev, reg.rev + 1)
  assert.deepEqual(set.record!.md, { base: b })
  const again = applyOp(set.register, { op: 'noteBase', id: { uuid: U, owner: 'user', n: primary.n }, base: { ...b } }, T0 + 10)
  assert.equal((again as { unchanged?: boolean }).unchanged, true)
  assert.ok('error' in applyOp(reg, { op: 'noteBase', id: { uuid: 'bbbbbbbb-0000-4000-8000-000000000002', owner: 'user' }, base: b }, T0))
  // On disk after `x`, before any unknown key; and back.
  const withX = { ...set.register, perma: set.register.perma.map(r => (r === set.record ? { ...r, x: { user: { k: 1 } }, future: true } : r)) }
  const text = serializeRegister(withX as Register)
  const rec = JSON.parse(text).perma.find((r: { owner: string; tier?: string }) => r.owner === 'user' && !r.tier)
  const keys = Object.keys(rec)
  assert.ok(keys.indexOf('x') < keys.indexOf('md') && keys.indexOf('md') < keys.indexOf('future'), keys.join(','))
  assert.deepEqual(parseRegister(text)!.perma.find(r => r.owner === 'user' && !r.tier)!.md, { base: b })
})
