// A conversation continued under a new session id gets its earlier sessions' bookmarks (U83 unit 4,
// handlers/bookmarks.ts adoptEarlier): once, newest first, the earlier files only read. On by
// default since the dry run on copies of real data (unit 6); the /config row adoptEarlier turns it off.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, parseRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { applyOp } from '../hooks/core/bookmarks/register-ops.ts'
import { BAND_PROPS, DATA_ROOT, pathKey, world } from './harness.ts'

const SID = '432b5fd1-2af8-4008-8baf-c8e33f495795'
const OLD = 'fe8a1041-3a7a-4754-8741-443af6e189f7'
const OLDER = '8ed53c04-304a-4519-a151-7e93495c6632'
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const TRANSCRIPT = `C:/test-home/.claude/projects/C--test-project/${SID}.jsonl`
const HERE = `${DATA_ROOT}/sessions/${SID}.json`
const OLD_FILE = `${DATA_ROOT}/sessions/${OLD}.json`
const OLDER_FILE = `${DATA_ROOT}/sessions/${OLDER}.json`

const registerWith = (sid: string, uuid: string, label: string) =>
  serializeRegister(addOrRelabel(emptyRegister(sid, 'test', 1), { uuid, owner: 'claude', label, head: label, by: 'claude', source: 'tool' }, 2).register)
// The lineage already kept, so no scan runs: OLDER, then OLD, then this id.
const LINEAGE = { [`lineage:${SID}`]: { self: SID, ancestors: [{ sessionId: OLDER, via: ['copied'] }, { sessionId: OLD, via: ['copied'] }], continuedIn: [] } }

type Engine = { session: { start: (i: object) => Promise<unknown> } }
const settle = () => new Promise(r => setTimeout(r, 300))
const start = ($: unknown) => ($ as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })

function chain() {
  const old = registerWith(OLD, B, 'from the middle session')
  const older = registerWith(OLDER, A, 'from the first session')
  return { old, older, options: { session: SID, store: LINEAGE, files: { [TRANSCRIPT]: '{}\n', [OLD_FILE]: old, [OLDER_FILE]: older } } }
}

test("the earlier sessions' bookmarks are copied in, newest first, keeping their session id", async ($, on) => {
  const c = chain()
  const w = world(on, c.options)
  await start($)
  await settle()
  const here = parseRegister(w.file(HERE) ?? '')
  expect(here?.perma.map(r => [r.uuid, r.n, r.sessionId])).toEqual([[B, 1, OLD], [A, 2, OLDER]])
  expect(here?.perma[1]?.rel).toEqual([{ kind: 'copied-from', to: `bm:${OLDER.slice(0, 8)}.1~aaaaaaaa` }])
  expect(w.logs().some(l => l.includes(`adopt: 2 copied into ${SID.slice(0, 8)} from ${OLD.slice(0, 8)}, ${OLDER.slice(0, 8)}`))).toBe(true)
})

test('the earlier files are only read: byte-identical afterwards', async ($, on) => {
  const c = chain()
  const w = world(on, c.options)
  await start($)
  await settle()
  expect(w.file(OLD_FILE)).toBe(c.old)
  expect(w.file(OLDER_FILE)).toBe(c.older)
})

test('a second start copies nothing: a record removed here does not come back', async ($, on) => {
  const c = chain()
  const w = world(on, c.options)
  await start($)
  await settle()
  // The person removes the copied record, by hand or another window: the file loses it.
  const once = parseRegister(w.file(HERE) ?? '')!
  w.files[pathKey(HERE)] = serializeRegister({ ...once, perma: once.perma.filter(r => r.uuid !== A) })
  await start($)
  await settle()
  expect(w.logs().filter(l => l.includes('[bm] adopt:'))).toEqual([expect.stringContaining('2 copied')])
  expect(parseRegister(w.file(HERE) ?? '')?.perma.map(r => r.uuid)).toEqual([B])
})

