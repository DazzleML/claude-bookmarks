// Round-1 probes for the multi-project / edge-state consultation (2026-11-03). Read-only against
// the plugin's pure modules; writes nothing anywhere. Run: node tests/one-offs/thinking/discuss-edge-state-2026-11-03/probe.mjs
import { parseIdentity, serializeIdentity, newIdentity, identityOf, projectFileOf, reconcile, importIdentity } from '../../../../plugin/hooks/core/projects/registry.ts'
import { parseProjectFile, serializeProjectFile } from '../../../../plugin/hooks/core/projects/project-file.ts'
import { parsePlacement, serializePlacement, membershipOf } from '../../../../plugin/hooks/core/projects/placement.ts'
import { parseLists, serializeLists } from '../../../../plugin/hooks/core/lists/lists.ts'
import { parseBundleIndex, serializeBundleIndex } from '../../../../plugin/hooks/core/lists/format3.ts'
import { parseBundleFile, renderBundleFile } from '../../../../plugin/hooks/core/lists/bundle-file.ts'
import { settle } from '../../../../plugin/hooks/core/lists/bundles.ts'
import { Continuum } from '../../../../plugin/hooks/core/kit/continuum.ts'

const T0 = '2026-11-03T14:00:00Z', T1 = '2026-11-03T14:10:00Z'
const say = (k, v) => console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
const has = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k)) ? 'KEPT' : 'DROPPED'

console.log('\n== P1. Unknown-key tolerance, file by file (parse, then serialize, then parse again) ==')
{
  // identity: a top-level unknown key
  const id = newIdentity({ id: 'aaaaaaaa', name: 'A', user: 'Extreme', now: T0 })
  const text = JSON.stringify({ ...id, projects: [{ id: 'bbbbbbbb', state: 1 }] })
  const r = parseIdentity(text)
  const again = parseIdentity(serializeIdentity(r.value))
  say('identity top-level `projects`', has(again.value.extra, 'projects'))
  // identity: a non-string member (the "member of kind project" in `members`)
  const r2 = parseIdentity(JSON.stringify({ ...id, members: ['C:/x', { kind: 'project', id: 'bbbbbbbb' }] }))
  say('identity `members` with an object entry', r2.kind === 'ok' ? 'READ' : `REFUSED (${r2.kind}: ${r2.why})`)
  // identity: newer version
  say('identity version 2', parseIdentity(JSON.stringify({ ...id, version: 2 })).kind)
}
{
  // project.json
  const pf = projectFileOf(newIdentity({ id: 'aaaaaaaa', name: 'A', user: 'Extreme', now: T0 }))
  const r = parseProjectFile(JSON.stringify({ ...pf, projects: [{ id: 'bbbbbbbb' }] }))
  say('project.json top-level `projects`', has(r.value, 'projects'))
  const r2 = parseProjectFile(JSON.stringify({ ...pf, members: [{ kind: 'project', id: 'bbbbbbbb' }] }))
  say('project.json `members` with an object entry', r2.kind === 'ok' ? 'READ' : `REFUSED (${r2.kind}: ${r2.why})`)
}
{
  // placement
  const p = { version: 1, id: 'aaaaaaaa', root: 'C:/code/a', members: ['C:/code/m'], linked: false, n: 1, updated_at: T0 }
  const r = parsePlacement(JSON.stringify({ ...p, exclude: ['C:/code/a/vendor'] }))
  say('placement top-level `exclude`', has(r.value, 'exclude'))
  const back = parsePlacement(serializePlacement(r.value))
  say('placement `exclude` after one write', has(back.value, 'exclude'))
  const r2 = parsePlacement(JSON.stringify({ ...p, members: [{ path: 'C:/code/m', state: 1 }] }))
  say('placement `members` with an object entry', r2.kind === 'ok' ? 'READ' : `REFUSED (${r2.kind}: ${r2.why})`)
  say('placement version 2', parsePlacement(JSON.stringify({ ...p, version: 2 })).kind)
}
{
  // lists.json v3: unknown keys at file, list, item and link level
  const file = {
    version: 3, writer: 'x', project: 'a', cwd: 'C:/code/a', updatedAt: 1,
    lists: [{ id: 'l', name: 'L', owner: 'user', createdAt: 1, updatedAt: 1, next: 2, umbrella: true, items: [
      { id: 'i1', label: 'one', by: 'user', addedAt: 1, bundle: 'b1', bundleState: 0, hidden: ['url|x'], links: [{ kind: 'url', href: 'https://e.x', state: 0, since: T0 }] },
    ] }],
    removed: [], edges: { note: 'file-level unknown' },
  }
  const r = parseLists(serializeLists(parseLists(JSON.stringify(file)).file))
  const l = r.file.lists[0], i = l.items[0]
  say('lists.json file-level `edges`', has(r.file, 'edges'))
  say('lists.json list-level `umbrella`', has(l, 'umbrella'))
  say('lists.json item-level `bundleState`', has(i, 'bundleState'))
  say('lists.json item-level `hidden`', has(i, 'hidden'))
  say('lists.json link-level `state`', has(i.links[0], 'state'))
  say('lists.json version 4', parseLists(JSON.stringify({ ...file, version: 4 })).kind)
}
{
  // bundles/index.json: entry-level and link-level unknown keys
  const idx = { version: 1, bundles: [{ id: 'b1', label: 'B', links: [{ kind: 'url', href: 'https://e.x', state: -1 }], by: 'claude', createdAt: 1, updatedAt: 1, rev: 1, file: 'f.md', relation: 'x' }] }
  const r = parseBundleIndex(serializeBundleIndex(parseBundleIndex(JSON.stringify(idx)).value))
  say('index entry-level `relation`', has(r.value.bundles[0], 'relation'))
  say('index link-level `state`', has(r.value.bundles[0].links[0], 'state'))
  say('index version 2', parseBundleIndex(JSON.stringify({ ...idx, version: 2 })).kind)
}
{
  // the bundle file's fenced block: block-level vs link-level unknown keys
  const d = { id: 'b1', label: 'B', tags: [], by: 'claude', rev: 3, links: [{ kind: 'url', href: 'https://e.x', state: 0, since: T0, by: 'claude' }], created: 1, updated: 2, started: 1 }
  let text = renderBundleFile(d, { notes: 'mine\n', linkLines: ['- x'] })
  // hand-add a block-level key the way a 0.9 writer might
  text = text.replace('"rev":3,', '"rev":3,"history":[{"link":"url|https://e.x","from":1,"to":0,"at":1}],')
  const p = parseBundleFile(text)
  say('bundle file parse', p.kind)
  say('bundle file link-level `state`/`since`/`by`', `${has(p.data.links[0], 'state')}/${has(p.data.links[0], 'since')}/${has(p.data.links[0], 'by')}`)
  const re = parseBundleFile(renderBundleFile(p.data, { notes: p.notes, linkLines: ['- x'] }))
  say('bundle file block-level `history` after one re-render', re.kind === 'ok' && /"history"/.test(renderBundleFile(p.data, { notes: p.notes, linkLines: ['- x'] })) ? 'KEPT' : 'DROPPED')
  say('bundle file notes byte-identical after re-render', re.notes === p.notes)
  say('bundle file version 2', parseBundleFile(text.replace('version: 1', 'version: 2')).kind)
}

