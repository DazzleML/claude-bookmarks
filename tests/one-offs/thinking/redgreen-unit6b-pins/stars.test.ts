// node --test tests/core/stars.test.ts
// Stars (the 0.7 groundwork design, 2026-10-25, unit 6a): a place starred in a list, recorded
// with the list it was made in; `starScope` decides whether a list shows only its own stars
// (`here`, the default per the gate's G-a) or every star on the place (`everywhere`). The v3
// pins become stars from `prompts` in the v3-to-v4 migration, written but not yet registered.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStar, isStarred, setStar, starredPlaces, starPlaceKey, unionStars, type Star } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/bookmarks/stars.ts'
import { emptyRegister, parseRegister, serializeRegister, REGISTER_VERSION, type Register } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/bookmarks/register-file.ts'
import { applyOp, union } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/bookmarks/register-ops.ts'
import { applyMigrations, MIGRATIONS, planFor, v3to4 } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/bookmarks/migrations.ts'
import { pinnedOf, starsOf } from './bookmarks.ts'

const P5 = { uuid: 'prompt-5' }
const R8 = { uuid: 'reply-8' }
const TOOL = { uuid: 'toolu-row', file: 'agent:a1', part: 1 }
const T0 = 1_760_000_000_000

test("djdarcy's case: #5 starred in the prompts list and #8 in search; each list shows only its own by default, both everywhere", () => {
  let s: Star[] = []
  s = setStar(s, 'user', P5, 'prompts', true, 'here', T0).stars
  s = setStar(s, 'user', R8, 'search', true, 'here', T0 + 1).stars
  assert.equal(isStarred(s, 'user', P5, 'prompts', 'here'), true)
  assert.equal(isStarred(s, 'user', R8, 'prompts', 'here'), false)
  assert.equal(isStarred(s, 'user', R8, 'search', 'here'), true)
  assert.equal(isStarred(s, 'user', P5, 'search', 'here'), false)
  assert.equal(isStarred(s, 'user', P5, 'search', 'everywhere'), true)
  assert.deepEqual([...starredPlaces(s, 'user', 'prompts', 'here')], [starPlaceKey(P5)])
  assert.deepEqual([...starredPlaces(s, 'user', 'prompts', 'everywhere')].sort(), [starPlaceKey(P5), starPlaceKey(R8)].sort())
})

test("the same place starred in two lists is two stars, each knowing where it was made; another owner's star does not show", () => {
  let s = setStar([], 'user', P5, 'prompts', true, 'here', T0).stars
  s = setStar(s, 'user', P5, 'search', true, 'here', T0 + 1).stars
  s = setStar(s, 'claude', R8, 'search', true, 'here', T0 + 2).stars
  assert.deepEqual(s.map(x => x.from), ['prompts', 'search', 'search'])
  assert.equal(isStarred(s, 'user', R8, 'search', 'everywhere'), false)
})

test('a place in an agent file, or one block of several, is its own place', () => {
  const s = setStar([], 'user', TOOL, 'search', true, 'here', T0).stars
  assert.deepEqual(s[0], { uuid: 'toolu-row', file: 'agent:a1', part: 1, owner: 'user', from: 'search', at: T0 })
  assert.equal(isStarred(s, 'user', { uuid: 'toolu-row' }, 'search', 'here'), false)
  assert.equal(isStarred(s, 'user', { uuid: 'toolu-row', file: 'agent:a1', part: 1 }, 'search', 'here'), true)
  // Another block of the same record is another place (found by the 6a red-green, S8).
  assert.equal(isStarred(s, 'user', { uuid: 'toolu-row', file: 'agent:a1', part: 2 }, 'search', 'here'), false)
})

test('what counts as a star read from a file: the four fields with their types, the optional ones typed when present', () => {
  assert.equal(isStar({ uuid: 'u', owner: 'user', from: 'prompts', at: 1 }), true)
  assert.equal(isStar({ uuid: 'u', owner: 'user', from: 'prompts', at: 1, file: 'agent:a', part: 0, off: 2 }), true)
  for (const bad of [null, 'a string', { owner: 'user', from: 'p', at: 1 }, { uuid: 'u', from: 'p', at: 1 }, { uuid: 'u', owner: 'user', at: 1 },
    { uuid: 'u', owner: 'user', from: 'p', at: 'soon' }, { uuid: 'u', owner: 'user', from: 'p', at: 1, file: 3 }, { uuid: 'u', owner: 'user', from: 'p', at: 1, part: '1' },
    { uuid: 'u', owner: 'user', from: 'p', at: 1, off: 'later' }]) assert.equal(isStar(bad), false, JSON.stringify(bad))
})