// The jumplist (unit 5): kept in the store per session id; an earlier one is taken over when this
// conversation has none of its own. Its entries name messages, which came along with their ids.
const JL_OLD = { entries: [{ uuid: A, block: 'start' }, { uuid: B, block: 'end' }], index: 1 }
const JL_OLDER = { entries: [{ uuid: A, block: 'start' }], index: 0 }
function watchStore(on: unknown) {
  const writes: { key?: unknown; value?: unknown }[] = []
  const hook = on as (event: string, match: object, h: (_h: unknown, e: Record<string, unknown>, next: (e: unknown) => unknown) => unknown) => void
  hook('store.set', {}, (_h, e, next) => {
    writes.push({ key: e.key, value: e.value })
    return next(e)
  })
  return writes
}

test("the newest earlier session's jumplist is taken over when this conversation has none", async ($, on) => {
  const writes = watchStore(on)
  const c = chain()
  world(on, { ...c.options, store: { ...LINEAGE, [`jumplist:${OLD}`]: JL_OLD, [`jumplist:${OLDER}`]: JL_OLDER } })
  await start($)
  await settle()
  expect(writes.filter(w => w.key === `jumplist:${SID}`).map(w => w.value)).toEqual([JL_OLD])
})

test("this conversation's own jumplist is never replaced", async ($, on) => {
  const writes = watchStore(on)
  const c = chain()
  const own = { entries: [{ uuid: B, block: 'start' }], index: 0 }
  world(on, { ...c.options, store: { ...LINEAGE, [`jumplist:${SID}`]: own, [`jumplist:${OLD}`]: JL_OLD } })
  await start($)
  await settle()
  expect(writes.some(w => w.key === `jumplist:${SID}`)).toBe(false)
})

test('with the adoptEarlier setting off, nothing is copied', { options: { adoptEarlier: false } }, async ($, on) => {
  const writes = watchStore(on)
  const c = chain()
  const w = world(on, { ...c.options, store: { ...LINEAGE, [`jumplist:${OLD}`]: JL_OLD } })
  await start($)
  await settle()
  expect(parseRegister(w.file(HERE) ?? '')?.perma.length ?? 0).toBe(0)
  expect(w.logs().some(l => l.includes('[bm] adopt:'))).toBe(false)
  expect(writes.some(w => w.key === `jumplist:${SID}`)).toBe(false)
})

// #39's own shape: `/branch` goes on in the same process under the fork's id, with no
// session.start; the next band command notices the new id (seams.test.ts M2), and the fork's
// transcript names its parent with `forkedFrom`.
test("#39: after a /branch the fork lists the parent's bookmarks and its mark, and the parent's file is unchanged", async ($, on) => {
  const PARENT = OLD
  const FORK = SID
  const FORK_TRANSCRIPT = TRANSCRIPT
  let parent = addOrRelabel(emptyRegister(PARENT, 'test', 1), { uuid: B, owner: 'claude', label: 'a decision', head: 'a decision', by: 'claude', source: 'tool' }, 2).register
  const marked = applyOp(parent, { op: 'setMark', owner: 'user', letter: 'a', place: { uuid: A, head: 'marked line' }, at: 3 }, 3)
  if ('error' in marked) throw new Error(marked.error)
  parent = marked.register
  const parentText = serializeRegister(parent)
  const scan = `"forkedFrom":{"sessionId":"${PARENT}","messageUuid":"${A}"}\n"session_id":"${FORK}"\n`
  const isForkScan = (argv: readonly string[]) => argv.some(a => a.includes('grep -o -E')) && argv[argv.length - 1]!.replace(/\\/g, '/').endsWith(`${FORK}.jsonl`)
  const opts = { session: PARENT, files: { [OLD_FILE]: parentText, [FORK_TRANSCRIPT]: '{}\n' }, process: (argv: readonly string[]) => (isForkScan(argv) ? { exitCode: 0, stdout: scan } : { exitCode: 1, stdout: '' }) }
  const w = world(on, opts)
  await start($)
  await settle()
  opts.session = FORK
  const band = (await ($ as unknown as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount({ plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' } as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: '?' }).catch(() => undefined)
  await settle()
  const fork = parseRegister(w.file(HERE) ?? '')
  expect(fork?.perma.filter(r => r.tier !== 'mark').map(r => [r.uuid, r.sessionId])).toEqual([[B, PARENT]])
  const a = fork?.slots?.user?.a
  expect(fork?.perma.find(r => r.n === a?.current)?.uuid).toBe(A)
  expect(w.file(OLD_FILE)).toBe(parentText)
})