console.log('\n== P2. A relation stored at one end: does it survive a rebuild and an import? ==')
{
  const A = newIdentity({ id: 'aaaaaaaa', name: 'A', user: 'Extreme', now: T0 })
  // 2a. in `extra` (a new top-level key the build does not know)
  const withExtra = parseIdentity(JSON.stringify({ ...A, related: [{ id: 'bbbbbbbb' }] })).value
  say('2a identity has extra.related', has(withExtra.extra, 'related'))
  const rebuilt = identityOf(projectFileOf(withExtra))         // the "lost identity file" path
  say('2a rebuilt-from-project.json has extra.related', has(rebuilt.extra, 'related'))
  const rec = reconcile(withExtra, projectFileOf(withExtra))    // the per-load reconcile
  say('2a reconcile keeps extra.related on the identity', has(rec.identity.extra, 'related'))
  say('2a mirror (project.json) carries related', has(rec.projectFile, 'related'))
  const imp = importIdentity([A], withExtra)                    // the other machine's copy arrives
  say('2a import of an identity carrying extra.related: result kind', imp.kind)
  say('2a import: reconciled identity has extra.related', imp.kind === 'same' ? has(imp.reconciled.extra, 'related') : 'n/a')
  // 2b. in `members` (the reconciled, stamped, mirrored field) -- as a string the parser accepts
  const asMember = { ...A, members: ['project:bbbbbbbb'], stamps: { ...A.stamps, members: T1 } }
  const rebuilt2 = identityOf(projectFileOf(asMember))
  say('2b rebuilt-from-project.json keeps members', rebuilt2.members)
  const imp2 = importIdentity([A], asMember)
  say('2b import: reconciled members', imp2.kind === 'same' ? imp2.reconciled.members : imp2.kind)
  // 2c. one stamp for the whole `members` list: a folder member added at T1 on one side, a project member at T0+ on the other
  const left = { ...A, members: ['C:/code/newfolder'], stamps: { ...A.stamps, members: T1 } }
  const right = { ...projectFileOf(A), members: ['project:bbbbbbbb'], stamps: { ...A.stamps, members: '2026-11-03T14:05:00Z' } }
  const rec3 = reconcile(left, right)
  say('2c two member kinds edited apart, one stamp: survivors', rec3.identity.members)
}

