// /bm-check through the kit (unit 11 of the record-format goal, handlers/bookmarks.ts
// checkCommand): a fixture data root with a clean register, an older one, an orphan note
// folder, a half-done run folder and a changed copy; the report names each and changes
// nothing. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { applyOp } from '../hooks/core/bookmarks/register-ops.ts'
import { fnv1a64 } from '../hooks/core/bookmarks/migrations.ts'
import { DATA_ROOT, world } from './harness.ts'

type Engine = Record<string, Record<string, (i: object) => Promise<unknown>>>
const SID = '11111111-2222-4333-8444-555555555555'
const OLD = '22222222-2222-4333-8444-555555555555'
const U = 'eeeeeeee-0000-4000-8000-000000000001'
const run = ($: unknown, command: string, args = '') => ($ as unknown as Engine).command.run({ command, args })

function current(sid: string): string {
  return serializeRegister(addOrRelabel(emptyRegister(sid, 'bookmarks test', 1), { uuid: U, owner: 'user', label: 'kept', head: 'kept', by: 'user', source: 'promote' }, 2).register)
}
function v1(sid: string): string {
  const { nextN: _n, slots: _s, ...reg } = emptyRegister(sid, 'bookmarks 0.4.110', 1)
  return JSON.stringify({ ...reg, version: 1 }, null, 2) + '\n'
}
const manifest = (status: string, files: { path: string; hash: string }[]) =>
  JSON.stringify({ kind: 'migration', from: 1, to: 3, writer: 'w', sessionId: SID, startedAt: 'x', status, files: files.map(f => ({ ...f, algo: 'fnv1a64', bytes: 1 })), storeKeys: [] })

test('/bm-check reports an older register, an orphan note folder, a half-done run and a changed copy, and changes no file', async ($, on) => {
  const original = v1(SID)
  const files = {
    [`${DATA_ROOT}/sessions/${SID}.json`]: current(SID),
    [`${DATA_ROOT}/sessions/${OLD}.json`]: v1(OLD),
    [`${DATA_ROOT}/sessions/33333333-2222-4333-8444-555555555555/aaaaaaaa.md`]: '# an orphan note\n',
    [`${DATA_ROOT}/backups/2026-10-16T00-00-00Z__pre-0.5__snapshot/manifest.json`]: '{"kind":"snapshot"}',
    [`${DATA_ROOT}/backups/run-done/manifest.json`]: manifest('done', [{ path: `sessions/${SID}.json`, hash: fnv1a64(original) }]),
    [`${DATA_ROOT}/backups/run-done/sessions/${SID}.json`]: original,
    [`${DATA_ROOT}/backups/run-half/manifest.json`]: manifest('backed-up', []),
    [`${DATA_ROOT}/backups/run-changed/manifest.json`]: manifest('done', [{ path: `sessions/${SID}.json`, hash: fnv1a64(original) }]),
    [`${DATA_ROOT}/backups/run-changed/sessions/${SID}.json`]: original + '\n// edited',
  }
  const w = world(on, { session: SID, files, store: { [`marks:44444444-2222-4333-8444-555555555555`]: { a: { uuid: U, head: 'h', markedAt: 1 } } } })
  const before = JSON.stringify(w.files)
  await run($, 'bm-check')
  const logs = w.logs()
  const has = (s: string) => logs.some(l => l.includes(s))
  expect(has(`2 register file(s) under bookmarks/sessions; 1 at v5`)).toBe(true)
  expect(has(`WARN ${OLD}.json is v1, older than this build: it migrates at the next start`)).toBe(true)
  expect(has('WARN bookmarks/sessions/33333333-2222-4333-8444-555555555555/ holds notes but has no')).toBe(true)
  expect(has('note bookmarks/sessions/index.json is missing')).toBe(true)
  expect(has('WARN backups/run-half/: the migration v1 -> v3 stopped at "backed-up"')).toBe(true)
  expect(has(`WARN backups/run-changed/sessions/${SID}.json differs from its manifest hash (fnv1a64)`)).toBe(true)
  expect(has('backups: 3 migration run(s), 1 done and intact; 1 snapshot(s)')).toBe(true)
  expect(has('note store holds marks or pins for 44444444 with no register')).toBe(true)
  expect(has('WARN bm-check: 4 warning(s); nothing was changed')).toBe(true)
  expect(JSON.stringify(w.files)).toBe(before)
})

test('/bm-check on a clean root says there is nothing to report', async ($, on) => {
  const w = world(on, { session: SID, files: { [`${DATA_ROOT}/sessions/${SID}.json`]: current(SID) } })
  await run($, 'bm-check')
  expect(w.logs().some(l => l === '[bm] bm-check: nothing to report; nothing was changed')).toBe(true)
  expect(w.logs().some(l => l.startsWith('[bm] WARN'))).toBe(false)
})

test('/bm-check notes a letter record no letter names (an orphan a forgotten mark can leave), and changes nothing', async ($, on) => {
  // A letter set, then its slot taken away by hand: the record stays, named by nothing.
  const marked = applyOp(emptyRegister(SID, 'bookmarks test', 1), { op: 'setMark', owner: 'user', letter: 'a', place: { uuid: U, head: 'h' }, at: 2 }, 2)
  if ('error' in marked) throw new Error(marked.error)
  const files = { [`${DATA_ROOT}/sessions/${SID}.json`]: serializeRegister({ ...marked.register, slots: {} }) }
  const w = world(on, { session: SID, files })
  const before = JSON.stringify(w.files)
  await run($, 'bm-check')
  expect(w.logs().some(l => l.includes(`note ${SID}.json holds 1 letter record(s) no letter names (#1)`))).toBe(true)
  expect(w.logs().some(l => l.startsWith('[bm] WARN'))).toBe(false)
  expect(JSON.stringify(w.files)).toBe(before)
})
