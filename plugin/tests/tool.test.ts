// The `bookmark` tool's tiers and claim (#21), as Claude calls it. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const UUID = 'cccccccc-0000-4000-8000-000000000001'
const PATH = `C:/test-home/claude/bookmarks/sessions/${SID}.json`

function seeded(tier: 'perma' | 'bookmark' = 'perma'): Record<string, string> {
  const r = addOrRelabel(
    emptyRegister(SID, 'test', 1),
    { uuid: UUID, owner: 'claude', label: 'where the palette began', head: 'the message', by: 'claude', source: 'tool', tier },
    2,
  )
  return { [PATH]: serializeRegister(r.register) }
}

type Pane = { findAll: (q: object) => Promise<{ text?: string }[]> }
const PANE = { plugin: 'bookmarks', surface: 'terminal', component: 'Pane', requestId: 'bm-pane', props: { title: 'bookmarks: type #', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } } }
async function bookmarksPaneTexts($: { ui: { mount: (t: never) => Promise<unknown> } }) {
  const band = (await $.ui.mount({ plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' } as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: 'b' }).catch(() => undefined)
  const pane = (await $.ui.mount(PANE as never)) as Pane
  return (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '').join(' | ')
}

// Q261012-07 part (1), djdarcy 2026-10-14: permalinks stay off the bookmarks pane by
// default ("we keep BOOKMARKS as a discrete concept"); a Permas group comes later (#38).
test('a permalink is not listed in the bookmarks pane', async ($, on) => {
  world(on, { session: SID, files: seeded('perma') })
  expect(await bookmarksPaneTexts($ as never)).toContain('No bookmarks yet')
})
test('a named bookmark of Claude\'s is listed in the bookmarks pane', async ($, on) => {
  world(on, { session: SID, files: seeded('bookmark') })
  expect(await bookmarksPaneTexts($ as never)).not.toContain('No bookmarks yet')
})

async function call($: { tool: { call: (i: never) => Promise<unknown> } }, input: Record<string, unknown>) {
  const out = (await $.tool.call({ tool: 'mcp__bookmarks__bookmark', tool_use_id: 'toolu_test', ...input } as never)) as { result?: string }
  return JSON.parse(String(out.result ?? '{}')) as Record<string, unknown>
}

test('list shows each record\'s tier', async ($, on) => {
  world(on, { session: SID, files: seeded() })
  const out = await call($ as never, { action: 'list' })
  expect((out.claudes as { tier: string }[])[0]?.tier).toBe('perma')
})

// Unit 7: every answer carries n; a listing links only a record whose file exists; a claim writes the file.
test('list gives n for every record and a link only where the export exists', async ($, on) => {
  const two = addOrRelabel(
    addOrRelabel(emptyRegister(SID, 'test', 1), { uuid: UUID, owner: 'claude', label: 'exported', head: 'h', by: 'claude', source: 'tool' }, 2).register,
    { uuid: 'dddddddd-0000-4000-8000-000000000002', owner: 'claude', label: 'not exported', head: 'h', by: 'claude', source: 'tool' },
    3,
  ).register
  world(on, { session: SID, files: { [PATH]: serializeRegister(two), [`C:/test-home/claude/bookmarks/sessions/${SID}/${UUID.slice(0, 8)}.md`]: '# exported\n' } })
  const out = await call($ as never, { action: 'list' })
  const claudes = out.claudes as { n: number; label: string; markdown?: string }[]
  expect(claudes.map(r => r.n)).toEqual([1, 2])
  expect(typeof claudes[0]?.markdown).toBe('string')
  expect(claudes[1]?.markdown).toBe(undefined)
})

test('a claim writes the record\'s file, since a link is handed out', async ($, on) => {
  const w = world(on, { session: SID, files: seeded('bookmark') })
  const out = await call($ as never, { action: 'claim', uuid: UUID.slice(0, 8) })
  expect(out.ok).toBe(true)
  expect((out.claimed as { n: number }).n).toBe(1)
  expect(w.file(`C:/test-home/claude/bookmarks/sessions/${SID}/${UUID.slice(0, 8)}.md`)).toContain('owners: user')
})

test('relabel with meta sets tags on the record and answers with them', async ($, on) => {
  const w = world(on, { session: SID, files: seeded('bookmark') })
  const out = await call($ as never, { action: 'relabel', uuid: UUID.slice(0, 8), owner: 'claude', meta: { tags: ['design/records'], x: { claude: { why: 'kept' } } } })
  expect(out.ok).toBe(true)
  expect((out.relabelled as { tags: string[]; n: number }).tags).toEqual(['design/records'])
  expect((out.relabelled as { n: number }).n).toBe(1)
  expect(w.file(PATH)).toContain('"tags": [')
  expect(w.file(PATH)).toContain('"x": {')
  // A relabel carrying only `x` is a change too (mutation sweep v0.5.7, M10).
  const onlyX = await call($ as never, { action: 'relabel', uuid: UUID.slice(0, 8), owner: 'claude', meta: { x: { claude: { seen: 2 } } } })
  expect(onlyX.ok).toBe(true)
  expect(w.file(PATH)).toContain('"seen": 2')
})

// A named bookmark: permalinks are off the pane (Q261012-07), so `c` acts on bookmarks.
test('c in the bookmarks list claims the chosen record', { options: { listInput: 'buttons' } }, async ($, on) => {
  const w = world(on, { session: SID, files: seeded('bookmark') })
  type Ui = { input: (t: object) => Promise<unknown>; press: (t: object) => Promise<unknown> }
  const band = (await $.ui.mount({ plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' } as never)) as unknown as Ui
  await band.input({ key: 'band-cmd-0', text: 'b' }).catch(() => undefined)
  await band.press({ key: 'band-num-1' }).catch(() => undefined)
  await band.press({ key: 'band-num-c' })
  expect(w.file(PATH)).toContain('"owner": "user"')
  expect(w.toasts()).toContain('#1 is yours now')
})

test('claim moves Claude\'s record to the person\'s list, same id and tier', async ($, on) => {
  const w = world(on, { session: SID, files: seeded() })
  const out = await call($ as never, { action: 'claim', uuid: UUID.slice(0, 8) })
  expect(out.ok).toBe(true)
  const claimed = out.claimed as { owner: string; uuid: string; tier: string }
  expect(claimed.owner).toBe('user')
  expect(claimed.uuid).toBe(UUID)
  expect(claimed.tier).toBe('perma')
  expect(w.file(PATH)).toContain('"owner": "user"')
})

// The process outlives a conversation (/clear, /resume start a new one in it), so the
// register held in memory must be the current conversation's. Found moving the bookmarks
// cluster (0.4.64): the cache was never keyed or reset, so the next conversation listed,
// and on its next save wrote under its own name, the register of the one before.
test('a new conversation reads its own register, not the one before it', async ($, on) => {
  const opts = { session: SID, files: seeded() }
  world(on, opts)
  expect(((await call($ as never, { action: 'list' })).claudes as unknown[]).length).toBe(1)
  // /clear: a new id, and no session.start (Q261014-01); the cache is keyed by the id.
  opts.session = '99999999-2222-4333-8444-555555555555'
  const out = await call($ as never, { action: 'list' })
  expect((out.claudes as unknown[]).length).toBe(0)
})

// The bm: short-reference design, unit 3a: the tool takes a reference in place of query/uuid.
test('a lookup reference to a bookmarked place is answered with its record, and nothing is minted', async ($, on) => {
  const w = world(on, { session: SID, files: seeded() })
  const before = w.file(PATH)
  const out = await call($ as never, { ref: `bm:${SID.slice(0, 8)}.1~${UUID.slice(0, 8)}` })
  expect(out.ok).toBe(true)
  expect(out.added).toBe(false)
  expect(out.n).toBe(1)
  expect(w.file(PATH)).toBe(before)
})

test('a lookup whose check names another record says so instead of answering with the wrong one', async ($, on) => {
  world(on, { session: SID, files: seeded() })
  const out = await call($ as never, { ref: `bm:${SID.slice(0, 8)}.1~dddddddd` })
  expect(String(out.error)).toContain('not the one the check names')
  expect((out.resolution as { kind: string }).kind).toBe('mismatch')
})

test('a reference to a conversation not on this machine, or text that is no reference, is refused with the reason', async ($, on) => {
  world(on, { session: SID, files: seeded() })
  expect(String((await call($ as never, { ref: 'bm:99999999/cccccccc', label: 'x' })).error)).toContain('not on this machine')
  expect(String((await call($ as never, { ref: 'not a reference', label: 'x' })).error)).toContain('not a bm: reference')
})