console.log('\n== P3. exclude as a rank -1 folder entry: does deepest-wins give the right answer with no new rule? ==')
{
  // model: a placement whose members carry a state; membershipOf is the shipped one, fed only the +1 bases,
  // and a -1 base is modelled as a *second* placement with no project (the folder is "its own").
  const pA = { version: 1, id: 'aaaaaaaa', root: 'C:/code/a', members: [], linked: false, n: 1, updated_at: T0 }
  const pB = { version: 1, id: 'bbbbbbbb', root: 'C:/code/a/vendor/dazzlelib/sub', members: [], linked: false, n: 2, updated_at: T0 }
  const excluded = ['C:/code/a/vendor']
  const resolve = (cwd) => {
    const m = membershipOf(cwd, [pA, pB])
    // the proposed rule: an excluded path deeper than the winning base takes the folder out
    const ex = excluded.filter(e => cwd.toLowerCase().startsWith(e.toLowerCase() + '/') || cwd.toLowerCase() === e.toLowerCase())
    const deepestEx = ex.sort((x, y) => y.length - x.length)[0]
    if (m && deepestEx && deepestEx.length > m.base.length) return 'own project (excluded)'
    return m ? `${m.id} via ${m.via} ${m.base}` : 'own project'
  }
  say('C:/code/a/src', resolve('C:/code/a/src'))
  say('C:/code/a/vendor/x', resolve('C:/code/a/vendor/x'))
  say('C:/code/a/vendor/dazzlelib/sub/y (registered under the excluded path)', resolve('C:/code/a/vendor/dazzlelib/sub/y'))
}

console.log('\n== P4. The continuum port on the 3-slot and the 5-slot ==')
{
  const three = new Continuum({ name: 'membership', ranks: new Map([['ungrouped', -1], ['tentative', 0], ['grouped', 1]]), invariant: 'offered, undecided', subtype: 'full' })
  say('3-slot levels cold->warm', three.levels())
  say('3-slot neutral / poles', [three.neutral(), three.coldPole(), three.warmPole()])
  say('flatten() (the simple case)', [three.flatten().minus, three.flatten().plus])
  // djdarcy's 5-slot: the 2nd/4th slots sit BETWEEN a pole and the neutral
  const five = three.densifyBetween('tentative', 'grouped', 'attaching').densifyBetween('ungrouped', 'tentative', 'detaching')
  say('5-slot via densifyBetween: levels', five.levels())
  say('5-slot ranks', Object.fromEntries([...five.ranks].map(([k, v]) => [k, String(v)])))
  say('5-slot flatten() still the simple case', [five.flatten().minus, five.flatten().plus])
  // the Director's +2/-2 reading: outside the poles
  const beyond = new Continuum({ name: 'membership', ranks: new Map([['detaching', -2], ['ungrouped', -1], ['tentative', 0], ['grouped', 1], ['attaching', 2]]), subtype: 'full' })
  say('+2/-2 reading: warm pole is', beyond.warmPole())
  say('+2/-2 reading: is attaching warmer than grouped?', beyond.isWarmer('attaching', 'grouped'))
  try { three.step('grouped', 1) } catch (e) { say('step past grouped', e.constructor.name) }
}

console.log('\n== P5. A -1 link left in a bundle for origin tracking: what today\'s settle shows in every list ==')
{
  const file = {
    version: 3, writer: 'x', project: 'a', cwd: 'C:/code/a', updatedAt: 1,
    lists: [{ id: 'l', name: 'L', owner: 'user', createdAt: 1, updatedAt: 1, next: 2, items: [
      { id: 'i1', label: 'one', by: 'user', addedAt: 1, bundle: 'b1', links: [] },
    ] }],
    removed: [],
    bundles: [{ id: 'b1', label: 'B', by: 'user', createdAt: 1, updatedAt: 1, links: [
      { kind: 'url', href: 'https://kept.x' }, { kind: 'url', href: 'https://left.x', state: -1 }, { kind: 'url', href: 'https://maybe.x', state: 0 },
    ] }],
  }
  const s = settle(file, 2)
  say('item.links after settle (count)', s.lists[0].items[0].links.length)
  say('item.links hrefs', s.lists[0].items[0].links.map(l => `${l.href}${l.state !== undefined ? `[${l.state}]` : ''}`))
}
