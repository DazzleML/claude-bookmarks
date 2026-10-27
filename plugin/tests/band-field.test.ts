// The band's own field for a list number (input routing, 2026-10-25, units 3 and 3b;
// private design 2026-10-25__00-24-05): after `p` the band draws a field instead of a digit
// button per key, and the list field's contract (core/band/field-input.ts) says what its
// text means: digits build the number, a shorter text is Backspace, `/words` filters the
// pane, `j`/`k` step, `q` closes, Enter with nothing typed ends the list.
// The kit does not route a plugin's own $.ui.focus or $.ui.scroll (docs/engine-quirks.md),
// so the calls that move the ring or scroll throw after what each test checks.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const PROMPTS = [
  { uuid: 'aaaaaaaa-0000-4000-8000-000000000001', head: 'first prompt: set up the plugin' },
  { uuid: 'aaaaaaaa-0000-4000-8000-000000000002', head: 'second prompt: add a band' },
  { uuid: 'aaaaaaaa-0000-4000-8000-000000000003', head: 'third prompt: the band redraw' },
]
const STORE = { [`prompts:${SID}`]: PROMPTS, [`backfilled7:${SID}`]: true }
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const PANE = {
  plugin: 'bookmarks',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'bm-pane',
  props: { title: 'prompts: type #', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
}

type Found = { type: string; key?: string; text?: string; props: Record<string, unknown> }
type Ui = { input: (t: object) => Promise<unknown>; press: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]>; find: (q: object) => Promise<Found | undefined> }
const mount = async ($: unknown, target: object) => (await ($ as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount(target as never)) as Ui
const leaves = (els: Found[]) => els.filter(e => e.type !== 'Box').map(e => `${e.type}:${e.key ?? ''}:${e.text ?? ''}`)
// The field is drawn as band-num-field-<n>, renewed when the plugin itself changes the number.
const fieldOf = async (band: Ui) => (await band.findAll({ type: 'Input' })).find(i => (i.key ?? '').startsWith('band-num-field'))
const type = async (band: Ui, text: string) => band.input({ key: (await fieldOf(band))?.key, text, kind: 'change' }).catch(() => undefined)
const enter = async (band: Ui, text: string) => band.input({ key: (await fieldOf(band))?.key, text, kind: 'submit' }).catch(() => undefined)
const paneNumber = async (pane: Ui) => (await pane.find({ type: 'Input', key: 'prompt-number' }))?.props.value

async function promptsBand($: unknown) {
  const band = await mount($, BAND)
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  return band
}

test('p draws the band field between the step keys, in place of the digit buttons', async ($, on) => {
  world(on, { store: STORE, session: SID })
  const band = await promptsBand($)
  expect(leaves(await band.findAll({}))).toEqual([
    'Text::bm',
    'Text::prompt',
    'Button:band-num-k:k↑',
    'Input:band-num-field-0:',
    'Button:band-num-j:j↓',
    'Button:band-num-s:s★ pin',
    'Button:band-num-q:q close',
    'Text::(Esc)',
  ])
  const field = await fieldOf(band)
  expect([field?.props.label, field?.props.autoFocus, field?.props.placeholder]).toEqual(['#', true, '1-3, /words, *N'])
})

test('digits build the number, and a shorter text (Backspace) takes one off', async ($, on) => {
  world(on, { store: STORE, session: SID })
  const band = await promptsBand($)
  const pane = await mount($, PANE)
  await type(band, '2')
  expect(await paneNumber(pane)).toBe('2')
  // The field draws no value of the plugin's: its text is the person's own.
  expect((await fieldOf(band))?.props.value).toBe(undefined)
  await type(band, '')
  expect(await paneNumber(pane)).toBe('')
  await type(band, '3')
  expect(await paneNumber(pane)).toBe('3')
})

test('/words in the band field filters the prompts pane', async ($, on) => {
  world(on, { store: STORE, session: SID })
  const band = await promptsBand($)
  await type(band, '/redraw')
  const pane = await mount($, PANE)
  expect((await pane.findAll({ type: 'Button' })).map(b => b.text)).toEqual([' 3) third prompt: the band redraw'])
})

test('j and k typed in the field step the list (djdarcy: "I want j/k to remain")', async ($, on) => {
  world(on, { store: STORE, session: SID })
  const band = await promptsBand($)
  const pane = await mount($, PANE)
  // Each step leaves a fresh, empty field, so the next key is typed alone: `j`, then `j` again.
  await type(band, 'j')
  expect(await paneNumber(pane)).toBe('3') // the first step lands on the newest
  await type(band, 'j')
  expect(await paneNumber(pane)).toBe('2') // from the number the band holds, not from nothing
  await type(band, 'k')
  expect(await paneNumber(pane)).toBe('3')
  // A number typed before the key steps from that number.
  await type(band, '3j')
  expect(await paneNumber(pane)).toBe('2')
})

// djdarcy's live checks, 2026-10-25: after `j` put 15 in the field, the next `j` landed
// mid-number ("1j5", 07:16); written as the field's value instead, the number read back as
// nothing and every `j` stepped from "" (07:31). The field holds only the person's typing.
test('a step draws a fresh empty field showing the number dim, and the next key steps from it', async ($, on) => {
  world(on, { store: STORE, session: SID })
  const band = await promptsBand($)
  const before = (await fieldOf(band))?.key
  await type(band, 'j')
  const after = await fieldOf(band)
  expect(after?.key).not.toBe(before)
  expect([after?.props.value, after?.props.placeholder]).toEqual([undefined, '3'])
  // While the person types, the field is not renewed: their own text stays under the same key.
  await type(band, '2')
  expect((await fieldOf(band))?.key).toBe(after?.key)
})

test('Enter on an empty field after a step jumps to the stepped number', async ($, on) => {
  const w = world(on, { store: STORE, session: SID, panes: [{ id: 'bm-pane' }] })
  const band = await promptsBand($)
  const pane = await mount($, PANE)
  await type(band, 'j')
  expect(await paneNumber(pane)).toBe('3')
  const closesBefore = w.calls.filter(c => c.event === 'ui.close').length
  await enter(band, '')
  // A jump, not a close (Enter with no number closes, the test above): the number is spent
  // on the jump, and the list was not closed. The jump's own scroll is not run by the kit.
  expect(await paneNumber(pane)).toBe('')
  expect(w.calls.filter(c => c.event === 'ui.close').length).toBe(closesBefore)
})

test('q alone closes the list and brings the bar back', async ($, on) => {
  world(on, { store: STORE, session: SID, panes: [{ id: 'bm-pane' }] })
  const band = await promptsBand($)
  await type(band, 'q')
  expect((await band.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['chord-mark', 'chord-jump', 'chord-read', 'chord-prompts', 'chord-lists', 'chord-search', 'chord-help'])
})

test('Enter with nothing typed ends the list, as go does', async ($, on) => {
  const w = world(on, { store: STORE, session: SID, panes: [{ id: 'bm-pane' }] })
  const band = await promptsBand($)
  const closesBefore = w.calls.filter(c => c.event === 'ui.close').length
  await enter(band, '')
  expect(w.calls.filter(c => c.event === 'ui.close').length).toBe(closesBefore + 1)
})

test('listInput: buttons keeps the digit buttons', { options: { listInput: 'buttons' } }, async ($, on) => {
  world(on, { store: STORE, session: SID })
  const band = await promptsBand($)
  const keys = (await band.findAll({})).map(e => e.key ?? '')
  expect(keys.includes('band-num-field')).toBe(false)
  expect(keys.includes('band-num-go')).toBe(true)
})
