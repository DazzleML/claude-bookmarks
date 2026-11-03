// node --test tests/core/bundles.test.ts
// Bundles (the bundles design, 2026-10-30__23-47-01, unit 2): a set of links kept once in the
// lists file, shown by items in any list, each item choosing its own face; the face-first copy in
// every pointing item kept current; an item with two or more links becomes a bundle when touched;
// a plain item is left exactly as it was.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyListOp, emptyLists, LISTS_VERSION, parseLists, serializeLists, type ListsFile, type Op } from '../../plugin/hooks/core/lists/lists.ts'
import { linkKey, type ItemLink } from '../../plugin/hooks/core/lists/item-links.ts'

const ISSUE: ItemLink = { kind: 'issue', repo: 'DazzleML/claude-bookmarks', n: 45 }
const DWP: ItemLink = { kind: 'file', path: 'C:/code/x/private/claude/2026-10-30__23-47-01__dwp.md' }
const NOTE: ItemLink = { kind: 'file', path: 'C:/code/x/private/claude/notes/ideas/bundles.md' }
const PLACE: ItemLink = { kind: 'place', session: '8f0f9b27-33fc-4054-806a-22a6d569dfb5', uuid: 'f1c069db-67bc-42e3-b6d6-cf200b57d957' }

function step(f: ListsFile, op: Op, at = 10): ListsFile {
  const r = applyListOp(f, op, at)
  if (!r.ok) throw new Error(r.error)
  return r.file
}
/** A file with two lists, "Work" and "Board", the first holding one item with three links. */
function twoLists(links: ItemLink[] = [ISSUE, DWP, NOTE]): ListsFile {
  let f = emptyLists('p', 'C:/p', 'test', 1)
  f = step(f, { op: 'create', name: 'Work', owner: 'user' })
  f = step(f, { op: 'create', name: 'Board', owner: 'user' })
  return step(f, { op: 'add', list: 'work', item: { label: 'bundles', by: 'user', links } })
}
const item = (f: ListsFile, list: string, n = 0) => f.lists.find(l => l.id === list)!.items[n]!

test('an item added with two or more links is a bundle, its face its first link, its links kept in the bundle', () => {
  const f = twoLists()
  const i = item(f, 'work')
  assert.ok(i.bundle, 'the item points at a bundle')
  const b = f.bundles!.find(x => x.id === i.bundle)!
  assert.deepEqual(b.links, [ISSUE, DWP, NOTE])
  assert.equal(i.face, linkKey(ISSUE))
  assert.deepEqual(i.links, [ISSUE, DWP, NOTE], 'the face-first copy, for every press and every older build')
})

test('a plain item -- one link, or none -- is left exactly as it was', () => {
  let f = emptyLists('p', 'C:/p', 'test', 1)
  f = step(f, { op: 'create', name: 'Work', owner: 'user' })
  f = step(f, { op: 'add', list: 'work', item: { label: 'a file', by: 'user', links: [DWP] } })
  f = step(f, { op: 'add', list: 'work', item: { label: 'a note', by: 'user', links: [] } })
  assert.deepEqual(item(f, 'work', 0), { label: 'a file', by: 'user', links: [DWP], id: 'i1', addedAt: 10 })
  assert.deepEqual(item(f, 'work', 1), { label: 'a note', by: 'user', links: [], id: 'i2', addedAt: 10 })
  assert.equal(f.bundles ?? undefined, undefined, 'no bundles collection appears until a bundle exists')
})

test('a plain item given its second link becomes a bundle', () => {
  let f = emptyLists('p', 'C:/p', 'test', 1)
  f = step(f, { op: 'create', name: 'Work', owner: 'user' })
  f = step(f, { op: 'add', list: 'work', item: { label: 'a file', by: 'user', links: [DWP] } })
  f = step(f, { op: 'edit', list: 'work', item: 'i1', links: [DWP, ISSUE] })
  const i = item(f, 'work')
  assert.ok(i.bundle)
  assert.equal(i.face, linkKey(DWP))
  assert.deepEqual(f.bundles!.find(b => b.id === i.bundle)!.links, [DWP, ISSUE])
})

test('one bundle in two lists, a different face in each; a link added to the bundle reaches both', () => {
  let f = twoLists()
  const b = item(f, 'work').bundle!
  f = step(f, { op: 'attach', list: 'board', bundle: b, face: linkKey(DWP) })
  const board = item(f, 'board')
  assert.equal(board.bundle, b)
  assert.equal(board.label, 'bundles', "the item takes the bundle's label")
  assert.deepEqual(board.links, [DWP, ISSUE, NOTE], 'the DWP leads on the board')
  assert.deepEqual(item(f, 'work').links, [ISSUE, DWP, NOTE], 'the issue still leads on Work')
  f = step(f, { op: 'bundle-link', bundle: b, links: [PLACE, DWP] })
  assert.deepEqual(f.bundles!.find(x => x.id === b)!.links, [ISSUE, DWP, NOTE, PLACE], 'a link already there is not added twice')
  assert.deepEqual(item(f, 'work').links, [ISSUE, DWP, NOTE, PLACE])
  assert.deepEqual(item(f, 'board').links, [DWP, ISSUE, NOTE, PLACE])
})

