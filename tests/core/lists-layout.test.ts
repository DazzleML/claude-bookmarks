// The lists handler's format-3 layer (0.8.x unit 5) over an in-memory ports fake: where a
// folder's lists resolve to, the dangling check, the set read with its bundle files, the one-time
// split of a flat file, and the write of the whole. The kit (plugin/tests/lists-format3.test.ts)
// runs the same through the real handler at version 3; this pins the layer's own rules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bundleFileName, checkLayout, linkLines, migrateFlat, readSet, resolveLayout, writeAll, type LayoutPorts,
} from '../../plugin/hooks/handlers/lists-layout.ts'
import { fnv1a64 } from '../../plugin/hooks/core/bookmarks/migrations.ts'
import { renderBundleFile } from '../../plugin/hooks/core/lists/bundle-file.ts'
import { serializePlacement } from '../../plugin/hooks/core/projects/placement.ts'
import { newIdentity, serializeIdentity } from '../../plugin/hooks/core/projects/registry.ts'
import { serializeProjectFile } from '../../plugin/hooks/core/projects/project-file.ts'
import { projectFileOf } from '../../plugin/hooks/core/projects/registry.ts'
import type { ListsFile } from '../../plugin/hooks/core/lists/lists.ts'

const ROOT = 'C:/home/claude'
const PROJECTS = `${ROOT}/bookmarks/projects`
const NOW = Date.parse('2026-11-02T23:00:00Z')

type Fake = { ports: LayoutPorts; files: Map<string, string>; writes: string[]; reads: string[]; toasts: string[]; logs: string[] }

/** The world under the layer: files by forward-slash path; `links` are folders that are links, with a real path or none (broken). */
function fake(o: { cwd: string; files?: Record<string, string>; links?: Record<string, { realPath?: string }>; user?: string }): Fake {
  const files = new Map(Object.entries(o.files ?? {}))
  const links = o.links ?? {}
  const through = (p: string) => {
    for (const [lp, t] of Object.entries(links)) if (t.realPath && (p === lp || p.startsWith(`${lp}/`))) return t.realPath + p.slice(lp.length)
    return p
  }
  const isDir = (p: string) => [...files.keys()].some(k => k.startsWith(`${p}/`))
  const writes: string[] = [], reads: string[] = [], toasts: string[] = [], logs: string[] = []
  let mints = 0
  const ports: LayoutPorts = {
    dataRoot: async () => ROOT,
    cwd: async () => o.cwd,
    user: async () => o.user ?? 'Extreme',
    machine: async () => 'plzwork',
    fsExists: async p => (p in links && !links[p]!.realPath ? false : files.has(through(p)) || isDir(through(p))),
    fsRead: async p => {
      reads.push(p)
      const t = files.get(through(p))
      if (t === undefined) throw new Error(`ENOENT ${p}`)
      return t
    },
    fsWrite: async (p, t) => {
      writes.push(p)
      files.set(through(p), t)
    },
    fsList: async p => {
      const dir = `${p.replace(/\/+$/, '')}/`
      const seen = new Map<string, { name: string; kind: string; size: number; mtimeMs: number; isLink: boolean }>()
      for (const [k, t] of files) {
        if (!k.startsWith(dir)) continue
        const rest = k.slice(dir.length), i = rest.indexOf('/'), name = i < 0 ? rest : rest.slice(0, i)
        if (!seen.has(name)) seen.set(name, { name, kind: i < 0 ? 'file' : 'dir', size: i < 0 ? t.length : 0, mtimeMs: 0, isLink: false })
      }
      for (const lp of Object.keys(links)) if (lp.slice(0, lp.lastIndexOf('/')) === dir.slice(0, -1)) seen.set(lp.slice(lp.lastIndexOf('/') + 1), { name: lp.slice(lp.lastIndexOf('/') + 1), kind: 'other', size: 0, mtimeMs: 0, isLink: true })
      if (!seen.size && !isDir(dir.slice(0, -1))) throw new Error(`ENOENT ${p}`)
      return [...seen.values()]
    },
    fsStatLink: async p => {
      const l = links[p]
      if (l) return l.realPath ? { kind: 'dir', isLink: true, realPath: l.realPath } : undefined
      const q = through(p)
      if (files.has(q)) return { kind: 'file', isLink: false, realPath: q }
      if (isDir(q)) return { kind: 'dir', isLink: false, realPath: q }
      return undefined
    },
    // Different bytes each call, as crypto gives: a second resolve of a folder not yet made mints another id (writeAll must not read that as a conflict).
    randomBytes: n => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11 + 29 * ++mints) & 0xff),
    hash: fnv1a64,
    now: async () => NOW,
    log: l => logs.push(l),
    toast: t => toasts.push(t),
  }
  return { ports, files, writes, reads, toasts, logs }
}

