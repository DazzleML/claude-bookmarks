// node --test tests/core/pins.test.ts
// Pins (the 0.7 groundwork design, 2026-10-25, unit 6; renamed from stars by the pins-by-name
// design, 2026-10-26): a place pinned in a list, recorded with the list it was made in;
// `pinScope` decides whether a list shows only its own pins (`here`, the default per the gate's
// G-a) or every pin on the place (`everywhere`). In memory the list is `pins` and the v2/v3 map
// `pinsV3`; in the file the list is `stars` at v4 and `pins` from v5, the map `pins` at v2/v3.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPin, isPinned, setPin, pinnedPlaces, pinPlaceKey, unionPins, type Pin } from '../../plugin/hooks/core/bookmarks/pins.ts'
import { emptyRegister, parseRegister, serializeRegister, REGISTER_VERSION, type Register } from '../../plugin/hooks/core/bookmarks/register-file.ts'
import { applyOp, union } from '../../plugin/hooks/core/bookmarks/register-ops.ts'
import { applyMigrations, MIGRATIONS, planFor, v3to4, v4to5 } from '../../plugin/hooks/core/bookmarks/migrations.ts'
import { pinnedOf } from '../../plugin/hooks/handlers/bookmarks.ts'

const P5 = { uuid: 'prompt-5' }
const R8 = { uuid: 'reply-8' }
const TOOL = { uuid: 'toolu-row', file: 'agent:a1', part: 1 }
const T0 = 1_760_000_000_000

test("djdarcy's case: #5 pinned in the prompts list and #8 in search; each list shows only its own by default, both everywhere", () => {
  let s: Pin[] = []
  s = setPin(s, 'user', P5, 'prompts', true, 'here', T0).pins
  s = setPin(s, 'user', R8, 'search', true, 'here', T0 + 1).pins
  assert.equal(isPinned(s, 'user', P5, 'prompts', 'here'), true)
  assert.equal(isPinned(s, 'user', R8, 'prompts', 'here'), false)
  assert.equal(isPinned(s, 'user', R8, 'search', 'here'), true)
  assert.equal(isPinned(s, 'user', P5, 'search', 'here'), false)
  assert.equal(isPinned(s, 'user', P5, 'search', 'everywhere'), true)
  assert.deepEqual([...pinnedPlaces(s, 'user', 'prompts', 'here')], [pinPlaceKey(P5)])
  assert.deepEqual([...pinnedPlaces(s, 'user', 'prompts', 'everywhere')].sort(), [pinPlaceKey(P5), pinPlaceKey(R8)].sort())
})

test("the same place pinned in two lists is two pins, each knowing where it was made; another owner's pin does not show", () => {
  let s = setPin([], 'user', P5, 'prompts', true, 'here', T0).pins
  s = setPin(s, 'user', P5, 'search', true, 'here', T0 + 1).pins
  s = setPin(s, 'claude', R8, 'search', true, 'here', T0 + 2).pins
  assert.deepEqual(s.map(x => x.from), ['prompts', 'search', 'search'])
  assert.equal(isPinned(s, 'user', R8, 'search', 'everywhere'), false)
})

test('a place in an agent file, or one block of several, is its own place', () => {
  const s = setPin([], 'user', TOOL, 'search', true, 'here', T0).pins
  assert.deepEqual(s[0], { uuid: 'toolu-row', file: 'agent:a1', part: 1, owner: 'user', from: 'search', at: T0 })
  assert.equal(isPinned(s, 'user', { uuid: 'toolu-row' }, 'search', 'here'), false)
  assert.equal(isPinned(s, 'user', { uuid: 'toolu-row', file: 'agent:a1', part: 1 }, 'search', 'here'), true)
  // Another block of the same record is another place (found by the 6a red-green, S8).
  assert.equal(isPinned(s, 'user', { uuid: 'toolu-row', file: 'agent:a1', part: 2 }, 'search', 'here'), false)
})

