// The project registry's core (0.8.x unit 1; the registry design, 2026-11-02__16-26-45, its 17:13
// and 17:50 addenda). The proof of concept's arms (tests/one-offs/thinking/poc-registry-binding/)
// are fixtures here: a rename finds the folder by id, a stub is not the project, each half rebuilds
// the other byte for byte, and with no project.json nothing can.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkFolder, foldersWithId, parseProjectFile, pickFolder, projectFolderName, serializeProjectFile, type ProjectFile,
} from '../../plugin/hooks/core/projects/project-file.ts'
import {
  listsFolderOf, membershipOf, nextOrdinal, normPath, parsePlacement, placementPath, serializePlacement, confirmReason, resolveFolderArg, type Placement,
} from '../../plugin/hooks/core/projects/placement.ts'
import {
  ID_PATTERN, identityOf, identityPath, importIdentity, lookupProject, mintId, newIdentity, parseIdentity, projectFileOf, reconcile, renamed,
  serializeIdentity, mergeEdges, withEdge, type Identity,
} from '../../plugin/hooks/core/projects/registry.ts'
import { fnv1a64 } from '../../plugin/hooks/core/bookmarks/migrations.ts'

const T0 = '2026-11-02T22:00:00Z', T1 = '2026-11-02T22:10:00Z', T2 = '2026-11-02T22:20:00Z'
const CB = newIdentity({ id: 'k7mq2xab', name: 'claude-bookmarks', user: 'Extreme', now: T0 })
const place = (id: string, root: string, n: number, members: string[] = []): Placement =>
  ({ version: 1, id, root, members, exclude: [], linked: false, n, updated_at: T0 })

// --- the id ---------------------------------------------------------------------------------

test('a minted id is 8 base32 characters, the same bytes the same id, five bytes needed', () => {
  const a = mintId([0, 0, 0, 0, 0]), b = mintId([255, 255, 255, 255, 255]), c = mintId([1, 2, 3, 4, 5])
  assert.equal(a, 'aaaaaaaa')
  assert.equal(b, '77777777')
  assert.match(c, ID_PATTERN)
  assert.equal(c, 'aebagbaf') // RFC 4648 base32 of 01 02 03 04 05 is AEBAGBAF: every one of the 40 bits is used
  assert.equal(mintId([1, 2, 3, 4, 5]), c)
  assert.notEqual(mintId([1, 2, 3, 4, 6]), c)
  assert.throws(() => mintId([1, 2, 3, 4]))
})

// --- membership -----------------------------------------------------------------------------

test('a folder under a registered root resolves to it, and the deepest root wins', () => {
  const outer = place('outer000', 'C:/code/umbrella-repo', 1)
  const inner = place('inner000', 'C:/code/umbrella-repo/packages/tool', 2)
  assert.equal(membershipOf('C:\\code\\umbrella-repo\\docs', [outer, inner])?.id, 'outer000')
  assert.equal(membershipOf('c:/CODE/umbrella-repo/packages/tool/src', [outer, inner])?.id, 'inner000')
  assert.equal(membershipOf('C:/code/umbrella-repo/packages/tool', [inner, outer])?.via, 'root')
})

test('a member folder outside the root belongs to the project; a lookalike prefix does not', () => {
  const p = place(CB.id, 'C:/code/claude-bookmarks', 1, ['C:/code/dazzle-claude-plugins'])
  assert.deepEqual(membershipOf('C:/code/dazzle-claude-plugins', [p]), { id: CB.id, root: 'C:/code/claude-bookmarks', via: 'member', base: 'C:/code/dazzle-claude-plugins' })
  assert.equal(membershipOf('C:/code/claude-bookmarks-old', [p]), undefined)
})

test('a folder under no registered root is its own project folder: no membership, nothing registered', () => {
  assert.equal(membershipOf('C:/elsewhere/scratch', [place(CB.id, 'C:/code/claude-bookmarks', 1)]), undefined)
})

// --- exclusions (0.8.14; the registry design's 13:41 and 15:03 addenda: the folder edge's ungrouped side) ---

test('an excluded folder, and everything beneath it, is no longer the project\'s: it is its own project folder', () => {
  const home = { ...place('homehome', 'C:/Users/Extreme', 1), exclude: ['C:/Users/Extreme/Downloads'] }
  assert.equal(membershipOf('C:/Users/Extreme/notes', [home])?.id, 'homehome')
  assert.equal(membershipOf('C:\\Users\\Extreme\\Downloads', [home]), undefined)
  assert.equal(membershipOf('c:/users/extreme/downloads/x/y', [home]), undefined)
  assert.equal(membershipOf('C:/Users/Extreme/DownloadsMore', [home])?.id, 'homehome') // a sibling with the same prefix is not excluded
})

