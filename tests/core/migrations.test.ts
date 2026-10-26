// node --test tests/core/migrations.test.ts
// The migration steps (unit 4 of the record-format goal): pure, deterministic, numbered.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addOrRelabel, emptyRegister, newerThanBuild, parseRegister, REGISTER_VERSION, serializeRegister, type Mint, type Register } from '../../plugin/hooks/core/bookmarks/register-file.ts'
import { applyMigrations, CURRENT, fnv1a64, hashText, planFor, runFolderName, snapshotFolderName, stampOf, STORE_PREFIXES, v1to2 } from '../../plugin/hooks/core/bookmarks/migrations.ts'

const SESSION = 'c8d1e0ee-6f97-41cd-8e23-325984a0109a'
const OTHER = 'b69ea1ca-ab14-4cce-8206-ebb91ebb4c44'
const T0 = 1_760_000_000_000
const T = 'C:/Users/x/.claude/projects/C--code/c8d1e0ee-6f97-41cd-8e23-325984a0109a.jsonl'
const T_MOVED = 'C:/Users/x/.claude/projects/C--code-elsewhere/c8d1e0ee-6f97-41cd-8e23-325984a0109a.jsonl'
const mintOf = (k: string, label: string, extra: Partial<Mint> = {}): Mint => ({ uuid: `${k.repeat(8)}-0000-4000-8000-000000000001`, owner: 'claude', label, head: `head ${k}`, by: 'claude', source: 'tool', transcript: T, ...extra })

