// A conversation's lineage (U83 unit 2, handlers/lineage.ts): read once from its transcript in the
// background with the spec's scan, kept in the store, and not scanned again. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { world } from './harness.ts'

const SID = '432b5fd1-2af8-4008-8baf-c8e33f495795'
const OLD = 'fe8a1041-3a7a-4754-8741-443af6e189f7'
const OLDER = '8ed53c04-304a-4519-a151-7e93495c6632'
const TRANSCRIPT = `C:/test-home/.claude/projects/C--test-project/${SID}.jsonl`
// What `grep -o -E <pattern> <transcript> | uniq` prints for a conversation continued twice.
const SCAN = [`"session_id":"${OLDER}"`, `"session_id":"${OLD}"`, `"session_id":"${SID}"`].join('\n')

type Engine = { session: { start: (i: object) => Promise<unknown> } }
const settle = () => new Promise(r => setTimeout(r, 300))
const isScan = (argv: readonly string[]) => argv.some(a => a.includes('grep -o -E'))

test('the lineage is read from the transcript once, in the background, and named in the log', async ($, on) => {
  let scans = 0
  const w = world(on, { session: SID, files: { [TRANSCRIPT]: '{}\n' }, process: argv => (isScan(argv) ? (scans++, { exitCode: 0, stdout: `${SCAN}\n` }) : { exitCode: 1, stdout: '' }) })
  await ($ as unknown as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  expect(scans).toBe(1)
  expect(w.logs().some(l => l.includes(`lineage of ${SID.slice(0, 8)}: ${OLDER.slice(0, 8)} (copied), ${OLD.slice(0, 8)} (copied)`))).toBe(true)
})

test('the lineage found is kept in the store as lineage:<sid>', async ($, on) => {
  const writes: { key?: unknown; value?: unknown }[] = []
  const hook = on as unknown as (event: string, match: object, h: (_h: unknown, e: Record<string, unknown>, next: (e: unknown) => unknown) => unknown) => void
  hook('store.set', {}, (_h, e, next) => {
    writes.push({ key: e.key, value: e.value })
    return next(e)
  })
  world(on, { session: SID, files: { [TRANSCRIPT]: '{}\n' }, process: argv => (isScan(argv) ? { exitCode: 0, stdout: `${SCAN}\n` } : { exitCode: 1, stdout: '' }) })
  await ($ as unknown as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  const kept = writes.find(w => w.key === `lineage:${SID}`)?.value as { ancestors?: { sessionId: string }[] } | undefined
  expect(kept?.ancestors?.map(a => a.sessionId)).toEqual([OLDER, OLD])
})

test('a lineage already kept in the store is used as it is: no scan', async ($, on) => {
  let scans = 0
  const kept = { self: SID, ancestors: [{ sessionId: OLD, via: ['copied'] }], continuedIn: [] }
  world(on, { session: SID, files: { [TRANSCRIPT]: '{}\n' }, store: { [`lineage:${SID}`]: kept }, process: argv => (isScan(argv) ? (scans++, { exitCode: 0, stdout: `${SCAN}\n` }) : { exitCode: 1, stdout: '' }) })
  await ($ as unknown as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  expect(scans).toBe(0)
})

test('the scan is the spec pattern, read by sh with the transcript as its argument', async ($, on) => {
  let argv: readonly string[] = []
  world(on, { session: SID, files: { [TRANSCRIPT]: '{}\n' }, process: a => (isScan(a) ? ((argv = a), { exitCode: 0, stdout: '' }) : { exitCode: 1, stdout: '' }) })
  await ($ as unknown as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  expect(argv[0]).toBe('sh')
  expect(argv.some(a => a.includes('"session_id":"[0-9a-f-]+"'))).toBe(true)
  expect(argv[argv.length - 1]!.replace(/\\/g, '/')).toContain(`${SID}.jsonl`)
})
