// node --test tests/core/check.test.ts
// /bm-check as a linter (unit 11 of the record-format goal): register versions against the
// build, orphan note folders, the index against the registers, run folders by manifest status
// and hash, the store against its cap and its leftover marks. Reports, never repairs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addOrRelabel, emptyRegister, serializeRegister } from '../../plugin/hooks/core/bookmarks/register-file.ts'
import { CURRENT, STORE_PREFIXES, type Manifest } from '../../plugin/hooks/core/bookmarks/migrations.ts'
import { buildIndex, entryOf, serializeIndex } from '../../plugin/hooks/core/bookmarks/session-index.ts'
import { checkReport, drawLine, STORE_CAP, STORE_WARN_SHARE, type CheckInput } from '../../plugin/hooks/core/bookmarks/check.ts'

const A = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const B = '11111111-2222-4333-8444-555555555555'
const T0 = 1_760_000_000_000
const withBookmark = (sid: string) => addOrRelabel(emptyRegister(sid, 'w', T0), { uuid: '12d637fb-6d1d-4c3f-bbb6-11c107d8af4e', owner: 'user', label: 'x', head: 'x', by: 'user', source: 'promote' }, T0 + 1).register
const manifest = (o: Partial<Manifest>): string => JSON.stringify({ kind: 'migration', from: 1, to: 3, writer: 'w', sessionId: A, startedAt: 'now', status: 'done', files: [], storeKeys: [], ...o })

function clean(): CheckInput {
  const a = withBookmark(A)
  return {
    current: CURRENT,
    root: 'C:/Users/x/claude',
    registers: [{ name: A, text: serializeRegister(a) }],
    folders: [A],
    index: serializeIndex(buildIndex([entryOf(a, new Set())], 'w', T0)),
    runs: [{ name: 'run1', manifest: manifest({ files: [{ path: `sessions/${A}.json`, algo: 'fnv1a64', hash: 'abc', bytes: 3 }] }), hashes: { [`sessions/${A}.json`]: 'abc' } }],
    snapshots: ['2026-10-17T00-00-00Z__pre-0.5__snapshot'],
    storeKeys: ['debug:x'],
    storeChars: 1000,
    storeCap: STORE_CAP,
    storePrefixes: STORE_PREFIXES,
  }
}
const texts = (i: CheckInput) => checkReport(i).map(drawLine)
const warns = (i: CheckInput) => checkReport(i).filter(l => l.level === 'warn')

test('a clean data root: every line ok, nothing to report, and nothing proposed', () => {
  const lines = checkReport(clean())
  assert.ok(lines.every(l => l.level === 'ok'), lines.map(drawLine).join('\n'))
  assert.equal(lines.at(-1)!.text, 'bm-check: nothing to report; nothing was changed')
  assert.ok(lines[0]!.text.includes(`1 register file(s)`) && lines[0]!.text.includes(`1 at v${CURRENT}`))
  assert.ok(texts(clean()).some(t => t === '[bm] index.json lists 1 conversation(s) with bookmarks, matching the registers'))
  assert.ok(texts(clean()).some(t => t.includes('1 migration run(s), 1 done and intact; 1 snapshot(s)')))
  assert.ok(texts(clean()).some(t => t.includes('store: 1 key(s), 1 KiB of the 4.0 MiB cap (0%)')))
})

test('registers: an older file says it migrates at the next start, a newer one that it is read-only, a non-register that it is left; a folder with no register is an orphan', () => {
  const i = clean()
  const older = { ...withBookmark(B), version: 1 }
  const { nextN: _n, slots: _s, ...v1 } = older
  i.registers.push({ name: B, text: JSON.stringify(v1) })
  i.registers.push({ name: 'cccccccc', text: JSON.stringify({ ...withBookmark('cccccccc'), version: CURRENT + 5 }) })
  i.registers.push({ name: 'broken', text: '{not json' })
  i.folders.push('dddddddd')
  const w = warns(i).map(l => l.text)
  assert.ok(w.some(t => t.startsWith(`${B}.json is v1, older than this build: it migrates at the next start`)), w.join('\n'))
  assert.ok(w.some(t => t.startsWith(`cccccccc.json is v${CURRENT + 5}, newer than this build: read-only here`)))
  assert.ok(w.some(t => t.startsWith('broken.json is not a register file')))
  assert.ok(w.some(t => t.startsWith('bookmarks/sessions/dddddddd/ holds notes but has no dddddddd.json')))
  assert.ok(!w.some(t => t.includes(`bookmarks/sessions/${A}/`)), 'the folder with a register is fine')
  assert.ok(checkReport(i).at(-1)!.text.startsWith('bm-check: 4 warning(s)'))
  // A file whose header names another session.
  const copy = { ...clean(), registers: [{ name: B, text: serializeRegister(withBookmark(A)) }], folders: [], index: undefined }
  assert.ok(warns(copy).some(l => l.text.includes(`${B}.json says its session is ${A}`)))
})

