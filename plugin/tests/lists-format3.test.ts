// Lists format 3 (0.8.x unit 5): the lists under the project folder, the bundle set with one file
// per bundle, the split of a flat file on first load, and the dangling check. Every test returns
// at once while LISTS_VERSION is 2 (the path is dead then) and runs for real at 3: before the
// flip on a scratch copy (tests/one-offs/thinking/v3-trial), after it here. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { applyListOp, emptyLists, LISTS_VERSION, serializeLists, type ListsFile } from '../hooks/core/lists/lists.ts'
import { renderBundleFile } from '../hooks/core/lists/bundle-file.ts'
import { serializePlacement } from '../hooks/core/projects/placement.ts'
import { newIdentity, projectFileOf, serializeIdentity } from '../hooks/core/projects/registry.ts'
import { serializeProjectFile } from '../hooks/core/projects/project-file.ts'
import { DATA_ROOT, world, type World } from './harness.ts'

const SID = '11111111-2222-4333-8444-999999999999'
const ROOT = 'C:/test-home/claude'
const PROJECTS = `${DATA_ROOT}/projects`
const FLAT = `${DATA_ROOT}/lists/test-project.json`
const CWD = 'C:/test-project'
// The OS account and machine the kit world has: none set, so the plugin's fallbacks.
const USER = 'user', MACHINE = 'machine'
type Found = { type: string; key?: string; text?: string; props: Record<string, unknown> }
type Ui = { press: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]>; unmount: () => Promise<unknown> }
type Engine = { tool: { call: (i: never) => Promise<unknown> }; ui: { mount: (t: never) => Promise<unknown> }; command: { run: (c: object) => Promise<unknown> } }
const PANE = { plugin: 'bookmarks', surface: 'terminal', component: 'Pane', requestId: 'bm-lists', props: { title: 'Lists', isFocused: false, bodyColumns: 44, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } } }
const mountPane = async ($: unknown) => (await ($ as Engine).ui.mount(PANE as never)) as Ui
const texts = async (ui: Ui) => (await ui.findAll({})).filter(e => e.type === 'Text' || e.type === 'Button' || e.type === 'Markdown').map(e => e.type === 'Markdown' ? String(e.props.text) : e.text ?? '').join(' | ')
/** One draw of the pane: mounted, read, unmounted. */
const draw = async ($: unknown): Promise<string> => {
  const ui = await mountPane($)
  const t = await texts(ui)
  await ui.unmount()
  return t
}
async function call($: unknown, input: Record<string, unknown>) {
  const out = (await ($ as Engine).tool.call({ tool: 'mcp__bookmarks__lists', tool_use_id: 'toolu_lists', ...input } as never)) as { result?: string }
  return JSON.parse(String(out.result ?? '{}')) as Record<string, unknown>
}
const key = (w: World, suffix: RegExp) => Object.keys(w.files).find(k => suffix.test(k.replace(/\\/g, '/')))
const writesTo = (w: World, suffix: RegExp) => w.calls.filter(c => c.event === 'fs.write' && suffix.test(String((c.input as { path?: unknown }).path).replace(/\\/g, '/'))).length
const readsOf = (w: World, suffix: RegExp) => w.calls.filter(c => c.event === 'fs.read' && suffix.test(String((c.input as { path?: unknown }).path).replace(/\\/g, '/'))).length

const link = (href: string) => ({ kind: 'url' as const, href })
const T = Date.parse('2026-10-12T00:00:00Z')
/** A flat file (format 2) with one list, its first item a bundle of two links, made on 2026-10-12. */
function flat(): string {
  let f: ListsFile = { ...emptyLists('test-project', CWD, 'test', T), version: 2 }
  for (const op of [
    { op: 'create', name: 'Work', owner: 'user' },
    { op: 'add', list: 'work', item: { label: 'the epic', by: 'user', links: [link('https://example.com/a'), link('https://example.com/b')] } },
    { op: 'add', list: 'work', item: { label: 'plain', by: 'user' } },
  ] as Parameters<typeof applyListOp>[1][]) {
    const r = applyListOp(f, op, T)
    if (!r.ok) throw new Error(r.error)
    f = r.file
  }
  return serializeLists(f)
}

