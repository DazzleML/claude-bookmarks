// The migration at a conversation's start (unit 4 of the record-format goal), as the
// handler runs it through the engine: the snapshot, the run folder and its manifest, the
// migrated file, the pins moved out of the store, and the second start doing nothing.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, parseRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { BAND_PROPS, pathKey, world } from './harness.ts'

type Engine = { session: { start: (e: object) => Promise<unknown> } }
const SID = '11111111-2222-4333-8444-555555555555'
const OTHER = '99999999-2222-4333-8444-555555555555'
const UUID = 'cccccccc-0000-4000-8000-000000000001'
const ROOT = 'C:/test-home/claude/bookmarks'
const PATH = `${ROOT}/sessions/${SID}.json`
const T = 'C:/test-home/.claude/projects/C--test-project/' + SID + '.jsonl'

/** A v1 register as the proof of concept wrote it. */
function v1Text(): string {
  const { nextN: _n, ...base } = emptyRegister(SID, 'bookmarks 0.4.110', 1)
  const r = addOrRelabel({ ...base, version: 1 }, { uuid: UUID, owner: 'claude', label: 'a place', head: 'the message', by: 'claude', source: 'tool', tier: 'bookmark', transcript: T }, 2).register
  return JSON.stringify(JSON.parse(serializeRegister(r)), null, 2) + '\n'
}

