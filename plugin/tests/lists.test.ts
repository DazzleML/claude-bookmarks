// Lists (#45, the first slice): /bm-lists opens the docked pane, the pane draws the project's
// lists from their file, a press reorders or ticks and writes the file, and Claude's `lists`
// tool creates and fills them. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { applyListOp, emptyLists, serializeLists, type ListsFile } from '../hooks/core/lists/lists.ts'
import { linkKey } from '../hooks/core/lists/item-links.ts'
import { addOrRelabel, emptyRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { BAND_PROPS, DATA_ROOT, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-999999999999'
const FILE = `${DATA_ROOT}/lists/test-project.json`
type Found = { type: string; key?: string; text?: string; props: Record<string, unknown> }
type Ui = { press: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]> }
type Engine = { command: { run: (c: object) => Promise<unknown> }; tool: { call: (i: never) => Promise<unknown> }; ui: { mount: (t: never) => Promise<unknown> } }
const PANE = { plugin: 'bookmarks', surface: 'terminal', component: 'Pane', requestId: 'bm-lists', props: { title: 'Lists', isFocused: false, bodyColumns: 44, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } } }
const mountPane = async ($: unknown) => (await ($ as Engine).ui.mount(PANE as never)) as Ui
const texts = async (ui: Ui) => (await ui.findAll({})).filter(e => e.type === 'Text' || e.type === 'Button' || e.type === 'Markdown').map(e => e.type === 'Markdown' ? String(e.props.text) : e.text ?? '').join(' | ')

function seeded(): Record<string, string> {
  let f: ListsFile = emptyLists('test-project', 'C:/test-project', 'test', 1)
  const step = (op: Parameters<typeof applyListOp>[1]) => {
    const r = applyListOp(f, op, 1)
    if (!r.ok) throw new Error(r.error)
    f = r.file
  }
  step({ op: 'create', name: "What's left", owner: 'user' })
  step({ op: 'add', list: 'what-s-left', item: { label: 'push 0.7.5', by: 'claude' } })
  step({ op: 'add', list: 'what-s-left', item: { label: 'the release', by: 'claude', link: 'https://example.com/release' } })
  return { [FILE]: serializeLists(f) }
}
const order = (w: { file: (p: string) => string | undefined }) => (JSON.parse(w.file(FILE)!) as ListsFile).lists[0]!.items.map(i => i.label)

test('/bm-lists opens the lists pane, docked and without the keyboard', async ($, on) => {
  const w = world(on, { session: SID })
  await ($ as unknown as Engine).command.run({ command: 'bm-lists', args: '' })
  expect(w.opened()).toEqual([{ id: 'bm-lists', title: 'Lists', columns: 44 }])
  expect(await texts(await mountPane($))).toContain('No lists yet for this project')
})

test("the pane draws the project's lists from their file, the shown one's items numbered", async ($, on) => {
  world(on, { session: SID, files: seeded() })
  const t = await texts(await mountPane($))
  expect(t).toContain("What's left (2)")
  expect(t).toContain('push 0.7.5')
  expect(t).toContain('the release')
  expect(t).toContain('2 open')
})

test('▼ moves an item down and writes the file; ✓ ticks it done', async ($, on) => {
  const w = world(on, { session: SID, files: seeded() })
  const ui = await mountPane($)
  await ui.press({ key: 'lists-down-i1' })
  expect(order(w)).toEqual(['the release', 'push 0.7.5'])
  await ui.press({ key: 'lists-done-i2' })
  expect((JSON.parse(w.file(FILE)!) as ListsFile).lists[0]!.items[0]!.done).toBe(true)
  expect(w.file(`${DATA_ROOT}/lists/test-project.md`)).toContain('~~[the release](https://example.com/release)~~')
  expect(w.file(`${FILE}.bak`)).toBeDefined()
})

// The per-draw freshness check (0.8.x unit 0b): each draw stats the cached file and reads it
// again only when its size or last change moved, so another session's change shows at the next
// draw and an unchanged file is not read again.
const readsOf = (w: { calls: { event: string; input: unknown }[] }) =>
  w.calls.filter(c => c.event === 'fs.read' && String((c.input as { path?: unknown }).path).replace(/\\/g, '/').endsWith('lists/test-project.json')).length
const keyOf = (w: { files: Record<string, string> }) => Object.keys(w.files).find(k => k.replace(/\\/g, '/').endsWith('lists/test-project.json'))!
/** One draw of the pane: mounted, read, unmounted (a pane mounts once at a time). */
const draw = async ($: unknown): Promise<string> => {
  const ui = await mountPane($)
  const t = await texts(ui)
  await (ui as Ui & { unmount: () => Promise<unknown> }).unmount()
  return t
}