test("face: an item's face is chosen by a link's identity; a face that leaves the bundle falls back to its first link", () => {
  let f = twoLists()
  f = step(f, { op: 'face', list: 'work', item: 'i1', face: linkKey(NOTE) })
  assert.deepEqual(item(f, 'work').links, [NOTE, ISSUE, DWP])
  const r = applyListOp(f, { op: 'face', list: 'work', item: 'i1', face: linkKey(PLACE) }, 10)
  assert.ok(!r.ok && /not one of/.test(r.error), 'a face must be one of the bundle\'s links')
  f = step(f, { op: 'bundle-unlink', bundle: item(f, 'work').bundle!, link: linkKey(NOTE) })
  assert.equal(item(f, 'work').face, linkKey(ISSUE))
  assert.deepEqual(item(f, 'work').links, [ISSUE, DWP])
})

test('the link and unlink a person already uses work on a bundled item: they change its bundle', () => {
  let f = twoLists()
  const b = item(f, 'work').bundle!
  f = step(f, { op: 'attach', list: 'board', bundle: b })
  // The tool's `link` sends the item's links plus the new one; `unlink` sends them less one.
  f = step(f, { op: 'edit', list: 'work', item: 'i1', links: [...item(f, 'work').links!, PLACE] })
  assert.deepEqual(item(f, 'board').links, [ISSUE, DWP, NOTE, PLACE], 'reached the other list')
  f = step(f, { op: 'edit', list: 'board', item: 'i1', links: item(f, 'board').links!.filter(l => l !== DWP && linkKey(l) !== linkKey(DWP)) })
  assert.deepEqual(f.bundles!.find(x => x.id === b)!.links, [ISSUE, NOTE, PLACE])
  assert.deepEqual(item(f, 'work').links, [ISSUE, NOTE, PLACE])
})

test('removing an item never removes its bundle', () => {
  let f = twoLists()
  const b = item(f, 'work').bundle!
  f = step(f, { op: 'remove', list: 'work', item: 'i1' })
  assert.ok(f.bundles!.some(x => x.id === b))
  f = step(f, { op: 'attach', list: 'board', bundle: b })
  assert.deepEqual(item(f, 'board').links, [ISSUE, DWP, NOTE], 'and it can be shown again')
})

test('bundle: an item with links made into a bundle by hand; a second time says so', () => {
  let f = emptyLists('p', 'C:/p', 'test', 1)
  f = step(f, { op: 'create', name: 'Work', owner: 'user' })
  f = step(f, { op: 'add', list: 'work', item: { label: 'a file', by: 'user', links: [DWP] } })
  f = step(f, { op: 'bundle', list: 'work', item: 'i1' })
  assert.ok(item(f, 'work').bundle)
  const again = applyListOp(f, { op: 'bundle', list: 'work', item: 'i1' }, 10)
  assert.ok(!again.ok && /already/.test(again.error))
})

// An item's own links beside its bundle (0.8.x unit 5b; the bundles design's 00:32 addendum).
/** A plain item with three links, as the items made before bundles are (no `bundle` field). */
function legacy(links: ItemLink[] = [ISSUE, DWP, NOTE]): ListsFile {
  let f = emptyLists('p', 'C:/p', 'test', 1)
  f = step(f, { op: 'create', name: 'Work', owner: 'user' })
  f = step(f, { op: 'create', name: 'Board', owner: 'user' })
  return { ...f, lists: f.lists.map(l => (l.id === 'work' ? { ...l, next: 2, items: [{ id: 'i1', label: 'csb groups sessions', by: 'claude', addedAt: 1, links }] } : l)) }
}
const bundleOf = (f: ListsFile, i: { bundle?: string }) => f.bundles!.find(b => b.id === i.bundle)!

test('bundle with own: the named links stay the item\'s own beside the bundle; every link still shows, the face first', () => {
  const f = step(legacy(), { op: 'bundle', list: 'work', item: 'i1', own: [linkKey(NOTE)] })
  const i = item(f, 'work')
  assert.deepEqual(bundleOf(f, i).links, [ISSUE, DWP])
  assert.deepEqual(i.own, [NOTE])
  assert.deepEqual(i.links, [ISSUE, DWP, NOTE], 'a reader that knows nothing of own still sees every link')
  assert.equal(i.face, linkKey(ISSUE))
  // When the item's first link is the one kept as its own, the face is still the bundle's first link.
  const g = item(step(legacy(), { op: 'bundle', list: 'work', item: 'i1', own: [linkKey(ISSUE)] }), 'work')
  assert.equal(g.face, linkKey(DWP))
  assert.deepEqual(g.links, [DWP, NOTE, ISSUE], 'the face, the rest of the bundle, then the own link')
})