/** A v1 file as the proof of concept wrote it: every record with its own sessionId and transcript, two spellings of the path, one record copied from another conversation, a tombstone, no numbers. */
function v1Text(): string {
  const { nextN: _n, slots: _s, format: _f, ...base } = emptyRegister(SESSION, 'bookmarks 0.4.110', T0) // no format field before 0.5.12
  let reg: Register = { ...base, version: 1 }
  reg = addOrRelabel(reg, mintOf('a', 'first', { transcript: T.replace(/\//g, '\\') }), T0 + 300).register // backslashes, minted third
  reg = addOrRelabel(reg, mintOf('b', 'second'), T0 + 100).register // minted first
  reg = addOrRelabel(reg, mintOf('c', 'third', { transcript: T_MOVED }), T0 + 200).register // seen after a /cd moved the transcript: the minority spelling
  const copied = { ...addOrRelabel(reg, mintOf('d', 'from another conversation', { transcript: 'C:/Users/x/.claude/projects/other/' + OTHER + '.jsonl' }), T0 + 400).record, sessionId: OTHER }
  reg = { ...reg, perma: [...reg.perma, copied], tombstones: [{ uuid: 'eeeeeeee-0000-4000-8000-000000000009', owner: 'claude', label: 'gone', removedAt: T0 + 50, removedBy: 'test' }] }
  const o = JSON.parse(serializeRegister(reg))
  // v1 wrote every record whole; make sure the fixture says so.
  for (const r of o.perma) assert.ok(r.sessionId && r.transcript)
  return JSON.stringify(o, null, 2) + '\n'
}

test('the plan: a v1 file takes three steps to CURRENT, a v2 file two, a v3 file one; a current or newer file takes none', () => {
  assert.equal(CURRENT, REGISTER_VERSION)
  assert.equal(CURRENT, 4)
  assert.deepEqual(planFor(1).map(s => [s.from, s.to]), [[1, 2], [2, 3], [3, 4]])
  assert.deepEqual(planFor(2).map(s => [s.from, s.to]), [[2, 3], [3, 4]])
  assert.deepEqual(planFor(3).map(s => [s.from, s.to]), [[3, 4]])
  assert.deepEqual(planFor(CURRENT), [])
  assert.deepEqual(planFor(CURRENT + 1), [])
  assert.deepEqual([...STORE_PREFIXES], ['pins:', 'marks:'])
})

test('v2 -> v3: the store\'s marks become mark records and slots; the reading position too; no marks gives empty slots', () => {
  const v2 = applyMigrations(parseRegister(v1Text())!, planFor(1).slice(0, 1), {}, { sessionId: SESSION, now: T0 + 1000 })
  assert.equal(v2.version, 2)
  assert.equal(v2.slots, undefined)
  const store = {
    [`marks:${SESSION}`]: {
      a: { uuid: '11111111-0000-4000-8000-000000000001', head: 'the a message', markedAt: T0 + 500, source: 'selection', snippet: 'selected words' },
      q: { uuid: '22222222-0000-4000-8000-000000000002', head: 'top of screen', markedAt: T0 + 400, source: 'screen' },
      '`': { uuid: '11111111-0000-4000-8000-000000000001', head: 'the a message', markedAt: T0 + 600, source: 'selection', snippet: 'reading here' },
    },
  }
  const v3 = applyMigrations(v2, planFor(2).slice(0, 1), store, { sessionId: SESSION, now: T0 + 2000 })
  assert.equal(v3.version, 3)
  // Each step names the reader its result needs; the file asks for the highest (v2's 2, then v3's 3).
  assert.equal(v2.format, 2)
  assert.equal(v3.format, 3)
  const marks = v3.perma.filter(r => r.tier === 'mark')
  assert.equal(marks.length, 2, 'a and ` share a message, so one record; q is another')
  assert.deepEqual(marks.map(r => r.n), [5, 6], 'numbered after the four bookmarks, in the order marked (q first)')
  assert.equal(v3.nextN, 7)
  assert.deepEqual(v3.slots?.user?.q, { current: 5, history: [{ n: 5, at: T0 + 400 }] })
  assert.deepEqual(v3.slots?.user?.a, { current: 6, history: [{ n: 6, at: T0 + 500 }] })
  assert.deepEqual(v3.slots?.user?.['`'], { current: 6, history: [{ n: 6, at: T0 + 600 }] })
  assert.equal(marks[1]?.words, 'reading here', 'the latest selection on the message is its words')
  // Straight from v1 with both store keys: the same end state as two starts would give.
  const direct = applyMigrations(parseRegister(v1Text())!, planFor(1), { ...store, [`pins:${SESSION}`]: ['33333333-0000-4000-8000-000000000003'] }, { sessionId: SESSION, now: T0 + 2000 })
  // Since 0.7.1 the plan goes on to v4: the pin taken from the store ends as a star from the prompts list.
  assert.equal(direct.version, 4)
  assert.equal(direct.pins, undefined)
  assert.deepEqual(direct.stars?.map(s => [s.uuid, s.owner, s.from]), [['33333333-0000-4000-8000-000000000003', 'user', 'prompts']])
  assert.deepEqual(direct.slots?.user?.a, v3.slots?.user?.a)
  assert.deepEqual(parseRegister(serializeRegister(direct)), direct, 'round-trips')
  // No marks in the store: slots exist and are empty, which is what says "migrated".
  const bare = applyMigrations(v2, planFor(2), {}, { sessionId: SESSION, now: T0 + 2000 })
  assert.deepEqual(bare.slots, {})
})

test('v1 -> v2: the hoist, the numbers in minting order, pins from the store; the result round-trips and reads back whole', () => {
  const text = v1Text()
  const reg = parseRegister(text)!
  assert.equal(reg.version, 1)
  const store = { [`pins:${SESSION}`]: ['11111111-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000002'] }
  const out = applyMigrations(reg, [v1to2], store, { sessionId: SESSION, now: T0 + 1000 })
  assert.equal(out.version, 2)
  assert.equal(out.transcript, T, 'the path most records agree on (2 of 3, one of them backslashed), slashes forward')
  assert.equal(out.perma[2]?.transcript, T_MOVED, 'the minority path stays on its record as an override')
  assert.deepEqual(out.perma.map(r => [r.label, r.n]), [['first', 3], ['second', 1], ['third', 2], ['from another conversation', 4]], 'numbered in minting order, positions kept')
  assert.equal(out.nextN, 5)
  assert.equal(out.perma[0]?.transcript, T, 'the backslashed spelling is normalised')
  assert.deepEqual(out.pins, { user: store[`pins:${SESSION}`] })
  assert.equal(out.rev, reg.rev + 1)
  assert.equal(out.updatedAt, T0 + 1000)
  assert.equal(out.tombstones.length, 1, 'tombstones ride along')
  // On disk: one transcript at the top, the file's own records without theirs, the copied record keeping its own.
  const written = serializeRegister(out)
  const o = JSON.parse(written)
  assert.equal(o.transcript, T)
  assert.equal(o.perma[0].transcript, undefined)
  assert.equal(o.perma[0].sessionId, undefined)
  assert.equal(o.perma[3].sessionId, OTHER)
  assert.ok(o.perma[3].transcript.includes(OTHER))
  assert.ok(Object.keys(o).indexOf('transcript') < Object.keys(o).indexOf('configDir') || o.configDir === undefined)
  // And it reads back as the same register, every record whole.
  const back = parseRegister(written)!
  assert.deepEqual(back, out)
  assert.equal(back.perma[1]?.sessionId, SESSION)
  assert.equal(back.perma[1]?.transcript, T)
  assert.equal(serializeRegister(back), written, 'idempotent')
})

test('a migration is deterministic, and running the plan for an already-current file is a no-op', () => {
  const reg = parseRegister(v1Text())!
  const ctx = { sessionId: SESSION, now: T0 + 1000 }
  const a = applyMigrations(reg, planFor(1), {}, ctx)
  const b = applyMigrations(reg, planFor(1), {}, ctx)
  assert.deepEqual(a, b)
  assert.deepEqual(planFor(a.version), [])
  assert.equal(newerThanBuild(a), false)
  // No pins in the store: no pins key at all.
  assert.equal(a.pins, undefined)
})

test('an empty v1 register (a store-only conversation) migrates to a v2 file with the pins and nothing else', () => {
  const { nextN: _n, slots: _s, ...base } = emptyRegister(OTHER, 'bookmarks 0.5.4', T0)
  const out = applyMigrations({ ...base, version: 1 }, [v1to2], { [`pins:${OTHER}`]: ['aaaaaaaa-0000-4000-8000-000000000001'] }, { sessionId: OTHER, now: T0, transcriptHint: 'C:\\x\\y.jsonl' })
  assert.equal(out.version, 2)
  assert.equal(out.nextN, 1)
  assert.equal(out.transcript, 'C:/x/y.jsonl', 'with no records, the hint names the transcript, slashes forward')
  assert.deepEqual(out.pins, { user: ['aaaaaaaa-0000-4000-8000-000000000001'] })
  assert.equal(v1to2.storeKeys(OTHER)[0], `pins:${OTHER}`)
})

test('the file\'s transcript comes from its own records, never from records copied in from another conversation (mutation sweep v0.5.4, M6)', () => {
  const { nextN: _n, slots: _s, ...base } = emptyRegister(SESSION, 'w', T0)
  let reg: Register = { ...base, version: 1 }
  reg = addOrRelabel(reg, mintOf('a', 'own'), T0 + 1).register
  const foreign = 'C:/Users/x/.claude/projects/other/' + OTHER + '.jsonl'
  for (const k of ['b', 'c']) reg = { ...reg, perma: [...reg.perma, { ...addOrRelabel(reg, mintOf(k, 'copied', { transcript: foreign }), T0 + 2).record, sessionId: OTHER }] }
  const out = applyMigrations(reg, planFor(1), {}, { sessionId: SESSION, now: T0 + 10 })
  assert.equal(out.transcript, T, 'one own record outweighs two copies')
  assert.equal(out.perma[1]?.transcript, foreign)
})

test('folder names carry the stamp without colons, the versions, the writer and the conversation', () => {
  const now = Date.UTC(2026, 9, 16, 21, 5, 9, 123)
  assert.equal(stampOf(now), '2026-10-16T21-05-09Z')
  assert.equal(runFolderName(now, 1, 2, 'bookmarks 0.5.4', SESSION), '2026-10-16T21-05-09Z__v1-to-v2__bookmarks-0.5.4__c8d1e0ee')
  assert.equal(snapshotFolderName(now), '2026-10-16T21-05-09Z__pre-0.5__snapshot')
})

test('the manifest hash names its algorithm; FNV-1a 64 is stable', async () => {
  assert.equal(fnv1a64(''), 'cbf29ce484222325')
  assert.equal(fnv1a64('a'), 'af63dc4c8601ec8c')
  const h = await hashText('hello')
  assert.ok(h.algo === 'sha256' || h.algo === 'fnv1a64')
  if (h.algo === 'sha256') assert.equal(h.hash, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
})
