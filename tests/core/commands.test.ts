import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COMMANDS } from '../../plugin/hooks/core/band/commands.ts'

// The typed commands are named twice: once in core/band/commands.ts (registered at every
// session start, with their descriptions) and once in register.tsx, each with its own
// literal `on('command.run', { command: '...' })`. The literal stays: a filter built at
// run time works, but the validator then reports `command.run{command=?}` and loses the
// plugin's list of commands (measured 2026-10-15, Q261015-02). This test keeps the two
// lists the same, so neither can gain or lose a command alone.
const register = readFileSync(new URL('../../plugin/hooks/register.tsx', import.meta.url), 'utf8')
const registered = [...register.matchAll(/on\('command\.run', \{ command: '([a-z-]+)' \}/g)].map(m => m[1]).sort()

test('every command in the table is registered once in register.tsx, and no other', () => {
  const table = COMMANDS.map(([name]) => name).sort()
  assert.deepEqual(registered, table)
  assert.equal(new Set(registered).size, registered.length, 'a command registered twice')
})

test('every registration names its command literally', () => {
  // A registration whose filter is not a string literal would not appear above.
  const all = register.match(/on\('command\.run',/g) ?? []
  assert.equal(all.length, registered.length)
})
