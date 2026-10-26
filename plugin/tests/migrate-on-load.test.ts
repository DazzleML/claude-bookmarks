// Migrate on load (the pins-by-name design, 2026-10-26, unit P2): a register below this build's
// version is migrated, with its run folder and backups, the first time the build loads it, even
// with no session start (a build that arrived by a reload). A migration that fails leaves the
// file as it was and the conversation's bookmarks read-only. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { emptyRegister, parseRegister, REGISTER_VERSION, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { BAND_PROPS, pathKey, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const ROOT = 'C:/test-home/claude/bookmarks'
const PATH = `${ROOT}/sessions/${SID}.json`
const PROMPT = 'aaaaaaaa-0000-4000-8000-000000000001'
const STORE = { [`prompts:${SID}`]: [{ uuid: PROMPT, head: 'first prompt' }], [`backfilled7:${SID}`]: true }

/** A v3 register with one pin in v3's shape (the map under `pins`). */
const v3Text = () => serializeRegister({ ...emptyRegister(SID, 'bookmarks 0.7.0', 1), version: 3, format: 3, updatedAt: 5, pinsV3: { user: [PROMPT] } })
const runFolders = (w: { files: Record<string, string> }) => Object.keys(w.files).filter(k => /__v3-to-v\d+__/.test(k) && k.endsWith('manifest.json'))
type Tool = { tool: { call: (i: never) => Promise<{ result?: string }> } }
type Mount = { ui: { mount: (t: never) => Promise<unknown> } }
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const PANE = { plugin: 'bookmarks', surface: 'terminal', component: 'Pane', requestId: 'bm-pane', props: { title: 'prompts: type #', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } } }
const list = async ($: unknown) => JSON.parse(String((await ($ as Tool).tool.call({ tool: 'mcp__bookmarks__bookmark', tool_use_id: 't', action: 'list' } as never)).result))

test('with no start, the first load of a v3 file migrates it: a run folder, the file current, its pin kept', async ($, on) => {
  const before = v3Text()
  const w = world(on, { session: SID, store: STORE, files: { [PATH]: before } })
  await list($) // any use loads the register
  const reg = parseRegister(w.file(PATH) ?? '')!
  expect(reg.version).toBe(REGISTER_VERSION)
  expect(reg.pinsV3).toBe(undefined)
  expect(reg.pins?.map(p => [p.uuid, p.owner, p.from, p.at])).toEqual([[PROMPT, 'user', 'prompts', 5]])
  expect(runFolders(w).length).toBe(1)
  const manifest = JSON.parse(w.files[runFolders(w)[0]!]!)
  expect(manifest.status).toBe('done')
  expect(manifest.from).toBe(3)
  // The run folder holds the v3 original, byte for byte.
  const copy = Object.keys(w.files).find(k => /__v3-to-v\d+__/.test(k) && k.endsWith(`${SID}.json`))!
  expect(w.files[copy]).toBe(before)
})

test('a second load migrates nothing more', async ($, on) => {
  const w = world(on, { session: SID, store: STORE, files: { [PATH]: v3Text() } })
  await list($)
  const after = w.file(PATH)
  await list($)
  expect(runFolders(w).length).toBe(1)
  expect(w.file(PATH)).toBe(after)
})

test('a torn file whose .bak is older is not migrated from the .bak: both stay as they were, and the file is read-only', async ($, on) => {
  const bak = v3Text()
  const torn = bak.slice(0, bak.length / 2)
  const w = world(on, { session: SID, store: STORE, files: { [PATH]: torn, [`${PATH}.bak`]: bak } })
  await list($)
  expect(w.file(PATH)).toBe(torn)
  expect(w.file(`${PATH}.bak`)).toBe(bak)
  expect(runFolders(w).length).toBe(0)
  expect(w.toasts().some(t => t.includes('read-only for now'))).toBe(true)
})

test('a migration that fails on load leaves the file as it was, and a save is refused', async ($, on) => {
  const before = v3Text()
  // Only the migration's own write to the file fails; a later save could write, so the refusal is the guard's doing.
  let refused = 0
  const w = world(on, { session: SID, store: STORE, files: { [PATH]: before }, failWrite: p => p === pathKey(PATH) && refused++ === 0 })
  await list($)
  expect(w.file(PATH)).toBe(before)
  expect(w.toasts().some(t => t.includes('read-only for now'))).toBe(true)
  // A pin from the prompts pane is a save: refused, with the note, and the file is untouched.
  const band = (await ($ as Mount).ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  const pane = (await ($ as Mount).ui.mount(PANE as never)) as { input: (t: object) => Promise<unknown> }
  await pane.input({ key: 'prompt-number', text: '*1', kind: 'submit' }).catch(() => undefined)
  expect(w.toasts().some(t => t.includes('could not be brought up to date'))).toBe(true)
  expect(w.file(PATH)).toBe(before)
})
