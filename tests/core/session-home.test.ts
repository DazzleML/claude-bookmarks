// The session home (0.8.15; the registry design's 14:50 ruling): a conversation may say which project
// it works on, whatever folder it runs in. The key lives in the conversation's own bookmark file,
// survives a write and a read, travels with an adoption (a continued conversation keeps the project
// the earlier one worked on, unless it said its own), and is set and cleared by one operation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyRegister, parseRegister, serializeRegister } from '../../plugin/hooks/core/bookmarks/register-file.ts'
import { applyOp, union } from '../../plugin/hooks/core/bookmarks/register-ops.ts'
import { adoptInto } from '../../plugin/hooks/core/bookmarks/adopt.ts'

const T0 = 1_762_180_000_000
const reg = (sid: string, home?: string) => ({ ...emptyRegister(sid, 'test', T0), ...(home ? { home } : {}) })

test('the home is written and read back; a file without one reads as having none', () => {
  const back = parseRegister(serializeRegister(reg('s1', 'eqtp5tl4')))
  assert.equal(back?.home, 'eqtp5tl4')
  assert.equal(parseRegister(serializeRegister(reg('s1')))?.home, undefined)
  assert.equal('home' in JSON.parse(serializeRegister(reg('s1'))), false)
})

test('the home operation sets, replaces and clears it, bumping rev; setting the same id changes nothing', () => {
  const set = applyOp(reg('s1'), { op: 'home', id: 'eqtp5tl4' }, T0 + 1)
  assert.ok(!('error' in set))
  if ('error' in set) return
  assert.equal(set.register.home, 'eqtp5tl4')
  assert.equal(set.register.rev, 1)
  const same = applyOp(set.register, { op: 'home', id: 'eqtp5tl4' }, T0 + 2)
  assert.ok(!('error' in same) && same.unchanged === true)
  const cleared = applyOp(set.register, { op: 'home' }, T0 + 3)
  assert.ok(!('error' in cleared) && cleared.register.home === undefined && cleared.register.rev === 2)
  assert.equal('home' in JSON.parse(serializeRegister((cleared as { register: ReturnType<typeof reg> }).register)), false)
})

test('a continued conversation keeps the earlier one\'s home unless it has its own', () => {
  const adopted = adoptInto(reg('s2'), reg('s1', 'eqtp5tl4'), T0 + 5)
  assert.equal(adopted.register.home, 'eqtp5tl4')
  assert.ok(adopted.adopted >= 1)
  // The earlier conversation carries a bookmark, so the adoption runs past its early return and the
  // home rule is what decides (red-green found the first version of this line passing either way).
  const earlier = { ...reg('s1', 'eqtp5tl4'), nextN: 2, perma: [{ uuid: 'u-1', n: 1, label: 'a place', owner: 'user' as const, head: 'h', by: 'user' as const, source: 'test', createdAt: T0 }] }
  const own = adoptInto(reg('s2', 'q4b8ztab'), earlier as never, T0 + 5)
  assert.ok(own.adopted >= 1, 'the earlier bookmark is adopted')
  assert.equal(own.register.home, 'q4b8ztab')
})

test('two copies meeting keep the newer copy\'s home', () => {
  const older = reg('s1', 'olderold')
  const newer = { ...reg('s1', 'newernew'), rev: 3, nextN: 2 }
  assert.equal(union(older, newer, T0 + 9).register.home, 'newernew')
})
