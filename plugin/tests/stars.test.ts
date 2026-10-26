// Stars in the prompts list (the 0.7 groundwork design, unit 6b): a pin is a star made in the
// prompts list, written to the register (format v4) with `from: "prompts"`; the starScope
// setting decides whether the list also shows stars made elsewhere. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { emptyRegister, parseRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { BAND_PROPS, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const PROMPTS = [
  { uuid: 'aaaaaaaa-0000-4000-8000-000000000001', head: 'first prompt: set up the plugin' },
  { uuid: 'aaaaaaaa-0000-4000-8000-000000000002', head: 'second prompt: add a band' },
]
const STORE = { [`prompts:${SID}`]: PROMPTS, [`backfilled7:${SID}`]: true }
const PATH = `C:/test-home/claude/bookmarks/sessions/${SID}.json`
const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const PANE = {
  plugin: 'bookmarks',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'bm-pane',
  props: { title: 'prompts: type #', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
}
type Found = { type: string; text?: string }
type Pane = { input: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]> }
type Mount = { ui: { mount: (t: never) => Promise<unknown> } }

async function openPane($: Mount): Promise<Pane> {
  const band = (await $.ui.mount(BAND as never)) as { input: (t: object) => Promise<unknown> }
  await band.input({ key: 'band-cmd-0', text: 'p' }).catch(() => undefined)
  return (await $.ui.mount(PANE as never)) as Pane
}
const stars = async (p: Pane) => (await p.findAll({ type: 'Text' })).filter(t => t.text === '★').length

/** A v4 register holding one star on prompt 2, made in a list other than the prompts list. */
const starredInSearch = () => serializeRegister({ ...emptyRegister(SID, 'bookmarks test', 0), stars: [{ uuid: PROMPTS[1]!.uuid, owner: 'user', from: 'search', at: 1 }] })

test('*2 in the prompts field stars prompt 2 as a star made in the prompts list, and the row shows it', async ($, on) => {
  const w = world(on, { session: SID, store: STORE })
  const pane = await openPane($ as never)
  await pane.input({ key: 'prompt-number', text: '*2', kind: 'submit' }).catch(() => undefined)
  const reg = parseRegister(w.file(PATH) ?? '')!
  expect(reg.version).toBe(4)
  expect(reg.pins).toBe(undefined)
  expect(reg.stars?.map(s => [s.uuid, s.owner, s.from, s.off])).toEqual([[PROMPTS[1]!.uuid, 'user', 'prompts', undefined]])
  expect(await stars(pane)).toBeGreaterThan(0)
})

test('starScope here (the default): a star made in another list does not show in the prompts list', async ($, on) => {
  world(on, { session: SID, store: STORE, files: { [PATH]: starredInSearch() } })
  expect(await stars(await openPane($ as never))).toBe(0)
})

test('starScope everywhere: the same star shows in the prompts list', { options: { starScope: 'everywhere' } }, async ($, on) => {
  world(on, { session: SID, store: STORE, files: { [PATH]: starredInSearch() } })
  expect(await stars(await openPane($ as never))).toBeGreaterThan(0)
})
