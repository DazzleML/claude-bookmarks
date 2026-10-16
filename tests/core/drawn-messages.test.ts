import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DrawnMessages } from '../../plugin/hooks/core/kit/drawn-messages.ts'
import { drawnFourOf } from '../../plugin/hooks/core/prompts/list-model.ts'

test('a drawn message keeps the text it was first drawn with', () => {
  const d = new DrawnMessages()
  d.note('aaaaaaaa-1111-4111-8111-000000000001', 'first')
  d.note('aaaaaaaa-1111-4111-8111-000000000001', 'redrawn')
  assert.equal(d.texts.get('aaaaaaaa-1111-4111-8111-000000000001'), 'first')
  assert.equal(d.texts.size, 1)
})

test('the first-four set follows the ids as they arrive, the same set the list model builds', () => {
  const d = new DrawnMessages()
  const ids = ['aaaaaaaa-1111-4111-8111-000000000000', 'bbbbbbbb-2222-4222-8222-123456789abc']
  for (const id of ids) d.note(id, '')
  assert.deepEqual([...d.firstFours].sort(), [...drawnFourOf(ids)].sort())
})