test('off stamps the star instead of deleting it; on again clears the stamp; a toggle that changes nothing says so', () => {
  let s = setStar([], 'user', P5, 'prompts', true, 'here', T0).stars
  assert.equal(setStar(s, 'user', P5, 'prompts', true, 'here', T0 + 1).changed, false)
  s = setStar(s, 'user', P5, 'prompts', false, 'here', T0 + 2).stars
  assert.deepEqual(s, [{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: T0, off: T0 + 2 }])
  assert.equal(isStarred(s, 'user', P5, 'prompts', 'here'), false)
  assert.equal(setStar(s, 'user', P5, 'prompts', false, 'here', T0 + 3).changed, false)
  // A star is off when it carries `off` at all, whatever the time (the 6a sweep, m1).
  assert.equal(isStarred([{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: 0, off: 0 }], 'user', P5, 'prompts', 'here'), false)
  s = setStar(s, 'user', P5, 'prompts', true, 'here', T0 + 4).stars
  assert.deepEqual(s, [{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: T0 + 4 }])
})

test("off with here turns off only this list's star; off with everywhere turns off every star the owner has on the place", () => {
  let s = setStar([], 'user', P5, 'prompts', true, 'here', T0).stars
  s = setStar(s, 'user', P5, 'search', true, 'here', T0 + 1).stars
  s = setStar(s, 'claude', P5, 'search', true, 'here', T0 + 1).stars
  const here = setStar(s, 'user', P5, 'search', false, 'here', T0 + 2).stars
  assert.equal(isStarred(here, 'user', P5, 'prompts', 'here'), true)
  assert.equal(isStarred(here, 'user', P5, 'search', 'here'), false)
  const all = setStar(s, 'user', P5, 'search', false, 'everywhere', T0 + 2).stars
  assert.equal(isStarred(all, 'user', P5, 'search', 'everywhere'), false)
  assert.equal(isStarred(all, 'claude', P5, 'search', 'here'), true)
})

test('when two copies meet, the later touch wins: a star turned off on one side stays off; one only on the other side comes in', () => {
  const on = setStar([], 'user', P5, 'prompts', true, 'here', T0).stars
  const off = setStar(on, 'user', P5, 'prompts', false, 'here', T0 + 5).stars
  assert.deepEqual(unionStars(on, off).stars, off)
  assert.deepEqual(unionStars(off, on), { stars: off, changed: false })
  const other = setStar([], 'user', R8, 'search', true, 'here', T0 + 1).stars
  const u = unionStars(off, other)
  assert.equal(u.changed, true)
  assert.deepEqual(u.stars.map(x => x.uuid), ['prompt-5', 'reply-8'])
  assert.deepEqual(unionStars(u.stars, u.stars), { stars: u.stars, changed: false })
})

test("the register's union carries the stars, and a union with itself changes nothing", () => {
  const a: Register = { ...emptyRegister('s', 'w', T0), rev: 2, stars: [{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: T0, off: T0 + 9 }] }
  const b: Register = { ...emptyRegister('s', 'w', T0), rev: 1, stars: [{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: T0 }, { uuid: 'reply-8', owner: 'user', from: 'search', at: T0 + 1 }] }
  const r = union(a, b, T0 + 20)
  assert.deepEqual(r.register.stars, [{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: T0, off: T0 + 9 }, { uuid: 'reply-8', owner: 'user', from: 'search', at: T0 + 1 }])
  assert.equal(union(r.register, r.register, T0 + 30).unchanged, true)
})

test('the star operation stars and unstars through applyOp, bumping rev only on a change', () => {
  const reg = emptyRegister('s', 'w', T0)
  const on = applyOp(reg, { op: 'star', owner: 'user', place: R8, from: 'search', on: true, scope: 'here', at: T0 + 1 }, T0 + 1)
  assert.ok(!('error' in on))
  assert.equal(on.register.rev, reg.rev + 1)
  assert.equal(isStarred(on.register.stars, 'user', R8, 'search', 'here'), true)
  const again = applyOp(on.register, { op: 'star', owner: 'user', place: R8, from: 'search', on: true, scope: 'here', at: T0 + 2 }, T0 + 2)
  assert.ok(!('error' in again) && again.unchanged === true)
})

test('stars round-trip through the file in their place among the keys; a malformed star is dropped on read', () => {
  const reg: Register = { ...emptyRegister('s', 'w', T0), stars: [{ uuid: 'u', file: 'agent:a1', part: 2, owner: 'user', from: 'search', at: T0, off: T0 + 1 }] }
  const text = serializeRegister(reg)
  assert.deepEqual(parseRegister(text)!.stars, reg.stars)
  const keys = Object.keys(JSON.parse(text))
  assert.equal(keys.indexOf('stars'), keys.indexOf('slots') + 1)
  const bad = JSON.parse(text)
  bad.stars.push({ uuid: 'no-owner', from: 'x', at: 1 }, 'a string', { uuid: 'v', owner: 'user', from: 'p', at: 'soon' })
  assert.deepEqual(parseRegister(JSON.stringify(bad))!.stars, reg.stars)
})

