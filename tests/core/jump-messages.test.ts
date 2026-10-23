import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REFUSED_JUMP_HOW, refusedJumpText } from '../../plugin/hooks/core/kit/jump-messages.ts'

// U59: the stock wording is 0.6.15's, byte for byte (handlers/navigation.ts before the move).
const HOW = `press Ctrl+O, then [ (full conversation), then your terminal's Find (Ctrl+Shift+F or Cmd+F)`

test('on stock the refused-jump toast is the 0.6.15 text, byte for byte', () => {
  assert.equal(REFUSED_JUMP_HOW, HOW)
  assert.equal(
    refusedJumpText('workaround', 'learn the TUI', true),
    `Can't jump there: that message isn't on screen (older than a compaction?). Copied "learn the TUI": ${HOW} and paste.`,
  )
  assert.equal(
    refusedJumpText('workaround', 'learn the TUI', false),
    `Can't jump there: that message isn't on screen (older than a compaction?). ${HOW} and search for "learn the TUI".`,
  )
  assert.equal(
    refusedJumpText('workaround', undefined, false),
    `Can't jump there: that message isn't on screen (older than a compaction?). ${HOW} and search for a few words of it.`,
  )
})

test('on the patched path the toast names the history patch and drops the compaction guess', () => {
  const t = refusedJumpText('patched', 'learn the TUI', true)
  assert.ok(t.includes('even with the history patch'), t)
  assert.ok(!t.includes('older than a compaction'), t)
  assert.ok(t.endsWith(`Copied "learn the TUI": ${HOW} and paste.`), t)
  assert.ok(refusedJumpText('patched', undefined, false).endsWith(`${HOW} and search for a few words of it.`))
})