test('a project registered beneath an excluded path is still itself; another project\'s exclusion cancels only its own claim', () => {
  const home = { ...place('homehome', 'C:/Users/Extreme', 1), exclude: ['C:/Users/Extreme/code'] }
  const inner = place('innerinn', 'C:/Users/Extreme/code/tool', 2)
  assert.equal(membershipOf('C:/Users/Extreme/code/tool/src', [home, inner])?.id, 'innerinn')
  assert.equal(membershipOf('C:/Users/Extreme/code/other', [home, inner]), undefined)
  const outer = { ...place('outerout', 'C:/x', 3), exclude: ['C:/x/y/z'] }
  const mid = place('midmidmi', 'C:/x/y', 4)
  assert.equal(membershipOf('C:/x/y/z/w', [outer, mid])?.id, 'midmidmi') // outer's exclusion is not mid's
})

test('an exclusion shallower than the claim it would cancel does not cancel it; removing the exclusion brings the folder back', () => {
  const p = { ...place('pppppppp', 'C:/a', 1, ['C:/a/b/c']), exclude: ['C:/a/b'] }
  assert.equal(membershipOf('C:/a/b/c/d', [p])?.via, 'member') // the member is deeper than the exclusion
  assert.equal(membershipOf('C:/a/b/x', [p]), undefined)
  assert.equal(membershipOf('C:/a/b/x', [{ ...p, exclude: [] }])?.id, 'pppppppp')
})

test('a folder named on the command line: relative to the working folder, with . and .. resolved', () => {
  assert.equal(resolveFolderArg('C:/code/x', '.'), 'C:/code/x')
  assert.equal(resolveFolderArg('C:/code/x', './scratch/'), 'C:/code/x/scratch')
  assert.equal(resolveFolderArg('C:/code/x/sub', '../other'), 'C:/code/x/other')
  assert.equal(resolveFolderArg('C:\\code\\x', 'a\\b'), 'C:/code/x/a/b')
  assert.equal(resolveFolderArg('C:/code/x', '"D:/elsewhere/y"'), 'D:/elsewhere/y')
  assert.equal(resolveFolderArg('/home/me/proj', '../../..'), '/')
})

test('a placement written before exclusions reads as excluding nothing, and writes the empty list', () => {
  const older = JSON.stringify({ version: 1, id: 'k7mq2xab', root: 'C:/code/x', members: [], linked: false, n: 1, updated_at: T0 })
  const r = parsePlacement(older)
  assert.equal(r.kind, 'ok')
  assert.deepEqual((r as { value: Placement }).value.exclude, [])
  assert.deepEqual(JSON.parse(serializePlacement((r as { value: Placement }).value)).exclude, [])
  assert.equal(parsePlacement(JSON.stringify({ ...JSON.parse(older), exclude: [1] })).kind, 'bad')
})

test("a working folder's lists folder: _root, the path below the root, or a member's base and hash", () => {
  assert.equal(listsFolderOf('C:/code/claude-bookmarks', 'C:\\code\\claude-bookmarks\\', fnv1a64), '_root')
  assert.equal(listsFolderOf('C:/code/claude-bookmarks', 'C:/code/claude-bookmarks/private/claude', fnv1a64), 'private--claude')
  assert.equal(listsFolderOf('c:/code/claude-bookmarks', 'C:/Code/claude-bookmarks/Private/Claude', fnv1a64), 'Private--Claude')
  const outside = listsFolderOf('C:/code/claude-bookmarks', 'C:/code/dazzle-claude-plugins', fnv1a64)
  assert.match(outside, /^dazzle-claude-plugins--[0-9a-f]{8}$/)
  assert.equal(outside, listsFolderOf('C:/code/claude-bookmarks', 'c:\\code\\DAZZLE-claude-plugins', fnv1a64).replace(/^DAZZLE/, 'dazzle'))
})

test('a wide root or an unmarked folder asks for a confirmation, with the reason: the home folder, a drive root, a folder with neither marker', () => {
  const home = 'C:/Users/Extreme'
  assert.equal(confirmReason('C:\\Users\\Extreme\\', { home, hasGit: true, hasRepokit: false }), 'the home folder')
  assert.equal(confirmReason('C:/', { home, hasGit: true, hasRepokit: false }), 'a drive root')
  assert.equal(confirmReason('C:/code', { home, hasGit: false, hasRepokit: false }), 'neither .git nor .repokit.json')
  assert.equal(confirmReason('C:/code/claude-bookmarks', { home, hasGit: true, hasRepokit: false }), undefined)
  assert.equal(confirmReason('C:/code/new-thing', { home, hasGit: false, hasRepokit: true }), undefined)
})

