// /bm-delmarks (handlers/marks.ts delmarksCommand, moved out of register.tsx's registration in
// 0.4.94): the usage line with nothing to delete, and a deleted letter staying deleted. It had
// no kit test before the move (test plan 2026-10-15__15-46-14, S2). Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { DATA_ROOT, registerWithMarks, world } from './harness.ts'
import { parseRegister } from '../hooks/core/bookmarks/register-file.ts'

type Engine = { command: { run: (i: object) => Promise<unknown> } }
const SID = '11111111-2222-4333-8444-555555555555'
const U = 'dddddddd-0000-4000-8000-000000000001'
const U2 = 'eeeeeeee-0000-4000-8000-000000000002'
// Since 0.5.5 the marks are the register's slots (two letters on two messages).
const FILES = registerWithMarks(SID, { a: { uuid: U, head: 'first', markedAt: 1, snippet: 'first' }, b: { uuid: U2, head: 'second', markedAt: 2, snippet: 'second' } })
const delmarks = ($: unknown, args: string) => ($ as Engine).command.run({ command: 'bm-delmarks', args })

test('/bm-delmarks with no letters gives the usage line and deletes nothing', async ($, on) => {
  const w = world(on, { session: SID, files: FILES })
  await delmarks($, '')
  expect(w.toasts().at(-1)).toBe('Usage: /bm-delmarks a b   (or /bm-delmarks all)')
  await delmarks($, 'a')
  expect(w.toasts().at(-1)).toBe('deleted mark a')
})

test('/bm-delmarks a deletes a and keeps b; a second delete finds a gone', async ($, on) => {
  const w = world(on, { session: SID, files: FILES })
  await delmarks($, 'a')
  expect(w.toasts().at(-1)).toBe('deleted mark a')
  await delmarks($, 'a b')
  expect(w.toasts().at(-1)).toBe('deleted mark b')
  // The slots: both cleared, both histories kept, both records still in the file (the data design, 2026-10-16).
  const reg = parseRegister(w.file(`${DATA_ROOT}/sessions/${SID}.json`) ?? '')!
  expect(reg.slots?.user?.a?.current).toBe(null)
  expect(reg.slots?.user?.b?.current).toBe(null)
  expect(reg.slots?.user?.a?.history.length).toBe(1)
  expect(reg.perma.filter(r => r.tier === 'mark').length).toBe(2)
})
