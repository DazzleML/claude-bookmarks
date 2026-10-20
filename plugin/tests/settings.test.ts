// Settings (#7) end to end: the person's /config values reach the plugin, a change in
// /config takes effect, and the debugText setting decides whether a log line quotes
// the conversation. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { registerWithMarks, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const settingsLine = (logs: string[]) => logs.find(l => l.startsWith('[bm] settings: ')) ?? ''

test('values chosen in /config reach the plugin and say so', { options: { followHere: 'never', paneAfterJump: 'stay' } }, async ($, on) => {
  const w = world(on, { session: SID })
  await $.command.run({ command: 'bm-config', args: '' } as never)
  const line = settingsLine(w.logs())
  expect(line).toContain('followHere="never" (/config)')
  expect(line).toContain('paneAfterJump="stay" (/config)')
  expect(line).toContain('listOpensAt="nearest" (default)')
})

test('a change in /config takes effect without a reload', async ($, on) => {
  const w = world(on, { session: SID })
  // Beneath the plugins, the change is stored as asked.
  on('config.set', {}, async (_h, e) => ({ value: e.value }))
  await $.config.set({ key: 'bookmarks.followHere', value: 'always', previous: 'when-idle', provider: { plugin: 'bookmarks', tier: 'mod' }, origin: { kind: 'composer' } } as never)
  await $.command.run({ command: 'bm-config', args: '' } as never)
  expect(settingsLine(w.logs())).toContain('followHere="always" (/config)')
})

const FILES = registerWithMarks(SID, { a: { uuid: 'bbbbbbbb-0000-4000-8000-000000000001', head: 'the marked message', markedAt: 0 } }) // the marks are the register's slots since 0.5.5
const debugLog = (files: Record<string, string>) => Object.entries(files).find(([p]) => p.endsWith(`${SID}.log`))?.[1] ?? ''

test('debugText off: a line that quotes the conversation is not kept', { options: { debugText: 'off' } }, async ($, on) => {
  const w = world(on, { session: SID, files: FILES })
  await $.command.run({ command: 'bm-marks', args: '' } as never)
  await w.clock.advance(1000)
  expect(debugLog(w.files)).not.toContain('the marked message')
})

test('debugText auto in a folder build: the line is kept, quote and all', async ($, on) => {
  const w = world(on, { session: SID, files: FILES })
  await $.command.run({ command: 'bm-marks', args: '' } as never)
  await w.clock.advance(1000)
  expect(debugLog(w.files)).toContain('the marked message')
})

test('the text channel keeps the quote whatever the setting', { options: { debugText: 'off' } }, async ($, on) => {
  const w = world(on, { session: SID, files: FILES, env: { CONVO_BOOKMARKS_DEBUG: 'text' } })
  await $.command.run({ command: 'bm-marks', args: '' } as never)
  await w.clock.advance(1000)
  expect(debugLog(w.files)).toContain('the marked message')
})