test("an item's own links survive another operation, a save and a load", () => {
  let f = step(legacy(), { op: 'bundle', list: 'work', item: 'i1', own: [linkKey(NOTE)] })
  f = step(f, { op: 'done', list: 'work', item: 'i1' })
  const back = parseLists(serializeLists(f))
  assert.equal(back.kind, 'ok')
  if (back.kind !== 'ok') return
  assert.deepEqual(item(back.file, 'work').own, [NOTE])
  assert.deepEqual(item(back.file, 'work').links, [ISSUE, DWP, NOTE])
})

test("a link added to a bundled item joins the bundle; with into: 'item' it stays the item's own", () => {
  const base = step(legacy(), { op: 'bundle', list: 'work', item: 'i1' })
  const toBundle = step(base, { op: 'edit', list: 'work', item: 'i1', links: [...item(base, 'work').links!, PLACE] })
  assert.deepEqual(bundleOf(toBundle, item(toBundle, 'work')).links, [ISSUE, DWP, NOTE, PLACE])
  assert.equal(item(toBundle, 'work').own, undefined)
  const toItem = step(base, { op: 'edit', list: 'work', item: 'i1', links: [...item(base, 'work').links!, PLACE], into: 'item' })
  assert.deepEqual(bundleOf(toItem, item(toItem, 'work')).links, [ISSUE, DWP, NOTE], 'the bundle is unchanged')
  assert.deepEqual(item(toItem, 'work').own, [PLACE])
  assert.deepEqual(item(toItem, 'work').links, [ISSUE, DWP, NOTE, PLACE])
})

test("an attach carries the bundle and never another list's own links; a face may be an own link", () => {
  let f = step(legacy(), { op: 'bundle', list: 'work', item: 'i1', own: [linkKey(NOTE)] })
  f = step(f, { op: 'attach', list: 'board', bundle: item(f, 'work').bundle! })
  assert.deepEqual(item(f, 'board').links, [ISSUE, DWP])
  assert.equal(item(f, 'board').own, undefined)
  f = step(f, { op: 'face', list: 'work', item: 'i1', face: linkKey(NOTE) })
  assert.deepEqual(item(f, 'work').links, [NOTE, ISSUE, DWP], 'the own link leads in its own list')
  assert.deepEqual(item(f, 'board').links, [ISSUE, DWP], 'and nowhere else')
})

test("unlink removes a link from wherever it is; an own link the bundle comes to hold is dropped from own", () => {
  const f = step(legacy(), { op: 'bundle', list: 'work', item: 'i1', own: [linkKey(NOTE)] })
  const unlinked = step(f, { op: 'edit', list: 'work', item: 'i1', links: [ISSUE, DWP] })
  assert.equal('own' in item(unlinked, 'work'), false, 'its last own link removed, the key goes')
  assert.deepEqual(bundleOf(unlinked, item(unlinked, 'work')).links, [ISSUE, DWP])
  const joined = step(f, { op: 'bundle-link', bundle: item(f, 'work').bundle!, links: [NOTE] })
  assert.equal('own' in item(joined, 'work'), false)
  assert.deepEqual(item(joined, 'work').links, [ISSUE, DWP, NOTE], 'nothing doubles')
})

test('bundle on an item already a bundle moves the named links out to its own; it refuses to empty a bundle or name a link the item lacks', () => {
  let f = twoLists()
  f = step(f, { op: 'attach', list: 'board', bundle: item(f, 'work').bundle! })
  f = step(f, { op: 'bundle', list: 'work', item: 'i1', own: [linkKey(DWP)] })
  assert.deepEqual(bundleOf(f, item(f, 'work')).links, [ISSUE, NOTE])
  assert.deepEqual(item(f, 'work').own, [DWP])
  assert.deepEqual(item(f, 'board').links, [ISSUE, NOTE], 'gone from the bundle everywhere it is shown')
  const all = applyListOp(legacy(), { op: 'bundle', list: 'work', item: 'i1', own: [ISSUE, DWP, NOTE].map(linkKey) }, 10)
  assert.ok(!all.ok && /at least one link/.test(all.error))
  const emptied = applyListOp(f, { op: 'bundle', list: 'work', item: 'i1', own: [ISSUE, NOTE].map(linkKey) }, 10)
  assert.ok(!emptied.ok && /at least one link/.test(emptied.error), 'nor on an item already a bundle')
  const stranger = applyListOp(legacy(), { op: 'bundle', list: 'work', item: 'i1', own: [linkKey(PLACE)] }, 10)
  assert.ok(!stranger.ok && /not one of its links/.test(stranger.error))
})

test("today's reader keeps the bundles and the items' fields across a save and a load", () => {
  let f = twoLists()
  f = step(f, { op: 'attach', list: 'board', bundle: item(f, 'work').bundle!, face: linkKey(NOTE) })
  const back = parseLists(serializeLists(f))
  assert.equal(back.kind, 'ok')
  if (back.kind !== 'ok') return
  assert.deepEqual(back.file.bundles, f.bundles)
  assert.deepEqual(item(back.file, 'board'), item(f, 'board'))
  assert.equal(back.file.version, LISTS_VERSION, 'no version move within this build (at format 3 the handler splits the bundles out before the file is written; the reader itself keeps them)')
})