// --- A registered project (its placement and identity), linked into its vault ------------------
const ID = 'k7mq2xab'
const FOLDER = `${PROJECTS}/test-project__${ID}__${USER}`
const TARGET = `${CWD}/private/claude/bookmarks`
const PROJECT_JSON = serializeProjectFile(projectFileOf(newIdentity({ id: ID, name: 'test-project', user: USER, now: '2026-11-02T22:00:00Z' })))
const registered = (linked: boolean): Record<string, string> => ({
  [`${ROOT}/projects/${MACHINE}/${USER}/${ID}.json`]: serializePlacement({ version: 1, id: ID, root: CWD, members: [], ...(linked ? { vault: CWD, junction_point: 'private/claude/bookmarks' } : {}), linked, n: 1, updated_at: '2026-11-02T22:00:00Z' }),
  [`${ROOT}/projects/${ID}.json`]: serializeIdentity(newIdentity({ id: ID, name: 'test-project', user: USER, now: '2026-11-02T22:00:00Z' })),
})
/** A split project folder at `at`: lists/_root with one item showing bundle b1, the index, and b1's file (`tweak` edits its text). */
function split(at: string, tweak: (t: string) => string = t => t): Record<string, string> {
  const b1 = { id: 'b1', label: 'the epic', links: [link('https://example.com/a')], by: 'user' as const, createdAt: Date.parse('2026-10-30T00:00:00Z'), updatedAt: 4 }
  return {
    [`${at}/project.json`]: PROJECT_JSON,
    [`${at}/lists/_root/lists.json`]: JSON.stringify({ version: 3, writer: 'test', project: 'test-project', cwd: CWD, updatedAt: 1, lists: [{ id: 'work', name: 'Work', owner: 'user', createdAt: 1, updatedAt: 1, next: 2, items: [{ id: 'i1', label: 'the epic', by: 'user', addedAt: 1, bundle: 'b1', links: b1.links }] }], removed: [] }),
    [`${at}/bundles/index.json`]: JSON.stringify({ version: 1, bundles: [{ ...b1, rev: 1, file: '2026-10-30__the-epic.md' }] }),
    [`${at}/bundles/2026-10-30__the-epic.md`]: tweak(renderBundleFile({ ...b1, tags: [], rev: 1, created: b1.createdAt, updated: b1.updatedAt, started: b1.createdAt }, { notes: 'my notes\n', linkLines: ['- a'] })),
  }
}
const B1_FILE = /\/bundles\/2026-10-30__the-epic\.md$/

test('the first load at format 3 splits the flat file into its project folder: project.json, lists.json, the index, one file per bundle; the flat file untouched', async ($, on) => {
  if (LISTS_VERSION < 3) return
  const before = flat()
  const w = world(on, { session: SID, files: { [FLAT]: before }, stat: true })
  const t = await draw($)
  expect(t).toContain('Work')
  expect(t).toContain('the epic')
  const folder = key(w, /\/projects\/test-project__[a-z2-7]{8}__user\/project\.json$/)
  expect(folder).toBeDefined()
  const dir = folder!.replace(/[\\/]project\.json$/, '').replace(/\\/g, '/')
  expect(JSON.parse(w.files[folder!]!).name).toBe('test-project')
  const lists = JSON.parse(w.files[key(w, new RegExp(`${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/lists/_root/lists\\.json$`))!]!)
  expect(lists.version).toBe(3)
  expect('bundles' in lists).toBe(false)
  const index = JSON.parse(w.files[key(w, /\/bundles\/index\.json$/)!]!)
  expect(index.bundles.map((b: { id: string; rev: number; file: string }) => [b.id, b.rev, b.file])).toEqual([['b1', 1, '2026-10-12__the-epic.md']])
  expect(w.files[key(w, /\/bundles\/2026-10-12__the-epic\.md$/)!]).toContain('- [https://example.com/a](https://example.com/a)')
  expect(w.file(FLAT)).toBe(before)
  expect(w.toasts().some(t => t.includes('moved into their project folder'))).toBe(true)
  // The page beside the new file is written at the split, not only at the next change (the oracle and Obsidian read it).
  expect(w.files[key(w, /\/lists\/_root\/lists\.md$/)!]).toContain('Work')
  // A second draw splits nothing more and reads nothing: the files are as they were.
  const writes = w.calls.filter(c => c.event === 'fs.write').length
  await draw($)
  expect(w.calls.filter(c => c.event === 'fs.write').length).toBe(writes)
})

