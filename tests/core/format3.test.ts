// Lists format 3, the step (0.8.x unit 2): a version 2 file splits into lists.json v3 and its set's
// index, with an inverse, so no record can be lost; the step twice changes nothing; a version 2
// reader refuses a version 3 file rather than writing over it. Synthetic fixtures only: the real
// files' dry run is tests/one-offs/thinking/format3-dryrun/run.mjs, on copies outside the repo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLists, serializeLists, type ListsFile } from '../../plugin/hooks/core/lists/lists.ts'
import {
  BUNDLE_INDEX_VERSION, fromFormat3, LISTS_FORMAT3, ownProjectOf, parseBundleIndex, serializeBundleIndex, stepToFormat3, toFormat3,
} from '../../plugin/hooks/core/lists/format3.ts'

const link = (u: string) => ({ kind: 'url', url: u }) as never
const item = (id: string, label: string, bundle?: string) => ({ id, label, by: 'claude', addedAt: 1, ...(bundle ? { bundle } : {}) }) as never
const FILE: ListsFile = {
  version: 2, writer: 'bookmarks 0.8.1', project: 'demo', cwd: 'C:/work/demo', updatedAt: 9,
  lists: [
    { id: 'whats-left', name: "What's left", owner: 'user', createdAt: 1, updatedAt: 9, next: 4, items: [item('i1', 'epic 14', 'b1'), item('i2', 'plain'), item('i3', 'the registry', 'b2')] },
    { id: 'claude', name: "Claude's", owner: 'claude', createdAt: 2, updatedAt: 3, next: 2, items: [item('i1', 'epic 14 again', 'b1')] },
  ],
  removed: [{ id: 'old', name: 'Old', owner: 'user', createdAt: 1, updatedAt: 1, next: 2, items: [item('i1', 'gone', 'b2')], removedAt: 5 }],
  bundles: [
    { id: 'b1', label: 'epic 14', links: [link('https://example.com/1'), link('https://example.com/2')], by: 'claude', createdAt: 2, updatedAt: 4 },
    { id: 'b2', label: 'the registry', why: 'the 0.8 line', links: [link('https://example.com/3')], by: 'user', createdAt: 3, updatedAt: 8 },
  ],
}

test('the split: lists.json at version 3 holds no bundles; the index holds every one, in order, at rev 1', () => {
  const r = toFormat3(FILE)
  assert.equal(r.lists.version, LISTS_FORMAT3)
  assert.equal('bundles' in r.lists, false)
  assert.equal(r.index.version, BUNDLE_INDEX_VERSION)
  assert.deepEqual(r.index.bundles.map(b => [b.id, b.rev]), [['b1', 1], ['b2', 1]])
  assert.deepEqual(r.index.bundles.map(({ rev: _r, ...b }) => b), FILE.bundles)
  assert.deepEqual(r.dangling, [])
})

test('every item that shows a bundle names an id in its set, removed lists included', () => {
  const r = toFormat3(FILE)
  const ids = new Set(r.index.bundles.map(b => b.id))
  const named = [...r.lists.lists, ...r.lists.removed].flatMap(l => l.items).flatMap(i => (i.bundle ? [i.bundle] : []))
  assert.equal(named.length, 4)
  assert.ok(named.every(id => ids.has(id)))
})

test('the inverse gives back the file record for record, only the version moved', () => {
  const r = toFormat3(FILE)
  assert.deepEqual(fromFormat3(r.lists, r.index), { ...FILE, version: LISTS_FORMAT3 })
})

test('a file with no bundles splits to an empty index, and comes back with no bundles field', () => {
  const { bundles: _b, ...none } = FILE
  const bare: ListsFile = { ...none, lists: none.lists.map(l => ({ ...l, items: l.items.map(i => ({ ...i, bundle: undefined })) })), removed: [] }
  const r = toFormat3(bare)
  assert.deepEqual(r.index.bundles, [])
  assert.equal('bundles' in fromFormat3(r.lists, r.index), false)
})

test('an item naming a bundle the file did not hold is carried as it is and reported', () => {
  const broken: ListsFile = { ...FILE, bundles: FILE.bundles!.filter(b => b.id === 'b1') }
  const r = toFormat3(broken)
  assert.deepEqual(r.dangling, ['b2'])
  assert.equal(r.lists.lists[0]!.items[2]!.bundle, 'b2')
  // A bundle named only from a removed list counts too: a removed list can be brought back.
  const onlyRemoved: ListsFile = { ...FILE, removed: [{ ...FILE.removed[0]!, items: [item('i1', 'gone', 'b9')] }] }
  assert.deepEqual(toFormat3(onlyRemoved).dangling, ['b9'])
})

test('the step twice changes nothing; the split itself refuses a file already at version 3', () => {
  const once = stepToFormat3({ lists: FILE })
  const twice = stepToFormat3({ lists: once.lists, index: once.index })
  assert.deepEqual(twice.lists, once.lists)
  assert.deepEqual(twice.index, once.index)
  assert.throws(() => toFormat3(once.lists as ListsFile))
})

test('a version 2 reader refuses a version 3 lists file as newer, so it never writes over it', () => {
  const r = parseLists(serializeLists(toFormat3(FILE).lists as ListsFile))
  assert.deepEqual(r, { kind: 'newer', version: 3 })
})

test("a flat file under no registered root becomes its own project folder, its lists at _root", () => {
  const p = ownProjectOf(FILE, { id: 'k7mq2xab', user: 'Extreme', now: '2026-11-02T22:00:00Z' })
  assert.equal(p.folder, 'demo__k7mq2xab__Extreme')
  assert.equal(p.listsFolder, '_root')
  assert.deepEqual([p.projectFile.id, p.projectFile.name, p.projectFile.user], ['k7mq2xab', 'demo', 'Extreme'])
})

test("the set's index round-trips; a newer one is not read; a malformed one is refused", () => {
  const { index } = toFormat3(FILE)
  const back = parseBundleIndex(serializeBundleIndex(index))
  assert.equal(back.kind, 'ok')
  assert.deepEqual(back.kind === 'ok' && back.value, index)
  assert.equal(parseBundleIndex(serializeBundleIndex({ ...index, version: 2 })).kind, 'newer')
  assert.equal(parseBundleIndex('{"version":1,"bundles":[{"label":"no id","rev":1}]}').kind, 'bad')
  assert.equal(parseBundleIndex('{"version":1,"bundles":[{"id":"b1","label":"no rev"}]}').kind, 'bad')
})
