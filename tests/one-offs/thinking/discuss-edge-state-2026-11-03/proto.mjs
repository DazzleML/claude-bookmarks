// Round 2: the `projects` field as a reconciled field, prototyped on scratch copies of registry.ts and
// project-file.ts (./proto/). Variant A = one list-level stamp (the `name`/`members` pattern);
// variant B = union by edge id, each edge's `since` its stamp. Run: node tests/one-offs/thinking/discuss-edge-state-2026-11-03/proto.mjs
import { newIdentity, parseIdentity, serializeIdentity, identityOf, projectFileOf, reconcile, importIdentity, renamed, withMembers, withProjectsA, withEdgeB, lookupProject } from './proto/registry.ts'
import { parseProjectFile, serializeProjectFile } from './proto/project-file.ts'

const T = n => `2026-11-03T14:${String(n).padStart(2, '0')}:00Z`
const say = (k, v) => console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
const ids = i => (i.projects ?? []).map(e => `${e.id}${e.state !== undefined ? `@${e.state}` : ''}`)

const A0 = newIdentity({ id: 'aaaaaaaa', name: 'A', user: 'Extreme', now: T(0) })
const B0 = newIdentity({ id: 'bbbbbbbb', name: 'B', user: 'Extreme', now: T(0) })

for (const variant of ['A', 'B']) {
  console.log(`\n==================== variant ${variant} ====================`)
  const add = (p, id, now, state) => variant === 'A'
    ? withProjectsA(p, [...(p.projects ?? []).filter(e => e.id !== id), { id, ...(state !== undefined ? { state } : {}), since: now, by: 'user' }], now)
    : withEdgeB(p, { id, ...(state !== undefined ? { state } : {}), by: 'user' }, now)

  console.log('-- P2a on the field: rebuild, mirror, import')
  const A1 = add(A0, 'bbbbbbbb', T(1))
  say('A.projects', ids(A1))
  say('parse(serialize) round trip equal', serializeIdentity(parseIdentity(serializeIdentity(A1)).value) === serializeIdentity(A1))
  say('project.json parse(serialize) round trip equal', serializeProjectFile(parseProjectFile(serializeProjectFile(projectFileOf(A1))).value) === serializeProjectFile(projectFileOf(A1)))
  say('rebuilt from project.json keeps projects', ids(identityOf(projectFileOf(A1))))
  say('rebuilt byte-equal to the identity', serializeIdentity(identityOf(projectFileOf(A1))) === serializeIdentity(A1))
  const rec = reconcile(A1, projectFileOf(A1), variant)
  say('reconcile with its own mirror: writes nothing', [rec.writeIdentity, rec.writeProjectFile])
  const imp = importIdentity([A0], A1, variant)
  say('import onto a machine whose A has no projects', imp.kind === 'same' ? ids(imp.reconciled) : imp.kind)

  console.log('-- P2c on the field: a folder member and a project edge edited apart')
  const left = withMembers(A0, ['C:/code/newfolder'], T(2))               // the identity side
  const right = projectFileOf(add(A0, 'bbbbbbbb', T(1)))                   // the project.json side
  const rec2 = reconcile(left, right, variant)
  say('survivors: members / projects', [rec2.identity.members, ids(rec2.identity)])

  console.log('-- rename A; delete B; the edge by id')
  const A2 = renamed(A1, 'A renamed', T(3))
  say('after rename: projects intact, name stamp moved', [ids(A2), A2.stamps.name === T(3)])
  say('lookup B with B present', lookupProject([A2, B0], 'bbbbbbbb') === 'unregistered' ? 'unregistered' : 'found')
  say('lookup B after B deleted', lookupProject([A2], 'bbbbbbbb') === 'unregistered' ? 'unregistered (dangling, as bundle refs are)' : 'found')
  say('A still carries the edge after B is gone', ids(A2))

  console.log('-- two machines add DIFFERENT edges to A while apart, then sync')
  const plz = add(A1, 'cccccccc', T(4))                                    // plzwork adds C at T4 (already has B@T1)
  const bad = add(A0, 'dddddddd', T(2))                                    // badbox, from the base, adds D at T2
  const imp2 = importIdentity([plz], bad, variant)
  say('plzwork after importing badbox', imp2.kind === 'same' ? ids(imp2.reconciled) : imp2.kind)
  const imp3 = importIdentity([bad], plz, variant)
  say('badbox after importing plzwork', imp3.kind === 'same' ? ids(imp3.reconciled) : imp3.kind)
  say('the two machines agree', imp2.kind === 'same' && imp3.kind === 'same' && JSON.stringify(ids(imp2.reconciled).sort()) === JSON.stringify(ids(imp3.reconciled).sort()))

  console.log('-- removal as a state, not an absence: badbox sets B to -1 later; plzwork still has B at +1')
  const badMinus = add(A1, 'bbbbbbbb', T(5), -1)
  const imp4 = importIdentity([A1], badMinus, variant)
  say('plzwork after import', imp4.kind === 'same' ? ids(imp4.reconciled) : imp4.kind)
  const imp5 = importIdentity([badMinus], A1, variant)
  say('badbox after importing the older +1', imp5.kind === 'same' ? ids(imp5.reconciled) : imp5.kind)

  console.log('-- a hand edit to the identity: an edge added with no `since`')
  const hand = { ...A1, projects: [...A1.projects, { id: 'eeeeeeee' }] }
  const rec3 = reconcile(hand, projectFileOf(A1), variant)
  say('reconcile keeps the hand edge and mirrors it', [ids(rec3.identity), rec3.writeProjectFile])
}

console.log('\n-- an older build (today\'s parsers) reading a file the prototype wrote')
{
  const { parseIdentity: oldParseIdentity } = await import('../../../../plugin/hooks/core/projects/registry.ts')
  const { parseProjectFile: oldParseProjectFile } = await import('../../../../plugin/hooks/core/projects/project-file.ts')
  const A1 = withEdgeB(A0, { id: 'bbbbbbbb', by: 'user' }, T(1))
  const r = oldParseIdentity(serializeIdentity(A1))
  say('0.8.11 parseIdentity', r.kind === 'ok' ? `ok; projects in extra: ${JSON.stringify(r.value.extra)}` : r.kind)
  const r2 = oldParseProjectFile(serializeProjectFile(projectFileOf(A1)))
  say('0.8.11 parseProjectFile', r2.kind === 'ok' ? `ok; projects ${Object.hasOwn(r2.value, 'projects') ? 'kept' : 'DROPPED'}` : r2.kind)
}