test('a broken link to the vault shows "broken" and writes nothing; a removed one shows "removed"', async ($, on) => {
  if (LISTS_VERSION < 3) return
  const broken = world(on, { session: SID, files: registered(true), links: { [FOLDER]: {} }, stat: true })
  expect(await draw($)).toContain('broken')
  // Nothing under the lists or the project folders (the plugin's data README is its own write).
  const DATA = /\/bookmarks\/(projects|lists)\//
  expect(writesTo(broken, DATA)).toBe(0)
  await call($, { action: 'create', name: 'Nope', owner: 'user' })
  expect(writesTo(broken, DATA)).toBe(0)
  expect(readsOf(broken, /project\.json$/)).toBe(0)
})

test('a removed vault folder shows "removed"', async ($, on) => {
  if (LISTS_VERSION < 3) return
  world(on, { session: SID, files: registered(true), stat: true })
  expect(await draw($)).toContain('removed')
})

test('a link pointing elsewhere is reported, and project.json is not read', async ($, on) => {
  if (LISTS_VERSION < 3) return
  const w = world(on, { session: SID, files: { ...registered(true), 'D:/elsewhere/project.json': PROJECT_JSON }, links: { [FOLDER]: { realPath: 'D:/elsewhere' } }, stat: true })
  expect(await draw($)).toContain('pointing elsewhere')
  expect(readsOf(w, /project\.json$/)).toBe(0)
  expect(writesTo(w, /\/bookmarks\/(projects|lists)\//)).toBe(0)
})

test("a healthy link into the vault: the lists are read through it, and a change is written at the vault's real path", async ($, on) => {
  if (LISTS_VERSION < 3) return
  const w = world(on, { session: SID, files: { ...registered(true), ...split(TARGET) }, links: { [FOLDER]: { realPath: TARGET } }, stat: true })
  expect(await draw($)).toContain('the epic')
  await call($, { action: 'add', list: 'Work', owner: 'user', label: 'added through the link' })
  expect(w.files[key(w, /\/private\/claude\/bookmarks\/lists\/_root\/lists\.json$/)!]).toContain('added through the link')
})

// --- The set shared across a project's folders, and other writers ------------------------------
// An unregistered folder whose own project folder exists: found by the cwd its root lists record.
const own = (tweak?: (t: string) => string) => split(FOLDER, tweak)

test("a link added to a bundle from a subfolder's session shows in the root's list at the next draw", async ($, on) => {
  if (LISTS_VERSION < 3) return
  const w = world(on, { session: SID, files: own(), stat: true })
  expect(await draw($)).not.toContain('+1')
  // The subfolder's session: the bundle gains a link in its file (rev 2) and the index.
  const fileKey = key(w, B1_FILE)!, indexKey = key(w, /\/bundles\/index\.json$/)!
  const b1 = { id: 'b1', label: 'the epic', links: [link('https://example.com/a'), link('https://example.com/b')], by: 'user' as const, createdAt: Date.parse('2026-10-30T00:00:00Z'), updatedAt: 5 }
  w.files[fileKey] = renderBundleFile({ ...b1, tags: [], rev: 2, created: b1.createdAt, updated: b1.updatedAt, started: b1.createdAt }, { notes: 'my notes\n', linkLines: ['- a', '- b'] })
  w.files[indexKey] = JSON.stringify({ version: 1, bundles: [{ ...b1, rev: 2, file: '2026-10-30__the-epic.md' }] })
  expect(await draw($)).toContain('+1')
})

test('two writers a tick apart both land: our change keeps the bundle another session added meanwhile', async ($, on) => {
  if (LISTS_VERSION < 3) return
  const w = world(on, { session: SID, stat: true })
  await call($, { action: 'create', name: 'Work', owner: 'user' })
  await call($, { action: 'add', list: 'Work', owner: 'user', label: 'ours', links: [{ link: 'https://example.com/a' }, { link: 'https://example.com/b' }] })
  const indexKey = key(w, /\/bundles\/index\.json$/)!
  const index = JSON.parse(w.files[indexKey]!) as { bundles: { id: string; rev: number; file: string }[] }
  expect(index.bundles.map(b => [b.id, b.rev])).toEqual([['b1', 1]])
  // The other session: b2 into the index and its file.
  const b2 = { id: 'b2', label: 'theirs', links: [link('https://example.com/t')], by: 'claude' as const, createdAt: Date.parse('2026-11-01T00:00:00Z'), updatedAt: 5 }
  w.files[indexKey] = JSON.stringify({ ...index, bundles: [...index.bundles, { ...b2, rev: 1, file: '2026-11-01__theirs.md' }] })
  w.files[indexKey.replace(/index\.json$/, '2026-11-01__theirs.md')] = renderBundleFile({ ...b2, tags: [], rev: 1, created: b2.createdAt, updated: b2.updatedAt, started: b2.createdAt }, { notes: '', linkLines: [] })
  // Ours, a tick later: b1 gains a link.
  await call($, { action: 'link', list: 'Work', owner: 'user', item: '1', link: 'https://example.com/c' })
  const after = JSON.parse(w.files[indexKey]!) as { bundles: { id: string; rev: number }[] }
  expect(after.bundles.map(b => [b.id, b.rev])).toEqual([['b1', 2], ['b2', 1]])
  expect(w.files[key(w, /\/bundles\/\d{4}-\d\d-\d\d__ours\.md$/)!]).toContain('<!-- bm end: 2 -->')
})

test('a bundle file with no end line is read twice and accepted when the second read agrees', async ($, on) => {
  if (LISTS_VERSION < 3) return
  const w = world(on, { session: SID, files: own(t => t.replace(/<!-- bm end: 1 -->\n$/, '')), stat: true })
  const t = await draw($)
  expect(t).toContain('the epic')
  expect(readsOf(w, B1_FILE)).toBe(2)
  expect(w.toasts().length).toBe(0)
})

// `/bm-project` (0.8.x unit 6b): registering a folder that already has its own project folder keeps
// that folder's id (the Director's ruling, 2026-11-03), and `where` then names it as #1.
test("/bm-project register keeps the id of the folder's own project folder; /bm-project then lists it as #1", async ($, on) => {
  if (LISTS_VERSION < 3) return
  const w = world(on, { session: SID, files: { ...own(), 'C:/test-project/.git/HEAD': 'ref: refs/heads/dev\n' }, stat: true })
  await ($ as Engine).command.run({ command: 'bm-project', args: 'register' })
  const identity = key(w, new RegExp(`/claude/projects/${ID}\\.json$`))
  expect(identity).toBeDefined()
  expect(JSON.parse(w.files[identity!]!).id).toBe(ID)
  expect(key(w, new RegExp(`/claude/projects/${MACHINE}/${USER}/${ID}\\.json$`))).toBeDefined()
  expect(Object.keys(w.files).filter(k => /[\\/]project\.json$/.test(k)).length).toBe(1)
  expect(w.logs().some(l => l.includes(`registered #1 test-project (${ID})`) && l.includes('keeping the id'))).toBe(true)
  await ($ as Engine).command.run({ command: 'bm-project', args: '' })
  expect(w.logs().some(l => l.includes(`▸ #1 test-project (${ID})`))).toBe(true)
  // The pane still draws the same lists, now through the registry.
  expect(await draw($)).toContain('the epic')
})

// 0.8.14 (the registry design's 13:41 addendum): no location is refused. A folder without markers
// is registered only after a dry run that writes nothing; --yes registers; a subfolder can then be
// excluded, and where says so.
test('/bm-project register on a folder without .git or .repokit.json is a dry run; --yes registers; exclude, then where lists it', async ($, on) => {
  if (LISTS_VERSION < 3) return
  const w = world(on, { session: SID, files: own(), stat: true })
  const before = Object.keys(w.files).length
  await ($ as Engine).command.run({ command: 'bm-project', args: 'register' })
  expect(w.logs().some(l => l.includes('not registered yet') && l.includes('neither .git nor .repokit.json'))).toBe(true)
  expect(w.logs().some(l => l.includes('register --yes'))).toBe(true)
  expect(Object.keys(w.files).length).toBe(before)
  expect(key(w, new RegExp(`/claude/projects/${ID}\\.json$`))).toBeUndefined()
  await ($ as Engine).command.run({ command: 'bm-project', args: 'register --yes' })
  expect(key(w, new RegExp(`/claude/projects/${ID}\\.json$`))).toBeDefined()
  expect(w.logs().some(l => l.includes(`registered #1 test-project (${ID})`))).toBe(true)
  await ($ as Engine).command.run({ command: 'bm-project', args: 'exclude scratch' })
  const placement = w.files[key(w, new RegExp(`/claude/projects/${MACHINE}/${USER}/${ID}\\.json$`))!]!
  expect(JSON.parse(placement).exclude).toEqual(['C:/test-project/scratch'])
  await ($ as Engine).command.run({ command: 'bm-project', args: 'where' })
  expect(w.logs().some(l => l.includes('excluded: C:/test-project/scratch'))).toBe(true)
  await ($ as Engine).command.run({ command: 'bm-project', args: 'include scratch' })
  expect(JSON.parse(w.files[key(w, new RegExp(`/claude/projects/${MACHINE}/${USER}/${ID}\\.json$`))!]!).exclude).toEqual([])
})

// 0.8.15 (the 14:50 ruling): a session says which project it works on; the key lands in the
// conversation's own bookmark file, where shows it, and --clear forgets it.
test('/bm-project home #1 sets the session home in its bookmark file; where shows it; home --clear forgets it', async ($, on) => {
  if (LISTS_VERSION < 3) return
  const w = world(on, { session: SID, files: { ...own(), 'C:/test-project/.git/HEAD': 'ref: refs/heads/dev\n' }, stat: true })
  await ($ as Engine).command.run({ command: 'bm-project', args: 'register' })
  await ($ as Engine).command.run({ command: 'bm-project', args: 'home #1' })
  expect(w.logs().some(l => l.includes('now works on #1 test-project (its home)'))).toBe(true)
  const sessionFile = key(w, new RegExp(`/bookmarks/sessions/${SID}\\.json$`))
  expect(sessionFile).toBeDefined()
  expect(JSON.parse(w.files[sessionFile!]!).home).toBe(ID)
  await ($ as Engine).command.run({ command: 'bm-project', args: 'where' })
  expect(w.logs().some(l => l.includes('This session works on #1 test-project (its home)'))).toBe(true)
  await ($ as Engine).command.run({ command: 'bm-project', args: 'home --clear' })
  expect(JSON.parse(w.files[sessionFile!]!).home).toBeUndefined()
  await ($ as Engine).command.run({ command: 'bm-project', args: 'home nothing-like-it' })
  expect(w.logs().some(l => l.includes('no registered project matches nothing-like-it'))).toBe(true)
  // The pane still draws the project's lists.
  expect(await draw($)).toContain('the epic')
})

// 0.8.16 (the registry design's 17:50 addendum): /bm-project link runs the link script -- never in
// a test: $.process.run is the harness's stub here, which records each argv and answers for it.
const REGISTERED = () => ({ ...own(), 'C:/test-project/.git/HEAD': 'ref: refs/heads/dev\n' })

test('/bm-project link with the vault option off runs nothing and says so', { options: { projectVault: false } }, async ($, on) => {
  if (LISTS_VERSION < 3) return
  const runs: (readonly string[])[] = []
  const w = world(on, { session: SID, files: REGISTERED(), stat: true, process: argv => { runs.push(argv); return { exitCode: 0, stdout: '' } } })
  await ($ as Engine).command.run({ command: 'bm-project', args: 'register' })
  await ($ as Engine).command.run({ command: 'bm-project', args: 'link' })
  expect(w.logs().some(l => l.includes('not linked') && l.includes('off in /config'))).toBe(true)
  expect(runs.length).toBe(0)
})

test('/bm-project link shows the script\'s refusal and changes nothing; a success marks the placement linked', async ($, on) => {
  if (LISTS_VERSION < 3) return
  let answer = '{"ok":false,"dryRun":false,"steps":["checked the target"],"refused":"the target is not empty","moved":0}'
  const runs: (readonly string[])[] = []
  const w = world(on, { session: SID, files: REGISTERED(), stat: true, process: argv => { runs.push(argv); return { exitCode: 0, stdout: answer + '\n' } } })
  await ($ as Engine).command.run({ command: 'bm-project', args: 'register' })
  const placementKey = () => key(w, new RegExp(`/claude/projects/${MACHINE}/${USER}/${ID}\\.json$`))!
  await ($ as Engine).command.run({ command: 'bm-project', args: 'link' })
  expect(w.logs().some(l => l.includes('not linked: the target is not empty'))).toBe(true)
  expect(JSON.parse(w.files[placementKey()]!).linked).toBe(false)
  expect(runs[0]!.some(a => a.endsWith('link-project.ps1'))).toBe(true)
  expect(runs[0]![runs[0]!.indexOf('-Target') + 1]).toBe('C:/test-project/private/claude/bookmarks')
  answer = '{"ok":true,"dryRun":false,"steps":["made the link","moved 4 entries"],"realPath":"C:/test-project/private/claude/bookmarks","moved":4}'
  await ($ as Engine).command.run({ command: 'bm-project', args: 'link' })
  const placement = JSON.parse(w.files[placementKey()]!)
  expect([placement.linked, placement.junction_point]).toEqual([true, 'private/claude/bookmarks'])
  expect(w.logs().some(l => l.includes('linked #1 test-project') && l.includes('4 moved'))).toBe(true)
})

test('a bundle file whose block does not parse refuses writes to that bundle and names the file in a toast, once', async ($, on) => {
  if (LISTS_VERSION < 3) return
  const broken = (t: string) => t.replace('```bm-links\n{', '```bm-links\n{not json')
  const w = world(on, { session: SID, files: own(broken), stat: true })
  const fileKey = key(w, B1_FILE)!
  const before = w.files[fileKey]
  await draw($)
  const named = w.toasts().filter(t => t.replace(/\\/g, '/').includes('2026-10-30__the-epic.md'))
  expect(named.length).toBe(1)
  await draw($)
  expect(w.toasts().filter(t => t.replace(/\\/g, '/').includes('2026-10-30__the-epic.md')).length).toBe(1)
  const r = await call($, { action: 'link', list: 'Work', owner: 'user', item: '1', link: 'https://example.com/z' })
  expect(String(r.error)).toContain('could not be read')
  expect(w.files[fileKey]).toBe(before)
  // Another list's change, touching no bundle, still writes.
  await call($, { action: 'add', list: 'Work', owner: 'user', label: 'plain' })
  expect(w.files[key(w, /\/lists\/_root\/lists\.json$/)!]).toContain('plain')
})
