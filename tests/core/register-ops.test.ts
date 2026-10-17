// node --test tests/core/register-ops.test.ts
// Identity and commit by operation (unit 3 of the record-format goal; the 2026-10-16
// assessments, C7 and probe p8). Two writers, A and B, hold copies of one file; B's
// operations land first; A's are replayed onto B's result by identity, never by position.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addOrRelabel, emptyRegister, findRecord, idOf, isRecord, listOf, parseRegister, recordById, serializeRegister, type Mint, type Register } from '../../plugin/hooks/core/bookmarks/register-file.ts'
import { applyOp, LETTER_HISTORY_CAP, letterHistory, marksOf, union, type Op } from '../../plugin/hooks/core/bookmarks/register-ops.ts'
import { sameMessage } from '../../plugin/hooks/core/kit/message-id.ts'

const SESSION = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const T0 = 1_760_000_000_000
const u = (k: string) => `${k.repeat(8)}-0000-4000-8000-000000000001`
const mintOf = (k: string, label: string, owner: Mint['owner'] = 'user'): Mint => ({ uuid: u(k), owner, label, head: `head ${k}`, by: 'claude', source: 'tool' })

/** A v2 register (numbered) with records one, two and twelve, as p8 had it. */
function diskRegister(): Register {
  let reg: Register = emptyRegister(SESSION, 'w', T0) // v2: numbered from 1
  reg = addOrRelabel(reg, mintOf('a', 'one'), T0 + 100).register // n 1
  reg = addOrRelabel(reg, mintOf('b', 'two'), T0 + 200).register // n 2
  reg = { ...reg, nextN: 12 }
  reg = addOrRelabel(reg, mintOf('c', 'twelve'), T0 + 1200).register // n 12
  return reg
}

/** The operation as commitOp applies it to a base: the result, or the error. */
function commit(base: Register, op: Op, now: number): Register {
  const r = applyOp(base, op, now)
  assert.ok(!('error' in r), 'error' in r ? r.error : '')
  return r.register
}

test('a v2 file numbers its records and never reuses a number; a v1 file numbers nothing', () => {
  const d = diskRegister()
  assert.deepEqual(d.perma.map(r => r.n), [1, 2, 12])
  assert.equal(d.nextN, 13)
  const removed = commit(d, { op: 'remove', id: idOf(d.perma[1]!), removedBy: 'test' }, T0 + 2000)
  assert.equal(removed.tombstones[0]?.n, 2)
  assert.equal(removed.tombstones[0]?.createdAt, T0 + 200)
  const next = commit(removed, { op: 'mint', mint: mintOf('d', 'thirteen') }, T0 + 2100)
  assert.equal(next.perma.at(-1)?.n, 13, 'the removed 2 is not reused')
  assert.equal(next.nextN, 14)
  const { nextN: _n, slots: _s, ...v1base } = emptyRegister(SESSION, 'w', T0)
  const v1 = addOrRelabel({ ...v1base, version: 1 }, mintOf('a', 'one'), T0).register
  assert.equal(v1.perma[0]?.n, undefined)
  assert.equal(v1.nextN, undefined)
})