// --- the placement file and the ordinal -------------------------------------------------------

test('the ordinal is one past the highest given on this machine', () => {
  assert.equal(nextOrdinal([]), 1)
  assert.equal(nextOrdinal([{ n: 3 }, { n: 7 }, { n: 2 }]), 8)
})

test('a placement round-trips; a newer one is not read; a bad n is refused', () => {
  const p: Placement = { ...place(CB.id, 'C:/code/claude-bookmarks', 7), vault: 'C:/code/claude-bookmarks/private/claude', junction_point: 'private/claude/bookmarks', linked: true }
  const r = parsePlacement(serializePlacement(p))
  assert.equal(r.kind, 'ok')
  assert.deepEqual(r.kind === 'ok' && r.value, p)
  assert.equal(parsePlacement(serializePlacement({ ...p, version: 2 })).kind, 'newer')
  assert.equal(parsePlacement(serializePlacement({ ...p, n: 0 })).kind, 'bad')
  assert.equal(placementPath('C:/Users/Extreme/claude/projects/', 'plzwork', 'Extreme', CB.id), `C:/Users/Extreme/claude/projects/plzwork/Extreme/${CB.id}.json`)
})

// --- the folder, found by id (the proof's arm 1) ------------------------------------------------

test('after a rename the folder is found by the id in its name, whatever its concept part says', () => {
  const names = [projectFolderName('bookmarks-plugin', CB.id, 'Extreme'), 'claude-bookmarks__zzzzzzzz__Extreme', 'other__k7mq2xab-not', 'loose-folder']
  assert.deepEqual(foldersWithId(names, CB.id), ['bookmarks-plugin__k7mq2xab__Extreme'])
  assert.equal(projectFolderName('claude bookmarks!', CB.id, 'Extreme'), 'claude-bookmarks__k7mq2xab__Extreme')
})

test("a stub under the old name is not the project: it holds moved-to.json, not project.json", () => {
  const stub = { movedTo: JSON.stringify({ version: 1, moved_to: 'bookmarks-plugin__k7mq2xab__Extreme', id: CB.id }) }
  assert.deepEqual(checkFolder(stub, CB.id), { kind: 'moved', to: 'bookmarks-plugin__k7mq2xab__Extreme' })
  const live = { projectFile: serializeProjectFile(projectFileOf(renamed(CB, 'bookmarks-plugin', T1))) }
  const picked = pickFolder([{ name: 'claude-bookmarks__k7mq2xab__Extreme', contents: stub }, { name: 'bookmarks-plugin__k7mq2xab__Extreme', contents: live }], CB.id)
  assert.equal(picked.kind, 'found')
  assert.equal(picked.kind === 'found' && picked.name, 'bookmarks-plugin__k7mq2xab__Extreme')
  assert.deepEqual(pickFolder([{ name: 'claude-bookmarks__k7mq2xab__Extreme', contents: stub }], CB.id), { kind: 'none', moved: 'bookmarks-plugin__k7mq2xab__Extreme' })
})

test("a folder whose project.json names another id is the wrong folder; an empty one is missing", () => {
  const other = { projectFile: serializeProjectFile(projectFileOf(newIdentity({ id: 'zzzzzzzz', name: 'x', user: 'Extreme', now: T0 }))) }
  assert.deepEqual(checkFolder(other, CB.id), { kind: 'wrong id', found: 'zzzzzzzz' })
  assert.deepEqual(checkFolder({}, CB.id), { kind: 'missing' })
  assert.equal(checkFolder({ projectFile: '{not json' }, CB.id).kind, 'bad')
})

// --- the two halves rebuild each other (arms 2 and 3, and the control) --------------------------

test('a lost identity file is rebuilt from project.json byte for byte, and the reverse', () => {
  const identity = withEdge(CB, { id: 'dzlbdzlb', as: 'uses' }, T1)
  const idText = serializeIdentity(identity), pjText = serializeProjectFile(projectFileOf(identity))
  const pj = parseProjectFile(pjText)
  assert.equal(pj.kind, 'ok')
  assert.equal(serializeIdentity(identityOf((pj as { value: ProjectFile }).value)), idText)
  const id = parseIdentity(idText)
  assert.equal(id.kind, 'ok')
  assert.equal(serializeProjectFile(projectFileOf((id as { value: Identity }).value)), pjText)
  assert.equal(identityPath('C:/Users/Extreme/claude/projects', CB.id), `C:/Users/Extreme/claude/projects/${CB.id}.json`)
})