test('v3 to v4: every pin becomes a star from the prompts list, at the file\'s last update; the pins go; format 4', () => {
  const v3: Register = { ...emptyRegister('s', 'w', T0), updatedAt: T0 + 7, pins: { user: ['p1', 'p2'], claude: ['p3'] } }
  const out = applyMigrations(v3, [v3to4], {}, { sessionId: 's', now: T0 + 50 })
  assert.equal(out.version, 4)
  assert.equal(out.format, 4)
  assert.equal(out.pins, undefined)
  assert.deepEqual(out.stars, [
    { uuid: 'p1', owner: 'user', from: 'prompts', at: T0 + 7 },
    { uuid: 'p2', owner: 'user', from: 'prompts', at: T0 + 7 },
    { uuid: 'p3', owner: 'claude', from: 'prompts', at: T0 + 7 },
  ])
  // The file keeps everything else: records, slots, unknown keys.
  const kept = { ...v3, perma: [], slots: { user: {} }, future: { keep: true } } as Register
  const out2 = v3to4.apply(kept, {}, { sessionId: 's', now: T0 })
  assert.deepEqual((out2 as Register & { future?: unknown }).future, { keep: true })
  assert.deepEqual(out2.slots, { user: {} })
})

test('v3 to v4: a file with no pins gets no stars key; a pin already a star is not doubled; junk in the pins is skipped', () => {
  // One pin is one star (the 6a sweep, m12).
  const one = v3to4.apply({ ...emptyRegister('s', 'w', T0), pins: { user: ['only'] } }, {}, { sessionId: 's', now: T0 })
  assert.deepEqual(one.stars, [{ uuid: 'only', owner: 'user', from: 'prompts', at: T0 }])
  const none = v3to4.apply(emptyRegister('s', 'w', T0), {}, { sessionId: 's', now: T0 })
  assert.equal(none.stars, undefined)
  assert.equal(none.version, 4)
  const mixed: Register = { ...emptyRegister('s', 'w', T0), pins: { user: ['p1', 7 as unknown as string, 'p1'] }, stars: [{ uuid: 'p1', owner: 'user', from: 'prompts', at: 1 }] }
  assert.deepEqual(v3to4.apply(mixed, {}, { sessionId: 's', now: T0 }).stars, [{ uuid: 'p1', owner: 'user', from: 'prompts', at: 1 }])
})

test("the prompts list's pins: the person's stars on main-transcript rows, made in the prompts list (here) or anywhere (everywhere), each once", () => {
  const s: Star[] = [
    { uuid: 'p1', owner: 'user', from: 'prompts', at: 1 },
    { uuid: 'p2', owner: 'user', from: 'search', at: 2 },
    { uuid: 'p1', owner: 'user', from: 'search', at: 3 },
    { uuid: 'p3', owner: 'claude', from: 'prompts', at: 4 },
    { uuid: 'p4', owner: 'user', from: 'prompts', at: 5, off: 6 },
    { uuid: 't1', file: 'agent:a', owner: 'user', from: 'prompts', at: 7 },
  ]
  assert.deepEqual(pinnedOf(s, 'here'), ['p1'])
  assert.deepEqual(pinnedOf(s, 'everywhere'), ['p1', 'p2'])
})

test('a file still at v3 shows its pins as the stars its migration will make; a v4 file shows its own stars', () => {
  const v3: Register = { ...emptyRegister('s', 'w', T0), version: 3, format: 3, updatedAt: T0 + 3, pins: { user: ['p1'] } }
  assert.deepEqual(starsOf(v3), [{ uuid: 'p1', owner: 'user', from: 'prompts', at: T0 + 3 }])
  const v4: Register = { ...emptyRegister('s', 'w', T0), pins: { user: ['ignored'] }, stars: [{ uuid: 'p9', owner: 'user', from: 'prompts', at: 1 }] }
  assert.deepEqual(starsOf(v4), [{ uuid: 'p9', owner: 'user', from: 'prompts', at: 1 }])
})

test('live since 0.7.1 (unit 6b): the build writes v4, and a v3 file takes the one step', () => {
  assert.equal(REGISTER_VERSION, 4)
  assert.deepEqual(planFor(3), [v3to4])
  assert.equal(MIGRATIONS.at(-1), v3to4)
})
