// node --test tests/core/adopt.test.ts
// Adopting an earlier session's register into the current one (U83 unit 4,
// core/bookmarks/adopt.ts): a conversation continued under a new session id gets its earlier
// records, letters and pins, keeping each record's session id (so its note path and links hold),
// the current conversation's own data winning, numbers kept unless taken.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addOrRelabel, emptyRegister, parseRegister, serializeRegister, type Register } from '../../plugin/hooks/core/bookmarks/register-file.ts'
import { applyOp } from '../../plugin/hooks/core/bookmarks/register-ops.ts'
import { adoptInto } from '../../plugin/hooks/core/bookmarks/adopt.ts'

const OLD = 'fe8a1041-3a7a-4754-8741-443af6e189f7'
const NEW = '432b5fd1-2af8-4008-8baf-c8e33f495795'
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const C = 'cccccccc-0000-4000-8000-000000000003'

function mint(reg: Register, uuid: string, label: string, at: number, owner: 'user' | 'claude' = 'claude'): Register {
  return addOrRelabel(reg, { uuid, owner, label, head: label, by: owner, source: 'tool' }, at).register
}
/** What a register looks like after a save and a load, as adoption sees an earlier one. */
const roundTrip = (r: Register): Register => parseRegister(serializeRegister(r))!

test('the earlier records are adopted with their numbers, their session id and a copied-from link', () => {
  const old = roundTrip(mint(mint(emptyRegister(OLD, 'w', 1), A, 'first', 2), B, 'second', 3))
  const r = adoptInto(emptyRegister(NEW, 'w', 10), old, 20)
  assert.deepEqual(r.register.perma.map(x => [x.uuid, x.n, x.sessionId]), [[A, 1, OLD], [B, 2, OLD]])
  assert.deepEqual(r.register.perma[0]!.rel, [{ kind: 'copied-from', to: `bm:${OLD.slice(0, 8)}.1~aaaaaaaa` }])
  assert.equal(r.register.nextN, 3)
  assert.equal(r.adopted, 2)
  // Saved, a copied record keeps the earlier session id, so its note stays at sessions/<earlier>/.
  assert.ok(serializeRegister(r.register).includes(`"sessionId": "${OLD}"`))
})

test("the conversation's own record of a message wins, and an own number is never taken", () => {
  const old = roundTrip(mint(mint(emptyRegister(OLD, 'w', 1), A, 'old label', 2), B, 'second', 3))
  const own = mint(emptyRegister(NEW, 'w', 10), A, 'own label', 11) // own #1, the same message as old #1
  const r = adoptInto(own, old, 20)
  const a = r.register.perma.filter(x => x.uuid === A)
  assert.deepEqual(a.map(x => [x.label, x.sessionId]), [['own label', NEW]], 'own wins: no second record of A')
  const b = r.register.perma.find(x => x.uuid === B)!
  assert.equal(b.n, 2, 'old #2 is free here, so it keeps its number')
  const own2 = mint(emptyRegister(NEW, 'w', 10), C, 'own c', 11) // own #1 is C
  const r2 = adoptInto(own2, old, 20)
  const a2 = r2.register.perma.find(x => x.uuid === A)!
  assert.equal(a2.n, 2, 'old #1 is taken by C, so A gets the next free number')
  assert.equal(r2.register.perma.find(x => x.uuid === B)!.n, 3)
  assert.deepEqual(a2.rel, [{ kind: 'copied-from', to: `bm:${OLD.slice(0, 8)}.1~aaaaaaaa` }], 'the link names the old number')
  assert.equal(r2.register.nextN, 4)
})

test('adopting again changes nothing', () => {
  const old = roundTrip(mint(emptyRegister(OLD, 'w', 1), A, 'first', 2))
  const once = adoptInto(emptyRegister(NEW, 'w', 10), old, 20).register
  const twice = adoptInto(once, old, 30)
  assert.equal(twice.adopted, 0)
  assert.equal(twice.register, once, 'the same register, not a copy')
})

