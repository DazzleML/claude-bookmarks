// The data folder's README (unit 12 of the record-format goal, handlers/bookmarks.ts
// ensureReadme): written at a start when missing or from another version, left alone when
// this version wrote it. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { dataReadme, README_MARK } from '../hooks/core/bookmarks/data-readme.ts'
import { DATA_ROOT, world } from './harness.ts'

type Engine = { session: { start: (i: object) => Promise<unknown> } }
const SID = '11111111-2222-4333-8444-555555555555'
const README = `${DATA_ROOT}/README.md`
const start = ($: unknown) => ($ as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
const readmeWrites = (w: { calls: { event: string; input: unknown }[] }) => w.calls.filter(c => c.event === 'fs.write' && String((c.input as { path: string }).path).replace(/\\/g, '/') === README).length

test('a start writes bookmarks/README.md when it is missing, with the layout table and the writer', async ($, on) => {
  const w = world(on, { session: SID })
  await start($)
  const md = w.file(README) ?? ''
  expect(md.startsWith(README_MARK)).toBe(true)
  expect(md).toContain('| `sessions/<session id>.json` |')
  expect(md).toContain('## What to back up')
  // The harness answers no plugin.json, so the kit's writer is `bookmarks ?`; a live one ends in the version.
  expect(md).toMatch(/<!-- writer: bookmarks .+ -->/)
  expect(readmeWrites(w)).toBe(1)
})

test('a start rewrites another version\'s README', async ($, on) => {
  const w = world(on, { session: SID, files: { [README]: dataReadme('bookmarks 0.0.0') } })
  await start($)
  expect(readmeWrites(w)).toBe(1)
  expect(w.file(README)).not.toContain('<!-- writer: bookmarks 0.0.0 -->')
})

test('a start leaves this version\'s README alone', async ($, on) => {
  const mine = dataReadme('bookmarks ?') // the kit's writer string (no plugin.json answered)
  const w = world(on, { session: SID, files: { [README]: mine } })
  await start($)
  expect(readmeWrites(w)).toBe(0)
  expect(w.file(README)).toBe(mine)
})
