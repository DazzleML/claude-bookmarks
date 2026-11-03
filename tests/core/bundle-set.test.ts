// A project's bundle set and references into it (0.8.x unit 4): a cross-project reference resolves
// through a fixture registry; a missing project or bundle is dangling, not an error; a bundle Claude
// made, attached to the person's list, keeps its owner (djdarcy, 18:02).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attachRef, formatBundleRef, ownerless, parseBundleRef, putEntry, refOf, resolveBundle, type SetLookup } from '../../plugin/hooks/core/lists/bundle-set.ts'
import { toFormat3, type BundleIndex } from '../../plugin/hooks/core/lists/format3.ts'
import type { ListItem, ListsFile } from '../../plugin/hooks/core/lists/lists.ts'
import type { Bundle } from '../../plugin/hooks/core/lists/bundles.ts'

const CB = 'k7mq2xab', RK = 'r4b8ztab'
const link = (u: string) => ({ kind: 'url', url: u }) as never
const bundle = (id: string, by: Bundle['by'], label = id): Bundle => ({ id, label, links: [link(`https://example.com/${id}`)], by, createdAt: 1, updatedAt: 2 })
const set = (...b: Bundle[]): BundleIndex => ({ version: 1, bundles: b.map(x => ({ ...x, rev: 1 })) })
const SETS: Record<string, BundleIndex> = { [CB]: set(bundle('b1', 'claude', 'epic 14'), bundle('b2', 'user')), [RK]: set(bundle('r1', 'user')) }
const lookup: SetLookup = id => SETS[id] ?? (id === 'qqqqqqqq' ? undefined : 'unregistered')
const item = (over: Partial<ListItem> = {}): ListItem => ({ id: 'i1', label: 'x', by: 'user', addedAt: 1, ...over })

test('the reference grammar: bm:bundle/<project-id>/<bundle-id>, both ways', () => {
  assert.deepEqual(parseBundleRef(`bm:bundle/${CB}/b1`), { project: CB, bundle: 'b1' })
  assert.equal(formatBundleRef({ project: CB, bundle: 'b1' }), `bm:bundle/${CB}/b1`)
  assert.equal(parseBundleRef('bm:bundle/claude-bookmarks/b1'), undefined) // a name is never a reference
  assert.equal(parseBundleRef(`bm:${CB}/b1`), undefined)
  assert.throws(() => formatBundleRef({ project: 'claude-bookmarks', bundle: 'b1' }))
})

test("an item in one project showing another project's bundle resolves through the registry", () => {
  const shown = refOf(item({ bundle: 'b1', bundleProject: CB }), RK)!
  const r = resolveBundle(shown, RK, lookup)
  assert.equal(r.kind, 'found')
  assert.equal(r.kind === 'found' && r.entry.label, 'epic 14')
  assert.equal(r.kind === 'found' && r.crossProject, true)
})

test("an item without a project names its own project's set", () => {
  const r = resolveBundle(refOf(item({ bundle: 'r1' }), RK)!, RK, lookup)
  assert.equal(r.kind === 'found' && r.project, RK)
  assert.equal(r.kind === 'found' && r.crossProject, false)
  assert.equal(refOf(item(), RK), undefined)
})

test('a missing project, a project with no set, or a missing bundle is dangling, not an error', () => {
  assert.deepEqual(resolveBundle({ project: 'zzzzzzzz', bundle: 'b1' }, RK, lookup), { kind: 'dangling', ref: { project: 'zzzzzzzz', bundle: 'b1' }, why: 'no such project' })
  assert.equal((resolveBundle({ project: 'qqqqqqqq', bundle: 'b1' }, RK, lookup) as { why: string }).why, 'no set')
  assert.equal((resolveBundle({ project: CB, bundle: 'b9' }, RK, lookup) as { why: string }).why, 'no such bundle')
})

test("a bundle Claude made, attached to the person's list, keeps its owner", () => {
  const mine = item({ by: 'user' })
  const attached = attachRef(mine, { project: CB, bundle: 'b1' }, RK)
  assert.deepEqual([attached.bundle, attached.bundleProject, attached.by], ['b1', CB, 'user'])
  const r = resolveBundle(refOf(attached, RK)!, RK, lookup)
  assert.equal(r.kind === 'found' && r.owner, 'claude')
  assert.equal(SETS[CB]!.bundles[0]!.by, 'claude') // the set itself is untouched
})

test("attaching within the list's own project carries no project id, and drops a stale one", () => {
  const a = attachRef(item({ bundle: 'b1', bundleProject: CB }), { project: RK, bundle: 'r1' }, RK)
  assert.deepEqual([a.bundle, 'bundleProject' in a], ['r1', false])
})

test("putting a bundle in the set: new at rev 1, replaced at the next rev, its file kept", () => {
  let s = putEntry(set(), bundle('b1', 'claude'))
  assert.deepEqual(s.bundles.map(e => [e.id, e.rev, e.file]), [['b1', 1, undefined]])
  s = putEntry(s, { ...bundle('b1', 'claude'), label: 'renamed' }, '2026-11-02__epic-14.md')
  s = putEntry(s, { ...bundle('b1', 'claude'), label: 'again' })
  assert.deepEqual(s.bundles.map(e => [e.id, e.rev, e.file, e.label]), [['b1', 3, '2026-11-02__epic-14.md', 'again']])
  assert.equal(putEntry(s, bundle('b2', 'user')).bundles.length, 2)
})

test('every bundle in a set made by the format-3 step carries an owner; an entry without one is reported', () => {
  const f: ListsFile = { version: 2, writer: 't', project: 'demo', cwd: 'C:/demo', updatedAt: 1, lists: [], removed: [], bundles: [bundle('b1', 'claude'), bundle('b2', 'user')] }
  assert.deepEqual(ownerless(toFormat3(f).index), [])
  assert.deepEqual(ownerless({ version: 1, bundles: [{ ...bundle('b3', 'user'), by: undefined as never, rev: 1 }] }), ['b3'])
})