test('a removed record stays removed: its tombstone comes along, the record does not', () => {
  const base = mint(mint(emptyRegister(OLD, 'w', 1), A, 'first', 2), B, 'second', 3)
  const rm = applyOp(base, { op: 'remove', id: { n: 1, uuid: A, owner: 'claude' }, removedBy: 'user' }, 4)
  if ('error' in rm) throw new Error(rm.error)
  const r = adoptInto(emptyRegister(NEW, 'w', 10), roundTrip(rm.register), 20).register
  assert.deepEqual(r.perma.map(x => x.uuid), [B])
  assert.deepEqual(r.tombstones.map(t => t.uuid), [A])
})

test('a letter comes along when the conversation has none of its own under it; pins come along', () => {
  let old = mint(emptyRegister(OLD, 'w', 1), B, 'a bookmark', 2)
  const m = applyOp(old, { op: 'setMark', owner: 'user', letter: 'a', place: { uuid: A, head: 'marked' }, at: 3 }, 3)
  if ('error' in m) throw new Error(m.error)
  old = m.register
  old = { ...old, pins: [{ uuid: C, owner: 'user', from: 'prompts', at: 4 }] }
  const r = adoptInto(emptyRegister(NEW, 'w', 10), roundTrip(old), 20).register
  const slot = r.slots?.user?.a
  assert.ok(slot && slot.current !== null)
  assert.equal(r.perma.find(x => x.n === slot.current)!.uuid, A, "the letter points at the adopted mark's record")
  assert.deepEqual(r.pins?.map(p => p.uuid), [C])
  // A letter the conversation set itself is not replaced.
  const ownMark = applyOp(emptyRegister(NEW, 'w', 10), { op: 'setMark', owner: 'user', letter: 'a', place: { uuid: B, head: 'mine' }, at: 11 }, 11)
  if ('error' in ownMark) throw new Error(ownMark.error)
  const r2 = adoptInto(ownMark.register, roundTrip(old), 20).register
  const own = r2.slots!.user!.a!
  assert.equal(r2.perma.find(x => x.n === own.current)!.uuid, B)
})

test('a chain adopted newest first: a record the newer session removed is not brought back from the older one', () => {
  const MID = '8ed53c04-0000-4000-8000-0000000000aa'
  // The oldest session bookmarked A; the middle one adopted it (keeping createdAt) and removed it.
  const oldest = roundTrip(mint(emptyRegister(MID, 'w', 1), A, 'first', 2))
  const mid0 = adoptInto(emptyRegister(OLD, 'w', 5), oldest, 6).register
  const rmA = applyOp(mid0, { op: 'remove', id: { n: 1, uuid: A, owner: 'claude' }, removedBy: 'user' }, 7)
  if ('error' in rmA) throw new Error(rmA.error)
  const mid = roundTrip(mint(rmA.register, B, 'second', 8))
  // The newest id adopts the middle session first, then the oldest.
  const once = adoptInto(emptyRegister(NEW, 'w', 10), mid, 20).register
  const r = adoptInto(once, oldest, 21).register
  assert.deepEqual(r.perma.map(x => x.uuid), [B], 'A stays removed')
  assert.ok(r.tombstones.some(t => t.uuid === A))
})

test('the adopt operation: applied through applyOp, unchanged when there is nothing new', () => {
  const old = roundTrip(mint(emptyRegister(OLD, 'w', 1), A, 'first', 2))
  const r = applyOp(emptyRegister(NEW, 'w', 10), { op: 'adopt', earlier: old }, 20)
  if ('error' in r) throw new Error(r.error)
  assert.equal(r.adopted, 1)
  assert.deepEqual(r.register.perma.map(x => x.uuid), [A])
  const again = applyOp(r.register, { op: 'adopt', earlier: old }, 30)
  if ('error' in again) throw new Error(again.error)
  assert.equal(again.unchanged, true)
})

test('the earlier register is never changed', () => {
  const old = roundTrip(mint(emptyRegister(OLD, 'w', 1), A, 'first', 2))
  const before = serializeRegister(old)
  adoptInto(emptyRegister(NEW, 'w', 10), old, 20)
  assert.equal(serializeRegister(old), before)
})