const link = (u: string) => ({ kind: 'url', href: u }) as never
const item = (id: string, label: string, bundle?: string) => ({ id, label, by: 'claude', addedAt: 1, ...(bundle ? { bundle } : {}) }) as never
/** A format-2 flat file for `demo`, two bundles. */
const flat = (cwd = 'C:/work/demo'): string => `${JSON.stringify({
  version: 2, writer: 'bookmarks 0.8.7', project: 'demo', cwd, updatedAt: 9,
  lists: [{ id: 'work', name: 'Work', owner: 'user', createdAt: 1, updatedAt: 9, next: 3, items: [item('i1', 'epic 14', 'b1'), item('i2', 'the registry', 'b2')] }],
  removed: [],
  bundles: [
    { id: 'b1', label: 'epic 14', links: [link('https://example.com/1'), link('https://example.com/2')], by: 'claude', createdAt: Date.parse('2026-10-30T00:00:00Z'), updatedAt: 4 },
    { id: 'b2', label: 'the registry', why: 'the 0.8 line', links: [link('https://example.com/3')], by: 'user', createdAt: Date.parse('2026-11-01T00:00:00Z'), updatedAt: 8 },
  ],
} satisfies ListsFile, null, 2)}\n`

const CB = 'k7mq2xab'
/** A registered, linked claude-bookmarks: its placement and identity files, its data folder a link into the vault. */
function registered(o: { linked: boolean; vault?: string }): Record<string, string> {
  const p = { version: 1, id: CB, root: 'C:/code/claude-bookmarks', members: [], ...(o.vault ? { vault: o.vault, junction_point: 'private/claude/bookmarks' } : {}), linked: o.linked, n: 1, updated_at: '2026-11-02T22:00:00Z' }
  return {
    [`${ROOT}/projects/plzwork/Extreme/${CB}.json`]: serializePlacement(p),
    [`${ROOT}/projects/${CB}.json`]: serializeIdentity(newIdentity({ id: CB, name: 'claude-bookmarks', user: 'Extreme', now: '2026-11-02T22:00:00Z' })),
  }
}
const CB_FOLDER = `${PROJECTS}/claude-bookmarks__${CB}__Extreme`
const CB_PROJECT_JSON = serializeProjectFile(projectFileOf(newIdentity({ id: CB, name: 'claude-bookmarks', user: 'Extreme', now: '2026-11-02T22:00:00Z' })))

