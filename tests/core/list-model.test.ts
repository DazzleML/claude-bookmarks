import { test } from 'node:test'
import assert from 'node:assert/strict'
import { age, bookmarkWho, drawnFourOf, foldedLabel, footnoteDisplay, footnotesByPrompt, groupHeader, numberLabel, numberNewestFirst, numberWidth, pinnedRowsOf, pointerFor, unreached } from '../../plugin/hooks/core/prompts/list-model.ts'

test('numbered in the order sent, listed newest first; labels right-aligned', () => {
  assert.deepEqual(numberNewestFirst([{ uuid: 'a' }, { uuid: 'b' }, { uuid: 'c' }]), [{ uuid: 'c', n: 3 }, { uuid: 'b', n: 2 }, { uuid: 'a', n: 1 }])
  assert.equal(numberWidth(120), 3)
  assert.equal(numberLabel(7, 3), '  7) ')
})

test('footnotes group under the prompt they follow; 0.k before the first', () => {
  const kept = [
    { kind: 'command', label: '/clear', uuid: 'f0', after: null },
    { kind: 'command', label: '/compact', uuid: 'f1', after: 'p1' },
    { kind: 'command', label: '/x', uuid: 'f2', after: 'p1' },
    { kind: 'command', label: '/y', uuid: 'f3', after: 'p3' },
  ] as never[]
  const by = footnotesByPrompt(['p1', 'p2', 'p3'], kept)
  assert.deepEqual([...by.keys()].sort(), [0, 1, 3])
  assert.deepEqual(by.get(1)!.map(x => `${x.k}:${(x.f as { label: string }).label}`), ['1:/compact', '2:/x'])
  assert.equal(by.get(0)!.length, 1)
})

test('how a prompt\'s footnotes draw, by setting and by hand', () => {
  assert.equal(footnoteDisplay('folded', false, false), 'none')
  assert.equal(footnoteDisplay('hidden', true, true), 'none')
  assert.equal(footnoteDisplay('folded', true, false), 'folded')
  assert.equal(footnoteDisplay('folded', true, true), 'open-refold')
  assert.equal(footnoteDisplay('shown', true, false), 'open')
  assert.equal(foldedLabel(1), '      … 1 footnote')
  assert.equal(foldedLabel(3), '      … 3 footnotes')
})

test('pinned rows in pin order, only those the filter shows', () => {
  const byUuid = new Map([['a', { uuid: 'a', n: 1 }], ['b', { uuid: 'b', n: 2 }], ['c', { uuid: 'c', n: 3 }]])
  assert.deepEqual(pinnedRowsOf(['c', 'zz', 'a', 'b'], byUuid, new Set(['a', 'c'])), [{ uuid: 'c', n: 3 }, { uuid: 'a', n: 1 }])
})

test('the ▶ pointer only while the band types a number', () => {
  assert.equal(pointerFor(undefined, undefined)(3), '')
  assert.equal(pointerFor('', undefined)(3), ' ')
  assert.equal(pointerFor('3', 3)(3), '▶')
  assert.equal(pointerFor('3', 3)(4), ' ')
})

test('dim by the first four groups: a drawn id with a different tail still counts', () => {
  const drawn = drawnFourOf(['aaaaaaaa-1111-4111-8111-000000000000'])
  assert.equal(unreached(drawn, 'aaaaaaaa-1111-4111-8111-222222222222'), false)
  assert.equal(unreached(drawn, 'bbbbbbbb-1111-4111-8111-222222222222'), true)
})

test('age and the bookmarks pane\'s second line', () => {
  const now = 10 * 86_400_000
  assert.equal(age(now, now - 5 * 60_000), '5m')
  assert.equal(age(now, now - 3 * 3_600_000), '3h')
  assert.equal(age(now, now - 2 * 86_400_000), '2d')
  assert.equal(bookmarkWho({ by: 'claude', role: 'assistant', createdAt: now - 60_000 } as never, now), "1m · Claude said it · Claude's")
  assert.equal(bookmarkWho({ by: 'user', owner: 'user', role: 'user', source: 'promote', temporary: true, createdAt: now } as never, now), '0m · you said it · promoted · temporary')
  assert.equal(bookmarkWho({ by: 'user', owner: 'user', sharedFrom: 'claude', createdAt: now } as never, now), '0m · shared by Claude')
})

test('the group header brackets the active group with its count', () => {
  const groups = [{ title: 'yours' }, { title: "Claude's" }, { title: 'all' }]
  assert.equal(groupHeader(groups, groups[1]!, g => g.title.length), "yours 5  [Claude's 8]  all 3")
})
