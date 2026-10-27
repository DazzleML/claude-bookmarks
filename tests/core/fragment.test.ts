// node --test tests/core/fragment.test.ts
// A quoted fragment matched the way a reader means it (0.7.9; core/kit/fragment.ts): Claude quotes a
// reply's words without its Markdown, so `**<leader> l** opens` must be found by "<leader> l opens".
// Every resolver tries the exact text first and the plain form only when nothing holds it exactly:
// the loader's and the grep's rows (resolveRows) and the places (a `plain` term).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { holdsPlain, plainText } from '../../plugin/hooks/core/kit/fragment.ts'
import { resolveRows, type TranscriptRow } from '../../plugin/hooks/core/bookmarks/transcript-lines.ts'
import { matchesTerms } from '../../plugin/hooks/core/search/query.ts'
import { plainFragmentQuery } from '../../plugin/hooks/core/places/resolve.ts'

const row = (uuid: string, text: string, line: number): TranscriptRow => ({ uuid, text, line, byteStart: 0, byteEnd: 0, role: 'assistant' })

test("the plain form drops Markdown's emphasis and code marks, and folds whitespace", () => {
  assert.equal(plainText('**`<leader> l` opens** the *lists* pane'), '<leader> l opens the lists pane')
  assert.equal(plainText('__bold__ and ~~gone~~'), 'bold and gone')
  assert.equal(plainText('one\n\n  two'), 'one two')
  assert.equal(plainText('snake_case stays'), 'snake_case stays', 'a single underscore is part of a name')
})

test('a plain fragment is held when both sides match once plain; an empty one holds nothing', () => {
  assert.equal(holdsPlain('**<leader> l opens the lists pane, and closes it again.**', '<leader> l opens the lists pane'), true)
  assert.equal(holdsPlain('the `lists` tool', 'the lists tool'), true)
  assert.equal(holdsPlain('the lists tool', '**the lists tool**'), true, 'marks in the quote are dropped too')
  assert.equal(holdsPlain('something else', 'the lists tool'), false)
  assert.equal(holdsPlain('anything', '** **'), false)
})

test('resolveRows: the exact text wins; the plain form is the fallback when nothing holds it exactly', () => {
  const bold = row('a1', 'Shipped: **<leader> l opens the lists pane**.', 1)
  const plain = row('b2', 'Later: <leader> l opens the lists pane, as before.', 2)
  // Exact: only the plain-text row holds it as written, so it is the one answer (no false "many").
  assert.deepEqual(resolveRows([bold, plain], { fragment: '<leader> l opens the lists pane,' }), { kind: 'one', row: plain })
  // No row holds the quote exactly: the bold row, once plain, does.
  assert.deepEqual(resolveRows([bold], { fragment: '<leader> l opens the lists pane.' }), { kind: 'one', row: bold })
  // Nothing at all.
  assert.deepEqual(resolveRows([bold], { fragment: 'not there' }), { kind: 'none' })
})

test('the places: a plain term matches the same way, and only the resolver makes one', () => {
  const q = plainFragmentQuery('<leader> l opens')
  assert.deepEqual(q.terms, [{ kind: 'plain', text: '<leader> l opens' }])
  assert.equal(matchesTerms('**<leader> l** opens the pane', q.terms), true)
  assert.equal(matchesTerms('<leader> l closes', q.terms), false)
  assert.equal(matchesTerms('**<leader> l** opens', [{ kind: 'phrase', text: '<leader> l opens' }]), false, 'a typed phrase stays exact')
})