test('a folder under no registered root is its own project: minted on first sight, found by its recorded cwd after', async () => {
  const w = fake({ cwd: 'C:/work/demo' })
  const r = (await resolveLayout(w.ports))!
  assert.match(r.layout.folder, /^demo__[a-z2-7]{8}__Extreme$/)
  assert.equal(r.layout.listsFolder, '_root')
  assert.equal(r.layout.listsPath, `${PROJECTS}/${r.layout.folder}/lists/_root/lists.json`)
  assert.equal(r.linked, false)
  assert.equal(r.projectFile?.name, 'demo')
  assert.equal(r.projectFile?.id, r.id)
  assert.equal(r.flatPath, `${ROOT}/bookmarks/lists/demo.json`)
  assert.deepEqual(w.writes, [], 'resolving writes nothing')
  // Once a folder of that base name records this cwd, it is the one; one recording another folder of the same name is not.
  const w2 = fake({ cwd: 'c:\\work\\demo', files: {
    [`${PROJECTS}/demo__aaaaaaaa__Extreme/lists/_root/lists.json`]: JSON.stringify({ version: 3, writer: 't', project: 'demo', cwd: 'C:/elsewhere/demo', updatedAt: 1, lists: [], removed: [] }),
    [`${PROJECTS}/demo__bbbbbbbb__Extreme/lists/_root/lists.json`]: JSON.stringify({ version: 3, writer: 't', project: 'demo', cwd: 'C:/work/demo', updatedAt: 1, lists: [], removed: [] }),
  } })
  const r2 = (await resolveLayout(w2.ports))!
  assert.equal(r2.layout.folder, 'demo__bbbbbbbb__Extreme')
  assert.equal(r2.id, 'bbbbbbbb')
  assert.equal(r2.projectFile, undefined)
})

test("a folder under a registered root resolves to the project's folder by id, the registry's name for a folder not made yet", async () => {
  const w = fake({ cwd: 'C:/code/claude-bookmarks/private/claude', files: { ...registered({ linked: false }), [`${PROJECTS}/renamed__${CB}__Extreme/project.json`]: CB_PROJECT_JSON } })
  const r = (await resolveLayout(w.ports))!
  assert.equal(r.layout.folder, `renamed__${CB}__Extreme`)
  assert.equal(r.layout.listsFolder, 'private--claude')
  assert.equal(r.id, CB)
  assert.equal(r.placement?.id, CB)
  assert.equal(r.projectFile?.name, 'claude-bookmarks')
  const w2 = fake({ cwd: 'C:/code/claude-bookmarks', files: registered({ linked: true, vault: 'C:/code/claude-bookmarks' }) })
  const r2 = (await resolveLayout(w2.ports))!
  assert.equal(r2.layout.folder, `claude-bookmarks__${CB}__Extreme`)
  assert.equal(r2.linked, true)
})

const VAULT = 'C:/code/claude-bookmarks'
const TARGET = `${VAULT}/private/claude/bookmarks`
const linkedWorld = (links: Record<string, { realPath?: string }>, more: Record<string, string> = {}) =>
  fake({ cwd: 'C:/code/claude-bookmarks', files: { ...registered({ linked: true, vault: VAULT }), ...more }, links })
const readProjectJson = (w: Fake) => w.reads.filter(p => p.endsWith('project.json'))

test('the dangling check: a broken link is "broken" and refuses; a removed one is "removed"; both without reading project.json', async () => {
  const broken = linkedWorld({ [CB_FOLDER]: {} })
  const rb = (await resolveLayout(broken.ports))!
  const cb = await checkLayout(broken.ports, rb)
  assert.equal(cb.link, 'broken')
  assert.equal(cb.verdict.write, false)
  assert.match(cb.verdict.why!, /broken/)
  assert.deepEqual(readProjectJson(broken), [])
  const removed = linkedWorld({})
  const cr = await checkLayout(removed.ports, (await resolveLayout(removed.ports))!)
  assert.deepEqual([cr.link, cr.verdict.write, cr.verdict.create], ['removed', false, false])
  assert.match(cr.verdict.why!, /removed/)
})

