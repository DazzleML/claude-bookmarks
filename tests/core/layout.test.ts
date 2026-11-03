// Where a working folder's data lives in the format-3 layout (0.8.x unit 5, the pure part).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutFor, pathsIn } from '../../plugin/hooks/core/lists/layout.ts'
import { fnv1a64 } from '../../plugin/hooks/core/bookmarks/migrations.ts'
import type { Placement } from '../../plugin/hooks/core/projects/placement.ts'

const ROOT = 'C:/Users/Extreme/claude'
const CB: Placement = { version: 1, id: 'k7mq2xab', root: 'C:/code/claude-projects/claude-bookmarks', members: [], linked: false, n: 1, updated_at: '2026-11-02T22:00:00Z' }
const base = { dataRoot: ROOT, user: 'Extreme', placements: [CB], names: new Map([['k7mq2xab', 'claude-bookmarks']]), hash: fnv1a64 }

test("a folder under a registered root finds its project's data folder by the id in its name", () => {
  const r = layoutFor({ ...base, cwdReal: 'C:/code/claude-projects/claude-bookmarks', folders: ['other__zzzzzzzz__Extreme', 'renamed-it__k7mq2xab__Extreme'] })
  assert.equal(r.kind, 'found')
  assert.deepEqual(r.kind === 'found' && r.layout, pathsIn(ROOT, 'renamed-it__k7mq2xab__Extreme', '_root', 'k7mq2xab'))
  assert.equal(r.kind === 'found' && r.layout.listsPath, `${ROOT}/bookmarks/projects/renamed-it__k7mq2xab__Extreme/lists/_root/lists.json`)
})

test("a registered project with no data folder yet is named from the registry, and a subfolder gets its own lists folder", () => {
  const r = layoutFor({ ...base, cwdReal: 'C:/code/claude-projects/claude-bookmarks/private/claude', folders: [] })
  assert.equal(r.kind, 'new-folder')
  assert.equal(r.kind === 'new-folder' && r.layout.folder, 'claude-bookmarks__k7mq2xab__Extreme')
  assert.equal(r.kind === 'new-folder' && r.layout.listsFolder, 'private--claude')
  assert.equal(r.kind === 'new-folder' && r.layout.indexPath, `${ROOT}/bookmarks/projects/claude-bookmarks__k7mq2xab__Extreme/bundles/index.json`)
})

// The session home (0.8.15; the 14:50 ruling): a session that says it works on a project resolves
// to that project's root lists from any folder; an id with no placement here changes nothing.
test('a session with a home resolves to that project\'s root lists from any folder; an unknown home falls back', () => {
  const folders = ['claude-bookmarks__k7mq2xab__Extreme']
  const away = layoutFor({ ...base, cwdReal: 'C:/code/claude-projects/dazzle-claude-plugins', folders, homeId: 'k7mq2xab' })
  assert.equal(away.kind, 'found')
  assert.equal(away.kind !== 'own' && away.layout.listsPath, `${ROOT}/bookmarks/projects/claude-bookmarks__k7mq2xab__Extreme/lists/_root/lists.json`)
  // From inside the project's own subfolder too, the home is the root's lists.
  const inside = layoutFor({ ...base, cwdReal: 'C:/code/claude-projects/claude-bookmarks/private/claude', folders, homeId: 'k7mq2xab' })
  assert.ok(inside.kind !== 'own' && inside.layout.listsPath.endsWith('/lists/_root/lists.json'))
  // Cleared, or naming a project this machine does not have: containment decides, as before.
  assert.equal(layoutFor({ ...base, cwdReal: 'C:/code/claude-projects/dazzle-claude-plugins', folders }).kind, 'own')
  assert.equal(layoutFor({ ...base, cwdReal: 'C:/code/claude-projects/dazzle-claude-plugins', folders, homeId: 'qqqqqqqq' }).kind, 'own')
})

