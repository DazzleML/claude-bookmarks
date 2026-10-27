// Lists (#45, the first slice): /bm-lists opens the docked pane, the pane draws the project's
// lists from their file, a press reorders or ticks and writes the file, and Claude's `lists`
// tool creates and fills them. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { applyListOp, emptyLists, serializeLists, type ListsFile } from '../hooks/core/lists/lists.ts'
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

test('a place in a conversation not on this machine: the press says so and copies nothing', async ($, on) => {
  const w = world(on, { session: SID, files: elsewhere() })
  await pressFirst($)
  expect(w.copied()).toEqual([])
  expect(w.toasts().some(t => t.includes('not on this machine'))).toBe(true)
})

test('the tool refuses an unknown list and an item with no label', async ($, on) => {
  world(on, { session: SID, files: seeded() })
  expect(String((await call($, { action: 'add', list: 'nope', label: 'x' })).error)).toContain('no list')
  expect(String((await call($, { action: 'add', list: "What's left" })).error)).toContain('needs `label`')
})