test('a link pointing elsewhere is reported before project.json is read; one at the vault with the right id is ok', async () => {
  const elsewhere = linkedWorld({ [CB_FOLDER]: { realPath: 'D:/somewhere/else' } }, { 'D:/somewhere/else/project.json': CB_PROJECT_JSON })
  const ce = await checkLayout(elsewhere.ports, (await resolveLayout(elsewhere.ports))!)
  assert.equal(ce.link, 'elsewhere')
  assert.equal(ce.verdict.write, false)
  assert.match(ce.verdict.why!, /pointing elsewhere/)
  assert.deepEqual(readProjectJson(elsewhere), [])
  const ok = linkedWorld({ [CB_FOLDER]: { realPath: TARGET } }, { [`${TARGET}/project.json`]: CB_PROJECT_JSON })
  const co = await checkLayout(ok.ports, (await resolveLayout(ok.ports))!)
  assert.deepEqual([co.link, co.check, co.verdict.write], ['ok', 'ok', true])
  assert.equal(readProjectJson(ok).length, 1)
  // A stub under the name (moved-to.json, no project.json) is never the project's.
  const stub = linkedWorld({ [CB_FOLDER]: { realPath: TARGET } }, { [`${TARGET}/moved-to.json`]: '{"version":1,"moved_to":"x"}' })
  const cs = await checkLayout(stub.ports, (await resolveLayout(stub.ports))!)
  assert.deepEqual([cs.link, cs.check, cs.verdict.write], ['ok', 'moved', false])
})

test("an unregistered folder's own data folder: absent is made on the first write; a stub or a wrong id refuses", async () => {
  const w = fake({ cwd: 'C:/work/demo' })
  const r = (await resolveLayout(w.ports))!
  assert.deepEqual((await checkLayout(w.ports, r)).verdict, { write: true, create: true })
  const wrong = fake({ cwd: 'C:/work/demo', files: { [`${PROJECTS}/demo__cccccccc__Extreme/lists/_root/lists.json`]: JSON.stringify({ version: 3, cwd: 'C:/work/demo', lists: [], removed: [] }), [`${PROJECTS}/demo__cccccccc__Extreme/project.json`]: serializeProjectFile(projectFileOf(newIdentity({ id: 'dddddddd', name: 'demo', user: 'Extreme', now: '2026-11-02T22:00:00Z' }))) } })
  const c = await checkLayout(wrong.ports, (await resolveLayout(wrong.ports))!)
  assert.deepEqual([c.link, c.check, c.verdict.write], ['ok', 'wrong id', false])
})

test('the split of a flat file: project.json, one file per bundle, the index, then lists.json at version 3; the flat file untouched', async () => {
  const FLAT = `${ROOT}/bookmarks/lists/demo.json`
  const w = fake({ cwd: 'C:/work/demo', files: { [FLAT]: flat() } })
  const r = (await resolveLayout(w.ports))!
  const m = await migrateFlat(w.ports, r, w.files.get(FLAT)!)
  assert.deepEqual(m, { ok: true, bundles: 2, dangling: [] })
  const dir = `${PROJECTS}/${r.layout.folder}`
  assert.deepEqual(w.writes, [`${dir}/project.json`, `${dir}/bundles/2026-10-30__epic-14.md`, `${dir}/bundles/2026-11-01__the-registry.md`, `${dir}/bundles/index.json`, `${dir}/lists/_root/lists.json`])
  assert.equal(w.files.get(FLAT), flat(), 'the flat file is byte-identical')
  const lists = JSON.parse(w.files.get(`${dir}/lists/_root/lists.json`)!)
  assert.equal(lists.version, 3)
  assert.equal('bundles' in lists, false)
  const index = JSON.parse(w.files.get(`${dir}/bundles/index.json`)!)
  assert.deepEqual(index.bundles.map((b: { id: string; rev: number; file: string }) => [b.id, b.rev, b.file]), [['b1', 1, '2026-10-30__epic-14.md'], ['b2', 1, '2026-11-01__the-registry.md']])
  const file = w.files.get(`${dir}/bundles/2026-10-30__epic-14.md`)!
  assert.match(file, /^---\ntype: bookmarks-bundle\n/)
  assert.ok(file.includes('- [https://example.com/1](https://example.com/1)'))
  assert.match(file, /<!-- bm end: 1 -->\n$/)
  assert.equal(JSON.parse(w.files.get(`${dir}/project.json`)!).id, r.id)
  // A refused folder splits nothing.
  const refused = linkedWorld({ [CB_FOLDER]: {} }, { [`${ROOT}/bookmarks/lists/claude-bookmarks.json`]: flat('C:/code/claude-bookmarks') })
  const rr = (await resolveLayout(refused.ports))!
  const mr = await migrateFlat(refused.ports, rr, flat('C:/code/claude-bookmarks'))
  assert.equal(mr.ok, false)
  assert.deepEqual(refused.writes, [])
})

