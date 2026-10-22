// Pane rows fill the pane's width (U64; djdarcy, 2026-10-15: "If a person resizes we should
// always fill the screen to show as much text as will fit"). A prompts-pane row draws the
// prompt's whole text as one line and lets the terminal cut it at the pane's edge; the
// 60-character head is the fallback when no text is kept. The cut itself is the
// terminal's and a live look (tests/checklists); the kit shows the row's whole text.
// Run: claude plugin test plugin
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
const PANE = {
  plugin: 'bookmarks',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'bm-pane',
  props: { title: 'prompts: type #', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
}
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

type Found = { type: string; key?: string; text?: string }
type Pane = { findAll: (q: object) => Promise<Found[]> }

async function promptsPane($: { ui: { mount: (t: never) => Promise<unknown> } }) {
  const band = (await $.ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  return (await $.ui.mount(PANE as never)) as Pane
}

test('a prompts-pane row carries the whole kept text on one line; the head when none is kept', async ($, on) => {
  world(on, { session: SID, store: STORE, files: TEXT_FILES })
  const pane = await promptsPane($ as never)
  const rows = (await pane.findAll({ type: 'Button' })).map(b => b.text)
  expect(rows).toEqual([
    ' 3) third prompt: a multi-line one with a second paragraph and a tab',
    ' 2) second prompt: add a band',
    ` 1) ${LONG}`,
  ])
})

// The drawn Text child carries the row's style, so a prompt not drawn since load reads dim in
// the text people see, not only on the Button's chrome (the v0.6.9 sweep's m8 and m9: the dim
// rule and the Text's style guard were unpinned).
test('a row not drawn since load is dim in its text; the Text child carries the style', async ($, on) => {
  world(on, { session: SID, store: STORE, files: TEXT_FILES })
  const pane = await promptsPane($ as never)
  const rowTexts = (await pane.findAll({ type: 'Text' })).filter(t => /^ \d\) /.test(t.text ?? '')) as (Found & { props?: { dimColor?: boolean } })[]
  expect(rowTexts.length).toBe(3)
  expect(rowTexts.every(t => t.props?.dimColor === true)).toBe(true)
})

// The jump pane cut each row's head to 40 characters (the reading row to 32) on top of the
// head's own 60; a row now carries the whole head and truncates at the pane's edge.
const HEAD60 = 'a marked line that runs to sixty characters, no fewer, so'.padEnd(60, '.')
const M1 = 'eeeeeeee-0000-4000-8000-000000000001'
const JUMP_PANE = {
  plugin: 'bookmarks',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'bm-pane',
  props: { title: 'jump: press a-z', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
}

test('a jump-pane row carries the whole 60-character head', async ($, on) => {
  world(on, { session: SID, files: registerWithMarks(SID, { a: { uuid: M1, head: HEAD60, markedAt: 1, snippet: HEAD60 } }) })
  // The marks the panes draw are read at the session's start (the cache fills then).
  await $.session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  const band = (await $.ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: "'" }).catch(() => undefined)
  const pane = (await $.ui.mount(JUMP_PANE as never)) as Pane
  const row = (await pane.findAll({ type: 'Button' })).find(b => b.key === 'jump-a')
  expect(HEAD60.length).toBe(60)
  expect(row?.text).toBe(HEAD60)
})

test('the reading row carries the whole head after its label', async ($, on) => {
  // The reading position is the backtick slot (register.tsx READING).
  world(on, { session: SID, files: registerWithMarks(SID, { '`': { uuid: M1, head: HEAD60, markedAt: 1, snippet: HEAD60 } }) })
  await $.session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  const band = (await $.ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: "'" }).catch(() => undefined)
  const pane = (await $.ui.mount(JUMP_PANE as never)) as Pane
  const row = (await pane.findAll({ type: 'Button' })).find(b => b.key === 'jump-reading')
  expect(row?.text).toBe(`␣ reading: ${HEAD60}`)
})

test('the jump pane with no marks and no reading position says so', async ($, on) => {
  world(on, { session: SID })
  await $.session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  const band = (await $.ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: "'" }).catch(() => undefined)
  const pane = (await $.ui.mount(JUMP_PANE as never)) as Pane
  expect((await pane.findAll({ type: 'Text' })).some(t => t.text === 'No marks yet. Esc')).toBe(true)
  expect((await pane.findAll({ type: 'Button' })).length).toBe(0)
})
