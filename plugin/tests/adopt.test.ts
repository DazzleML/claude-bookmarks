// A conversation continued under a new session id gets its earlier sessions' bookmarks (U83 unit 4,
// handlers/bookmarks.ts adoptEarlier): once, newest first, the earlier files only read. Behind
// CONVO_BOOKMARKS_ADOPT=1 until the dry run on copies of real data (unit 6).
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, parseRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { DATA_ROOT, pathKey, world } from './harness.ts'

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

function chain(env: Record<string, string> = { CONVO_BOOKMARKS_ADOPT: '1' }) {
  const old = registerWith(OLD, B, 'from the middle session')
  const older = registerWith(OLDER, A, 'from the first session')
  return { old, older, options: { session: SID, env, store: LINEAGE, files: { [TRANSCRIPT]: '{}\n', [OLD_FILE]: old, [OLDER_FILE]: older } } }
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

test('without CONVO_BOOKMARKS_ADOPT nothing is copied (until the dry run on real copies)', async ($, on) => {
  const c = chain({})
  const w = world(on, c.options)
  await start($)
  await settle()
  expect(parseRegister(w.file(HERE) ?? '')?.perma.length ?? 0).toBe(0)
  expect(w.logs().some(l => l.includes('[bm] adopt:'))).toBe(false)
})
