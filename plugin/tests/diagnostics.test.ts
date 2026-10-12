// The diagnostic commands through the kit: pins their words before and after they leave
// register.tsx through ports (the 17-18-16 DWP; Q261012-11). /bm-config is in goldens.test.ts.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
// Lines logged without `always` are not drawn while the echo is off; they reach the file log.
const LOG = `C:/test-home/claude/bookmarks/debug/${SID}.log`
type Engine = Record<string, Record<string, (i: object) => Promise<unknown>>>
const run = ($: unknown, command: string, args = '') => ($ as unknown as Engine).command.run({ command, args })
const settle = () => new Promise(r => setTimeout(r, 300))
const fileLines = (w: { file: (p: string) => string | undefined }) => (w.file(LOG) ?? '').split('\n').map(l => l.slice(25))

test('/bm-env names the plugin, the Claude Code build, the session and the capability paths', async ($, on) => {
  const w = world(on, { session: SID })
  await run($, 'bm-env')
  const line = w.logs().find(l => l.includes('on Claude Code'))
  expect(line !== undefined).toBe(true)
  expect(line!.includes('on Claude Code 2.1.296')).toBe(true)
  expect(line!.includes(`session ${SID}`)).toBe(true)
  expect(line!.includes('capability paths: ideal > patched > workaround')).toBe(true)
  expect(w.logs().some(l => l.startsWith('[bm] dcc-patcher: none seen'))).toBe(true)
})

test('/bm-timeline says how many events it shows of how many', async ($, on) => {
  const w = world(on, { session: SID })
  await run($, 'bm-timeline', '5')
  await settle()
  expect(fileLines(w).some(l => /^\[bm\] timeline: last \d+ of \d+ events since load$/.test(l))).toBe(true)
})

test('/bm-marks with none set says so', async ($, on) => {
  const w = world(on, { session: SID })
  await run($, 'bm-marks')
  await settle()
  expect(fileLines(w).some(l => l === '[bm] no marks in this session')).toBe(true)
})

test('/bm-sel with nothing selected says so', async ($, on) => {
  const w = world(on, { session: SID })
  await run($, 'bm-sel')
  await settle()
  expect(fileLines(w).some(l => l.startsWith('[bm] SEL: no selection'))).toBe(true)
})

test('/bm-ids reports the drawn ids against the appended prompts', async ($, on) => {
  const w = world(on, { session: SID, store: { [`prompts:${SID}`]: [{ uuid: 'aaaaaaaa-0000-4000-8000-000000000001', head: 'first prompt' }], [`backfilled6:${SID}`]: true } })
  await run($, 'bm-ids')
  await settle()
  expect(fileLines(w).some(l => l.startsWith('[bm] ids: 0 of 1 appended prompt uuids were seen'))).toBe(true)
})