test('what counts as a pin read from a file: the four fields with their types, the optional ones typed when present', () => {
  assert.equal(isPin({ uuid: 'u', owner: 'user', from: 'prompts', at: 1 }), true)
  assert.equal(isPin({ uuid: 'u', owner: 'user', from: 'prompts', at: 1, file: 'agent:a', part: 0, off: 2 }), true)
  for (const bad of [null, 'a string', { owner: 'user', from: 'p', at: 1 }, { uuid: 'u', from: 'p', at: 1 }, { uuid: 'u', owner: 'user', at: 1 },
    { uuid: 'u', owner: 'user', from: 'p', at: 'soon' }, { uuid: 'u', owner: 'user', from: 'p', at: 1, file: 3 }, { uuid: 'u', owner: 'user', from: 'p', at: 1, part: '1' },
    { uuid: 'u', owner: 'user', from: 'p', at: 1, off: 'later' }]) assert.equal(isPin(bad), false, JSON.stringify(bad))
})

test('off stamps the pin instead of deleting it; on again clears the stamp; a toggle that changes nothing says so', () => {
  let s = setPin([], 'user', P5, 'prompts', true, 'here', T0).pins
  assert.equal(setPin(s, 'user', P5, 'prompts', true, 'here', T0 + 1).changed, false)
  s = setPin(s, 'user', P5, 'prompts', false, 'here', T0 + 2).pins
  assert.deepEqual(s, [{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: T0, off: T0 + 2 }])
  assert.equal(isPinned(s, 'user', P5, 'prompts', 'here'), false)
  assert.equal(setPin(s, 'user', P5, 'prompts', false, 'here', T0 + 3).changed, false)
  // A pin is off when it carries `off` at all, whatever the time (the 6a sweep, m1).
  assert.equal(isPinned([{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: 0, off: 0 }], 'user', P5, 'prompts', 'here'), false)
  s = setPin(s, 'user', P5, 'prompts', true, 'here', T0 + 4).pins
  assert.deepEqual(s, [{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: T0 + 4 }])
})

test("off with here turns off only this list's pin; off with everywhere turns off every pin the owner has on the place", () => {
  let s = setPin([], 'user', P5, 'prompts', true, 'here', T0).pins
  s = setPin(s, 'user', P5, 'search', true, 'here', T0 + 1).pins
  s = setPin(s, 'claude', P5, 'search', true, 'here', T0 + 1).pins
  const here = setPin(s, 'user', P5, 'search', false, 'here', T0 + 2).pins
  assert.equal(isPinned(here, 'user', P5, 'prompts', 'here'), true)
  assert.equal(isPinned(here, 'user', P5, 'search', 'here'), false)
  const all = setPin(s, 'user', P5, 'search', false, 'everywhere', T0 + 2).pins
  assert.equal(isPinned(all, 'user', P5, 'search', 'everywhere'), false)
  assert.equal(isPinned(all, 'claude', P5, 'search', 'here'), true)
})

test('when two copies meet, the later touch wins: a pin turned off on one side stays off; one only on the other side comes in', () => {
  const on = setPin([], 'user', P5, 'prompts', true, 'here', T0).pins
  const off = setPin(on, 'user', P5, 'prompts', false, 'here', T0 + 5).pins
  assert.deepEqual(unionPins(on, off).pins, off)
  assert.deepEqual(unionPins(off, on), { pins: off, changed: false })
  const other = setPin([], 'user', R8, 'search', true, 'here', T0 + 1).pins
  const u = unionPins(off, other)
  assert.equal(u.changed, true)
  assert.deepEqual(u.pins.map(x => x.uuid), ['prompt-5', 'reply-8'])
  assert.deepEqual(unionPins(u.pins, u.pins), { pins: u.pins, changed: false })
})