/** A project folder already split, `b1` with its file; `tweak` changes the file's text before it is seeded. */
function splitWorld(tweak: (fileText: string) => string = t => t): { w: Fake; dir: string; filePath: string } {
  const dir = `${PROJECTS}/demo__bmyfk6u7__Extreme`
  const b1 = { id: 'b1', label: 'epic 14', links: [link('https://example.com/1')], by: 'claude' as const, createdAt: Date.parse('2026-10-30T00:00:00Z'), updatedAt: 4 }
  const filePath = `${dir}/bundles/2026-10-30__epic-14.md`
  const text = renderBundleFile({ ...b1, tags: ['keep'], rev: 1, created: b1.createdAt, updated: b1.updatedAt, started: b1.createdAt }, { notes: 'my notes\n', linkLines: ['- x'] })
  const w = fake({ cwd: 'C:/work/demo', files: {
    [`${dir}/project.json`]: serializeProjectFile(projectFileOf(newIdentity({ id: 'bmyfk6u7', name: 'demo', user: 'Extreme', now: '2026-11-02T22:00:00Z' }))),
    [`${dir}/lists/_root/lists.json`]: JSON.stringify({ version: 3, writer: 't', project: 'demo', cwd: 'C:/work/demo', updatedAt: 1, lists: [{ id: 'work', name: 'Work', owner: 'user', createdAt: 1, updatedAt: 1, next: 2, items: [item('i1', 'epic 14', 'b1')] }], removed: [] }),
    [`${dir}/bundles/index.json`]: JSON.stringify({ version: 1, bundles: [{ ...b1, rev: 1, file: '2026-10-30__epic-14.md' }] }),
    [filePath]: tweak(text),
  } })
  return { w, dir, filePath }
}

test("the set read: the file wins when its rev is at least the index's; a person's edits to the front matter are taken", async () => {
  const { w, filePath } = splitWorld(t => t.replace('label: epic 14', 'label: epic fourteen'))
  const r = (await resolveLayout(w.ports))!
  const set = await readSet(w.ports, r, new Set())
  assert.equal(set.index.bundles[0]!.label, 'epic fourteen')
  assert.deepEqual(set.files.get('b1')?.data.tags, ['keep'])
  assert.equal(set.files.get('b1')?.notes, 'my notes\n')
  assert.equal(set.refused.size, 0)
  assert.equal(w.reads.filter(p => p === filePath).length, 1)
  assert.match(set.mark, /2026-10-30__epic-14\.md:\d+:/)
  // A file behind the index (its rev older) loses: the index copy stands, and the file is regenerated at the next change.
  const older = splitWorld(t => t.replace('label: epic 14', 'label: stale').replace('"rev":1', '"rev":0').replace('<!-- bm end: 1 -->', '<!-- bm end: 0 -->'))
  const ro = (await resolveLayout(older.w.ports))!
  const so = await readSet(older.w.ports, ro, new Set())
  assert.equal(so.index.bundles[0]!.label, 'epic 14')
  assert.equal(so.index.bundles[0]!.rev, 1)
})