test('the control: with no project.json and no identity file, nothing can rebuild the project', () => {
  const picked = pickFolder([{ name: 'claude-bookmarks__k7mq2xab__Extreme', contents: {} }], CB.id)
  assert.deepEqual(picked, { kind: 'none' })
})

test('keys a later build wrote into the identity file are kept as they were', () => {
  const text = JSON.stringify({ ...JSON.parse(serializeIdentity(CB)), sessions: [{ id: 's1' }], position: 'full' }, null, 2) + '\n'
  const r = parseIdentity(text)
  assert.equal(r.kind, 'ok')
  assert.equal(serializeIdentity((r as { value: Identity }).value), text)
  assert.equal(parseIdentity(text.replace('"version": 1', '"version": 2')).kind, 'newer')
})

// --- reconcile: per-field stamps, mirror only when newer ------------------------------------------

test('a name edit and a relation added apart, one in each half, both survive', () => {
  const entry = renamed(CB, 'bookmarks-plugin', T1)
  const file = withEdge(projectFileOf(CB), { id: 'dzlbdzlb', as: 'uses' }, T2)
  const r = reconcile(entry, file)
  assert.equal(r.identity.name, 'bookmarks-plugin')
  assert.deepEqual(r.identity.projects, [{ id: 'dzlbdzlb', as: 'uses', since: T2 }])
  assert.deepEqual(r.identity.stamps, { name: T1 })
  assert.equal(r.writeIdentity, true)
  assert.equal(r.writeProjectFile, true)
  assert.equal(serializeProjectFile(r.projectFile), serializeProjectFile(projectFileOf(r.identity)))
})

// --- relations between projects (the registry design's 14:50 addendum; the umbrella consultation's
// prototype, tests/one-offs/thinking/discuss-edge-state-2026-11-03/) --------------------------------

test('two machines add different relations apart: after syncing both ways, both keep all of them', () => {
  const T3 = '2026-11-02T22:30:00Z', T4 = '2026-11-02T22:40:00Z'
  const plzwork = withEdge(withEdge(CB, { id: 'bbbbbbbb' }, T1), { id: 'cccccccc' }, T4)
  const badbox = withEdge(CB, { id: 'dddddddd' }, T3)
  const a = importIdentity([plzwork], badbox), b = importIdentity([badbox], plzwork)
  const ids = (r: typeof a) => (r.kind === 'same' ? (r.reconciled.projects ?? []).map(e => e.id).sort() : [])
  assert.deepEqual(ids(a), ['bbbbbbbb', 'cccccccc', 'dddddddd'])
  assert.deepEqual(ids(b), ids(a))
})

test('a removal is the ungrouped rank, and it beats an older copy that still holds the relation', () => {
  const kept = withEdge(CB, { id: 'bbbbbbbb' }, T1)
  const removed = withEdge(CB, { id: 'bbbbbbbb', state: -2 }, T2)
  assert.deepEqual(mergeEdges(kept.projects, removed.projects), [{ id: 'bbbbbbbb', state: -2, since: T2 }])
  assert.deepEqual(mergeEdges(removed.projects, kept.projects), [{ id: 'bbbbbbbb', state: -2, since: T2 }])
})

test('a relation survives a rename of either project, a rebuild from project.json, and the other project being deleted', () => {
  const a = withEdge(CB, { id: 'bbbbbbbb', as: 'uses' }, T1)
  assert.deepEqual(renamed(a, 'bookmarks-plugin', T2).projects, a.projects)
  assert.deepEqual(identityOf(projectFileOf(a)).projects, a.projects)
  assert.equal(lookupProject([a], 'bbbbbbbb'), 'unregistered') // B gone: the edge dangles, it is not lost
  assert.deepEqual(a.projects?.map(e => e.id), ['bbbbbbbb'])
})

test('a relation written under a key the build does not know is kept as it was, never read as a relation', () => {
  const text = JSON.stringify({ ...JSON.parse(serializeIdentity(CB)), related: [{ id: 'bbbbbbbb' }] }, null, 2) + '\n'
  const r = parseIdentity(text)
  assert.equal(r.kind, 'ok')
  const id = (r as { value: Identity }).value
  assert.equal(id.projects, undefined)
  assert.deepEqual(id.extra, { related: [{ id: 'bbbbbbbb' }] })
  assert.equal(projectFileOf(id).projects, undefined)
})

