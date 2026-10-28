// node --test tests/core/ref-expand.test.ts
// Finding and expanding bm: references in a reply's text (core/bookmarks/ref-expand.ts; the bm:
// short-reference design, unit 4): a [label](bm:...) link and a bare bm: token, never inside code,
// each replaced by what the caller's resolver returns, the rest of the text untouched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expandRefs, refTokens } from '../../plugin/hooks/core/bookmarks/ref-expand.ts'

const tokens = (t: string) => refTokens(t).map(x => ({ raw: x.raw, label: x.label }))

test('a link and a bare token are found; text with none has none', () => {
  assert.deepEqual(tokens('See [that place](bm:8f0f9b27/68b352d2) and bm:8f0f9b27.122~68b352d2 too.'), [
    { raw: 'bm:8f0f9b27/68b352d2', label: 'that place' },
    { raw: 'bm:8f0f9b27.122~68b352d2', label: undefined },
  ])
  assert.deepEqual(tokens('No references here, and a bm: alone is not one.'), [])
})

test('the boundary table: trailing punctuation is not part of a bare token', () => {
  for (const [text, raw] of [
    ['(bm:8f0f9b27/68b352d2)', 'bm:8f0f9b27/68b352d2'],
    ['ends a sentence bm:8f0f9b27/68b352d2.', 'bm:8f0f9b27/68b352d2'],
    ['a list: bm:8f0f9b27.12~68b352d2, then more', 'bm:8f0f9b27.12~68b352d2'],
    ['[bm:8f0f9b27/68b352d2]', 'bm:8f0f9b27/68b352d2'],
    ['quoted "bm:8f0f9b27/68b352d2.p0"!', 'bm:8f0f9b27/68b352d2.p0'],
    ['with words bm:8f0f9b27/68b352d2~w:the%20fix; next', 'bm:8f0f9b27/68b352d2~w:the%20fix'],
  ] as const) assert.deepEqual(tokens(text).map(t => t.raw), [raw], text)
})

test('references inside inline code or a fence are left as written', () => {
  assert.deepEqual(tokens('write `bm:8f0f9b27/68b352d2` like this'), [])
  assert.deepEqual(tokens('```\nbm:8f0f9b27/68b352d2\n```\nafter bm:8f0f9b27/aaaaaaaa'), [{ raw: 'bm:8f0f9b27/aaaaaaaa', label: undefined }])
})

test('expanding: found references become links, the rest of the text is unchanged', async () => {
  const text = 'See [that place](bm:8f0f9b27/68b352d2), bm:8f0f9b27.1~68b352d2. Unknown bm:99999999/12345678 stays.'
  const out = await expandRefs(text, async raw => (raw.startsWith('bm:8f0f9b27') ? `file:///x/${raw.length}.md?u=68b352d2` : undefined))
  assert.equal(out, 'See [that place](file:///x/20.md?u=68b352d2), [bm:8f0f9b27.1~68b352d2](file:///x/22.md?u=68b352d2). Unknown bm:99999999/12345678 stays.')
  assert.equal(await expandRefs('nothing to do', async () => 'x'), 'nothing to do')
})
