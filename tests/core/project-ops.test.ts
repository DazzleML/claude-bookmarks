// The /bm-project operations (0.8.x unit 6b, 0.8.14): register adopts an own folder's id or mints one,
// and asks first for a wide root (a dry run; --yes registers); exclude and include change a
// project's scope; where lists every project with its ordinal and exclusions and warns about a
// linked cwd or a gone root; rename changes one field and leaves the folder's name. Pure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { excludePlan, includePlan, registerPlan, renamePlan, whereRows, whereText } from '../../plugin/hooks/core/projects/project-ops.ts'
import { newIdentity, parseIdentity, projectFileOf } from '../../plugin/hooks/core/projects/registry.ts'
import { parsePlacement, type Placement } from '../../plugin/hooks/core/projects/placement.ts'
import { parseProjectFile } from '../../plugin/hooks/core/projects/project-file.ts'
import { layoutFor } from '../../plugin/hooks/core/lists/layout.ts'
import { fnv1a64 } from '../../plugin/hooks/core/bookmarks/migrations.ts'

const ROOT = 'C:/Users/Extreme/claude'
const CB = 'C:/code/claude-projects/claude-bookmarks'
const NOW = '2026-11-03T12:00:00Z'
const REPO = { home: 'C:/Users/Extreme', hasGit: true, hasRepokit: false }
const base = { dataRoot: ROOT, machine: 'PLZWORK', user: 'Extreme', now: NOW, facts: REPO, placements: [] as Placement[], names: new Map<string, string>(), bytes: [1, 2, 3, 4, 5] }
/** claude-bookmarks' own project folder, as 0.8.8's live switch minted it. */
const OWN = { folder: 'claude-bookmarks__eqtp5tl4__Extreme', id: 'eqtp5tl4', projectFile: projectFileOf(newIdentity({ id: 'eqtp5tl4', name: 'claude-bookmarks', user: 'Extreme', now: '2026-11-03T04:45:42.840Z' })) }

test('registering a folder that has its own project folder adopts that folder\'s id: one identity, one placement, no second folder', () => {
  const r = registerPlan({ ...base, cwdReal: CB, own: OWN })
  assert.equal(r.kind, 'register')
  if (r.kind !== 'register') return
  assert.equal(r.id, 'eqtp5tl4')
  assert.equal(r.adopted, true)
  const identity = r.writes.find(w => w.path === `${ROOT}/projects/eqtp5tl4.json`)
  assert.ok(identity, 'the identity file is named by the adopted id')
  const parsed = parseIdentity(identity!.text)
  assert.equal(parsed.kind === 'ok' && parsed.value.created_at, '2026-11-03T04:45:42.840Z', 'the folder\'s creation is kept')
  const placement = parsePlacement(r.writes.find(w => w.path === `${ROOT}/projects/PLZWORK/Extreme/eqtp5tl4.json`)!.text)
  assert.ok(placement.kind === 'ok' && placement.value.n === 1 && placement.value.root === CB && !placement.value.linked)
  assert.equal(r.writes.length, 2, 'project.json already mirrors the identity, so it is not rewritten')
  // The layout now finds the same folder by id: no second one.
  const l = layoutFor({ dataRoot: ROOT, cwdReal: CB, user: 'Extreme', placements: [r.placement], names: new Map([['eqtp5tl4', 'claude-bookmarks']]), folders: [OWN.folder], hash: fnv1a64 })
  assert.equal(l.kind, 'found')
  assert.equal(l.kind === 'found' && l.layout.folder, OWN.folder)
})

test('registering with a new name renames the adopted identity and mirrors it into project.json', () => {
  const r = registerPlan({ ...base, cwdReal: CB, own: OWN, name: 'bookmarks' })
  assert.ok(r.kind === 'register')
  if (r.kind !== 'register') return
  assert.equal(r.identity.name, 'bookmarks')
  assert.equal(r.identity.id, 'eqtp5tl4')
  const pj = r.writes.find(w => w.path.endsWith(`${OWN.folder}/project.json`))
  assert.ok(pj && parseProjectFile(pj.text).kind === 'ok')
})