test('p8: two writers; A\'s operations replay onto B\'s result by identity', () => {
  const disk0 = diskRegister()
  // B lands first: a new place, then removes two.
  const b1 = commit(disk0, { op: 'mint', mint: mintOf('e', 'B new place') }, T0 + 3500)
  const bNew = b1.perma.at(-1)!
  assert.equal(bNew.n, 13)
  const b2 = commit(b1, { op: 'remove', id: idOf(disk0.perma[1]!), removedBy: 'B' }, T0 + 4000)
  // A, holding disk0, relabels one and mints its own place; each is replayed onto b2.
  const a1 = commit(b2, { op: 'relabel', id: idOf(disk0.perma[0]!), changes: { label: 'one (A relabel)' } }, T0 + 5000)
  assert.equal(recordById(a1, idOf(disk0.perma[0]!))?.label, 'one (A relabel)')
  const a2 = commit(a1, { op: 'mint', mint: mintOf('f', 'A new place') }, T0 + 3000)
  assert.equal(a2.perma.at(-1)?.n, 14, 'A\'s mint takes the next number after B\'s, not the 13 A would have guessed')
  assert.deepEqual(a2.perma.map(r => [r.n, r.label]), [[1, 'one (A relabel)'], [12, 'twelve'], [13, 'B new place'], [14, 'A new place']])
  assert.deepEqual(a2.tombstones.map(t => t.n), [2])
  // Drift: A relabels two, which B removed -- fails loudly, nothing resolved for it.
  const drift = applyOp(a2, { op: 'relabel', id: idOf(disk0.perma[1]!), changes: { label: 'two (A)' } }, T0 + 5200)
  assert.ok('error' in drift)
  assert.match(drift.error, /#2/)
  assert.match(drift.error, /removed/)
})

test('a relabel of a removed record fails and reports; a removal twice fails the second time', () => {
  const d = diskRegister()
  const id = idOf(d.perma[2]!)
  const gone = commit(d, { op: 'remove', id, removedBy: 'test' }, T0 + 1)
  const r = applyOp(gone, { op: 'relabel', id, changes: { label: 'x' } }, T0 + 2)
  assert.ok('error' in r)
  const again = applyOp(gone, { op: 'remove', id, removedBy: 'test' }, T0 + 3)
  assert.ok('error' in again)
  assert.match(again.error, /already removed/)
})

test('identity: n when both have one, else (uuid, createdAt) and the owner; a drawn id names the same message', () => {
  const d = diskRegister()
  const one = d.perma[0]!
  assert.ok(isRecord(one, { n: 1, uuid: 'zzzzzzzz-0000-4000-8000-000000000009' }), 'n wins when both sides have one')
  assert.ok(!isRecord(one, { n: 2, uuid: one.uuid }))
  assert.ok(isRecord(one, { uuid: one.uuid, createdAt: one.createdAt }))
  assert.ok(!isRecord(one, { uuid: one.uuid, createdAt: one.createdAt + 1 }), 'the same message minted at another time is another record')
  assert.ok(!isRecord(one, { uuid: one.uuid, owner: 'claude' }), 'the other list is another record')
  const drawn = one.uuid.replace(/[0-9a-f]{12}$/, '000000000000')
  assert.ok(isRecord(one, { uuid: drawn, createdAt: one.createdAt }))
  // A claim keeps the identity (same n, uuid, createdAt) while the owner changes: the id without an owner still finds it.
  const onClaudes = addOrRelabel(d, mintOf('1', 'claudes', 'claude'), T0 + 10).register
  const rec = onClaudes.perma.at(-1)!
  const claimed = commit(onClaudes, { op: 'claim', id: idOf(rec) }, T0 + 11)
  const after = recordById(claimed, { n: rec.n, uuid: rec.uuid })
  assert.equal(after?.owner, 'user')
  assert.equal(after?.n, rec.n)
  assert.equal(after?.createdAt, rec.createdAt)
})

test('a mint with a drawn id is marked idKind drawn; a real uuid is not', () => {
  const d = diskRegister()
  const drawn = u('2').replace(/[0-9a-f]{12}$/, '000000000000')
  const r = commit(d, { op: 'mint', mint: { ...mintOf('2', 'drawn'), uuid: drawn } }, T0 + 1)
  assert.equal(r.perma.at(-1)?.idKind, 'drawn')
  assert.equal(d.perma[0]?.idKind, undefined)
  const text = serializeRegister(r)
  assert.ok(text.includes('"idKind": "drawn"'))
  assert.equal(parseRegister(text)?.perma.at(-1)?.idKind, 'drawn')
})

test('a claim plus a relabel on each side union to one record', () => {
  const d = addOrRelabel(diskRegister(), mintOf('1', 'claudes', 'claude'), T0 + 2000).register
  const rec = d.perma.at(-1)!
  const sideA = commit(d, { op: 'claim', id: idOf(rec) }, T0 + 2020)
  const sideB = commit(d, { op: 'relabel', id: idOf(rec), changes: { label: 'renamed by B' } }, T0 + 2030)
  const merged = union(sideA, sideB, T0 + 2040).register
  const matches = merged.perma.filter(r => isRecord(r, { n: rec.n, uuid: rec.uuid }))
  assert.equal(matches.length, 1, 'one record, not two')
  assert.equal(matches[0]?.label, 'renamed by B', 'the later touch wins')
})

test('the union is by identity and idempotent; a later tombstone removes on both sides', () => {
  const d = diskRegister()
  const a = commit(d, { op: 'mint', mint: mintOf('e', 'only on A') }, T0 + 2001)
  const b = commit(d, { op: 'remove', id: idOf(d.perma[0]!), removedBy: 'B' }, T0 + 2002)
  const ab = union(a, b, T0 + 2003).register
  assert.deepEqual(ab.perma.map(r => r.label).sort(), ['only on A', 'twelve', 'two'])
  assert.deepEqual(ab.tombstones.map(t => t.n), [1])
  assert.equal(ab.nextN, 14)
  const again = union(ab, b, T0 + 2004)
  assert.equal(again.unchanged, true)
  assert.deepEqual(again.register, ab)
  const self = union(ab, ab, T0 + 2005)
  assert.equal(self.unchanged, true)
})

test('union: on a rev tie the left-hand copy is the base; a tombstone at the very instant of the last touch still removes (mutation sweep v0.5.3, M11 and M13)', () => {
  const d = diskRegister()
  const a = { ...commit(d, { op: 'mint', mint: mintOf('e', 'on A') }, T0 + 2001), writer: 'A' }
  const b = { ...commit(d, { op: 'mint', mint: mintOf('f', 'on B') }, T0 + 2001), writer: 'B' }
  assert.equal(a.rev, b.rev)
  assert.equal(union(a, b, T0 + 2002).register.writer, 'A', 'the caller\'s own copy wins the tie')
  assert.equal(union(b, a, T0 + 2002).register.writer, 'B')
  // The record `one` was last touched at T0 + 100; a removal stamped at exactly that instant wins.
  const one = d.perma[0]!
  const removedAtTouch: Register = { ...d, rev: d.rev + 1, perma: d.perma.filter(r => r !== one), tombstones: [{ uuid: one.uuid, n: one.n, createdAt: one.createdAt, owner: 'user', removedAt: one.createdAt }] }
  const merged = union(d, removedAtTouch, T0 + 3000).register
  assert.ok(!merged.perma.some(r => r.n === one.n), 'removed at the instant of its last touch: gone, not resurrected')
})

test('pins are a per-owner list in the register; pinning twice changes nothing', () => {
  const d = diskRegister()
  const p = commit(d, { op: 'pin', owner: 'user', uuid: u('a'), on: true }, T0 + 1)
  assert.deepEqual(p.pins, { user: [u('a')] })
  const twice = applyOp(p, { op: 'pin', owner: 'user', uuid: u('a'), on: true }, T0 + 2)
  assert.ok(!('error' in twice) && twice.unchanged)
  const off = commit(p, { op: 'pin', owner: 'user', uuid: u('a'), on: false }, T0 + 3)
  assert.deepEqual(off.pins, { user: [] })
  const text = serializeRegister(p)
  assert.ok(text.indexOf('"pins"') > text.indexOf('"tombstones"'), 'pins after tombstones in the file')
  assert.deepEqual(parseRegister(text)?.pins, { user: [u('a')] })
})

// --- Slots (unit 5): the letters and the reading position as records pointed at by slots -----

const place = (k: string, head: string, words?: string) => ({ uuid: u(k), head, ...(words ? { words } : {}) })

test('setMark: a letter makes a mark record and a slot; re-marking the same message reuses the record; another message pushes history', () => {
  const d = diskRegister()
  const a1 = commit(d, { op: 'setMark', owner: 'user', letter: 'a', place: place('a', 'first head', 'the selected words'), at: T0 + 3000 }, T0 + 3000)
  const rec = a1.perma.find(r => r.tier === 'mark')!
  assert.equal(rec.n, 13)
  assert.equal(rec.label, 'the selected words')
  assert.equal(rec.words, 'the selected words')
  assert.equal(rec.source, 'mark')
  assert.equal(rec.by, 'user')
  assert.deepEqual(a1.slots?.user?.a, { current: 13, history: [{ n: 13, at: T0 + 3000 }] })
  // The same message again under the same letter: no new record, the time moves.
  const a2 = commit(a1, { op: 'setMark', owner: 'user', letter: 'a', place: place('a', 'first head', 'other words'), at: T0 + 3100 }, T0 + 3100)
  assert.equal(a2.perma.filter(r => r.tier === 'mark').length, 1)
  assert.deepEqual(a2.slots?.user?.a, { current: 13, history: [{ n: 13, at: T0 + 3100 }] })
  assert.equal(recordById(a2, { n: 13, uuid: u('a') })?.words, 'other words', 'the words follow the latest selection')
  assert.equal(marksOf(a2, 'user').a?.markedAt, T0 + 3100, 'markedAt is when the letter was last set there, not when the record was made (mutation sweep v0.5.5, M9)')
  // Another message: a new record, the old one kept as a_001.
  const a3 = commit(a2, { op: 'setMark', owner: 'user', letter: 'a', place: place('e', 'second head'), at: T0 + 3200 }, T0 + 3200)
  assert.deepEqual(a3.slots?.user?.a, { current: 14, history: [{ n: 14, at: T0 + 3200 }, { n: 13, at: T0 + 3100 }] })
  assert.equal(a3.nextN, 15)
  // The same message as a bookmark on the same list is a separate record: a mark never relabels a bookmark.
  const withBookmark = commit(a3, { op: 'mint', mint: mintOf('e', 'a bookmark here', 'user') }, T0 + 3300)
  assert.equal(withBookmark.perma.filter(r => sameMessage(r.uuid, u('e'))).length, 2)
  // Marks are not bookmarks: listOf leaves them out (the three from diskRegister plus the one bookmark on e),
  // and a lookup by message finds the bookmark, never the mark (the export of a promoted mark described the mark, 0.5.6).
  assert.ok(!listOf(withBookmark, 'user').some(r => r.tier === 'mark'))
  assert.equal(listOf(withBookmark, 'user').length, 4)
  assert.equal(findRecord(withBookmark, u('e'), 'user')?.tier, undefined, 'the bookmark (no tier field), not the mark')
  assert.equal(findRecord(a3, u('e'), 'user'), undefined, 'a message with only a mark has no findable record')
})

test('marksOf derives the panes\' marks from the slots; a cleared letter shows nothing but keeps its history; bring back by n', () => {
  const d = diskRegister()
  const a1 = commit(d, { op: 'setMark', owner: 'user', letter: 'a', place: place('a', 'first head', 'words'), at: T0 + 3000 }, T0 + 3000)
  const a2 = commit(a1, { op: 'setMark', owner: 'user', letter: 'a', place: place('e', 'second head'), at: T0 + 3200 }, T0 + 3200)
  const b = commit(a2, { op: 'setMark', owner: 'user', letter: '`', place: place('b', 'reading here', 'the line'), at: T0 + 3300 }, T0 + 3300)
  const marks = marksOf(b, 'user')
  assert.deepEqual(marks.a, { uuid: u('e'), head: 'second head', markedAt: T0 + 3200, source: 'screen' })
  assert.deepEqual(marks['`'], { uuid: u('b'), head: 'reading here', markedAt: T0 + 3300, source: 'selection', snippet: 'the line' })
  assert.deepEqual(letterHistory(b, 'user', 'a').map(h => [h.name, h.n, h.current]), [['a', 14, true], ['a_001', 13, false]])
  // Clear a: nothing drawn for a, the history kept, the records kept.
  const cleared = commit(b, { op: 'clearMarks', owner: 'user', letters: ['a', 'z'] }, T0 + 3400)
  assert.equal(marksOf(cleared, 'user').a, undefined)
  assert.equal(cleared.slots?.user?.a?.current, null)
  assert.equal(cleared.slots?.user?.a?.history.length, 2)
  assert.equal(cleared.perma.filter(r => r.tier === 'mark').length, 3)
  const r = applyOp(b, { op: 'clearMarks', owner: 'user', letters: ['a', 'z'] }, T0 + 3400)
  assert.ok(!('error' in r) && r.cleared?.join() === 'a' && r.missing?.join() === 'z')
  const nothing = applyOp(cleared, { op: 'clearMarks', owner: 'user', letters: ['a'] }, T0 + 3500)
  assert.ok(!('error' in nothing) && nothing.unchanged, 'clearing a cleared letter changes nothing')
  // Bring back the first place by its number: current again, moved to the head with the new time.
  const back = commit(cleared, { op: 'bringBack', owner: 'user', letter: 'a', n: 13, at: T0 + 3600 }, T0 + 3600)
  assert.deepEqual(back.slots?.user?.a, { current: 13, history: [{ n: 13, at: T0 + 3600 }, { n: 14, at: T0 + 3200 }] })
  assert.equal(marksOf(back, 'user').a?.uuid, u('a'))
  const wrong = applyOp(back, { op: 'bringBack', owner: 'user', letter: 'a', n: 99, at: T0 + 3700 }, T0 + 3700)
  assert.ok('error' in wrong)
  // A record that exists but was never under this letter is refused too (M4): bring back is within a letter's own history.
  const elsewhere = applyOp(back, { op: 'bringBack', owner: 'user', letter: 'a', n: 12, at: T0 + 3700 }, T0 + 3700)
  assert.ok('error' in elsewhere)
  assert.match(elsewhere.error, /not in a's history/)
})

test('a letter\'s history is capped at LETTER_HISTORY_CAP; an unnumbered (v1) file refuses a mark', () => {
  let reg = diskRegister()
  for (let i = 0; i < LETTER_HISTORY_CAP + 5; i++) {
    // Distinct messages: the first four groups differ (sameMessage compares those), so no record is reused.
    const uuid = `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`.replace(/0000-4000-8000-000000000000$/, `${String(i).padStart(4, '0')}-4000-8000-000000000001`)
    reg = commit(reg, { op: 'setMark', owner: 'user', letter: 'a', place: { uuid, head: `h${i}` }, at: T0 + 4000 + i }, T0 + 4000 + i)
  }
  assert.equal(reg.slots?.user?.a?.history.length, LETTER_HISTORY_CAP)
  const { nextN: _n, slots: _s, ...v1 } = emptyRegister(SESSION, 'w', T0)
  const refused = applyOp({ ...v1, version: 1 }, { op: 'setMark', owner: 'user', letter: 'a', place: place('a', 'h'), at: T0 }, T0)
  assert.ok('error' in refused)
  assert.match(refused.error, /not numbered/)
})

test('a prune with nothing to prune is unchanged; a hand edit survives a replayed mint', () => {
  const d = diskRegister()
  const r = applyOp(d, { op: 'prune', retention: '7d' }, T0 + 1)
  assert.ok(!('error' in r) && r.unchanged)
  // The file on disk was edited by hand (a label) since this session read it; the mint replays onto the edited file.
  const edited = parseRegister(serializeRegister(d).replace('"label": "one"', '"label": "one, by hand"'))!
  const replayed = commit(edited, { op: 'mint', mint: mintOf('e', 'new') }, T0 + 2)
  assert.equal(replayed.perma[0]?.label, 'one, by hand')
  assert.equal(replayed.perma.at(-1)?.label, 'new')
})
