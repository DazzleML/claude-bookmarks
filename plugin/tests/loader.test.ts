// Slice F, the whole-conversation loader, check 4 of its design (2026-10-22__21-35-40): the
// pass reads the transcript in CHUNK_BYTES pieces through a program and carries the partial
// last line of one piece into the next, so a row split at a piece boundary is still one row.
// The program is the harness's `process` answer, keyed by argv: the chunk reader's call
// names read-chunk.ps1 and the byte offset; every other program (the user-rows back-fill)
// returns nothing.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { world } from './harness.ts'

const SID = '11111111-2222-4333-8444-666666666666'
const LOG = `C:/test-home/claude/bookmarks/debug/${SID}.log`
const TRANSCRIPT = `C:/test-home/.claude/projects/C--test-project/${SID}.jsonl`
const CHUNK_BYTES = 4_000_000 // handlers/transcript.ts; the reader is asked for this many
type Engine = Record<string, Record<string, (i: object) => Promise<unknown>>>
const settle = (ms: number) => new Promise(r => setTimeout(r, ms))
const userRow = (uuid: string, text: string) => JSON.stringify({ type: 'user', uuid, message: { role: 'user', content: text } })

// ASCII throughout, so a character count is a byte count. Filler rows up to just under the
// piece size, then the one row the first piece cuts in two.
function fixture() {
  const lines: string[] = []
  let length = 0
  for (let i = 0; length < CHUNK_BYTES - 120; i++) {
    const line = userRow(`dddddddd-0000-4000-8000-${String(i).padStart(12, '0')}`, `filler prompt ${i}`)
    lines.push(line)
    length += line.length + 1
  }
  const split = userRow('eeeeeeee-0000-4000-8000-000000000009', 'the row split across two pieces')
  lines.push(split)
  const file = lines.join('\n') + '\n'
  return { file, prompts: lines.length }
}

test('F check 4: a two-piece pass carries the split row; the second read starts where the first ended', async ($, on) => {
  const { file, prompts } = fixture()
  expect(file.length > CHUNK_BYTES).toBe(true)
  const offsets: number[] = []
  const w = world(on, {
    session: SID,
    files: { [TRANSCRIPT]: '' },
    process: argv => {
      const at = argv.indexOf('-Offset')
      if (!argv.some(a => a.endsWith('read-chunk.ps1')) || at < 0) return { exitCode: 0, stdout: '' }
      const offset = Number(argv[at + 1])
      offsets.push(offset)
      return { exitCode: 0, stdout: file.slice(offset, offset + CHUNK_BYTES) }
    },
  })
  await ($ as unknown as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  // The pass ticks on the mocked clock: one chunk per after(0); each advance fires one tick.
  for (let i = 0; i < 4; i++) {
    await w.clock.advance(10)
    await settle(300)
  }
  const line = (w.file(LOG) ?? '').split('\n').find(l => l.includes('loader:') && l.includes('chunk(s)')) ?? ''
  if (offsets.length === 0) expect((w.file(LOG) ?? '').split('\n').filter(l => /loader|process|chunk/.test(l))).toEqual(['(no chunk read was asked)'])
  expect(offsets).toEqual([0, CHUNK_BYTES])
  expect(line.includes('over 2 chunk(s)')).toBe(true)
  expect(line.includes(`(${prompts} prompts)`)).toBe(true)
  expect(line.includes(`${file.length} of ${file.length} bytes`)).toBe(true)
})
