import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScreenModel } from '../../plugin/hooks/core/kit/screen-model.ts'

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const rows = (first: number, last: number, of: number) => ({ first, last, of })

test('only real message ids are noted; null or absent drops a message', () => {
  const s = new ScreenModel()
  s.noteMessage('placeholder-1', rows(1, 3, 3), 1000)
  s.noteMessage(A, rows(1, 3, 3), 1000)
  assert.deepEqual(s.entries().map(([id]) => id), [A])
  s.noteMessage(A, null, 2000)
  assert.deepEqual(s.entries(), [])
})

test('a repeated report keeps the earlier time; a change of lines refreshes it; growth is flagged', () => {
  const s = new ScreenModel()
  s.noteMessage(A, rows(1, 5, 10), 1000)
  s.noteMessage(A, rows(1, 5, 10), 2000)
  assert.equal(s.report(A)!.at, 1000)
  s.noteMessage(A, rows(2, 6, 10), 3000)
  assert.equal(s.report(A)!.at, 3000)
  assert.equal(s.report(A)!.grew, false)
  s.noteMessage(A, rows(2, 6, 14), 4000)
  assert.equal(s.report(A)!.grew, true)
})

test('fresh is the latest burst: a message left behind by a jump drops out, a tool row dates the burst', () => {
  const s = new ScreenModel()
  s.noteMessage(A, rows(1, 5, 5), 1000)
  s.noteMessage(B, rows(1, 2, 2), 1200)
  assert.deepEqual(s.fresh().sort(), [A, B])
  s.noteMessage(B, rows(1, 2, 2), 1200 + 10_000) // a repeat: keeps 1200, so nothing is newer
  assert.deepEqual(s.fresh().sort(), [A, B])
  s.noteOther('tool-row-1', rows(1, 65, 65), 30_000) // a screen of tool rows, much later
  assert.deepEqual(s.fresh(), [])
  s.noteMessage(B, rows(3, 4, 4), 30_500)
  assert.deepEqual(s.fresh(), [B])
})

test('a non-message row: a repeat or growth keeps its time, so it does not refresh the burst', () => {
  const s = new ScreenModel()
  s.noteMessage(A, rows(1, 5, 5), 1000)
  s.noteOther('t1', rows(1, 3, 3), 1100)
  s.noteOther('t1', rows(1, 3, 3), 9000)
  s.noteOther('t1', rows(1, 3, 8), 9500)
  assert.deepEqual(s.fresh(), [A])
  s.noteOther('t1', null, 9600)
  assert.deepEqual(s.fresh(), [A])
})

test('the plugin\'s own redraw is expected for two seconds, with its reason', () => {
  const s = new ScreenModel()
  assert.equal(s.recentSelfRedraw(5000), false)
  s.expectRedraw('a highlight shown', 5000)
  assert.equal(s.selfRedrawWhy, 'a highlight shown')
  assert.equal(s.recentSelfRedraw(6999), true)
  assert.equal(s.sinceSelfRedraw(6999), 1999)
  assert.equal(s.recentSelfRedraw(7000), false)
})
