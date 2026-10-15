// /bm-debug through the kit: pins the command's words and answers before and after it
// leaves register.tsx through ports (the 17-18-16 DWP; Q261012-11).
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
type Engine = Record<string, Record<string, (i: object) => Promise<unknown>>>
const run = ($: unknown, args: string) => ($ as unknown as Engine).command.run({ command: 'bm-debug', args })

test('/bm-debug status says the echo state, the channels and the file log', async ($, on) => {
  const w = world(on, { session: SID })
  await run($, 'status')
  const line = w.logs().find(l => l.includes('log echo'))
  expect(line !== undefined).toBe(true)
  expect(line!.includes('off, the default (every conversation without a choice of its own)')).toBe(true)
  expect(line!.includes('channels on: none')).toBe(true)
  expect(line!.includes('/bm-debug on|off|reset')).toBe(true)
})

test('/bm-debug channels lists every channel, all off', async ($, on) => {
  const w = world(on, { session: SID })
  await run($, 'channels')
  const rows = w.logs().filter(l => l.includes('debug channel '))
  expect(rows.map(l => l.replace(/^\[bm\] debug channel (\w+): (\w+).*$/, '$1:$2'))).toEqual(['screen:off', 'held:off', 'text:off'])
})

test('/bm-debug enable held turns the channel on and says so', async ($, on) => {
  const w = world(on, { session: SID })
  await run($, 'enable held')
  expect(w.toasts().some(t => t === 'bookmarks: debug channels held on')).toBe(true)
  expect(w.logs().some(l => l.startsWith('[bm] debug channel held: ON'))).toBe(true)
  expect(w.calls.some(c => c.event === 'env.set')).toBe(true)
})

test('/bm-debug enable with no names, or an unknown name, says which channels exist', async ($, on) => {
  const w = world(on, { session: SID })
  await run($, 'enable')
  expect(w.logs().some(l => l.includes('needs channel names: screen, held, text'))).toBe(true)
  await run($, 'enable zzz')
  expect(w.logs().some(l => l.includes('no such debug channel: zzz'))).toBe(true)
})

test('/bm-debug on, then default off: the echo state follows', async ($, on) => {
  const w = world(on, { session: SID })
  await run($, 'on')
  expect(w.toasts().some(t => t === "bookmarks: log echo on here only (this conversation's choice; the default is off)")).toBe(true)
  await run($, 'force off')
  expect(w.toasts().some(t => t.startsWith('bookmarks: log echo off everywhere, forced'))).toBe(true)
})