test('a folder with no project folder yet gets a minted id; a wide root asks first; a registered root says so', () => {
  const minted = registerPlan({ ...base, cwdReal: 'C:/code/ck3-save-migrator' })
  assert.ok(minted.kind === 'register' && !minted.adopted && /^[a-z2-7]{8}$/.test(minted.id))
  assert.equal(registerPlan({ ...base, cwdReal: 'C:/Users/Extreme' }).kind, 'confirm')
  assert.equal(registerPlan({ ...base, cwdReal: 'C:/tmp/plain', facts: { home: 'C:/Users/Extreme', hasGit: false, hasRepokit: false } }).kind, 'confirm')
  if (minted.kind !== 'register') return
  const again = registerPlan({ ...base, cwdReal: 'c:\\code\\ck3-save-migrator\\', placements: [minted.placement], names: new Map([[minted.id, 'ck3-save-migrator']]) })
  assert.deepEqual([again.kind, again.kind === 'already' && again.name], ['already', 'ck3-save-migrator'])
  // The next one takes the next ordinal.
  const second = registerPlan({ ...base, cwdReal: CB, own: OWN, placements: [minted.placement] })
  assert.equal(second.kind === 'register' && second.placement.n, 2)
})

// --- wide roots (0.8.14; the registry design's 13:41 addendum: no location is refused, and the
// scope changes over time) -------------------------------------------------------------------------

test('a wide root without --yes is a dry run: no writes, the reason, what would join and what stays its own', () => {
  const inner: Placement = { version: 1, id: 'q4b8ztab', root: 'C:/Users/Extreme/code/tool', members: [], exclude: [], linked: false, n: 1, updated_at: NOW }
  const r = registerPlan({
    ...base, cwdReal: 'C:/Users/Extreme', placements: [inner], names: new Map([['q4b8ztab', 'tool']]),
    ownBeneath: ['C:/Users/Extreme/notes', 'C:/elsewhere/x', 'C:/Users/Extreme'],
  })
  assert.equal(r.kind, 'confirm')
  if (r.kind !== 'confirm') return
  assert.equal(r.why, 'the home folder')
  assert.deepEqual(r.ownBeneath, ['C:/Users/Extreme/notes']) // the root itself and folders elsewhere are not beneath it
  assert.deepEqual(r.registeredBeneath, [{ n: 1, name: 'tool', root: 'C:/Users/Extreme/code/tool' }])
  assert.equal('writes' in r, false)
})

test('a wide root with --yes registers like any other folder; an unmarked folder too', () => {
  const home = registerPlan({ ...base, cwdReal: 'C:/Users/Extreme', yes: true })
  assert.equal(home.kind, 'register')
  assert.ok(home.kind === 'register' && home.writes.length === 2 && home.placement.exclude.length === 0)
  const plain = registerPlan({ ...base, cwdReal: 'C:/tmp/plain', facts: { home: 'C:/Users/Extreme', hasGit: false, hasRepokit: false }, yes: true })
  assert.equal(plain.kind, 'register')
})

test('exclude takes a folder out of its project and include puts it back; only the placement is written', () => {
  const p: Placement = { version: 1, id: 'homehome', root: 'C:/Users/Extreme', members: [], exclude: [], linked: false, n: 1, updated_at: NOW }
  const o = { dataRoot: ROOT, machine: 'PLZWORK', user: 'Extreme', now: '2026-11-03T13:00:00Z' }
  const ex = excludePlan({ ...o, placement: p, folderReal: 'C:\\Users\\Extreme\\Downloads\\' })
  assert.ok(!('error' in ex))
  if ('error' in ex) return
  assert.deepEqual(ex.placement.exclude, ['C:/Users/Extreme/Downloads'])
  assert.equal(ex.placement.updated_at, '2026-11-03T13:00:00Z')
  assert.deepEqual(ex.writes.map(w => w.path), [`${ROOT}/projects/PLZWORK/Extreme/homehome.json`])
  assert.deepEqual(parsePlacement(ex.writes[0]!.text).kind === 'ok' && (parsePlacement(ex.writes[0]!.text) as { value: Placement }).value.exclude, ['C:/Users/Extreme/Downloads'])
  assert.match((excludePlan({ ...o, placement: ex.placement, folderReal: 'c:/users/extreme/downloads' }) as { error: string }).error, /already excluded/)
  assert.match((excludePlan({ ...o, placement: p, folderReal: 'C:/Users/Extreme' }) as { error: string }).error, /root/)
  assert.match((excludePlan({ ...o, placement: p, folderReal: 'D:/other' }) as { error: string }).error, /not inside/)
  const inc = includePlan({ ...o, placement: ex.placement, folderReal: 'C:/Users/Extreme/Downloads' })
  assert.ok(!('error' in inc) && inc.placement.exclude.length === 0)
  assert.match((includePlan({ ...o, placement: p, folderReal: 'C:/Users/Extreme/Downloads' }) as { error: string }).error, /not excluded/)
})