test('a version 2 flat file splits into lists.json v3 and the index; anything else is left as it is', async () => {
  const { emptyLists, serializeLists } = await import('../../plugin/hooks/core/lists/lists.ts')
  const { splitFlatFile } = await import('../../plugin/hooks/core/lists/layout.ts')
  // A flat file is version 2 whatever this build's version is.
  const f = { ...emptyLists('demo', 'C:/demo', 't', 1), version: 2, bundles: [{ id: 'b1', label: 'x', links: [], by: 'claude', createdAt: 1, updatedAt: 1 }] }
  const r = splitFlatFile(serializeLists(f as never))
  assert.equal(r.kind, 'split')
  if (r.kind !== 'split') return
  assert.equal(JSON.parse(r.lists).version, 3)
  assert.equal('bundles' in JSON.parse(r.lists), false)
  assert.deepEqual(JSON.parse(r.index).bundles.map((b: { id: string }) => b.id), ['b1'])
  assert.equal(r.bundles, 1)
  assert.equal(splitFlatFile('{not json').kind, 'not-v2')
  assert.equal(splitFlatFile(r.lists).kind, 'not-v2')
})

test('the link state: ok, broken, removed, points elsewhere, not a folder', async () => {
  const { linkState } = await import('../../plugin/hooks/core/lists/layout.ts')
  const T = 'C:/code/claude-projects/claude-bookmarks/private/claude/bookmarks'
  assert.equal(linkState({ stat: { kind: 'dir', isLink: true, realPath: 'c:\\code\\claude-projects\\claude-bookmarks\\private\\claude\\bookmarks\\' } }, T), 'ok')
  assert.equal(linkState({ listed: { isLink: true } }, T), 'broken')
  assert.equal(linkState({}, T), 'removed')
  assert.equal(linkState({ stat: { kind: 'other', isLink: true } }, T), 'broken')
  assert.equal(linkState({ stat: { kind: 'dir', isLink: true, realPath: 'D:/elsewhere' } }, T), 'elsewhere')
  assert.equal(linkState({ stat: { kind: 'file' } }, T), 'not a folder')
  assert.equal(linkState({ stat: { kind: 'dir' } }), 'ok')
})

test("an unregistered folder's own project folder is the candidate that records it; two of one name stay apart", async () => {
  const { ownFolderFor } = await import('../../plugin/hooks/core/lists/layout.ts')
  const c = [
    { folder: 'issues__aaaaaaaa__Extreme', recordedCwd: 'C:/code/ck3-save-migrator/private/claude/issues' },
    { folder: 'issues__bbbbbbbb__Extreme', recordedCwd: 'C:/code/other/issues' },
    { folder: 'issues__cccccccc__Extreme' },
  ]
  assert.equal(ownFolderFor(c, 'c:\\code\\other\\issues\\'), 'issues__bbbbbbbb__Extreme')
  assert.equal(ownFolderFor(c, 'C:/code/third/issues'), undefined)
})

test('the write verdict: a failure refuses and never creates; only an absent, unlinked folder is made', async () => {
  const { writeVerdict } = await import('../../plugin/hooks/core/lists/layout.ts')
  assert.deepEqual(writeVerdict('ok', 'ok', true), { write: true, create: false })
  assert.equal(writeVerdict('broken', 'ok', true).write, false)
  assert.equal(writeVerdict('removed', 'missing', true).create, false)
  assert.equal(writeVerdict('removed', 'ok', true).write, false) // the link's state refuses first, whatever the file says
  assert.equal(writeVerdict('ok', 'wrong id', true).write, false)
  assert.deepEqual(writeVerdict('removed', 'missing', false), { write: true, create: true })
  assert.equal(writeVerdict('ok', 'moved', false).write, false)
  assert.equal(writeVerdict('elsewhere', 'ok', false).create, false)
  assert.equal(writeVerdict('ok', 'missing', false).write, true)
})

test('a folder under no registered root is its own project; its candidate folders are offered by base name', () => {
  const r = layoutFor({ ...base, cwdReal: 'C:/code/ck3-save-migrator', folders: ['ck3-save-migrator__q4b8ztab__Extreme', 'claude-bookmarks__k7mq2xab__Extreme'] })
  assert.deepEqual(r, { kind: 'own', base: 'ck3-save-migrator', candidates: ['ck3-save-migrator__q4b8ztab__Extreme'] })
})
