// /bm-delmarks (handlers/marks.ts delmarksCommand, moved out of register.tsx's registration in
// 0.4.94): the usage line with nothing to delete, and a deleted letter staying deleted. It had
// no kit test before the move (test plan 2026-10-15__15-46-14, S2). Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { world } from './harness.ts'

type Engine = { command: { run: (i: object) => Promise<unknown> } }
const SID = '11111111-2222-4333-8444-555555555555'
const U = 'dddddddd-0000-4000-8000-000000000001'
const MARKS = { [`marks:${SID}`]: { a: { uuid: U, head: 'first', markedAt: 1, source: 'selection', snippet: 'first' }, b: { uuid: U, head: 'second', markedAt: 2, source: 'selection', snippet: 'second' } } }
const delmarks = ($: unknown, args: string) => ($ as Engine).command.run({ command: 'bm-delmarks', args })

test('/bm-delmarks with no letters gives the usage line and deletes nothing', async ($, on) => {
  const w = world(on, { session: SID, store: MARKS })
  await delmarks($, '')
  expect(w.toasts().at(-1)).toBe('Usage: /bm-delmarks a b   (or /bm-delmarks all)')
  await delmarks($, 'a')
  expect(w.toasts().at(-1)).toBe('deleted mark a')
})

test('/bm-delmarks a deletes a and keeps b; a second delete finds a gone', async ($, on) => {
  const w = world(on, { session: SID, store: MARKS })
  await delmarks($, 'a')
  expect(w.toasts().at(-1)).toBe('deleted mark a')
  await delmarks($, 'a b')
  expect(w.toasts().at(-1)).toBe('deleted mark b')
})
