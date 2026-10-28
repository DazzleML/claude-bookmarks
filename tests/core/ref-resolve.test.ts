// node --test tests/core/ref-resolve.test.ts
// The resolver of a bm: reference (core/bookmarks/ref-resolve.ts; the bm: short-reference design
// 2026-10-27__14-00-02, unit 2): the current conversation first (a fork keeps its parent's uuids),
// then the named session, then "not on this machine"; seven outcomes, never a guess.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cachedRegisters, resolveRef, type RefPorts, type RegisterView } from '../../plugin/hooks/core/bookmarks/ref-resolve.ts'
import { parseRef } from '../../plugin/hooks/core/bookmarks/ref.ts'

const CUR = 'aaaaaaaa-1111-4111-8111-111111111111'
const OTHER = 'bbbbbbbb-2222-4222-8222-222222222222'
const TWIN = 'bbbbbbbb-3333-4333-8333-333333333333'
const U1 = '68b352d2-c1aa-4bbb-8ccc-000000000001'
const U2 = '68b352d2-c9ff-4ddd-8eee-000000000002'
const U3 = '77777777-0000-4000-8000-000000000003'

type Row = { uuid: string; text?: string }
function ports(world: { sessions: Record<string, { title?: string; rows: Row[]; register?: RegisterView }> }): RefPorts & { loads: string[] } {
  const loads: string[] = []
  return {
    loads,
    currentSession: () => CUR,
    sessionsByPrefix: async p => Object.entries(world.sessions).filter(([id]) => id.startsWith(p)).map(([id, s]) => ({ id, ...(s.title ? { title: s.title } : {}) })),
    rowsByPrefix: async (sid, p) => (world.sessions[sid]?.rows ?? []).filter(r => r.uuid.replace(/-/g, '').startsWith(p.replace(/-/g, ''))),
    register: async sid => { loads.push(sid); return world.sessions[sid]?.register },
  }
}
const ref = (t: string) => parseRef(t)!

test('found: an exact reference to a row of another conversation on this machine', async () => {
  const p = ports({ sessions: { [CUR]: { rows: [] }, [OTHER]: { rows: [{ uuid: U3 }] } } })
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb/77777777.p0'), p), { kind: 'found', session: OTHER, uuid: U3, part: 0 })
})

test('local first: a fork holds its parent\'s rows, so a parent reference lands in the current conversation', async () => {
  const p = ports({ sessions: { [CUR]: { rows: [{ uuid: U3 }] }, [OTHER]: { rows: [{ uuid: U3 }] } } })
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb/77777777'), p), { kind: 'found', session: CUR, uuid: U3 })
})

test('ambiguous row: two rows share the prefix; the words decide, else both are offered', async () => {
  const rows = [{ uuid: U1, text: 'the landing fix' }, { uuid: U2, text: 'something else' }]
  const p = ports({ sessions: { [CUR]: { rows }, [OTHER]: { rows: [] } } })
  assert.deepEqual(await resolveRef(ref('bm:aaaaaaaa/68b352d2'), p), { kind: 'ambiguous-row', session: CUR, candidates: [U1, U2] })
  assert.deepEqual(await resolveRef(ref('bm:aaaaaaaa/68b352d2~w:landing%20fix'), p), { kind: 'found', session: CUR, uuid: U1, words: 'landing fix' })
})

test('unverified: a reference into a conversation whose rows cannot be read here is kept as written', async () => {
  const base = ports({ sessions: { [CUR]: { rows: [] }, [OTHER]: { rows: [] } } })
  const p = { ...base, rowsByPrefix: async (sid: string, pre: string) => (sid === OTHER ? undefined : base.rowsByPrefix(sid, pre)) }
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb/77777777.p1'), p), { kind: 'found', session: OTHER, uuid: '77777777', part: 1, unverified: true })
})

test('ambiguous session: two conversations share the prefix and neither is the current one', async () => {
  const p = ports({ sessions: { [CUR]: { rows: [] }, [OTHER]: { title: 'one', rows: [] }, [TWIN]: { title: 'two', rows: [] } } })
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb/77777777'), p), { kind: 'ambiguous-session', candidates: [{ id: OTHER, title: 'one' }, { id: TWIN, title: 'two' }] })
})