test('a relation added by hand with no since is kept and mirrored', () => {
  const hand: Identity = { ...CB, projects: [{ id: 'eeeeeeee' }] }
  const r = reconcile(hand, projectFileOf(CB))
  assert.deepEqual(r.identity.projects, [{ id: 'eeeeeeee' }])
  assert.equal(r.writeProjectFile, true)
})

test('a relation with a rank outside -2..2, or a direction other than 1 or -1, is refused', () => {
  const base = JSON.parse(serializeIdentity(CB))
  assert.equal(parseIdentity(JSON.stringify({ ...base, projects: [{ id: 'bbbbbbbb', state: 3 }] })).kind, 'bad')
  assert.equal(parseIdentity(JSON.stringify({ ...base, projects: [{ id: 'bbbbbbbb', dir: 0 }] })).kind, 'bad')
  assert.equal(parseIdentity(JSON.stringify({ ...base, projects: [{ id: 'bbbbbbbb', state: -1, dir: -1 }] })).kind, 'ok')
})

test('a project with no relations writes no projects key; an older file with the empty members reads and drops it', () => {
  assert.equal('projects' in JSON.parse(serializeIdentity(CB)), false)
  const older = JSON.stringify({ version: 1, id: CB.id, name: CB.name, user: 'Extreme', created_at: T0, members: [], stamps: { name: T0, members: T0 } }, null, 2) + '\n'
  const pj = parseProjectFile(older)
  assert.equal(pj.kind, 'ok')
  assert.equal(serializeProjectFile((pj as { value: ProjectFile }).value), serializeProjectFile(projectFileOf(CB)))
  const id = parseIdentity(older)
  assert.equal(id.kind, 'ok')
  assert.equal(serializeIdentity((id as { value: Identity }).value), serializeIdentity(CB)) // not kept as an extra key
})

test('the mirror is written only when the entry is newer: two equal halves write nothing', () => {
  const r = reconcile(CB, projectFileOf(CB))
  assert.equal(r.writeIdentity, false)
  assert.equal(r.writeProjectFile, false)
  const newerFile = reconcile(CB, renamed(projectFileOf(CB), 'renamed-in-the-folder', T1))
  assert.equal(newerFile.writeProjectFile, false)
  assert.equal(newerFile.writeIdentity, true)
})

test('a hand edit to the entry survives the entry being lost, after one load mirrored it', () => {
  const handEdited: Identity = { ...CB, name: 'edited-by-hand' } // a person changed the name, not its stamp
  const load = reconcile(handEdited, projectFileOf(CB))
  assert.equal(load.writeProjectFile, true) // the load mirrors the edit
  const rebuilt = identityOf(load.projectFile) // ... then the entry is deleted and rebuilt
  assert.equal(rebuilt.name, 'edited-by-hand')
})

test('reconcile refuses two halves of different projects', () => {
  assert.throws(() => reconcile(CB, projectFileOf(newIdentity({ id: 'zzzzzzzz', name: 'x', user: 'Extreme', now: T0 }))))
})

// --- import and lookup ---------------------------------------------------------------------------

test('an import: a new id is added; the same project is reconciled; a colliding id is refused and reported', () => {
  assert.equal(importIdentity([CB], newIdentity({ id: 'd9w3hcab', name: 'dazzlecmd', user: 'Extreme', now: T0 })).kind, 'new')
  const same = importIdentity([CB], renamed(CB, 'from-the-other-machine', T2))
  assert.equal(same.kind, 'same')
  assert.equal(same.kind === 'same' && same.reconciled.name, 'from-the-other-machine')
  const clash = importIdentity([CB], newIdentity({ id: CB.id, name: 'dazzlecmd', user: 'Extreme', now: T1 }))
  assert.equal(clash.kind, 'collision')
  assert.equal(clash.kind === 'collision' && clash.local.name, 'claude-bookmarks')
})

test('an id this machine does not know reads unregistered', () => {
  assert.equal(lookupProject([CB], 'qqqqqqqq'), 'unregistered')
  assert.equal(lookupProject([CB], CB.id), CB)
})

test('paths compare with one separator, no trailing one, in lower case', () => {
  assert.equal(normPath('C:\\Code\\\\X\\'), 'c:/code/x')
  assert.equal(normPath('/'), '/')
})
