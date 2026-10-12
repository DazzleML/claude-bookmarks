import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendOnce, backfillLine, backfilledKey, footnotesKey, mergeBackfill, parseBackfill, promptList, promptTextBase, promptsKey, transcriptGuess } from '../../plugin/hooks/core/prompt-store.ts'

const row = (uuid: string, text: string, extra: Record<string, unknown> = {}) => JSON.stringify({ type: 'user', uuid, message: { role: 'user', content: text }, ...extra })

test('keys and paths', () => {
  assert.equal(promptsKey('s1'), 'prompts:s1')
  assert.equal(footnotesKey('s1'), 'footnotes:s1')
  assert.equal(backfilledKey(6, 's1'), 'backfilled6:s1')
  assert.equal(promptTextBase('C:/u/claude', 's1'), 'C:/u/claude/bookmarks/prompttext/s1')
  assert.equal(transcriptGuess('C:/u/.claude', 'C:/code/my project', 's1'), 'C:/u/.claude/projects/C--code-my-project/s1.jsonl')
})

test('appendOnce keeps a uuid once and the newest cap items', () => {
  assert.deepEqual(appendOnce([{ uuid: 'a' }], { uuid: 'b' }), [{ uuid: 'a' }, { uuid: 'b' }])
  assert.equal(appendOnce([{ uuid: 'a' }], { uuid: 'a' }), undefined)
  assert.deepEqual(appendOnce([{ uuid: 'a' }, { uuid: 'b' }], { uuid: 'c' }, 2), [{ uuid: 'b' }, { uuid: 'c' }])
})

test('a transcript read: prompts with their text, footnotes after their prompt, the rest skipped', () => {
  const stdout = [
    row('p1', 'first prompt\nsecond line'),
    '{"uuid": "cut off at the lim',
    row('f1', '<command-name>/compact</command-name><command-message>compact</command-message>'),
    row('p2', '[SYSTEM NOTIFICATION - NOT USER INPUT] a notice'),
    row('p3', 'a skill body', { isMeta: true }),
    row('p4', 'third'),
    '{"type":"user","message":{"role":"user","content":"no uuid"}}',
    '',
  ].join('\n')
  const b = parseBackfill(stdout)
  assert.deepEqual(b.found, [{ uuid: 'p1', head: 'first prompt second line' }, { uuid: 'p4', head: 'third' }]) // headOf joins the lines
  assert.deepEqual(b.texts, [['p1', 'first prompt\nsecond line'], ['p4', 'third']])
  assert.equal(b.footnotes.length, 1)
  assert.equal(b.footnotes[0]!.uuid, 'f1')
  assert.equal(b.footnotes[0]!.after, 'p1')
})

test('a footnote before any prompt follows null', () => {
  const b = parseBackfill(row('f0', '<command-name>/clear</command-name><command-message>clear</command-message>'))
  assert.deepEqual(b.found, [])
  assert.equal(b.footnotes[0]!.after, null)
})

test('the merge: file order, then live-only prompts, notices out, capped', () => {
  const found = [{ uuid: 'a', head: 'one' }, { uuid: 'b', head: 'two' }]
  const kept = [{ uuid: 'b', head: 'two' }, { uuid: 'c', head: 'live only' }, { uuid: 'n', head: '[SYSTEM NOTIFICATION - NOT USER INPUT] x' }]
  assert.deepEqual(mergeBackfill(found, kept), [{ uuid: 'a', head: 'one' }, { uuid: 'b', head: 'two' }, { uuid: 'c', head: 'live only' }])
  assert.deepEqual(mergeBackfill(found, kept, 2), [{ uuid: 'b', head: 'two' }, { uuid: 'c', head: 'live only' }])
})

test('the back-fill line', () => {
  assert.equal(backfillLine(2, 'powershell', 994, 1525179, false, 450), '[bm] backfill: 2 prompts from the transcript via powershell in 994 ms (1525179 chars); list now 450')
  assert.equal(backfillLine(402, 'sh', 3300, 4187511, true, 402), '[bm] backfill: 402 prompts from the transcript via sh in 3300 ms (4187511 chars, CUT OFF at 4 MiB: newest may be missing); list now 402')
})

test('the list: kept prompts that are prompts, then live rows the store lacks, same filter', () => {
  const kept = [{ uuid: 'a', head: 'one' }, { uuid: 'n', head: '<task-notification>done' }]
  const live = [
    { uuid: 'a', door: 'prompt', head: 'one' },
    { uuid: 'r', door: 'response', head: 'a reply' },
    { uuid: 'b', door: 'prompt', head: 'two', text: 'two in full' },
    { uuid: 'q', door: 'prompt', head: 'looks fine', text: '[Request interrupted by user]' },
  ]
  assert.deepEqual(promptList(kept, live), [{ uuid: 'a', head: 'one' }, { uuid: 'b', head: 'two' }])
})