test("the register's union carries the pins, and a union with itself changes nothing", () => {
  const a: Register = { ...emptyRegister('s', 'w', T0), rev: 2, pins: [{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: T0, off: T0 + 9 }] }
  const b: Register = { ...emptyRegister('s', 'w', T0), rev: 1, pins: [{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: T0 }, { uuid: 'reply-8', owner: 'user', from: 'search', at: T0 + 1 }] }
  const r = union(a, b, T0 + 20)
  assert.deepEqual(r.register.pins, [{ uuid: 'prompt-5', owner: 'user', from: 'prompts', at: T0, off: T0 + 9 }, { uuid: 'reply-8', owner: 'user', from: 'search', at: T0 + 1 }])
  assert.equal(union(r.register, r.register, T0 + 30).unchanged, true)
})

test('the pin operation pins and unpins through applyOp, bumping rev only on a change', () => {
  const reg = emptyRegister('s', 'w', T0)
  const on = applyOp(reg, { op: 'pin', owner: 'user', place: R8, from: 'search', on: true, scope: 'here', at: T0 + 1 }, T0 + 1)
  assert.ok(!('error' in on))
  assert.equal(on.register.rev, reg.rev + 1)
  assert.equal(isPinned(on.register.pins, 'user', R8, 'search', 'here'), true)
  const again = applyOp(on.register, { op: 'pin', owner: 'user', place: R8, from: 'search', on: true, scope: 'here', at: T0 + 2 }, T0 + 2)
  assert.ok(!('error' in again) && again.unchanged === true)
})

test('pins round-trip through the file in their place among the keys; a malformed pin is dropped on read', () => {
  const reg: Register = { ...emptyRegister('s', 'w', T0), version: 5, format: 5, pins: [{ uuid: 'u', file: 'agent:a1', part: 2, owner: 'user', from: 'search', at: T0, off: T0 + 1 }] }
  const text = serializeRegister(reg)
  assert.deepEqual(parseRegister(text)!.pins, reg.pins)
  const keys = Object.keys(JSON.parse(text))
  assert.equal(keys.includes('stars'), false)
  assert.ok(keys.indexOf('pins') > keys.indexOf('tombstones'))
  const bad = JSON.parse(text)
  bad.pins.push({ uuid: 'no-owner', from: 'x', at: 1 }, 'a string', { uuid: 'v', owner: 'user', from: 'p', at: 'soon' })
  assert.deepEqual(parseRegister(JSON.stringify(bad))!.pins, reg.pins)
})

test('each version is written in its own shape: the map under pins at v3, the list under stars at v4 and under pins at v5', () => {
  const list: Pin[] = [{ uuid: 'p1', owner: 'user', from: 'prompts', at: 1 }]
  const v3 = JSON.parse(serializeRegister({ ...emptyRegister('s', 'w', T0), version: 3, format: 3, pinsV3: { user: ['p1'] } }))
  assert.deepEqual(v3.pins, { user: ['p1'] })
  assert.equal(v3.stars, undefined)
  assert.equal(v3.pinsV3, undefined, 'the in-memory name is never written')
  const v4 = JSON.parse(serializeRegister({ ...emptyRegister('s', 'w', T0), version: 4, format: 4, pins: list }))
  assert.deepEqual(v4.stars, list)
  assert.equal(v4.pins, undefined)
  const v5 = JSON.parse(serializeRegister({ ...emptyRegister('s', 'w', T0), version: 5, format: 5, pins: list }))
  assert.deepEqual(v5.pins, list)
  assert.equal(v5.stars, undefined)
})

