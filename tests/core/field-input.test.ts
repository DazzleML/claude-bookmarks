// The list field's contract (plugin/hooks/core/band/field-input.ts; the input-routing
// design of 2026-10-25, unit 1): what the prompts and bookmarks `#` fields, and the band's
// own field, do with the text typed so far. Run: node --test tests/core/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fieldInput } from '../../plugin/hooks/core/band/field-input.ts'
import { DEFAULT_TABLES } from '../../plugin/hooks/core/band/keys.ts'

const T = DEFAULT_TABLES

test('a lone close key closes either list, and only alone', () => {
  assert.deepEqual(fieldInput('q', 'list', 50, T), { op: 'close' })
  assert.deepEqual(fieldInput('q', 'bookmarks', 5, T), { op: 'close' })
  assert.notEqual(fieldInput('1q', 'list', 50, T).op, 'close')
})

test('the prompts field: /words is the filter, anything else clears it', () => {
  assert.deepEqual(fieldInput('/hel', 'list', 50, T), { op: 'text', filter: 'hel' })
  assert.deepEqual(fieldInput('/', 'list', 50, T), { op: 'text', filter: '' })
  assert.deepEqual(fieldInput('4', 'list', 50, T), { op: 'text', filter: '' })
})

test('typing a number never jumps on its own: Enter does (PROMPT_NUMBER_JUMPS_AT is enter)', () => {
  // band-entry.ts promptNumberComplete jumps early only when jumpsAt is 'complete'.
  assert.deepEqual(fieldInput('12', 'list', 50, T), { op: 'text', filter: '' })
  assert.deepEqual(fieldInput('7', 'list', 9, T), { op: 'text', filter: '' })
  assert.deepEqual(fieldInput('3', 'bookmarks', 5, T), { op: 'text' })
})

test('the bookmarks field: a number then the remove key removes that bookmark', () => {
  assert.deepEqual(fieldInput('12d', 'bookmarks', 20, T), { op: 'remove', number: '12' })
  assert.deepEqual(fieldInput('d', 'bookmarks', 20, T), { op: 'text' })
})

test('the bookmarks field has no filter, and the prompts field has no remove', () => {
  assert.deepEqual(fieldInput('/x', 'bookmarks', 5, T), { op: 'text' })
  assert.equal(fieldInput('12d', 'list', 50, T).op, 'text')
})
