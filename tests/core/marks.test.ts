import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MarkCache, deleteMarks, marksShowing, searchPhrase, type Marks } from '../../plugin/hooks/core/marks/marks.ts'

test('the mark cache: replace takes the stored record; a transient highlight lasts until the next replace', () => {
  const c = new MarkCache()
  assert.deepEqual(c.all, {})
  c.replace({ a: { uuid: 'u1', head: 'first', markedAt: 1 } })
  c.showTransient('@', { uuid: 'u2', head: 'anchor words', markedAt: 2, source: 'selection', snippet: 'anchor words' })
  assert.deepEqual(Object.keys(c.all).sort(), ['@', 'a'])
  assert.equal(c.headOf('u2'), 'anchor words')
  assert.equal(c.headOf('nope'), undefined)
  c.replace({ a: { uuid: 'u1', head: 'first', markedAt: 1 } })
  assert.deepEqual(Object.keys(c.all), ['a'])
})

const U = 'aaaaaaaa-1111-4111-8111-222222222222'
const DRAWN = 'aaaaaaaa-1111-4111-8111-000000000000' // the same message as Claude Code draws it
const MARKS: Marks = {
  a: { uuid: U, head: 'h', markedAt: 1, source: 'selection', snippet: 'words' },
  b: { uuid: U, head: 'h', markedAt: 2, source: 'latest' },
  c: { uuid: 'cccccccc-1111-4111-8111-222222222222', head: 'h', markedAt: 3, source: 'selection' },
}

test('only the shown mark, only from a selection, only on its own row (real uuid or drawn id)', () => {
  assert.deepEqual(marksShowing(MARKS, U, undefined), [])
  assert.deepEqual(marksShowing(MARKS, U, 'a').map(([l]) => l), ['a'])
  assert.deepEqual(marksShowing(MARKS, DRAWN, 'a').map(([l]) => l), ['a'])
  assert.deepEqual(marksShowing(MARKS, U, 'b'), []) // not a selection
  assert.deepEqual(marksShowing(MARKS, U, 'c'), []) // another message
  assert.deepEqual(marksShowing(MARKS, U, 'z'), [])
})

test('the search phrase: openings stripped, whitespace folded, cut at a word near 32 characters', () => {
  assert.equal(searchPhrase(undefined), undefined)
  assert.equal(searchPhrase('   '), undefined)
  assert.equal(searchPhrase('RE: { the actual words }'), 'the actual words }')
  assert.equal(searchPhrase('<pasted_content id="1">pasted  text\nhere</pasted_content>'), 'pasted text here')
  assert.equal(searchPhrase('one two three four five six seven eight nine'), 'one two three four five six')
  assert.equal(searchPhrase('x'.repeat(40)), 'x'.repeat(32))
  // A space too early (at or before 16) is not a cut point: the raw 32 characters stand
  // (mutation sweep 2026-10-12: the earlier case's last space was past 16 either way).
  assert.equal(searchPhrase('abcdefghijklmnop qrstuvwxyzabcdefghij'), 'abcdefghijklmnop qrstuvwxyzabcde')
  assert.equal(searchPhrase('short'), 'short')
})

test('/bm-delmarks: named letters, or every set one; the reading position is never a letter', () => {
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')
  const marks: Marks = { a: MARKS.a!, c: MARKS.c!, '`': { uuid: U, head: 'reading', markedAt: 0 } }
  const named = deleteMarks(marks, ' A, z ', LETTERS)
  assert.deepEqual(named.letters, ['a', 'z'])
  assert.deepEqual(named.gone, ['a'])
  assert.deepEqual(named.missing, ['z'])
  assert.deepEqual(Object.keys(named.kept).sort(), ['`', 'c'])
  const all = deleteMarks(marks, 'all', LETTERS)
  assert.deepEqual(all.gone, ['a', 'c'])
  assert.deepEqual(Object.keys(all.kept), ['`'])
  assert.deepEqual(deleteMarks(marks, '!', LETTERS).gone, ['a', 'c'])
  assert.deepEqual(deleteMarks(marks, '', LETTERS).letters, [])
  assert.deepEqual(deleteMarks(marks, '1 ab', LETTERS).letters, [])
})