test('where lists each exclusion, and says when an excluded folder\'s lists are still inside the project', () => {
  const p: Placement = { version: 1, id: 'homehome', root: 'C:/Users/Extreme', members: [], exclude: ['C:/Users/Extreme/Downloads', 'C:/Users/Extreme/tmp'], linked: false, n: 1, updated_at: NOW }
  const r = whereRows({ placements: [p], names: new Map([['homehome', 'home']]), folders: [], cwd: 'C:/Users/Extreme', cwdReal: 'C:/Users/Extreme', rootsMissing: new Set(), leftBehind: new Map([['homehome', ['c:/users/extreme/tmp']]]) })
  const text = whereText(r)
  assert.ok(text.includes('    excluded: C:/Users/Extreme/Downloads'))
  assert.ok(text.some(l => l.startsWith('    excluded: C:/Users/Extreme/tmp (its lists from before are still inside the project')))
})

test('where: every project by ordinal, this one marked; a linked cwd and a gone root are warned of', () => {
  const p1: Placement = { version: 1, id: 'eqtp5tl4', root: CB, members: [], linked: true, vault: CB, junction_point: 'private/claude/bookmarks', n: 1, updated_at: NOW }
  const p2: Placement = { version: 1, id: 'q4b8ztab', root: 'C:/code/ck3-save-migrator', members: [], linked: false, n: 2, updated_at: NOW }
  const r = whereRows({ placements: [p2, p1], names: new Map([['eqtp5tl4', 'claude-bookmarks']]), folders: [OWN.folder], cwd: 'C:/links/cb/private/claude', cwdReal: `${CB}/private/claude`, rootsMissing: new Set(['q4b8ztab']) })
  assert.deepEqual(r.rows.map(x => [x.n, x.name, x.here, x.folder ?? null]), [[1, 'claude-bookmarks', true, OWN.folder], [2, 'ck3-save-migrator', false, null]])
  assert.equal(r.rows[0]!.target, `${CB}/private/claude/bookmarks`)
  assert.equal(r.warnings.length, 2)
  assert.match(r.warnings[0]!, /reached through a link/)
  assert.match(r.warnings[1]!, /#2 .* is gone/)
  const text = whereText(r)
  assert.match(text[0]!, /^▸ #1 claude-bookmarks \(eqtp5tl4\)/)
  assert.ok(text.some(l => l.startsWith('! ')))
  // An unregistered folder is its own project.
  const none = whereText(whereRows({ placements: [], names: new Map(), folders: [], cwd: CB, cwdReal: CB, rootsMissing: new Set() }), { folder: OWN.folder })
  assert.deepEqual(none, ['No project is registered on this machine.', `This folder is its own project: ${OWN.folder}`])
})

test('rename: one field and its stamp, the id kept, project.json mirrored, the folder name left as it is', () => {
  const identity = newIdentity({ id: 'eqtp5tl4', name: 'claude-bookmarks', user: 'Extreme', now: '2026-11-03T04:45:42Z' })
  const r = renamePlan({ identity, name: 'bookmarks', now: NOW, dataRoot: ROOT, folder: OWN.folder })
  assert.ok(!('error' in r))
  if ('error' in r) return
  assert.deepEqual([r.identity.id, r.identity.name, r.identity.stamps.name], ['eqtp5tl4', 'bookmarks', NOW])
  assert.deepEqual(r.writes.map(w => w.path), [`${ROOT}/projects/eqtp5tl4.json`, `${ROOT}/bookmarks/projects/${OWN.folder}/project.json`])
  assert.ok('error' in renamePlan({ identity, name: '  ', now: NOW, dataRoot: ROOT }))
  assert.ok('error' in renamePlan({ identity, name: 'claude-bookmarks', now: NOW, dataRoot: ROOT }))
})