test("another session's change to the lists file shows at the pane's next draw", async ($, on) => {
  const w = world(on, { session: SID, files: seeded(), stat: true })
  expect(await draw($)).not.toContain('written by the other session')
  const r = applyListOp(JSON.parse(w.files[keyOf(w)]!) as ListsFile, { op: 'add', list: 'what-s-left', item: { label: 'written by the other session', by: 'claude' } }, 2)
  if (!r.ok) throw new Error(r.error)
  w.files[keyOf(w)] = serializeLists(r.file)
  expect(await draw($)).toContain('written by the other session')
})

test('an unchanged lists file is not read again at the next draw', async ($, on) => {
  const w = world(on, { session: SID, files: seeded(), stat: true })
  await draw($)
  const after = readsOf(w)
  expect(after).toBeGreaterThan(0)
  await draw($)
  await draw($)
  expect(readsOf(w)).toBe(after)
  expect(w.calls.some(c => c.event === 'fs.stat')).toBe(true)
})

// The write's own redraw reads the file once (its watermark is dropped at the write, so a second
// writer between our write and that read is not missed); after that, draws read nothing more.
test('after a press writes the file, the pane shows it and later draws do not read it again', async ($, on) => {
  const w = world(on, { session: SID, files: seeded(), stat: true })
  const ui = await mountPane($)
  await ui.press({ key: 'lists-down-i1' })
  await (ui as Ui & { unmount: () => Promise<unknown> }).unmount()
  const settled = readsOf(w)
  expect(order(w)).toEqual(['the release', 'push 0.7.5'])
  await draw($)
  await draw($)
  expect(readsOf(w)).toBe(settled)
})

test("after a press of ours, another session's later change still shows at the next draw", async ($, on) => {
  const w = world(on, { session: SID, files: seeded(), stat: true })
  const ui = await mountPane($)
  await ui.press({ key: 'lists-down-i1' })
  await (ui as Ui & { unmount: () => Promise<unknown> }).unmount()
  const r = applyListOp(JSON.parse(w.files[keyOf(w)]!) as ListsFile, { op: 'add', list: 'what-s-left', item: { label: 'written after our press', by: 'claude' } }, 3)
  if (!r.ok) throw new Error(r.error)
  w.files[keyOf(w)] = serializeLists(r.file)
  expect(await draw($)).toContain('written after our press')
})

// An item with a target is a Markdown link, as a reply's links are: a plain click is the
// plugin's (lands or copies), a ctrl-click the terminal's own open (djdarcy, 2026-10-27). An
// item with no target stays a Button.
test('an item with a link is drawn as a pressable Markdown link; one without stays a button', async ($, on) => {
  world(on, { session: SID, files: seeded() })
  const ui = await mountPane($)
  const md = (await ui.findAll({ type: 'Markdown' })).find(m => m.key === 'lists-go-i2')
  expect(String(md?.props.text)).toBe('[the release](https://example.com/release)')
  expect(md?.props.pressableLinks).toEqual(['https://example.com/release'])
  expect((await ui.findAll({ type: 'Button' })).some(b => b.key === 'lists-go-i1')).toBe(true)
})

// djdarcy, 2026-10-27: "how am I supposed to read the entire note?" -- an item's number opens it
// in place, its whole note wrapped; a note with nowhere to go opens on a press of its label.
test("an item's number opens it in place with its whole note, and a second press closes it", async ($, on) => {
  let f: ListsFile = emptyLists('test-project', 'C:/test-project', 'test', 1)
  const long = 'the order and ticks should survive closing and reopening the pane, and this sentence runs well past the dock'
  for (const op of [
    { op: 'create', name: 'Proof', owner: 'user' },
    { op: 'add', list: 'proof', item: { label: 'reorder and tick', why: long, by: 'claude' } },
  ] as Parameters<typeof applyListOp>[1][]) {
    const r = applyListOp(f, op, 1)
    if (!r.ok) throw new Error(r.error)
    f = r.file
  }
  world(on, { session: SID, files: { [FILE]: serializeLists(f) } })
  const ui = await mountPane($)
  const whyText = async () => (await ui.findAll({ type: 'Text' })).filter(t => (t.text ?? '').includes('runs well past')).map(t => t.props.wrap)
  expect(await whyText()).toEqual(['truncate-end'])
  await ui.press({ key: 'lists-num-i1' })
  expect(await whyText()).toEqual(['wrap'])
  expect(await texts(ui)).toContain('a note: no place or link')
  await ui.press({ key: 'lists-go-i1' })
  expect(await whyText()).toEqual(['truncate-end'])
})

async function call($: unknown, input: Record<string, unknown>) {
  const out = (await ($ as Engine).tool.call({ tool: 'mcp__bookmarks__lists', tool_use_id: 'toolu_lists', ...input } as never)) as { result?: string }
  return JSON.parse(String(out.result ?? '{}')) as Record<string, unknown>
}

