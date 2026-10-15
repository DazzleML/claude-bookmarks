// The band drawn from the router's table (slice 5; #29): `?` for the help, a press doing
// what its key does, and the switches `band`, `chords`, `panes`. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, world } from './harness.ts'
import { listHint, listKeysFor } from '../hooks/core/band/keys.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const STORE = {
  [`prompts:${SID}`]: [
    { uuid: 'aaaaaaaa-0000-4000-8000-000000000001', head: 'first prompt' },
    { uuid: 'aaaaaaaa-0000-4000-8000-000000000002', head: 'second prompt' },
  ],
  [`backfilled6:${SID}`]: true,
}
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }

type Found = { type: string; key?: string; text?: string; props: Record<string, unknown> }
type Band = { input: (t: object) => Promise<unknown>; press: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]> }
const mount = async ($: unknown, maxRows = BAND_PROPS.maxRows) =>
  (await ($ as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount({ ...BAND, props: { ...BAND_PROPS, maxRows } } as never)) as Band
const texts = async (band: Band) => (await band.findAll({ type: 'Text' })).map(t => t.text ?? '')
// The help's lines: every Text after its `bm help` title (the kit reports no key for a Text).
const helpText = async (band: Band) => {
  const all = await texts(band)
  return all.slice(all.indexOf('bm help') + 1)
}

test('? in a tall band: one line per command, and close returns to the bar', async ($, on) => {
  world(on, { store: STORE, session: SID })
  const band = await mount($, 40)
  // The plugin moves the ring onto `close`; its own $.ui.focus is not routed to tests.
  await band.input({ key: 'band-cmd-0', text: '?' }).catch(() => undefined)
  const help = (await helpText(band)).join('\n')
  for (const line of ['jump to a mark', 'turn mark a-z into a bookmark', 'back to where the last jump left from', 'j next · k previous · s pin', 'Chords (mark, jump, prompts, read on their own keybindings): on'])
    expect(help.includes(line)).toBe(true)
  await band.press({ key: 'band-help-close' })
  expect((await band.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['chord-mark', 'chord-jump', 'chord-prompts', 'chord-read', 'chord-help'])
})

// Taller than the band, the help scrolled, and the keyboard probe scrolled it back to the
// top (djdarcy, 2026-10-12): a band too short gets the four-line form instead.
test('? in a short band: the four-line help, fitting it', async ($, on) => {
  world(on, { store: STORE, session: SID })
  const band = await mount($, 10)
  await band.input({ key: 'band-cmd-0', text: '?' }).catch(() => undefined)
  const help = await helpText(band)
  expect(help.length).toBe(4)
  expect(help[0]!.includes("' or j + letter (jump)")).toBe(true)
})

test('q in a list closes the pane and brings the bar back (Q261012-09)', async ($, on) => {
  // The pane is open (the harness's `panes`), so closing it is observable as a ui.close.
  const w = world(on, { store: STORE, session: SID, panes: [{ id: 'bm-pane' }] })
  const band = await mount($)
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  expect((await band.findAll({ type: 'Button' })).some(b => b.key === 'band-num-q')).toBe(true)
  const closesBefore = w.calls.filter(c => c.event === 'ui.close').length
  await band.press({ key: 'band-num-q' })
  expect(w.calls.filter(c => c.event === 'ui.close').length).toBe(closesBefore + 1)
  expect((await band.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['chord-mark', 'chord-jump', 'chord-prompts', 'chord-read', 'chord-help'])
})

test('a press on the bar does what its key does: prompts opens the list', async ($, on) => {
  const w = world(on, { store: STORE, session: SID })
  const band = await mount($)
  await band.press({ key: 'chord-prompts' }).catch(() => undefined)
  expect((w.opened() as { title: string }[]).map(o => o.title)).toEqual(['prompts: type #'])
})

for (const [cmd, pane] of [['p', 'list'], ['b', 'bookmarks']] as const) {
  test(`the ${pane} row draws exactly the letter keys its hint names`, async ($, on) => {
    world(on, { store: STORE, session: SID })
    const band = await mount($)
    await band.input({ key: 'band-cmd-0', text: cmd }).catch(() => undefined)
    const letters = (await band.findAll({ type: 'Button' })).map(b => b.props.hotkey).filter((h): h is string => typeof h === 'string' && /^[a-z]$/.test(h))
    expect(letters.sort()).toEqual(listKeysFor(pane).map(l => l.key).sort())
    for (const l of letters) expect(listHint(pane).includes(`${l} `)).toBe(true)
  })
}

test('chords off: no button carries a borrowed action', { options: { chords: 'off' } }, async ($, on) => {
  world(on, { store: STORE, session: SID })
  const band = await mount($)
  const buttons = await band.findAll({ type: 'Button' })
  expect(buttons.length).toBe(5)
  expect(buttons.filter(b => b.props.action !== undefined).length).toBe(0)
})

test('band: field draws the field alone', { options: { band: 'field' } }, async ($, on) => {
  world(on, { store: STORE, session: SID })
  const band = await mount($)
  expect((await band.findAll({})).filter(e => e.type !== 'Box').map(e => e.type)).toEqual(['Input'])
})

// Every command that opens a list or a letter pane, with lists off: no pane, the band's
// own row for the key (the band row's title tells which).
for (const [cmd, title] of [['p', 'prompt #'], ['b', 'bookmark #'], ['m', 'mark as:'], ["'", 'jump:']] as const) {
  test(`panes off: ${cmd} takes its key in the band and opens no pane`, { options: { panes: 'off' } }, async ($, on) => {
    const w = world(on, { store: STORE, session: SID })
    const band = await mount($)
    await band.input({ key: 'band-cmd-0', text: cmd }).catch(() => undefined)
    expect(w.opened()).toEqual([])
    expect((await texts(band))[1]).toBe(title)
  })
}
