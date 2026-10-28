// node --test tests/core/ref-binding.test.ts
// The binding lines a prompt's references get (core/bookmarks/ref-binding.ts; the bm: design, 5a/5b).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bindingContext, bindingLine, parseBindings } from '../../plugin/hooks/core/bookmarks/ref-binding.ts'

test('a binding line names the exact place, with the record for a lookup, or says why it is unresolved', () => {
  assert.equal(bindingLine({ asTyped: 'bm:8f0f9b27.122~68b352d2', exact: 'bm:8f0f9b27/68b352d2', record: 122 }), 'bm-binding v1: bm:8f0f9b27.122~68b352d2 = bm:8f0f9b27/68b352d2 (#122)')
  assert.equal(bindingLine({ asTyped: 'bm:99999999/12345678', unresolved: 'not-on-this-machine' }), 'bm-binding v1: bm:99999999/12345678 = unresolved (not-on-this-machine)')
})

test('the context entry carries every line and reads back to the same bindings; none gives no entry', () => {
  const bindings = [
    { asTyped: 'bm:8f0f9b27.122~68b352d2', exact: 'bm:8f0f9b27/68b352d2', record: 122 },
    { asTyped: 'bm:8f0f9b27/aaaaaaaa.p1', exact: 'bm:8f0f9b27/aaaaaaaa.p1' },
    { asTyped: 'bm:99999999/12345678', unresolved: 'not-on-this-machine' },
  ]
  const ctx = bindingContext(bindings)!
  assert.deepEqual(parseBindings(`<system-reminder>\n${ctx}\n</system-reminder>`), bindings)
  assert.equal(bindingContext([]), undefined)
  assert.deepEqual(parseBindings('bm-binding v2: something newer\nunrelated'), [], 'another version or shape is skipped')
})