test('a file of each version reads back to the same bytes (parse and serialize are inverse at v2, v3, v4 and v5)', () => {
  const base = emptyRegister('s', 'w', T0)
  const texts = [
    serializeRegister({ ...base, version: 2, format: 2, slots: undefined, pinsV3: { user: ['a', 'b'] } }),
    serializeRegister({ ...base, version: 3, format: 3, pinsV3: { user: ['a'], claude: ['c'] } }),
    serializeRegister({ ...base, version: 4, format: 4, pins: [{ uuid: 'a', owner: 'user', from: 'prompts', at: 3 }] }),
    serializeRegister({ ...base, version: 5, format: 5, pins: [{ uuid: 'a', owner: 'user', from: 'search', at: 3, off: 4 }] }),
  ]
  for (const t of texts) assert.equal(serializeRegister(parseRegister(t)!), t)
  // The shapes are told apart by the file: v3's object becomes pinsV3, v4's stars and v5's pins become pins.
  assert.deepEqual(parseRegister(texts[1]!)!.pinsV3, { user: ['a'], claude: ['c'] })
  assert.equal(parseRegister(texts[1]!)!.pins, undefined)
  assert.deepEqual(parseRegister(texts[2]!)!.pins?.map(p => p.uuid), ['a'])
  assert.equal(parseRegister(texts[2]!)!.pinsV3, undefined)
})

test('v3 to v4: every pin of the map becomes a pin from the prompts list, at the file\'s last update; the map goes; format 4', () => {
  const v3: Register = { ...emptyRegister('s', 'w', T0), version: 3, format: 3, updatedAt: T0 + 7, pinsV3: { user: ['p1', 'p2'], claude: ['p3'] } }
  const out = applyMigrations(v3, [v3to4], {}, { sessionId: 's', now: T0 + 50 })
  assert.equal(out.version, 4)
  assert.equal(out.format, 4)
  assert.equal(out.pinsV3, undefined)
  assert.deepEqual(out.pins, [
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

test('v3 to v4: a file with no pins gets no pins; a pin already in the list is not doubled; junk in the map is skipped', () => {
  // One pin is one pin (the 6a sweep, m12).
  const one = v3to4.apply({ ...emptyRegister('s', 'w', T0), pinsV3: { user: ['only'] } }, {}, { sessionId: 's', now: T0 })
  assert.deepEqual(one.pins, [{ uuid: 'only', owner: 'user', from: 'prompts', at: T0 }])
  const none = v3to4.apply(emptyRegister('s', 'w', T0), {}, { sessionId: 's', now: T0 })
  assert.equal(none.pins, undefined)
  assert.equal(none.version, 4)
  const mixed: Register = { ...emptyRegister('s', 'w', T0), pinsV3: { user: ['p1', 7 as unknown as string, 'p1'] }, pins: [{ uuid: 'p1', owner: 'user', from: 'prompts', at: 1 }] }
  assert.deepEqual(v3to4.apply(mixed, {}, { sessionId: 's', now: T0 }).pins, [{ uuid: 'p1', owner: 'user', from: 'prompts', at: 1 }])
})

test('v4 to v5: the list is the same; the version and format move to 5, so the file writes it under pins', () => {
  const v4text = serializeRegister({ ...emptyRegister('s', 'w', T0), version: 4, format: 4, pins: [{ uuid: 'p1', owner: 'user', from: 'prompts', at: 2 }] })
  const out = applyMigrations(parseRegister(v4text)!, [v4to5], {}, { sessionId: 's', now: T0 + 9 })
  assert.equal(out.version, 5)
  assert.equal(out.format, 5)
  const o = JSON.parse(serializeRegister(out))
  assert.deepEqual(o.pins, [{ uuid: 'p1', owner: 'user', from: 'prompts', at: 2 }])
  assert.equal(o.stars, undefined)
})

test("the prompts list's pins: the person's pins on main-transcript rows, made in the prompts list (here) or anywhere (everywhere), each once", () => {
  const s: Pin[] = [
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

test('live since P3: the build writes v5; a v4 file takes one step, a v3 file two', () => {
  assert.equal(REGISTER_VERSION, 5)
  assert.deepEqual(planFor(4), [v4to5])
  assert.deepEqual(planFor(3), [v3to4, v4to5])
  assert.equal(MIGRATIONS.at(-1), v4to5)
})