const start = ($: unknown) => ($ as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
const keysUnder = (w: { files: Record<string, string> }, part: string) => Object.keys(w.files).filter(k => k.replace(/\\/g, '/').includes(part))

test('a v1 register is migrated at the start: snapshot first, a run folder with its manifest, the file at v2, the pins moved out of the store', async ($, on) => {
  const v1 = v1Text()
  const store: Record<string, unknown> = { [`pins:${SID}`]: ['dddddddd-0000-4000-8000-000000000002'] }
  const olderBak = v1.replace('bookmarks 0.4.110', 'bookmarks 0.4.100') // an earlier save, so the .bak's fate is visible
  const w = world(on, {
    session: SID,
    files: { [PATH]: v1, [`${PATH}.bak`]: olderBak, [`${ROOT}/sessions/${SID}/cccccccc.md`]: '# export\n' },
    store,
  })
  await start($)
  // The snapshot holds every file that was under sessions/, and a manifest.
  const snap = keysUnder(w, '__pre-0.5__snapshot/')
  expect(snap.some(k => k.endsWith(`${SID}.json`))).toBe(true)
  expect(snap.some(k => k.endsWith(`${SID}.json.bak`))).toBe(true)
  expect(snap.some(k => k.endsWith('cccccccc.md'))).toBe(true)
  expect(snap.some(k => k.endsWith('manifest.json'))).toBe(true)
  // The run folder: the original, its .bak, the store copy, and a manifest that reached `done`. One run takes the file the whole way (v1 -> v4 since 0.7.1).
  const run = keysUnder(w, '__v1-to-v4__')
  expect(run.some(k => k.endsWith(`sessions\\${SID}.json`) || k.endsWith(`sessions/${SID}.json`))).toBe(true)
  const manifestKey = run.find(k => k.endsWith('manifest.json'))!
  const manifest = JSON.parse(w.files[manifestKey]!)
  expect(manifest.status).toBe('done')
  expect(manifest.from).toBe(1)
  expect(manifest.to).toBe(4)
  expect(manifest.storeKeys).toEqual([`pins:${SID}`, `marks:${SID}`])
  expect(manifest.files.map((f: { path: string }) => f.path).sort()).toEqual([`sessions/${SID}.json`, `sessions/${SID}.json.bak`, `store/${SID}.json`])
  expect(manifest.files.every((f: { hash: string; algo: string }) => f.hash.length >= 16 && f.algo)).toBe(true)
  expect(w.files[run.find(k => k.endsWith(`sessions\\${SID}.json`) || k.endsWith(`sessions/${SID}.json`))!]).toBe(v1)
  expect(w.files[run.find(k => k.endsWith(`${SID}.json.bak`))!]).toBe(olderBak)
  // The status ladder is written in order: `started`, then `backed-up` once the copies are in, before the register is touched, then `done` (M14).
  const writes = w.calls.filter(c => c.event === 'fs.write').map(c => c.input as { path: string; text: string })
  const statusAt = (s: string) => writes.findIndex(x => x.path.replace(/\\/g, '/').endsWith('manifest.json') && x.path.includes('__v1-to-v4__') && x.text.includes(`"status": "${s}"`))
  const registerWrite = writes.findIndex(x => pathKey(x.path) === pathKey(PATH) && x.text.includes('"version": 4'))
  expect(statusAt('started')).toBeGreaterThanOrEqual(0)
  expect(statusAt('backed-up')).toBeGreaterThan(statusAt('started'))
  expect(registerWrite).toBeGreaterThan(statusAt('backed-up'))
  expect(statusAt('done')).toBeGreaterThan(registerWrite)
  // The live file is current: numbered, hoisted, with the pins as stars and empty slots; its .bak is the v1 original.
  const reg = parseRegister(w.file(PATH) ?? '')!
  expect(reg.version).toBe(4)
  expect(reg.slots).toEqual({})
  expect(reg.nextN).toBe(2)
  expect(reg.perma[0]?.n).toBe(1)
  expect(reg.transcript).toBe(T)
  expect(JSON.parse(w.file(PATH)!).perma[0].transcript).toBe(undefined)
  expect(reg.pins).toBe(undefined)
  expect(reg.stars?.map(s => [s.uuid, s.owner, s.from])).toEqual([['dddddddd-0000-4000-8000-000000000002', 'user', 'prompts']])
  expect(w.file(`${PATH}.bak`)).toBe(v1)
  // The store key the step consumed is deleted by `$.store.delete`, which the kit's mock store answers on its own
  // (not recorded in `calls`, and not reflected in the object the world was given, measured 2026-10-16); the
  // manifest's `storeKeys` above is the record of what was consumed, and the live check is the data root itself.
  void store
  // The list action sees the migrated register at once (the cache was refreshed, not the v1 copy).
  const out = (await ($ as { tool: { call: (i: never) => Promise<{ result?: string }> } }).tool.call({ tool: 'mcp__bookmarks__bookmark', tool_use_id: 't', action: 'list' } as never))
  const listed = JSON.parse(String(out.result)) as { claudes: { uuid: string }[] }
  expect(listed.claudes.length).toBe(1)
  expect(listed.claudes[0]?.uuid).toBe(UUID)
})

test('a second start migrates nothing and takes no second snapshot', async ($, on) => {
  const w = world(on, { session: SID, files: { [PATH]: v1Text() }, store: {} })
  await start($)
  const after1 = Object.keys(w.files).length
  const snaps1 = keysUnder(w, '__pre-0.5__snapshot/').filter(k => k.endsWith('manifest.json')).length
  await start($)
  expect(Object.keys(w.files).length).toBe(after1)
  expect(keysUnder(w, '__pre-0.5__snapshot/').filter(k => k.endsWith('manifest.json')).length).toBe(snaps1)
  expect(snaps1).toBe(1)
  expect(keysUnder(w, '__v1-to-v4__').filter(k => k.endsWith('manifest.json')).length).toBe(1)
})

test('a conversation with pins in the store and no register gets one, current', async ($, on) => {
  const w = world(on, { session: SID, files: { [PATH]: v1Text() }, store: { [`pins:${OTHER}`]: ['eeeeeeee-0000-4000-8000-000000000003'] } })
  await start($)
  const other = parseRegister(w.file(`${ROOT}/sessions/${OTHER}.json`) ?? '')
  expect(other?.version).toBe(4)
  expect(other?.pins).toBe(undefined)
  expect(other?.stars?.map(s => [s.uuid, s.owner, s.from])).toEqual([['eeeeeeee-0000-4000-8000-000000000003', 'user', 'prompts']])
  expect(other?.perma.length).toBe(0)
  expect(keysUnder(w, `__v1-to-v4__`).filter(k => k.endsWith('manifest.json')).length).toBe(2)
  // Two migrations in one start, one snapshot (M13): one snapshot manifest on disk, written once.
  expect(keysUnder(w, '__pre-0.5__snapshot/').filter(k => k.endsWith('manifest.json')).length).toBe(1)
  const snapshotWrites = w.calls.filter(c => c.event === 'fs.write' && String((c.input as { path: string }).path).includes('__pre-0.5__snapshot') && String((c.input as { path: string }).path).endsWith('manifest.json'))
  expect(snapshotWrites.length).toBe(1)
})

test('v2 -> v3 at the start: the store\'s marks become slots and records, and the marks pane draws the letter', async ($, on) => {
  const v2 = serializeRegister({ ...emptyRegister(SID, 'bookmarks 0.5.4', 1), version: 2, slots: undefined })
  const marks = { a: { uuid: UUID, head: 'the marked message', markedAt: 5, source: 'selection', snippet: 'marked words' } }
  const w = world(on, { session: SID, files: { [PATH]: v2 }, store: { [`marks:${SID}`]: marks } })
  await start($)
  const reg = parseRegister(w.file(PATH) ?? '')!
  expect(reg.version).toBe(4)
  const rec = reg.perma.find(r => r.tier === 'mark')!
  expect(rec.uuid).toBe(UUID)
  expect(rec.words).toBe('marked words')
  expect(reg.slots?.user?.a).toEqual({ current: rec.n, history: [{ n: rec.n, at: 5 }] })
  const run = keysUnder(w, '__v2-to-v4__').find(k => k.endsWith('manifest.json'))!
  expect(JSON.parse(w.files[run]!).storeKeys).toEqual([`marks:${SID}`])
  // The letter is in use: the mark pane draws `a` as taken.
  const band = (await ($ as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount({ plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' } as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: 'm' }).catch(() => undefined)
  const pane = (await ($ as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount({ plugin: 'bookmarks', surface: 'terminal', component: 'Pane', requestId: 'bm-pane', props: { title: 'mark', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } } } as never)) as { findAll: (q: object) => Promise<{ text?: string }[]> }
  const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
  expect(texts.some(t => t.includes('the marked message'))).toBe(true)
})

test('a current file is loaded and never copied: no snapshot, no run folder', async ($, on) => {
  const current = serializeRegister(emptyRegister(SID, 'bookmarks 0.5.4', 1))
  const w = world(on, { session: SID, files: { [PATH]: current }, store: {} })
  await start($)
  expect(keysUnder(w, '/backups/').length).toBe(0)
  expect(w.file(PATH)).toBe(current)
})
