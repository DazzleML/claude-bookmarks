// The seams register.tsx's split must not change (test-plan 2026-10-12__15-25-30, rows 6a,
// 7, 4): the start path, prompt capture, and a submitted prompt ending the band's mode.
// Reach measured first (row R): a test's $.session.start, $.prompt.submit and
// $.session.append reach the plugin's hooks with their base events passed through.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const LOG = `C:/test-home/claude/bookmarks/debug/${SID}.log`
const STORE = { [`prompts:${SID}`]: [{ uuid: 'aaaaaaaa-0000-4000-8000-000000000001', head: 'first prompt' }], [`backfilled6:${SID}`]: true }
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const PANE = { plugin: 'bookmarks', surface: 'terminal', component: 'Pane', requestId: 'bm-pane', props: { title: 'prompts: type #', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } } }
type Ui = { input: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<{ type: string; key?: string; text?: string }[]> }
type Engine = Record<string, Record<string, (i: object) => Promise<unknown>>>
const settle = () => new Promise(r => setTimeout(r, 300))

async function listed($: unknown) {
  const band = (await ($ as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount(BAND as never)) as Ui
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  const pane = (await ($ as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount(PANE as never)) as Ui
  return (await pane.findAll({ type: 'Button' })).map(b => b.text)
}

test('6a start: the prune drops back-fill flags of other versions, and says so', async ($, on) => {
  const w = world(on, { session: SID, store: { ...STORE, 'backfilled3:old': true } })
  await ($ as unknown as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  expect((w.file(LOG) ?? '').includes('store: pruned 1 keys (backfilled3)')).toBe(true)
})

test('6a control: with nothing stale, the prune deletes nothing', async ($, on) => {
  const w = world(on, { session: SID, store: STORE })
  await ($ as unknown as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  expect((w.file(LOG) ?? '').includes('store: pruned')).toBe(false)
  expect((w.file(LOG) ?? '').includes('register:')).toBe(true) // the start hook did run
})

const append = (engine: Engine, uuid: string, text: string, origin: string, type = 'user', name?: string) =>
  engine.session.append({
    door: 'prompt',
    uuid,
    origin: { kind: origin },
    message: { type, ...(name ? { name } : {}), role: 'user', content: [{ type: 'text', text }] },
  })

test('7 capture: a prompt the person typed is listed', async ($, on) => {
  world(on, { session: SID, store: STORE })
  await append($ as unknown as Engine, 'cccccccc-0000-4000-8000-000000000002', 'hello appended', 'composer')
  expect(await listed($)).toEqual([' 2) hello appended', ' 1) first prompt'])
})

test('7 capture: a task notification is not listed (origin)', async ($, on) => {
  world(on, { session: SID, store: STORE })
  await append($ as unknown as Engine, 'cccccccc-0000-4000-8000-000000000003', 'a background task finished', 'task-notification').catch(() => undefined)
  expect(await listed($)).toEqual([' 1) first prompt'])
})

test('7 capture: a notice queued into a running turn is not listed (text)', async ($, on) => {
  world(on, { session: SID, store: STORE })
  await append($ as unknown as Engine, 'cccccccc-0000-4000-8000-000000000004', '[SYSTEM NOTIFICATION - NOT USER INPUT] done', 'engine', 'attachment', 'queued_command').catch(() => undefined)
  expect(await listed($)).toEqual([' 1) first prompt'])
})

test('4 a submitted prompt ends the band waiting for a number', async ($, on) => {
  world(on, { session: SID, store: STORE })
  on('prompt.submit' as never, {} as never, (async (_h: unknown, e: object) => e) as never)
  const band = (await $.ui.mount(BAND as never)) as unknown as Ui
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  expect((await band.findAll({ type: 'Text' })).some(t => t.text === 'prompt #')).toBe(true)
  await ($ as unknown as Engine).prompt.submit({ text: 'hello' })
  expect((await band.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['chord-mark', 'chord-jump', 'chord-prompts', 'chord-read', 'chord-help'])
})
