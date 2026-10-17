// node --test tests/core/record.test.ts
// The reserved names and the tiers (unit 6 of the record-format goal): the record's open
// fields round-trip in the writer's order, the header's title and project, the front
// matter's fixed property list, and the tier gate as the converse of `passes`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addOrRelabel, emptyRegister, exportMarkdown, FRONT_MATTER_PROPERTIES, parseFrontMatter, parseRegister, RESERVED, serializeRegister, type Mint, type Register } from '../../plugin/hooks/core/bookmarks/register-file.ts'
import { ownerOf, tierOf, type AnchorOwner, type AnchorRecord } from '../../plugin/hooks/core/bookmarks/anchor.ts'
import { admits, TIERS, tierContinuum, warmer } from '../../plugin/hooks/core/bookmarks/tiers.ts'

const SESSION = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const T0 = 1_760_000_000_000
const mint: Mint = { uuid: '12d637fb-6d1d-4c3f-bbb6-11c107d8af4e', owner: 'claude', label: 'the trigger message', head: 'the message', by: 'claude', source: 'tool' }

test('the tiers are an ordinal continuum, cold to warm; the gate admits at-or-warmer, the converse of passes', () => {
  assert.deepEqual([...TIERS], ['transient', 'mark', 'perma', 'bookmark'])
  assert.equal(tierContinuum.subtype, 'list')
  // passes is "at or colder": a bookmark does NOT pass a threshold of perma; a mark does.
  assert.equal(tierContinuum.passes('bookmark', 'perma'), false)
  assert.equal(tierContinuum.passes('mark', 'perma'), true)
  // admits is the converse: a pane gated at perma shows perma and bookmark, not mark or transient.
  assert.equal(admits('bookmark', 'perma'), true)
  assert.equal(admits('perma', 'perma'), true)
  assert.equal(admits('mark', 'perma'), false)
  assert.equal(admits('transient', 'mark'), false)
  assert.equal(admits('transient', 'transient'), true)
  assert.equal(warmer('mark', 'bookmark'), 'bookmark')
  assert.equal(warmer('perma', 'transient'), 'perma')
})

test('a record\'s open fields -- tags, axes, rel, x -- round-trip through the file in the writer\'s order, and stay by relabel', () => {
  const reg = emptyRegister(SESSION, 'w', T0)
  const a = addOrRelabel(reg, mint, T0).register
  const rich: AnchorRecord = {
    ...a.perma[0]!,
    tags: ['design/records', 'kept'],
    axes: { attention: 'read', processing: 'wip' },
    rel: [{ kind: 'answers', to: 'bm:c8d1e0ee.12' }],
    x: { claude: { why: 'cited twice' }, 'agent:oracle': { seen: true } },
  }
  const withRich: Register = { ...a, perma: [rich] }
  const text = serializeRegister(withRich)
  const keys = Object.keys(JSON.parse(text).perma[0])
  assert.deepEqual(keys.slice(-4), ['tags', 'axes', 'rel', 'x'], 'the open fields come last, in the reserved order')
  assert.ok((RESERVED.record as readonly string[]).includes('axes'))
  assert.ok((RESERVED.register as readonly string[]).includes('title'))
  const back = parseRegister(text)!
  assert.deepEqual(back.perma[0], rich)
  const relabelled = addOrRelabel(back, { ...mint, label: 'renamed' }, T0 + 1).record
  assert.deepEqual(relabelled.tags, rich.tags)
  assert.deepEqual(relabelled.x, rich.x)
  assert.equal(relabelled.label, 'renamed')
})

test('an owner is an open name: the two known ones and agent:/person: forms', () => {
  const owners: AnchorOwner[] = ['user', 'claude', 'agent:oracle', 'person:djdarcy']
  const reg = emptyRegister(SESSION, 'w', T0)
  let out = reg
  for (const owner of owners) out = addOrRelabel(out, { ...mint, owner, uuid: `${owner.length.toString(16).padStart(8, '0')}-0000-4000-8000-000000000001` }, T0).register
  assert.deepEqual(out.perma.map(r => ownerOf(r)), owners)
  const back = parseRegister(serializeRegister(out))!
  assert.deepEqual(back.perma.map(r => ownerOf(r)), owners)
  // A record from before owners existed is read by who minted it.
  assert.equal(ownerOf({ by: 'user' }), 'user')
  assert.equal(ownerOf({ by: 'prose' }), 'claude')
})

test('title and project sit in the header, in the fixed order, and round-trip', () => {
  // The title is the person's words, kept verbatim (spaces and all; mutation sweep v0.5.6, M4).
  const reg: Register = { ...emptyRegister(SESSION, 'w', T0, { cwd: 'C:/code/claude-bookmarks' }), title: ' the record format ', project: 'claude-bookmarks' }
  const text = serializeRegister(reg)
  const keys = Object.keys(JSON.parse(text))
  assert.deepEqual(keys.slice(0, 7), ['version', 'sessionId', 'cwd', 'title', 'project', 'rev', 'updatedAt'])
  assert.deepEqual(parseRegister(text), reg)
  // Absent when unknown: a header with no title writes none.
  assert.ok(!serializeRegister(emptyRegister(SESSION, 'w', T0)).includes('"title"'))
})

test('tier is stored by name only, and an absent tier reads as bookmark', () => {
  const reg = emptyRegister(SESSION, 'w', T0)
  const perma = addOrRelabel(reg, { ...mint, tier: 'perma' }, T0).register
  assert.equal(JSON.parse(serializeRegister(perma)).perma[0].tier, 'perma')
  assert.equal(tierOf({ tier: undefined }), 'bookmark')
  const asMark = addOrRelabel(reg, { ...mint, tier: 'mark' }, T0).register
  assert.equal(tierOf(asMark.perma[0]!), 'mark')
  // No rank is ever written: the file holds the name, the continuum holds the order.
  assert.ok(!serializeRegister(perma).includes('"rank"'))
})

test('the export writes only names from FRONT_MATTER_PROPERTIES, and now n, tier, title, project and the writer', () => {
  const reg: Register = { ...emptyRegister(SESSION, 'w', T0), title: 'the record format', project: 'claude-bookmarks' }
  const rec = { ...addOrRelabel(reg, { ...mint, tier: 'perma' }, T0).record, tags: ['a/b', 'c'] }
  const md = exportMarkdown(rec, 'the message text', { minted: 'by test', writer: 'bookmarks 0.5.6', title: reg.title, project: reg.project })
  const fm = parseFrontMatter(md)
  for (const k of Object.keys(fm)) assert.ok((FRONT_MATTER_PROPERTIES as readonly string[]).includes(k), `${k} is not a reserved front-matter property`)
  assert.equal(fm.n, '1')
  assert.equal(fm.tier, 'perma')
  assert.equal(fm.tags, 'a/b, c')
  assert.equal(fm.title, 'the record format')
  assert.equal(fm.project, 'claude-bookmarks')
  assert.equal(fm['bm-writer'], 'bookmarks 0.5.6')
  // Without them, the lines are not written at all (no empty properties), and an empty string is no property either (M8).
  const bare = exportMarkdown({ ...addOrRelabel(emptyRegister(SESSION, 'w', T0), mint, T0).record, why: '' }, 'text', { title: '' })
  assert.ok(!bare.includes('\ntitle:') && !bare.includes('\ntags:') && !bare.includes('\nbm-writer:') && !bare.includes('\nwhy:'), bare)
})
