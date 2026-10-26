// The version guard and the `.bak` rule (0.5.1, the data design of 2026-10-16), as the
// handler meets them through the engine. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, parseRegister, REGISTER_VERSION, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const UUID = 'cccccccc-0000-4000-8000-000000000001'
const PATH = `C:/test-home/claude/bookmarks/sessions/${SID}.json`

// The default is this build's own version: these tests are about the guard and the .bak rule,
// and since migrate-on-load (the pins-by-name design, 2026-10-26) an older fixture would be
// migrated at its first load, before the case under test ran.
function registerText(version = REGISTER_VERSION): string {
  const r = addOrRelabel(
    emptyRegister(SID, 'bookmarks 0.9', 1),
    { uuid: UUID, owner: 'claude', label: 'where the palette began', head: 'the message', by: 'claude', source: 'tool', tier: 'bookmark' },
    2,
  ).register
  const o = JSON.parse(serializeRegister(r))
  o.version = version
  o.format = version // the fixture's format moves with its version: a v9 file asks for a v9 reader (0.5.12)
  if (version === 1) {
    // A v1 file as the proof of concept wrote it: no numbers, no hoist, no format field.
    delete o.format
    delete o.nextN
    delete o.perma[0].n
    o.perma[0].sessionId = SID
  }
  return JSON.stringify(o, null, 2) + '\n'
}

async function call($: { tool: { call: (i: never) => Promise<unknown> } }, input: Record<string, unknown>) {
  const out = (await $.tool.call({ tool: 'mcp__bookmarks__bookmark', tool_use_id: 'toolu_test', ...input } as never)) as { result?: string }
  return JSON.parse(String(out.result ?? '{}')) as Record<string, unknown>
}

test('a register from a newer build is read in full and never written; the tool says so', async ($, on) => {
  const before = registerText(REGISTER_VERSION + 1) // one above this build's version
  const w = world(on, { session: SID, files: { [PATH]: before } })
  const listed = await call($ as never, { action: 'list' })
  expect((listed.claudes as unknown[]).length).toBe(1)
  // Said once at load, before anything tries to write (mutation sweep v0.5.1, M9).
  expect(w.toasts().filter(t => t.includes('newer build')).length).toBe(1)
  const relabel = await call($ as never, { action: 'relabel', uuid: UUID.slice(0, 8), owner: 'claude', label: 'renamed' })
  expect(String(relabel.error)).toContain('newer build')
  expect(w.file(PATH)).toBe(before)
  expect(w.file(`${PATH}.bak`)).toBe(undefined)
  expect(w.toasts().filter(t => t.includes('newer build')).length).toBe(2)
})

test('.bak is written only from a file that parses: a torn file never becomes the backup', async ($, on) => {
  const good = registerText()
  const torn = good.slice(0, good.length / 2)
  const w = world(on, { session: SID, files: { [PATH]: torn, [`${PATH}.bak`]: good } })
  // The torn file falls back to .bak on load; a save keeps that .bak rather than copying the torn text over it.
  const out = await call($ as never, { action: 'relabel', uuid: UUID.slice(0, 8), owner: 'claude', label: 'renamed' })
  expect(out.ok).toBe(true)
  expect(w.file(`${PATH}.bak`)).toBe(good)
  expect(parseRegister(w.file(PATH) ?? '')?.perma[0]?.label).toBe('renamed')
  // The log says the .bak was the copy loaded (N10); the line lands in the echo or the debug file.
  expect(everything(w).some(t => t.includes('loaded its .bak'))).toBe(true)
})

