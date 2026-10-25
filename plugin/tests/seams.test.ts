// The seams register.tsx's split must not change (test-plan 2026-10-12__15-25-30, rows 6a,
// 6b, 7, 4, 2, M): the start path and its back-fill, prompt capture, a submitted prompt
// ending the band's mode, "go" with nothing typed, and a session start resetting the state
// that belonged to the conversation before it.
// Reach measured first (row R): a test's $.session.start, $.prompt.submit and
// $.session.append reach the plugin's hooks with their base events passed through.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const LOG = `C:/test-home/claude/bookmarks/debug/${SID}.log`
const STORE = { [`prompts:${SID}`]: [{ uuid: 'aaaaaaaa-0000-4000-8000-000000000001', head: 'first prompt' }], [`backfilled7:${SID}`]: true }
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const PANE = { plugin: 'bookmarks', surface: 'terminal', component: 'Pane', requestId: 'bm-pane', props: { title: 'prompts: type #', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } } }
type Ui = { input: (t: object) => Promise<unknown>; press: (t: object) => Promise<unknown>; unmount?: () => Promise<void>; findAll: (q: object) => Promise<{ type: string; key?: string; text?: string }[]> }
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

// Row 6b: the back-fill reads the transcript's user rows through a program; here the
// program's output is crafted. The transcript only has to exist (the guess from the cwd).
const TRANSCRIPT = `C:/test-home/.claude/projects/C--test-project/${SID}.jsonl`
const userRow = (uuid: string, text: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'user', uuid, message: { role: 'user', content: text }, ...extra })
const FILE_ROWS = [
  userRow('bbbbbbbb-0000-4000-8000-000000000001', 'from the file, one'),
  userRow('bbbbbbbb-0000-4000-8000-000000000002', 'from the file, two'),
  userRow('bbbbbbbb-0000-4000-8000-000000000003', '<command-name>/compact</command-name><command-message>compact</command-message>'),
  userRow('bbbbbbbb-0000-4000-8000-000000000004', '[SYSTEM NOTIFICATION - NOT USER INPUT] a notice'),
  userRow('bbbbbbbb-0000-4000-8000-000000000005', 'a skill body', { isMeta: true }),
].join('\n')
// The live capture holds one prompt the file does not (sent while the file was read).
const LIVE_ONLY = { [`prompts:${SID}`]: [{ uuid: 'cccccccc-0000-4000-8000-000000000007', head: 'live only' }] }
const start = ($: unknown) => ($ as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
const backfillLines = (w: { file: (p: string) => string | undefined }) => (w.file(LOG) ?? '').split('\n').filter(l => l.includes('backfill:'))

test('6b back-fill: file prompts first, then live-only ones; the footnote, notice and meta rows are not prompts', async ($, on) => {
  const w = world(on, { session: SID, store: LIVE_ONLY, files: { [TRANSCRIPT]: '' }, process: () => ({ exitCode: 0, stdout: FILE_ROWS }) })
  await start($)
  await settle()
  expect(backfillLines(w).length).toBe(1)
  expect(backfillLines(w)[0]!.includes('2 prompts from the transcript via powershell')).toBe(true)
  expect(await listed($)).toEqual([' 3) live only', ' 2) from the file, two', '      … 1 footnote', ' 1) from the file, one'])
})

test('6b a complete read marks the conversation done: a second start reads nothing', async ($, on) => {
  const w = world(on, { session: SID, store: LIVE_ONLY, files: { [TRANSCRIPT]: '' }, process: () => ({ exitCode: 0, stdout: FILE_ROWS }) })
  await start($)
  await settle()
  await start($)
  await settle()
  expect(backfillLines(w).length).toBe(1)
})

test('6b a read cut off at 4 MiB says so and is tried again at the next start', async ($, on) => {
  const w = world(on, { session: SID, store: LIVE_ONLY, files: { [TRANSCRIPT]: '' }, process: () => ({ exitCode: 0, stdout: FILE_ROWS, isStdoutTruncated: true }) })
  await start($)
  await settle()
  expect(backfillLines(w)[0]!.includes('CUT OFF at 4 MiB')).toBe(true)
  await start($)
  await settle()
  expect(backfillLines(w).length).toBe(2)
})

test('6b control: no program runs, the list starts from the live capture', async ($, on) => {
  const w = world(on, { session: SID, store: LIVE_ONLY, files: { [TRANSCRIPT]: '' } })
  await start($)
  await settle()
  expect(backfillLines(w)[0]!.includes('neither PowerShell nor sh + grep ran')).toBe(true)
  expect(await listed($)).toEqual([' 1) live only'])
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

// A /loop firing runs a slash command as a user row; it is the schedule's, not a footnote
// of the person's (2026-10-15: 535 of 671 stored footnotes were firings).
const CMD = '<command-name>/obsidian-update</command-name> <command-args>on the vault</command-args>'
// The prompts pane's rows, as a person sees them after `p` (a kept footnote shows folded).
async function paneRows($: unknown) {
  const band = await mount($, BAND)
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  return (await (await mount($, PANE)).findAll({ type: 'Button' })).map(b => b.text)
}

test('7 capture: a scheduled firing is not kept as a footnote (origin)', async ($, on) => {
  world(on, { session: SID, store: STORE })
  await append($ as unknown as Engine, 'cccccccc-0000-4000-8000-000000000005', CMD, 'scheduled-trigger').catch(() => undefined)
  expect(await paneRows($)).toEqual([' 1) first prompt'])
})

test('7 capture control: the same command typed by the person is kept as a footnote', async ($, on) => {
  world(on, { session: SID, store: STORE })
  await append($ as unknown as Engine, 'cccccccc-0000-4000-8000-000000000006', CMD, 'composer')
  expect(await paneRows($)).toEqual([' 1) first prompt', '      … 1 footnote'])
})

// Row M: a footnote unfolded by hand stays unfolded across a re-mount of the pane (module
// state), and a session start folds it again. A mounted pane must be unmounted before the
// same requestId is mounted afresh ("mounted on the terminal surface already").
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const FOOTNOTED = { ...STORE, [`footnotes:${SID}`]: [{ kind: 'command', label: '/compact', uuid: 'ffffffff-0000-4000-8000-000000000009', after: P1 }] }
const UNFOLDED = [' 1) first prompt', '   1.1 /compact', '      ▴ fold']
const FOLDED = [' 1) first prompt', '      … 1 footnote']
const mount = ($: unknown, t: object) => ($ as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount(t as never) as Promise<Ui>

async function unfoldedThenRemounted($: unknown, between: () => Promise<unknown>) {
  const band = await mount($, BAND)
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  const pane = await mount($, PANE)
  await pane.press({ key: 'fn-fold-1' })
  const before = (await pane.findAll({ type: 'Button' })).map(b => b.text)
  await between()
  await pane.unmount?.()
  const after = (await (await mount($, PANE)).findAll({ type: 'Button' })).map(b => b.text)
  return { before, after }
}

test('M a session start folds the footnotes the last conversation unfolded', async ($, on) => {
  world(on, { session: SID, store: FOOTNOTED })
  const { before, after } = await unfoldedThenRemounted($, () =>
    ($ as unknown as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true }))
  expect(before).toEqual(UNFOLDED)
  expect(after).toEqual(FOLDED)
})

test('M control: without a session start, a re-mounted pane keeps the footnote unfolded', async ($, on) => {
  world(on, { session: SID, store: FOOTNOTED })
  const { before, after } = await unfoldedThenRemounted($, async () => undefined)
  expect(before).toEqual(UNFOLDED)
  expect(after).toEqual(UNFOLDED)
})

test('2 go with nothing typed closes the list and brings the bar back (settle, esc)', { options: { listInput: 'buttons' } }, async ($, on) => {
  const w = world(on, { session: SID, store: STORE, panes: [{ id: 'bm-pane' }] })
  const band = await mount($, BAND)
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  const closesBefore = w.calls.filter(c => c.event === 'ui.close').length
  await band.press({ key: 'band-num-go' }).catch(() => undefined) // the view restore's own scroll throws in the kit
  expect(w.calls.filter(c => c.event === 'ui.close').length).toBe(closesBefore + 1)
  expect((await band.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['chord-mark', 'chord-jump', 'chord-prompts', 'chord-read', 'chord-help'])
})

test('4 a submitted prompt ends the band waiting for a number', { options: { listInput: 'buttons' } }, async ($, on) => {
  world(on, { session: SID, store: STORE })
  on('prompt.submit' as never, {} as never, (async (_h: unknown, e: object) => e) as never)
  const band = (await $.ui.mount(BAND as never)) as unknown as Ui
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  expect((await band.findAll({ type: 'Text' })).some(t => t.text === 'prompt #')).toBe(true)
  await ($ as unknown as Engine).prompt.submit({ text: 'hello' })
  expect((await band.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['chord-mark', 'chord-jump', 'chord-prompts', 'chord-read', 'chord-help'])
})

// The jumplist in memory belongs to one conversation (test-scenarios 2026-10-14__02-07-49,
// S1: the same class as the register cache, 0.4.65). `i` at the end of A's list moves
// nothing but loads it; after the switch, `o` must find B's list, which is empty.
test('M2 a new conversation walks its own jumplist, not the one before it', async ($, on) => {
  const B = '99999999-2222-4333-8444-555555555555'
  const jl = { entries: [{ uuid: 'aaaaaaaa-0000-4000-8000-000000000001', block: 'start' }, { uuid: 'aaaaaaaa-0000-4000-8000-000000000002', block: 'start' }], index: 1 }
  const opts = { session: SID, store: { ...STORE, [`jumplist:${SID}`]: jl } }
  const w = world(on, opts)
  const band = (await ($ as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount(BAND as never)) as Ui
  const type = async (text: string) => {
    const field = (await band.findAll({ type: 'Input' }))[0]?.key ?? 'band-cmd-0'
    // A walk to an entry scrolls, which a plugin's own $.ui.scroll does not reach in the
    // kit (it throws "no implementation"); only an empty list answers with a toast alone.
    await band.input({ key: field, text }).catch(() => undefined)
  }
  await type('i')
  expect(w.toasts()).toContain('Nothing to go forward to')
  // /clear: the process goes on under a new id, and no session.start fires (Q261014-01);
  // the next band command notices the new id.
  opts.session = B
  await type('o')
  expect(w.toasts().at(-1)).toBe('Nothing to go back to')
})

// The debug log is the conversation's own (test-scenarios 2026-10-14__02-07-49, S4): its
// path was looked up once per process, so a new conversation's lines went on into the
// previous conversation's file. The engine's order (Q261014-01): session.start once, at
// the process's start; at /clear, session.end with reason `clear`, then the process goes
// on under a new id with no session.start. An end while the id is still the old one
// resets nothing (compaction keeps the id too); the first look under the new id does.
test('M3 a new conversation writes its own debug log', async ($, on) => {
  const B = '99999999-2222-4333-8444-555555555555'
  const LOG_B = `C:/test-home/claude/bookmarks/debug/${B}.log`
  const opts = { session: SID, store: STORE }
  const w = world(on, opts)
  on('prompt.submit' as never, {} as never, (async (_h: unknown, e: object) => e) as never)
  await ($ as unknown as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  await settle()
  expect((w.file(LOG) ?? '').includes('tool registered')).toBe(true)
  await ($ as unknown as Engine).session.end({ reason: 'clear', sessionId: SID } as never)
  await settle()
  expect((w.file(LOG) ?? '').includes('a new conversation')).toBe(false)
  const linesInA = (w.file(LOG) ?? '').split('\n').length
  opts.session = B
  await ($ as unknown as Engine).prompt.submit({ text: 'hello' })
  await settle()
  expect((w.file(LOG_B) ?? '').includes('a new conversation')).toBe(true)
  expect((w.file(LOG) ?? '').split('\n').length).toBe(linesInA)
})

// A conversation the process moves to (a resume, or /clear) is back-filled too: the
// back-fill started only from session.start, which never fires there (acceptance check
// 2026-10-14__16-55-20, #15; Q261014-01). Its done flag is per conversation, so B is read.
test('6b a conversation the process moves to is back-filled when its id is first seen', async ($, on) => {
  const B = '99999999-2222-4333-8444-555555555555'
  const LOG_B = `C:/test-home/claude/bookmarks/debug/${B}.log`
  const opts = { session: SID, store: LIVE_ONLY, files: { [TRANSCRIPT]: '', [TRANSCRIPT.replace(SID, B)]: '' }, process: () => ({ exitCode: 0, stdout: FILE_ROWS }) }
  const w = world(on, opts)
  on('prompt.submit' as never, {} as never, (async (_h: unknown, e: object) => e) as never)
  await start($)
  await settle()
  expect(backfillLines(w).length).toBe(1)
  opts.session = B
  await ($ as unknown as Engine).prompt.submit({ text: 'hello' })
  await settle()
  expect((w.file(LOG_B) ?? '').split('\n').some(l => l.includes('backfill:'))).toBe(true)
})