test("Claude's tool creates a list on the person's side, adds to it, and moves an item", async ($, on) => {
  const w = world(on, { session: SID })
  expect((await call($, { action: 'create', name: 'Tests to run', owner: 'user' })).ok).toBe(true)
  await call($, { action: 'add', list: 'Tests to run', owner: 'user', label: 'the fold, live' })
  await call($, { action: 'add', list: 'Tests to run', owner: 'user', label: 'the landing, live', why: 'an AskUserQuestion link' })
  const moved = await call($, { action: 'move', list: 'Tests to run', owner: 'user', item: '2', to: 1 })
  expect(moved.order).toEqual(['1. the landing, live', '2. the fold, live'])
  const f = JSON.parse(w.file(FILE)!) as ListsFile
  expect(f.lists[0]!.owner).toBe('user')
  expect((await call($, { action: 'lists' })).yours).toEqual([{ id: 'tests-to-run', name: 'Tests to run', owner: 'user', items: 2, done: 0 }])
})

// djdarcy, 2026-10-27: "Probably something like <leader>l would make sense".
test('<leader> l: l on the band\'s command line opens the lists pane', async ($, on) => {
  const w = world(on, { session: SID })
  const band = (await ($ as unknown as Engine).ui.mount({ plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' } as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: 'l' }).catch(() => undefined)
  expect((w.opened() as { id?: string }[]).some(o => o.id === 'bm-lists')).toBe(true)
})

// The gaps the refactor-advisor named (2026-10-27), written before the moves so they prove them.

test("pressing a list's tab shows that list", async ($, on) => {
  let f = JSON.parse(seeded()[FILE]!) as ListsFile
  const r = applyListOp(f, { op: 'create', name: 'Second', owner: 'claude' }, 2)
  if (!r.ok) throw new Error(r.error)
  f = r.file
  world(on, { session: SID, files: { [FILE]: serializeLists(f) } })
  const ui = await mountPane($)
  expect(await texts(ui)).toContain("What's left: 2 open")
  await ui.press({ key: 'lists-tab-second' })
  expect(await texts(ui)).toContain("Second (Claude's): 0 open")
})

test('/bm-lists <name> or <number> opens on that list, and /bm-lists again closes the pane', async ($, on) => {
  let f = JSON.parse(seeded()[FILE]!) as ListsFile
  const r = applyListOp(f, { op: 'create', name: 'Second', owner: 'claude' }, 2)
  if (!r.ok) throw new Error(r.error)
  f = r.file
  const w = world(on, { session: SID, files: { [FILE]: serializeLists(f) }, panes: [{ id: 'bm-lists' }] })
  const ui = await mountPane($)
  await ($ as unknown as Engine).command.run({ command: 'bm-lists', args: '2' })
  expect(await texts(ui)).toContain("Second (Claude's): 0 open")
  await ($ as unknown as Engine).command.run({ command: 'bm-lists', args: "what's" })
  expect(await texts(ui)).toContain("What's left: 2 open")
  await ($ as unknown as Engine).command.run({ command: 'bm-lists', args: '' })
  expect(w.calls.some(c => c.event === 'ui.close' && (c.input as { id?: string }).id === 'bm-lists')).toBe(true)
})

const TRANSCRIPT = `C:/test-home/.claude/projects/C--test-project/${SID}.jsonl`
const U = 'eeeeeeee-0000-4000-8000-000000000009'
const ROW = JSON.stringify({ type: 'user', uuid: U, message: { role: 'user', content: 'keep a list of what is left' }, timestamp: '2026-10-27T00:00:00.000Z' })

test("the tool adds a place of this conversation by a quote, and pressing the item scrolls there", async ($, on) => {
  const w = world(on, { session: SID, files: { [TRANSCRIPT]: '' }, process: () => ({ exitCode: 0, stdout: `1:0:${ROW}\n` }) })
  await call($, { action: 'create', name: 'Places', owner: 'user' })
  const added = await call($, { action: 'add', list: 'Places', owner: 'user', label: 'where it was asked', query: 'keep a list of what is left' })
  expect((added.added as { place?: string }).place).toBe(`${SID.slice(0, 8)}/${U.slice(0, 8)}`)
  const f = JSON.parse(w.file(FILE)!) as ListsFile
  // The file holds the item's typed links (lists v2, the links-in-files design, 2026-10-27).
  expect(f.lists[0]!.items[0]!.links?.[0]).toEqual({ kind: 'place', session: SID, uuid: U, words: 'keep a list of what is left' })
  const ui = await mountPane($)
  const md = (await ui.findAll({ type: 'Markdown' })).find(m => m.key === 'lists-go-i1')
  const href = (md?.props.pressableLinks as string[] | undefined)?.[0]
  expect(href).toContain(`u=${U}`)
  // The jump is the plugin's own $.ui.scroll, which the kit never routes (docs/engine-quirks.md;
  // footnotes.test.ts does the same): the press reaching it is the evidence the item landed.
  const pressed = await ui.press({ key: 'lists-go-i1', link: { href: href! } } as never).then(() => 'no scroll', err => String(err))
  expect(pressed).toContain('no implementation for ui.scroll')
})

// Several links per item (the links-in-files design, B4; djdarcy: "links from the real
// conversation, links to files, and links to github issues all in one item").
test('the tool adds an item with a place, a file and an issue; the place is minted, so its note exists', async ($, on) => {
  const w = world(on, { session: SID, files: { [TRANSCRIPT]: '' }, process: () => ({ exitCode: 0, stdout: `1:0:${ROW}\n` }) })
  await call($, { action: 'create', name: 'Places', owner: 'user' })
  const added = await call($, {
    action: 'add', list: 'Places', owner: 'user', label: 'the lists epic',
    query: 'keep a list of what is left', links: [{ link: 'C:/code/notes/lists.md' }, { link: 'https://github.com/DazzleML/claude-bookmarks/issues/45' }],
  })
  const links = (added.added as { links: { kind: string; what: string }[] }).links
  expect(links.map(l => l.kind)).toEqual(['place', 'file', 'issue'])
  expect(links[2]!.what).toBe('DazzleML/claude-bookmarks#45')
  const f = JSON.parse(w.file(FILE)!) as ListsFile
  expect(f.lists[0]!.items[0]!.links?.length).toBe(3)
  // The place's note: written by the bookmark tool's mint, so the item's ctrl-click opens a file that exists.
  expect(w.file(`${DATA_ROOT}/sessions/${SID}/${U.slice(0, 8)}.md`)).toBeDefined()
})

test('link adds a link to an item; unlink removes one by its number', async ($, on) => {
  const w = world(on, { session: SID })
  await call($, { action: 'create', name: 'Reading', owner: 'user' })
  await call($, { action: 'add', list: 'Reading', owner: 'user', label: 'the design' })
  const linked = await call($, { action: 'link', list: 'Reading', owner: 'user', item: '1', links: ['https://example.com/a', 'C:/code/b.md'] })
  expect(((linked.item as { links: { kind: string }[] }).links).map(l => l.kind)).toEqual(['url', 'file'])
  const unlinked = await call($, { action: 'unlink', list: 'Reading', owner: 'user', item: '1', at: 1 })
  expect(((unlinked.item as { links: { kind: string; what: string }[] }).links).map(l => l.what)).toEqual(['C:/code/b.md'])
  expect(String((await call($, { action: 'unlink', list: 'Reading', owner: 'user', item: '1', at: 5 })).error)).toContain('1 to 1')
  const f = JSON.parse(w.file(FILE)!) as ListsFile
  expect(f.lists[0]!.items[0]!.links).toEqual([{ kind: 'file', path: 'C:/code/b.md' }])
})

// Seen live (2026-10-27): Claude Code delivers the array parameter as a JSON string, and a
// re-linked place was added twice.
test('links given as a JSON string are read; a link the item already has is not added again', async ($, on) => {
  const w = world(on, { session: SID })
  await call($, { action: 'create', name: 'Reading', owner: 'user' })
  await call($, { action: 'add', list: 'Reading', owner: 'user', label: 'the epic', links: JSON.stringify([{ link: 'https://github.com/DazzleML/claude-bookmarks/issues/45' }]) })
  await call($, { action: 'link', list: 'Reading', owner: 'user', item: '1', links: '[{"link":"https://github.com/DazzleML/claude-bookmarks/issues/45"},{"link":"C:/code/b.md"}]' })
  const f = JSON.parse(w.file(FILE)!) as ListsFile
  expect(f.lists[0]!.items[0]!.links).toEqual([{ kind: 'issue', repo: 'DazzleML/claude-bookmarks', n: 45 }, { kind: 'file', path: 'C:/code/b.md' }])
})

// A link's identity (the bundles design, unit 1; U74): the same file written another way is the same link.
test('a link the item has, written with other slashes or case, is not added again', async ($, on) => {
  const w = world(on, { session: SID })
  await call($, { action: 'create', name: 'Reading', owner: 'user' })
  await call($, { action: 'add', list: 'Reading', owner: 'user', label: 'notes', link: 'C:/code/b.md' })
  await call($, { action: 'link', list: 'Reading', owner: 'user', item: '1', link: 'c:\\code\\b.md' })
  const f = JSON.parse(w.file(FILE)!) as ListsFile
  expect(f.lists[0]!.items[0]!.links).toEqual([{ kind: 'file', path: 'C:/code/b.md' }])
})

// Pressing a place in another conversation (the links-in-files design, B5): named and resumable
// when its transcript is on this machine, said so when it is not -- never a blind copy.
const OTHER = '22222222-3333-4444-8555-666666666666'
const elsewhere = () => ({
  [FILE]: JSON.stringify({
    version: 2, writer: 'test', project: 'test-project', cwd: 'C:/test-project', updatedAt: 1, removed: [],
    lists: [{ id: 'elsewhere', name: 'Elsewhere', owner: 'user', createdAt: 1, updatedAt: 1, next: 2,
      items: [{ id: 'i1', label: 'decided over there', by: 'claude', addedAt: 1, links: [{ kind: 'place', session: OTHER, uuid: 'ffffffff-0000-4000-8000-000000000001' }] }] }],
  }),
})
async function pressFirst($: unknown) {
  const ui = await mountPane($)
  const md = (await ui.findAll({ type: 'Markdown' })).find(m => m.key === 'lists-go-i1')
  const href = (md?.props.pressableLinks as string[] | undefined)?.[0]
  await ui.press({ key: 'lists-go-i1', link: { href: href! } } as never)
}

test('a place in another conversation on this machine: the press names it and copies its resume command', async ($, on) => {
  const w = world(on, { session: SID, files: { ...elsewhere(), [`C:/test-home/.claude/projects/C--other/${OTHER}.jsonl`]: '{}\n', [`${DATA_ROOT}/sessions/${OTHER}.json`]: JSON.stringify({ title: 'the ck3 worker' }) } })
  await pressFirst($)
  expect(w.copied()).toEqual([`claude --resume ${OTHER}`])
  expect(w.toasts().some(t => t.includes('"the ck3 worker"') && t.includes('Copied'))).toBe(true)
})

// A conversation that continued under a new session id keeps its messages' ids (seen in the CK3
// worker's report, 2026-10-28: fe8a1041 -> 432b5fd1, the bookmarked uuids in both transcripts), so
// a place naming the old id is looked for in this transcript first and, when found, landed on here.
test('a place naming an earlier session id whose message is in this conversation lands here', async ($, on) => {
  const FU = 'ffffffff-0000-4000-8000-000000000001'
  const row = JSON.stringify({ type: 'user', uuid: FU, message: { role: 'user', content: 'decided over there' }, timestamp: '2026-10-27T00:00:00.000Z' })
  const w = world(on, {
    session: SID,
    files: { ...elsewhere(), [TRANSCRIPT]: '', [`C:/test-home/.claude/projects/C--other/${OTHER}.jsonl`]: '{}\n' },
    process: argv => (argv.some(a => a.includes(FU)) ? { exitCode: 0, stdout: `1:0:${row}\n` } : { exitCode: 1, stdout: '' }),
  })
  // The jump is the plugin's own $.ui.scroll, which the kit never routes: reaching it is the evidence.
  const pressed = await pressFirst($).then(() => 'no scroll', err => String(err))
  expect(pressed).toContain('no implementation for ui.scroll')
  expect(w.copied()).toEqual([])
})

test('a place in a conversation not on this machine: the press says so and copies nothing', async ($, on) => {
  const w = world(on, { session: SID, files: elsewhere() })
  await pressFirst($)
  expect(w.copied()).toEqual([])
  expect(w.toasts().some(t => t.includes('not on this machine'))).toBe(true)
})

// A bm: reference given as a link (the bm: short-reference design, unit 6): stored as the exact
// place it names when it resolves; kept as typed when it does not; never as a file path.
const REC = 'cccccccc-0000-4000-8000-000000000001'
const registerWithOne = () => {
  const r = addOrRelabel(emptyRegister(SID, 'test', 1), { uuid: REC, owner: 'claude', label: 'the place', head: 'the message', by: 'claude', source: 'tool' }, 2)
  return { [`${DATA_ROOT}/sessions/${SID}.json`]: serializeRegister(r.register) }
}

test('a bm: lookup given as a link is stored as the place it names, its check matched', async ($, on) => {
  const w = world(on, { session: SID, files: registerWithOne() })
  await call($, { action: 'create', name: 'Refs', owner: 'user' })
  const added = await call($, { action: 'add', list: 'Refs', owner: 'user', label: 'that place', link: `bm:${SID.slice(0, 8)}.1~${REC.slice(0, 8)}` })
  expect((added.added as { links: { kind: string }[] }).links.map(l => l.kind)).toEqual(['place'])
  const f = JSON.parse(w.file(FILE)!) as ListsFile
  expect(f.lists[0]!.items[0]!.links).toEqual([{ kind: 'place', session: SID, uuid: REC }])
})

test('a bm: reference that names no place here is kept as typed, and a press copies it', async ($, on) => {
  const w = world(on, { session: SID, files: registerWithOne() })
  await call($, { action: 'create', name: 'Refs', owner: 'user' })
  const wrongCheck = `bm:${SID.slice(0, 8)}.1~dddddddd`
  await call($, { action: 'add', list: 'Refs', owner: 'user', label: 'a lost place', link: wrongCheck, links: [{ link: 'bm:99999999/12345678' }] })
  const f = JSON.parse(w.file(FILE)!) as ListsFile
  expect(f.lists[0]!.items[0]!.links).toEqual([{ kind: 'ref', text: wrongCheck }, { kind: 'ref', text: 'bm:99999999/12345678' }])
  const ui = await mountPane($)
  await ui.press({ key: 'lists-go-i1' } as never)
  expect(w.copied()).toEqual([wrongCheck])
})

test('a reference kept as typed is read again on a press: once it resolves, the press goes there', async ($, on) => {
  // Kept as typed at add (its register was missing then); the register is here now.
  const lookup = `bm:${SID.slice(0, 8)}.1~${REC.slice(0, 8)}`
  const file = JSON.stringify({
    version: 2, writer: 'test', project: 'test-project', cwd: 'C:/test-project', updatedAt: 1, removed: [],
    lists: [{ id: 'refs', name: 'Refs', owner: 'user', createdAt: 1, updatedAt: 1, next: 2,
      items: [{ id: 'i1', label: 'that place', by: 'claude', addedAt: 1, links: [{ kind: 'ref', text: lookup }] }] }],
  })
  const w = world(on, { session: SID, files: { ...registerWithOne(), [FILE]: file } })
  const ui = await mountPane($)
  // The jump is the plugin's own $.ui.scroll, which the kit never routes (as the quote test above).
  const pressed = await ui.press({ key: 'lists-go-i1' } as never).then(() => 'no scroll', err => String(err))
  expect(w.copied()).toEqual([])
  expect(pressed).toContain('no implementation for ui.scroll')
})

test('the tool refuses an unknown list and an item with no label', async ($, on) => {
  world(on, { session: SID, files: seeded() })
  expect(String((await call($, { action: 'add', list: 'nope', label: 'x' })).error)).toContain('no list')
  expect(String((await call($, { action: 'add', list: "What's left" })).error)).toContain('needs `label`')
})

// Bundles in the pane (the bundles design, unit 6; djdarcy: "all the other link items can be exposed
// by the user clicking the number in the list expanding it to see the remaining items").
const BUNDLE_LINKS = [
  { kind: 'file' as const, path: 'C:/code/x/dwp.md' },
  { kind: 'issue' as const, repo: 'DazzleML/claude-bookmarks', n: 45 },
  { kind: 'url' as const, href: 'https://example.com/notes' },
]
function bundled(): Record<string, string> {
  let f: ListsFile = emptyLists('test-project', 'C:/test-project', 'test', 1)
  for (const op of [
    { op: 'create', name: 'Work', owner: 'user' },
    { op: 'add', list: 'work', item: { label: 'bundles', by: 'user', links: BUNDLE_LINKS } },
    { op: 'add', list: 'work', item: { label: 'one file', by: 'user', links: [{ kind: 'file', path: 'C:/code/x/one.md' }] } },
  ] as Parameters<typeof applyListOp>[1][]) {
    const r = applyListOp(f, op, 1)
    if (!r.ok) throw new Error(r.error)
    f = r.file
  }
  return { [FILE]: serializeLists(f) }
}

test('an item with several links shows +N on its row; opened, it lists every link, the face first and starred', async ($, on) => {
  world(on, { session: SID, files: bundled() })
  const ui = await mountPane($)
  expect(await texts(ui)).toContain('+2')
  await ui.press({ key: 'lists-num-i1' })
  const rows = (await ui.findAll({})).filter(e => (e.key ?? '').startsWith('lists-link-i1-')).map(e => String(e.props.text ?? e.text ?? ''))
  expect(rows.length).toBe(3)
  expect(rows[0]).toContain('C:/code/x/dwp.md')
  expect(rows[1]).toContain('DazzleML/claude-bookmarks#45')
  // One line per row: the mark and the icon inside the row's own Markdown, never a line of their own
  // (djdarcy, 2026-10-31: "Notice how the icons are on a line by themselves?").
  // The face is marked ●, never ★, which means pinned elsewhere (djdarcy, 2026-10-31: "Is the star an indicator that the link is already bookmarked?").
  expect(rows[0]).toMatch(/^● ▤ \[C:\/code\/x\/dwp\.md\]\(/)
  expect(rows[1]).toMatch(/^\\# \[DazzleML\/claude-bookmarks#45\]\(/)
})

// djdarcy, 2026-10-31: clicking and ctrl-clicking a file row "only shows the toast that it's copying the filename".
test('a link row is a link the terminal can open: a file row carries its file: URL, so a ctrl-click opens it', async ($, on) => {
  world(on, { session: SID, files: bundled() })
  const ui = await mountPane($)
  await ui.press({ key: 'lists-num-i1' })
  const row = (await ui.findAll({ type: 'Markdown' })).find(m => m.key === 'lists-link-i1-0')
  expect(row?.props.pressableLinks).toEqual(['file:///C:/code/x/dwp.md'])
  // An issue row too: its GitHub URL, so a ctrl-click opens the issue (djdarcy, 2026-10-31: "#39 ... ctrl-clicking the link should also work").
  const issue = (await ui.findAll({ type: 'Markdown' })).find(m => m.key === 'lists-link-i1-1')
  expect(issue?.props.pressableLinks).toEqual(['https://github.com/DazzleML/claude-bookmarks/issues/45'])
})

test('a place row says what it is about: the words it was made from', async ($, on) => {
  let f: ListsFile = emptyLists('test-project', 'C:/test-project', 'test', 1)
  for (const op of [
    { op: 'create', name: 'Work', owner: 'user' },
    { op: 'add', list: 'work', item: { label: 'two places', by: 'user', links: [
      { kind: 'place', session: SID, uuid: 'aaaaaaaa-0000-4000-8000-000000000001', words: 'We will need to handle migrations' },
      { kind: 'file', path: 'C:/code/x/dwp.md' },
    ] } },
  ] as Parameters<typeof applyListOp>[1][]) {
    const r = applyListOp(f, op, 1)
    if (!r.ok) throw new Error(r.error)
    f = r.file
  }
  world(on, { session: SID, files: { [FILE]: serializeLists(f) } })
  const ui = await mountPane($)
  await ui.press({ key: 'lists-num-i1' })
  const row = (await ui.findAll({})).find(e => e.key === 'lists-link-i1-0')
  // The words follow the link, outside it (djdarcy: "it would be nice if the text next to the shortlinks wasn't hyperlinked").
  expect(String(row?.props.text ?? row?.text)).toMatch(/^● ⚓ \[11111111\/aaaaaaaa\]\([^)]*\) "We will need to handle migrations"$/)
})

test('pressing a link row opens that link, not the face', async ($, on) => {
  const w = world(on, { session: SID, files: bundled() })
  const ui = await mountPane($)
  await ui.press({ key: 'lists-num-i1' })
  await ui.press({ key: 'lists-link-i1-1', link: { href: 'https://github.com/DazzleML/claude-bookmarks/issues/45' } } as never)
  expect(w.copied()).toEqual(['https://github.com/DazzleML/claude-bookmarks/issues/45'])
  expect((await ui.findAll({ type: 'Button' })).some(b => (b.key ?? '').startsWith('lists-copy-')), 'no copy button while a click copies').toBe(false)
})

// djdarcy, 2026-10-31: "an option that let's people enable/disable whether or not clicking a link in
// the list automatically copies the URI/URL to the clipboard" -- with a copy button when it does not.
test('with "A click on a link in a list" set to nothing: a click copies nothing, the ⧉ button copies', { options: { listLinkClick: 'nothing' } }, async ($, on) => {
  const w = world(on, { session: SID, files: bundled() })
  const ui = await mountPane($)
  await ui.press({ key: 'lists-go-i2', link: { href: 'file:///C:/code/x/one.md' } } as never)
  await ui.press({ key: 'lists-num-i1' })
  await ui.press({ key: 'lists-link-i1-1', link: { href: 'https://github.com/DazzleML/claude-bookmarks/issues/45' } } as never)
  expect(w.copied()).toEqual([])
  await ui.press({ key: 'lists-copy-i1-0' })
  expect(w.copied()).toEqual(['C:/code/x/dwp.md'])
})

test("a link row's ○ button makes it this list's face, and the row leads with it", async ($, on) => {
  const w = world(on, { session: SID, files: bundled() })
  const ui = await mountPane($)
  await ui.press({ key: 'lists-num-i1' })
  await ui.press({ key: 'lists-face-i1-2' })
  const item = (JSON.parse(w.file(FILE)!) as ListsFile).lists[0]!.items[0]!
  expect(item.face).toBe(linkKey(BUNDLE_LINKS[2]!))
  expect(item.links![0]).toEqual(BUNDLE_LINKS[2])
})

test('the tool: bundle an item, attach the bundle to another list, choose its face there', async ($, on) => {
  const w = world(on, { session: SID })
  await call($, { action: 'create', name: 'Work', owner: 'user' })
  await call($, { action: 'create', name: 'Board', owner: 'user' })
  await call($, { action: 'add', list: 'Work', owner: 'user', label: 'notes', link: 'C:/code/x/a.md' })
  const made = await call($, { action: 'bundle', list: 'Work', owner: 'user', item: '1' })
  const b = (made.item as { bundle?: string }).bundle
  expect(b).toBe('b1')
  await call($, { action: 'link', list: 'Work', owner: 'user', item: '1', link: 'https://github.com/DazzleML/claude-bookmarks/issues/45' })
  const attached = await call($, { action: 'attach', list: 'Board', owner: 'user', bundle: b })
  expect((attached.item as { bundle?: string; links: unknown[] }).links.length).toBe(2)
  await call($, { action: 'face', list: 'Board', owner: 'user', item: '1', at: 2 })
  const f = JSON.parse(w.file(FILE)!) as ListsFile
  const board = f.lists.find(l => l.name === 'Board')!.items[0]!
  expect(board.links![0]).toEqual({ kind: 'issue', repo: 'DazzleML/claude-bookmarks', n: 45 })
  expect(f.lists.find(l => l.name === 'Work')!.items[0]!.links![0]).toEqual({ kind: 'file', path: 'C:/code/x/a.md' })
  expect(String((await call($, { action: 'attach', list: 'Board', owner: 'user', bundle: 'b9' })).error)).toContain('no bundle')
})

// A link's `about` (the bundles design, addendum 2026-10-31 01:49; djdarcy: "a 1 sentence explanation of each file / URL").
test('an about given with a link is kept on it and shown after it on its row', async ($, on) => {
  const w = world(on, { session: SID })
  await call($, { action: 'create', name: 'Work', owner: 'user' })
  await call($, { action: 'add', list: 'Work', owner: 'user', label: 'continuations', links: [
    { link: 'C:/code/x/dwp.md', about: 'the design and its addenda' },
    { link: 'https://github.com/DazzleML/claude-bookmarks/issues/39', about: 'A branched conversation keeps its data' },
  ] })
  const item = (JSON.parse(w.file(FILE)!) as ListsFile).lists[0]!.items[0]!
  expect(item.links!.map(l => (l as { about?: string }).about)).toEqual(['the design and its addenda', 'A branched conversation keeps its data'])
  const ui = await mountPane($)
  await ui.press({ key: 'lists-num-i1' })
  const row = (await ui.findAll({ type: 'Markdown' })).find(m => m.key === 'lists-link-i1-1')
  expect(String(row?.props.text)).toMatch(/\]\([^)]*\) — A branched conversation keeps its data$/)
})

test('about on an existing link reaches every list that shows its bundle; a link given again gains an about, never doubles', async ($, on) => {
  const w = world(on, { session: SID })
  await call($, { action: 'create', name: 'Work', owner: 'user' })
  await call($, { action: 'create', name: 'Board', owner: 'user' })
  await call($, { action: 'add', list: 'Work', owner: 'user', label: 'notes', links: [{ link: 'C:/code/x/a.md' }, { link: 'C:/code/x/b.md' }] })
  await call($, { action: 'attach', list: 'Board', owner: 'user', bundle: 'b1' })
  await call($, { action: 'about', list: 'Work', owner: 'user', item: '1', at: 2, about: 'the second note' })
  await call($, { action: 'link', list: 'Board', owner: 'user', item: '1', links: [{ link: 'c:\\code\\x\\a.md', about: 'the first note' }] })
  const f = JSON.parse(w.file(FILE)!) as ListsFile
  for (const name of ['Work', 'Board']) {
    const links = f.lists.find(l => l.name === name)!.items[0]!.links as { path: string; about?: string }[]
    expect(links.map(l => [l.path, l.about])).toEqual([['C:/code/x/a.md', 'the first note'], ['C:/code/x/b.md', 'the second note']])
  }
})

// djdarcy, 2026-10-31: "I'm not sure we need the info text in the middle of the foldout pane
// explaining how to use the links" -- each link's row says where it goes, the footer how to use it.
test('an item with one link opens to its one link row, no +N, and no how-to line', async ($, on) => {
  world(on, { session: SID, files: bundled() })
  const ui = await mountPane($)
  expect(await texts(ui)).not.toContain('+0')
  await ui.press({ key: 'lists-num-i2' })
  const rows = (await ui.findAll({})).filter(e => (e.key ?? '').startsWith('lists-link-i2-'))
  expect(rows.length).toBe(1)
  expect(String(rows[0]!.props.text)).toContain('C:/code/x/one.md')
  expect(await texts(ui)).not.toContain('press the label')
  expect(await texts(ui)).toContain('ctrl-click a link to open it')
})
