// Promoting a mark into a bookmark (handlers/bookmarks.ts promoteLetter), the path the
// split moved in 0.4.64 with no kit test (test-scenarios 2026-10-14__02-07-49, S5): it
// ends at the clipboard, which the harness now answers. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { registerWithMarks, world } from './harness.ts'

type Engine = { command: { run: (i: object) => Promise<unknown> } }
const SID = '11111111-2222-4333-8444-555555555555'
const U = 'dddddddd-0000-4000-8000-000000000001'
const REGISTER = `C:/test-home/claude/bookmarks/sessions/${SID}.json`
// The transcript only has to exist; the program that greps it answers with the one row.
const TRANSCRIPT = `C:/test-home/.claude/projects/C--test-project/${SID}.jsonl`
const ROW = JSON.stringify({ type: 'user', uuid: U, message: { role: 'user', content: 'this is where the palette began, in so many words' }, timestamp: '2026-10-14T00:00:00.000Z' })
const FILES = registerWithMarks(SID, { a: { uuid: U, head: 'this is where the palette began', markedAt: 1, snippet: 'the palette began' } }) // the marks are the register's slots since 0.5.5
const promote = ($: unknown, letter: string) => ($ as Engine).command.run({ command: 'bm-promote', args: letter })

test('/bm-promote a: the person\'s bookmark, with the mark\'s words, and its link copied', async ($, on) => {
  const w = world(on, { session: SID, files: { [TRANSCRIPT]: '', ...FILES }, process: () => ({ exitCode: 0, stdout: `1:0:${ROW}\n` }) })
  await promote($, 'a')
  const reg = w.file(REGISTER) ?? ''
  expect(reg).toContain(`"uuid": "${U}"`)
  expect(reg).toContain('"owner": "user"')
  expect(reg).toContain('"source": "promote"')
  expect(reg).toContain('"words": "the palette began"')
  expect(w.copied().length).toBe(1)
  expect(w.copied()[0]).toContain(U.slice(0, 8))
  expect(w.toasts().at(-1)).toContain('bookmarked: the palette began')
  expect(w.toasts().at(-1)).toContain('(link copied)')
})

test('/bm-promote b with no mark b: says so, writes and copies nothing', async ($, on) => {
  const w = world(on, { session: SID, files: { [TRANSCRIPT]: '', ...FILES }, process: () => ({ exitCode: 0, stdout: `1:0:${ROW}\n` }) })
  await promote($, 'b')
  expect(w.toasts().at(-1)).toBe('mark b is not set')
  expect(w.file(REGISTER)).not.toContain('"source": "promote"')
  expect(w.copied()).toEqual([])
})
