// node --test tests/core/ref-binding.test.ts
// The binding lines a prompt's references get (core/bookmarks/ref-binding.ts; the bm: design, 5a/5b).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bindingContext, bindingLine, bindingsForPrompt, parseBindings } from '../../plugin/hooks/core/bookmarks/ref-binding.ts'

// Unit 5b: the shape unit 0 measured -- the prompt, its attachment rows, then the context row whose
// parent is the last attachment, not the prompt.
test('a prompt\'s bindings are read back from its context row, found by walking parents to the nearest typed prompt', () => {
  const ctx = bindingContext([{ asTyped: 'bm:8f0f9b27.1~68b352d2', exact: 'bm:8f0f9b27/68b352d2', record: 1 }])!
  const rows = [
    { uuid: 'p1', parentUuid: null, type: 'user', text: 'first prompt' },
    { uuid: 'a1', parentUuid: 'p1', type: 'attachment', attachment: 'environment', text: 'env' },
    { uuid: 'c1', parentUuid: 'a1', type: 'attachment', attachment: 'hook_additional_context', text: ctx },
    { uuid: 'r1', parentUuid: 'c1', type: 'assistant', text: 'reply' },
    { uuid: 'p2', parentUuid: 'r1', type: 'user', text: 'second prompt, no references' },
    { uuid: 'm2', parentUuid: 'p2', type: 'user', isMeta: true, text: 'a reminder' },
    { uuid: 'c2', parentUuid: 'm2', type: 'attachment', attachment: 'hook_additional_context', text: 'unrelated context' },
  ]
  assert.deepEqual(bindingsForPrompt(rows, 'p1'), [{ asTyped: 'bm:8f0f9b27.1~68b352d2', exact: 'bm:8f0f9b27/68b352d2', record: 1 }])
  assert.deepEqual(bindingsForPrompt(rows, 'p2'), [], 'a context row without binding lines gives none')
})

// The red-green audit (dispatched after the fact, 2026-10-30) found the meta skip unpinned: the
// case above holds no binding under the meta row, so counting the meta row as the prompt changed
// nothing. Here the binding sits under a meta row and belongs to the typed prompt above it.
test('a meta user row between a context row and its prompt is skipped: the binding belongs to the typed prompt', () => {
  const ctx = bindingContext([{ asTyped: 'bm:8f0f9b27.2~aaaaaaaa', exact: 'bm:8f0f9b27/aaaaaaaa', record: 2 }])!
  const rows = [
    { uuid: 'p1', parentUuid: null, type: 'user', text: 'a prompt' },
    { uuid: 'm1', parentUuid: 'p1', type: 'user', isMeta: true, text: 'a reminder' },
    { uuid: 'c1', parentUuid: 'm1', type: 'attachment', attachment: 'hook_additional_context', text: ctx },
  ]
  assert.deepEqual(bindingsForPrompt(rows, 'p1'), [{ asTyped: 'bm:8f0f9b27.2~aaaaaaaa', exact: 'bm:8f0f9b27/aaaaaaaa', record: 2 }])
  assert.deepEqual(bindingsForPrompt(rows, 'm1'), [], 'a meta row is never a prompt')
})

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
