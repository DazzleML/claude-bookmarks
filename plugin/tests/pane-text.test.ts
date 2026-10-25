// Pane rows fill the pane's width (U64; djdarcy, 2026-10-15: "If a person resizes we should
// always fill the screen to show as much text as will fit"). A prompts-pane row draws the
// prompt's whole text as one line cut to the pane's width (the engine's `bodyColumns`) less
// the number column, with an ellipsis; the 60-character head is the fallback when no text
// is kept. The cut is the plugin's: live, a long Button label wraps and a Text's
// truncate-end inside a Button is not honoured (0.6.9 shipped that way and showed whole
// prompts; 0.6.10 cuts by width). Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, registerWithMarks, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const U1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const U2 = 'aaaaaaaa-0000-4000-8000-000000000002'
const U3 = 'aaaaaaaa-0000-4000-8000-000000000003'
const STORE = {
  [`prompts:${SID}`]: [
    { uuid: U1, head: 'first prompt: set up the plugin, and much later a zebra'.slice(0, 60) },
    { uuid: U2, head: 'second prompt: add a band' },
    { uuid: U3, head: 'third prompt: a multi-line one' },
  ],
  [`backfilled7:${SID}`]: true,
}
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const pane = (title: string, bodyColumns: number) => ({
  plugin: 'bookmarks',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'bm-pane',
  props: { title, isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
})
// The kept text (the filter's, handlers/prompts.ts) lives in files under the data root.
const TEXT_BASE = `C:/test-home/claude/bookmarks/prompttext/${SID}`
const LONG = 'first prompt: set up the plugin, and much later a zebra, and a giraffe after that, well past sixty characters'
const TEXT_FILES = {
  [`${TEXT_BASE}.json`]: JSON.stringify({ pieces: 1 }),
  [`${TEXT_BASE}.0.json`]: JSON.stringify([
    { uuid: U1, text: LONG },
    { uuid: U3, text: 'third prompt: a multi-line one\n\n   with a second   paragraph\tand a tab' },
  ]),
}

type Found = { type: string; key?: string; text?: string; props?: { dimColor?: boolean } }
type Pane = { findAll: (q: object) => Promise<Found[]> }

async function promptsPane($: { ui: { mount: (t: never) => Promise<unknown> } }, bodyColumns: number) {
  const band = (await $.ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  return (await $.ui.mount(pane('prompts: type #', bodyColumns) as never)) as Pane
}

test('a wide prompts pane carries the whole kept text on one line; the head when none is kept', async ($, on) => {
  world(on, { session: SID, store: STORE, files: TEXT_FILES })
  const rows = (await (await promptsPane($ as never, 200)).findAll({ type: 'Button' })).map(b => b.text)
  expect(rows).toEqual([
    ' 3) third prompt: a multi-line one with a second paragraph and a tab',
    ' 2) second prompt: add a band',
    ` 1) ${LONG}`,
  ])
})

// The one-line cut of 0.6.10, pinned under `rowLines: 1` (the default is 2 since U70).
test('a narrow prompts pane cuts each row to its width with an ellipsis, the number column intact', { options: { rowLines: 1 } }, async ($, on) => {
  world(on, { session: SID, store: STORE, files: TEXT_FILES })
  const rows = (await (await promptsPane($ as never, 60)).findAll({ type: 'Button' })).map(b => b.text ?? '')
  // 60 body columns, one spare, four for ` 1) `: 55 for the text, the last of them the ellipsis.
  expect(rows[2]).toBe(` 1) ${LONG.slice(0, 54)}…`)
  expect(rows[2]!.length).toBe(59)
  expect(rows[0]).toBe(' 3) third prompt: a multi-line one with a second paragraph…')
  expect(rows[1]).toBe(' 2) second prompt: add a band')
  expect(rows.every(r => r.length <= 59)).toBe(true)
})

// U70 (djdarcy, 2026-10-22: "letting users choose how many lines per entry is best ... a good
// default is "2 lines""): at the default a row's label carries up to two hard lines, each cut
// to the width, the second indented under the text past the number column.
test('at the default two lines a narrow pane shows two lines of a long prompt, the second under the text', async ($, on) => {
  world(on, { session: SID, store: STORE, files: TEXT_FILES })
  const rows = (await (await promptsPane($ as never, 60)).findAll({ type: 'Button' })).map(b => b.text ?? '')
  // 55 columns of text per line after ` 1) `. The first line breaks before "zebra," (the word
  // straddling the edge fits a line, djdarcy 2026-10-22); the second is cut hard with the ellipsis.
  expect(rows[2]).toBe(' 1) first prompt: set up the plugin, and much later a\n    zebra, and a giraffe after that, well past sixty chara…')
  expect(rows[1]).toBe(' 2) second prompt: add a band')
  // The edge falls on the space after "paragraph": whole words, the rest on the second line.
  expect(rows[0]).toBe(' 3) third prompt: a multi-line one with a second paragraph\n    and a tab')
  for (const r of rows) for (const line of r.split('\n')) expect(line.length <= 59).toBe(true)
})

test('a prompt longer than two lines is cut at the end of the second with an ellipsis', { options: { rowLines: 2 } }, async ($, on) => {
  const longer = `${LONG}, and then a third line's worth of text that no two lines could hold at sixty columns`
  const files = { ...TEXT_FILES, [`${TEXT_BASE}.0.json`]: JSON.stringify([{ uuid: U1, text: longer }]) }
  world(on, { session: SID, store: STORE, files })
  const rows = (await (await promptsPane($ as never, 60)).findAll({ type: 'Button' })).map(b => b.text ?? '')
  expect(longer.length > 110).toBe(true)
  const lines = rows[2]!.split('\n')
  expect(lines.length).toBe(2)
  expect(lines[0]).toBe(' 1) first prompt: set up the plugin, and much later a')
  expect(lines[1]).toBe('    zebra, and a giraffe after that, well past sixty chara…')
})

// A prompt not drawn since load reads dim (the v0.6.9 sweep's m8: the dim rule was unpinned).
test('a row not drawn since load is dim', async ($, on) => {
  world(on, { session: SID, store: STORE, files: TEXT_FILES })
  const rows = await (await promptsPane($ as never, 200)).findAll({ type: 'Button' })
  expect(rows.length).toBe(3)
  expect(rows.every(b => b.props?.dimColor === true)).toBe(true)
})

// The jump pane cut each row's head to 40 characters (the reading row to 32) on top of the
// head's own 60; a row now carries as much of the head as the pane is wide.
const HEAD60 = 'a marked line that runs to sixty characters, no fewer, so'.padEnd(60, '.')
const M1 = 'eeeeeeee-0000-4000-8000-000000000001'

async function jumpPane($: { ui: { mount: (t: never) => Promise<unknown> }; session: { start: (t: object) => Promise<unknown> } }, files: Record<string, string>, bodyColumns: number, on: unknown) {
  world(on as never, { session: SID, files })
  // The marks the panes draw are read at the session's start (the cache fills then).
  await $.session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  const band = (await $.ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: "'" }).catch(() => undefined)
  return (await $.ui.mount(pane('jump: press a-z', bodyColumns) as never)) as Pane
}

// One world per test: the kit refuses a second `world()` once a test has used `$`.
const MARK_A = () => registerWithMarks(SID, { a: { uuid: M1, head: HEAD60, markedAt: 1, snippet: HEAD60 } })

test('a wide jump pane carries the whole 60-character head', async ($, on) => {
  expect(HEAD60.length).toBe(60)
  const wide = await jumpPane($ as never, MARK_A(), 200, on)
  expect((await wide.findAll({ type: 'Button' })).find(b => b.key === 'jump-a')?.text).toBe(HEAD60)
})

test('a narrow jump pane cuts the head to its width with an ellipsis', { options: { rowLines: 1 } }, async ($, on) => {
  const narrow = await jumpPane($ as never, MARK_A(), 40, on)
  // 40 columns, one spare, three for `a: `: 36 for the head, the last the ellipsis.
  expect((await narrow.findAll({ type: 'Button' })).find(b => b.key === 'jump-a')?.text).toBe(`${HEAD60.slice(0, 35)}…`)
})

test('at two lines a narrow jump pane carries the whole head over two, the second indented past `a: `', async ($, on) => {
  const narrow = await jumpPane($ as never, MARK_A(), 40, on)
  // 36 columns per line; the first breaks before "characters," which fits the second whole.
  expect((await narrow.findAll({ type: 'Button' })).find(b => b.key === 'jump-a')?.text).toBe('a marked line that runs to sixty\n   characters, no fewer, so...')
})

test('the reading row carries the whole head after its label in a wide pane', async ($, on) => {
  // The reading position is the backtick slot (register.tsx READING).
  const files = registerWithMarks(SID, { '`': { uuid: M1, head: HEAD60, markedAt: 1, snippet: HEAD60 } })
  const wide = await jumpPane($ as never, files, 200, on)
  expect((await wide.findAll({ type: 'Button' })).find(b => b.key === 'jump-reading')?.text).toBe(`␣ reading: ${HEAD60}`)
})

test('the jump pane with no marks and no reading position says so', async ($, on) => {
  const p = await jumpPane($ as never, {}, 60, on)
  expect((await p.findAll({ type: 'Text' })).some(t => t.text === 'No marks yet. Esc')).toBe(true)
  expect((await p.findAll({ type: 'Button' })).length).toBe(0)
})