test('not on this machine, and not found', async () => {
  const p = ports({ sessions: { [CUR]: { rows: [] }, [OTHER]: { rows: [] } } })
  assert.deepEqual(await resolveRef(ref('bm:cccccccc/77777777'), p), { kind: 'not-on-this-machine', session: 'cccccccc' })
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb/77777777'), p), { kind: 'not-found', session: OTHER })
})

const REG: RegisterView = { records: [{ n: 122, uuid: U3, part: 0 }], tombstones: [{ n: 7, uuid: U1 }] }

test('a lookup resolves through its register; the check must agree', async () => {
  const p = ports({ sessions: { [CUR]: { rows: [] }, [OTHER]: { rows: [{ uuid: U3 }], register: REG } } })
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb.122~77777777'), p), { kind: 'found', session: OTHER, uuid: U3, part: 0, record: 122 })
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb.122'), p), { kind: 'found', session: OTHER, uuid: U3, part: 0, record: 122 }, 'a typed lookup with no check')
})

test('a lookup reads its record from the named conversation, then finds the row here first when a fork holds it', async () => {
  const p = ports({ sessions: { [CUR]: { rows: [{ uuid: U3 }] }, [OTHER]: { rows: [{ uuid: U3 }], register: REG } } })
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb.122~77777777'), p), { kind: 'found', session: CUR, uuid: U3, part: 0, record: 122 })
})

test('mismatch: a re-created register numbers from 1 again; the check reports it and the fallback finds the row', async () => {
  const recreated: RegisterView = { records: [{ n: 122, uuid: U2 }], tombstones: [] }
  const p = ports({ sessions: { [CUR]: { rows: [] }, [OTHER]: { rows: [{ uuid: U3 }, { uuid: U2 }], register: recreated } } })
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb.122~77777777'), p), {
    kind: 'mismatch', session: OTHER, record: 122, check: '77777777', registerNames: U2, fallback: { kind: 'found', session: OTHER, uuid: U3, record: 122 },
  })
  const none = ports({ sessions: { [CUR]: { rows: [] }, [OTHER]: { rows: [{ uuid: U2 }], register: recreated } } })
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb.122~77777777'), none), { kind: 'mismatch', session: OTHER, record: 122, check: '77777777', registerNames: U2 })
})

test('removed: a tombstone keeps its number, and the place it named is offered', async () => {
  const p = ports({ sessions: { [CUR]: { rows: [] }, [OTHER]: { rows: [{ uuid: U1 }], register: REG } } })
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb.7~68b352d2'), p), { kind: 'removed', session: OTHER, record: 7, uuid: U1 })
})

test('a register newer than this build still resolves (read-only is the writer\'s concern)', async () => {
  const newer = { ...REG, newerThanBuild: true } as RegisterView
  const p = ports({ sessions: { [CUR]: { rows: [] }, [OTHER]: { rows: [{ uuid: U3 }], register: newer } } })
  assert.equal((await resolveRef(ref('bm:bbbbbbbb.122~77777777'), p)).kind, 'found')
})

test('a lookup with no such number is not found; a check of any length is a prefix', async () => {
  const p = ports({ sessions: { [CUR]: { rows: [] }, [OTHER]: { rows: [{ uuid: U3 }], register: REG } } })
  assert.deepEqual(await resolveRef(ref('bm:bbbbbbbb.999'), p), { kind: 'not-found', session: OTHER, record: 999 })
  assert.equal((await resolveRef(ref('bm:bbbbbbbb.122~7777'), p)).kind, 'found')
})

test('the register cache loads each conversation once', async () => {
  const base = ports({ sessions: { [CUR]: { rows: [] }, [OTHER]: { rows: [{ uuid: U3 }], register: REG } } })
  const p = { ...base, register: cachedRegisters(base.register) }
  await resolveRef(ref('bm:bbbbbbbb.122~77777777'), p)
  await resolveRef(ref('bm:bbbbbbbb.122~77777777'), p)
  assert.deepEqual(base.loads, [OTHER])
})