test('a file with no end line is read twice and taken only when the second read agrees', async () => {
  const { w, filePath } = splitWorld(t => t.replace(/<!-- bm end: 1 -->\n$/, ''))
  const r = (await resolveLayout(w.ports))!
  const set = await readSet(w.ports, r, new Set())
  assert.equal(w.reads.filter(p => p === filePath).length, 2)
  assert.equal(set.files.has('b1'), true, 'a stable read is accepted')
  assert.equal(set.refused.size, 0)
  // Being written by someone else (the second read differs): shown from the index copy, and a
  // change to that bundle is refused -- a write now would rewrite the file without its notes.
  const torn = splitWorld(t => t.replace(/<!-- bm end: 1 -->\n$/, ''))
  const original = torn.w.ports.fsRead
  let n = 0
  torn.w.ports.fsRead = async p => {
    const text = await original(p)
    return p === torn.filePath && ++n === 2 ? `${text}more\n` : text
  }
  const rt = (await resolveLayout(torn.w.ports))!
  const st = await readSet(torn.w.ports, rt, new Set())
  assert.equal(st.files.has('b1'), false)
  assert.equal(st.index.bundles[0]!.label, 'epic 14', 'the index copy')
  assert.equal(st.refused.get('b1'), torn.filePath)
  const lists = JSON.parse(torn.w.files.get(rt.layout.listsPath)!) as ListsFile
  const out = await writeAll(torn.w.ports, rt, { ...lists, bundles: [{ ...st.index.bundles[0]!, links: [link('https://example.com/9')] }] }, st)
  assert.equal(out.ok, false)
  assert.ok(torn.w.files.get(torn.filePath)!.includes('my notes'), 'the notes are still in the file')
  assert.equal(torn.w.toasts.length, 0, 'transient: no toast')
})

test('a bad block refuses writes to that bundle, toasts its path once per session, and shows the index copy', async () => {
  const { w, filePath } = splitWorld(t => t.replace('```bm-links\n{', '```bm-links\n{not json'))
  const r = (await resolveLayout(w.ports))!
  const toasted = new Set<string>()
  const set = await readSet(w.ports, r, toasted)
  assert.equal(set.refused.get('b1'), filePath)
  assert.equal(set.index.bundles[0]!.label, 'epic 14', 'the index copy')
  assert.equal(w.toasts.length, 1)
  assert.ok(w.toasts[0]!.includes(filePath))
  await readSet(w.ports, r, toasted)
  assert.equal(w.toasts.length, 1, 'once per session')
  // A change to that bundle is refused; the file is untouched.
  const lists = JSON.parse(w.files.get(r.layout.listsPath)!) as ListsFile
  const file: ListsFile = { ...lists, bundles: [{ ...set.index.bundles[0]!, links: [link('https://example.com/9')] }] }
  const out = await writeAll(w.ports, r, file, set)
  assert.equal(out.ok, false)
  assert.match((out as { error: string }).error, /could not be read/)
  assert.deepEqual(w.writes, [])
})