// Commit by operation (unit 3): the file changed on disk since this session read it.
test('a hand edit on disk survives: the operation is applied to the disk\'s version, not this session\'s copy', async ($, on) => {
  const good = registerText()
  const w = world(on, { session: SID, files: { [PATH]: good } })
  await call($ as never, { action: 'list' }) // the session reads the file
  // Someone edits the label by hand (or another window writes); this session's copy is now stale.
  w.files[fileKey(w, good)] = good.replace('"label": "where the palette began"', '"label": "edited by hand"')
  const out = await call($ as never, { action: 'relabel', uuid: UUID.slice(0, 8), owner: 'claude', why: 'a reason added by this session' })
  expect(out.ok).toBe(true)
  const saved = parseRegister(w.file(PATH) ?? '')!
  expect(saved.perma[0]?.label).toBe('edited by hand')
  expect(saved.perma[0]?.why).toBe('a reason added by this session')
  expect(w.file(`${PATH}.bak`)).toContain('edited by hand')
})

/** The harness's own key for a file whose text is `text` (it normalises paths its own way). */
const fileKey = (w: { files: Record<string, string> }, text: string) => Object.keys(w.files).find(k => w.files[k] === text)!

test('an operation whose record is gone from the disk reports and writes nothing', async ($, on) => {
  const good = registerText()
  const w = world(on, { session: SID, files: { [PATH]: good } })
  await call($ as never, { action: 'list' })
  // Another writer removed the only record.
  const emptied = JSON.parse(good)
  emptied.perma = []
  emptied.rev = 9
  const emptiedText = JSON.stringify(emptied, null, 2) + '\n'
  w.files[fileKey(w, good)] = emptiedText
  const out = await call($ as never, { action: 'relabel', uuid: UUID.slice(0, 8), owner: 'claude', label: 'renamed' })
  expect(String(out.error)).toContain('changed since this session read it')
  expect(w.file(PATH)).toBe(emptiedText)
})

// The header's title and project (unit 6): the first prompt's head, and the cwd's last segment whatever its trailing slash.
test('the header takes the first prompt as the title and the folder name as the project', async ($, on) => {
  const good = registerText()
  const w = world(on, {
    session: SID,
    cwd: 'C:/test-project/',
    files: { [PATH]: good },
    store: { [`prompts:${SID}`]: [{ uuid: 'aaaaaaaa-0000-4000-8000-000000000001', head: 'first prompt' }, { uuid: 'bbbbbbbb-0000-4000-8000-000000000002', head: 'second prompt' }], [`backfilled7:${SID}`]: true },
  })
  const out = await call($ as never, { action: 'relabel', uuid: UUID.slice(0, 8), owner: 'claude', label: 'renamed' })
  expect(out.ok).toBe(true)
  const saved = parseRegister(w.file(PATH) ?? '')
  expect(saved?.title).toBe('first prompt')
  expect(saved?.project).toBe('test-project')
})

/** Every line the plugin logged or wrote, wherever it went. */
function everything(w: { logs: () => string[]; files: Record<string, string> }): string[] {
  return [...w.logs(), ...Object.values(w.files)]
}

test('.bak is the previous file when that file parses', async ($, on) => {
  const good = registerText()
  const w = world(on, { session: SID, files: { [PATH]: good } })
  const out = await call($ as never, { action: 'relabel', uuid: UUID.slice(0, 8), owner: 'claude', label: 'renamed' })
  expect(out.ok).toBe(true)
  expect(w.file(`${PATH}.bak`)).toBe(good)
  // A file of this build's version never draws the newer-build warning (M9).
  expect(w.toasts().some(t => t.includes('newer build'))).toBe(false)
  // The save stamps this build as the writer (N8), and what was saved is what is read next (N9).
  const saved = parseRegister(w.file(PATH) ?? '')
  expect(saved?.writer.startsWith('bookmarks ')).toBe(true)
  expect(saved?.writer).not.toBe('bookmarks 0.9')
  // The header's project is the cwd's last segment, refreshed on save (unit 6); no title when the conversation has no prompts yet.
  expect(saved?.project).toBe('test-project')
  expect(saved?.title).toBe(undefined)
  const listed = await call($ as never, { action: 'list' })
  expect((listed.claudes as { label: string }[])[0]?.label).toBe('renamed')
  // And a file that read fine was never reported as loaded from its .bak (N10).
  expect(everything(w).some(t => t.includes('loaded its .bak'))).toBe(false)
})