test('the index: missing is a note, unparseable a warning, a count that differs from the registers with bookmarks is stale', () => {
  const missing = { ...clean(), index: undefined }
  assert.ok(checkReport(missing).some(l => l.level === 'note' && l.text.includes('index.json is missing: written at the next save or start')))
  const broken = { ...clean(), index: '{' }
  assert.ok(warns(broken).some(l => l.text.includes('index.json does not parse: rebuilt at the next start')))
  const stale = clean()
  stale.registers.push({ name: B, text: serializeRegister(withBookmark(B)) })
  stale.folders.push(B)
  assert.ok(checkReport(stale).some(l => l.level === 'note' && l.text.includes('lists 1 conversation(s) but 2 register(s) have bookmarks: stale')))
  // A register with only marks does not count as having bookmarks.
  const marksOnly = clean()
  marksOnly.registers.push({ name: B, text: serializeRegister({ ...emptyRegister(B, 'w', T0), perma: [{ sessionId: B, uuid: 'aaaaaaaa-0000-4000-8000-000000000001', owner: 'user', label: 'm', head: 'm', tier: 'mark', createdAt: T0, by: 'user', source: 'mark' }] }) })
  marksOnly.folders.push(B)
  assert.ok(checkReport(marksOnly).some(l => l.text.includes('matching the registers')))
})

test('backups: a run without a manifest, one stopped before done, a copy missing, a copy whose hash differs; snapshots counted; none though runs ran', () => {
  const i = clean()
  i.runs.push({ name: 'bare', hashes: {} })
  i.runs.push({ name: 'half', manifest: manifest({ status: 'backed-up' }), hashes: {} })
  i.runs.push({ name: 'gone', manifest: manifest({ files: [{ path: 'store/x.json', algo: 'fnv1a64', hash: 'h', bytes: 1 }] }), hashes: {} })
  i.runs.push({ name: 'changed', manifest: manifest({ files: [{ path: `sessions/${A}.json`, algo: 'sha256', hash: 'h1', bytes: 1 }] }), hashes: { [`sessions/${A}.json`]: 'h2' } })
  i.runs.push({ name: 'odd', manifest: '{"kind": "snapshot"}', hashes: {} })
  // A snapshot's manifest with a files array is still not a migration's: the kind decides (mutation sweep v0.5.11, M8).
  i.runs.push({ name: 'snap-shaped', manifest: '{"kind": "snapshot", "files": []}', hashes: {} })
  const w = warns(i).map(l => l.text)
  assert.ok(w.some(t => t === 'backups/snap-shaped/manifest.json is not a migration manifest'), w.join('\n'))
  assert.ok(w.some(t => t.startsWith('backups/bare/ has no manifest.json')), w.join('\n'))
  assert.ok(w.some(t => t.includes('backups/half/: the migration v1 -> v3 stopped at "backed-up"') && t.includes('migrates again at the next start')))
  assert.ok(w.some(t => t === 'backups/gone/store/x.json is missing though the manifest lists it'))
  assert.ok(w.some(t => t === `backups/changed/sessions/${A}.json differs from its manifest hash (sha256): the copy was changed after it was taken`))
  assert.ok(w.some(t => t === 'backups/odd/manifest.json is not a migration manifest'))
  const summary = checkReport(i).find(l => l.text.startsWith('backups:'))!
  assert.equal(summary.level, 'note')
  assert.ok(summary.text.includes('7 migration run(s), 1 done and intact; 1 snapshot(s)'), summary.text)
  // "started" says the live file was not touched.
  const started = { ...clean(), runs: [{ name: 's', manifest: manifest({ status: 'started' }), hashes: {} }] }
  assert.ok(warns(started).some(l => l.text.includes('stopped at "started"') && l.text.includes('was not touched')))
  const noSnap = { ...clean(), snapshots: [] }
  assert.ok(checkReport(noSnap).some(l => l.text.includes('0 snapshot(s) -- none, though migrations ran')))
})

test('the store: the share of the cap, a warning at the threshold, and marks or pins left for a conversation with no register', () => {
  const near = { ...clean(), storeChars: Math.ceil(STORE_CAP * STORE_WARN_SHARE) }
  const line = checkReport(near).find(l => l.text.startsWith('store:'))!
  assert.equal(line.level, 'warn')
  assert.ok(line.text.includes('(75%) -- near the cap'))
  const under = { ...clean(), storeChars: Math.floor(STORE_CAP * STORE_WARN_SHARE) - 1 }
  assert.equal(checkReport(under).find(l => l.text.startsWith('store:'))!.level, 'ok')
  const left = { ...clean(), storeKeys: ['debug:x', `marks:${B}`, `pins:${B}`, `pins:${A}`] }
  const notes = checkReport(left).filter(l => l.level === 'note').map(l => l.text)
  assert.deepEqual(notes, [`store holds marks or pins for ${B.slice(0, 8)} with no register: a register is made for it at the next start`], 'one line per conversation; A has a register')
  assert.equal(drawLine({ level: 'warn', text: 'x' }), '[bm] WARN x')
  assert.equal(drawLine({ level: 'note', text: 'x' }), '[bm] note x')
  assert.equal(drawLine({ level: 'ok', text: 'x' }), '[bm] x')
})