test('two writers a tick apart both land: a change written after another session added a bundle keeps that bundle', async () => {
  const { w, dir } = splitWorld()
  const r = (await resolveLayout(w.ports))!
  const set = await readSet(w.ports, r, new Set())
  // The other session: b2 into the index and its file.
  const b2 = { id: 'b2', label: 'theirs', links: [link('https://example.com/2')], by: 'user', createdAt: Date.parse('2026-11-01T00:00:00Z'), updatedAt: 5 }
  w.files.set(`${dir}/bundles/index.json`, JSON.stringify({ version: 1, bundles: [...set.index.bundles, { ...b2, rev: 1, file: '2026-11-01__theirs.md' }] }))
  w.files.set(`${dir}/bundles/2026-11-01__theirs.md`, renderBundleFile({ ...b2, tags: [], rev: 1, created: b2.createdAt, updated: b2.updatedAt, started: b2.createdAt } as never, { notes: '', linkLines: [] }))
  // Ours: b1 gains a link. The handler reads fresh before a change, so the set is read again here.
  const fresh = await readSet(w.ports, r, new Set())
  const lists = JSON.parse(w.files.get(r.layout.listsPath)!) as ListsFile
  const mine = { ...fresh.index.bundles[0]!, links: [link('https://example.com/1'), link('https://example.com/1b')], updatedAt: 6 }
  const { rev: _r, file: _f, ...b1 } = mine
  const out = await writeAll(w.ports, r, { ...lists, bundles: [b1, b2 as never] }, fresh)
  assert.equal(out.ok, true)
  const index = JSON.parse(w.files.get(`${dir}/bundles/index.json`)!)
  assert.deepEqual(index.bundles.map((b: { id: string; rev: number }) => [b.id, b.rev]), [['b1', 2], ['b2', 1]])
  const f1 = w.files.get(`${dir}/bundles/2026-10-30__epic-14.md`)!
  assert.ok(f1.includes('my notes'), "the person's notes are kept")
  assert.ok(f1.includes('  - bm/keep'), "the person's tags are kept")
  assert.match(f1, /<!-- bm end: 2 -->\n$/)
  assert.ok(w.writes.indexOf(`${dir}/bundles/2026-10-30__epic-14.md`) < w.writes.indexOf(`${dir}/bundles/index.json`), 'the file before the index')
  assert.equal(w.writes[w.writes.length - 1], r.layout.listsPath, 'lists.json last')
  assert.ok(w.files.has(`${r.layout.listsPath}.bak`))
  assert.equal(JSON.parse(w.files.get(r.layout.listsPath)!).version, 3)
})

test("a write that would create the folder is re-resolved: another session's folder for this cwd made meanwhile refuses the write", async () => {
  const w = fake({ cwd: 'C:/work/demo' })
  const r = (await resolveLayout(w.ports))!
  const set = await readSet(w.ports, r, new Set())
  w.files.set(`${PROJECTS}/demo__zzzzzzzz__Extreme/lists/_root/lists.json`, JSON.stringify({ version: 3, cwd: 'C:/work/demo', lists: [], removed: [] }))
  const out = await writeAll(w.ports, r, { version: 3, writer: 't', project: 'demo', cwd: 'C:/work/demo', updatedAt: 1, lists: [], removed: [] }, set)
  assert.equal(out.ok, false)
  assert.match((out as { error: string }).error, /another session/)
  assert.deepEqual(w.writes, [])
  // With no such folder, the first write makes it: project.json first, then lists.json.
  const w2 = fake({ cwd: 'C:/work/demo' })
  const r2 = (await resolveLayout(w2.ports))!
  const out2 = await writeAll(w2.ports, r2, { version: 3, writer: 't', project: 'demo', cwd: 'C:/work/demo', updatedAt: 1, lists: [], removed: [] }, await readSet(w2.ports, r2, new Set()))
  assert.equal(out2.ok, true)
  assert.deepEqual(w2.writes, [`${r2.folderPath}/project.json`, r2.layout.indexPath, r2.layout.listsPath])
})

test('bundle file names: the created date and a slug of the label; a taken name gains the id; the Links lines carry an address where there is one', () => {
  const b = { id: 'b7', label: 'The Registry: 0.8.x!', createdAt: Date.parse('2026-11-02T23:59:59Z') }
  assert.equal(bundleFileName(b, new Set()), '2026-11-02__the-registry-0-8-x.md')
  assert.equal(bundleFileName(b, new Set(['2026-11-02__the-registry-0-8-x.md'])), '2026-11-02__the-registry-0-8-x-b7.md')
  assert.equal(bundleFileName({ id: 'b8', label: '!!!', createdAt: 0 }, new Set()), '1970-01-01__b8.md')
  assert.deepEqual(linkLines([link('https://example.com/a'), { kind: 'ref', text: 'bm:12345678/abcdefab' } as never], undefined), ['- [https://example.com/a](https://example.com/a)', '- bm:12345678/abcdefab (not resolved here)'])
})
