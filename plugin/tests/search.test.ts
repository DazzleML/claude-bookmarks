// The search pane (the search-pane-and-links design, 2026-10-26, unit U-S): `<leader> /`
// opens it with the band's field as the query; typing narrows, a toggle narrows, the step
// buttons move the ▶, Enter lands, `*N` pins a tool row with its block, and the toggle-row
// setting hides the row. The place reader reads the transcript through the harness's
// `process` answer (read-chunk.ps1 by offset), as tests/loader.test.ts does.
// The kit does not route a plugin's own $.ui.focus or $.ui.scroll (docs/engine-quirks.md), so
// the calls that move the ring or scroll throw after what each test checks.
// Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { BAND_PROPS, DATA_ROOT, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-777777777777'
const TRANSCRIPT = `C:/test-home/.claude/projects/C--test-project/${SID}.jsonl`
const line = (o: unknown) => JSON.stringify(o)
const FILE = [
  line({ type: 'user', uuid: 'aaaaaaaa-0000-4000-8000-000000000001', timestamp: '2026-10-26T01:00:00Z', message: { role: 'user', content: 'find the loader please' } }),
  line({ type: 'assistant', uuid: 'aaaaaaaa-0000-4000-8000-000000000002', timestamp: '2026-10-26T01:01:00Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01Loader', name: 'Bash', input: { command: 'grep -rn loader src' } }] } }),
  line({ type: 'user', uuid: 'aaaaaaaa-0000-4000-8000-000000000003', timestamp: '2026-10-26T01:02:00Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01Loader', content: 'src/loader.ts:51' }] } }),
  line({ type: 'assistant', uuid: 'aaaaaaaa-0000-4000-8000-000000000004', timestamp: '2026-10-26T01:03:00Z', message: { role: 'assistant', content: [{ type: 'text', text: 'The loader is in src/loader.ts' }] } }),
  line({ type: 'user', uuid: 'aaaaaaaa-0000-4000-8000-000000000005', timestamp: '2026-10-26T01:04:00Z', message: { role: 'user', content: 'thanks, now the pane' } }),
].join('\n') + '\n'

const BAND = { plugin: 'bookmarks', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS, requestId: 'band-1' }
const PANE = {
  plugin: 'bookmarks',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'bm-pane',
  props: { title: 'search: type words', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 } },
}

type Found = { type: string; key?: string; text?: string; props: Record<string, unknown> }
type Ui = { input: (t: object) => Promise<unknown>; press: (t: object) => Promise<unknown>; findAll: (q: object) => Promise<Found[]>; find: (q: object) => Promise<Found | undefined> }
const mount = async ($: unknown, target: object) => (await ($ as { ui: { mount: (t: never) => Promise<unknown> } }).ui.mount(target as never)) as Ui
const settle = (ms: number) => new Promise(r => setTimeout(r, ms))
const fieldOf = async (band: Ui) => (await band.findAll({ type: 'Input' })).find(i => (i.key ?? '').startsWith('band-num-field'))
const type = async (band: Ui, text: string) => band.input({ key: (await fieldOf(band))?.key, text, kind: 'change' }).catch(() => undefined)
const enter = async (band: Ui, text: string) => band.input({ key: (await fieldOf(band))?.key, text, kind: 'submit' }).catch(() => undefined)
/** The result rows' Buttons, in the order drawn. */
const results = async (pane: Ui) => (await pane.findAll({ type: 'Button' })).filter(b => /^s-\d+$/.test(b.key ?? '')).map(b => b.text)

function searchWorld(on: unknown, file = FILE) {
  return world(on, {
    session: SID,
    files: { [TRANSCRIPT]: file },
    process: argv => {
      const at = argv.indexOf('-Offset')
      if (!argv.some(a => a.endsWith('read-chunk.ps1')) || at < 0) return { exitCode: 0, stdout: '' }
      const offset = Number(argv[at + 1])
      return { exitCode: 0, stdout: file.slice(offset, offset + 4_000_000) }
    },
  })
}

/** Run the mocked clock until the reader and the search have settled. */
async function run(w: ReturnType<typeof world>) {
  for (let i = 0; i < 12; i++) {
    await w.clock.advance(200)
    await settle(60)
  }
}

async function openSearch($: unknown, w: ReturnType<typeof world>) {
  await ($ as { session: { start: (e: object) => Promise<unknown> } }).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })
  const band = await mount($, BAND)
  await band.input({ key: 'band-cmd-0', text: '/' }).catch(() => undefined)
  await run(w)
  return band
}

test('<leader> / opens search: the band draws its query field, and the pane lists every place, newest first', async ($, on) => {
  const w = searchWorld(on)
  const band = await openSearch($, w)
  const field = await fieldOf(band)
  expect([field?.props.label, field?.props.autoFocus]).toEqual(['/', true])
  expect((await band.findAll({ type: 'Text' })).map(t => t.text)).toContain('search')
  const pane = await mount($, PANE)
  expect(await results(pane)).toEqual([
    'thanks, now the pane',
    'The loader is in src/loader.ts',
    'src/loader.ts:51',
    // The label beside it says Bash; the head goes on into the call's input.
    'grep -rn loader src {"command":"grep -rn loader src"}',
    'find the loader please',
  ])
  // The place reader wrote its index: it ran on demand, for this search.
  expect(Object.keys(w.files).some(p => p.replace(/\\/g, '/').startsWith(`${DATA_ROOT}/places/${SID}/index.json`))).toBe(true)
})

test('typing narrows the results; a toggle narrows them again', async ($, on) => {
  const w = searchWorld(on)
  const band = await openSearch($, w)
  await type(band, 'loader')
  await run(w)
  const pane = await mount($, PANE)
  expect((await results(pane)).length).toBe(4)
  await pane.press({ key: 's-toggle-tools' }).catch(() => undefined)
  await run(w)
  expect(await results(pane)).toEqual(['grep -rn loader src {"command":"grep -rn loader src"}'])
})

test('the step buttons move the ▶ through the results, and Enter lands on the one under it', async ($, on) => {
  const w = searchWorld(on)
  const band = await openSearch($, w)
  await type(band, 'loader')
  await run(w)
  await band.press({ key: 'band-num-j' }).catch(() => undefined)
  await band.press({ key: 'band-num-j' }).catch(() => undefined)
  const pane = await mount($, PANE)
  const numbers = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '').filter(t => /^.?\s*\d+$/.test(t))
  expect(numbers[1]).toBe('▶2')
  await enter(band, '')
  // The landing, from the debug log: result #2 is the tool's output, landed on by its call's id.
  expect((w.file(`${DATA_ROOT}/debug/${SID}.log`) ?? '').split('\n').some(l => l.includes('[bm] search: result #2 (output,') && l.includes('-> toolu_01Loader'))).toBe(true)
})

test("#N typed in the pane's field moves the ▶ there, and the result gone to is drawn in yellow", async ($, on) => {
  const w = searchWorld(on)
  await openSearch($, w)
  const pane = await mount($, PANE)
  await pane.input({ key: 'search-query', text: '#4', kind: 'change' }).catch(() => undefined)
  await run(w)
  const texts = async () => (await pane.findAll({ type: 'Text' })).map(t => ({ text: t.text ?? '', color: t.props.color }))
  expect((await texts()).some(t => t.text === '▶4')).toBe(true)
  await pane.input({ key: 'search-query', text: '#4', kind: 'submit' }).catch(() => undefined)
  await run(w)
  const after = await texts()
  const four = after.find(t => /^\s*4$/.test(t.text))
  const three = after.find(t => /^\s*3$/.test(t.text))
  expect(four?.color !== undefined && four.color !== three?.color).toBe(true)
  expect(after.some(t => t.text.includes('the result you last went to'))).toBe(true)
})

test('*N pins a tool row in the search list with its block', async ($, on) => {
  const w = searchWorld(on)
  const band = await openSearch($, w)
  await type(band, 'loader')
  await run(w)
  await enter(band, '*3')
  await run(w)
  const register = Object.entries(w.files).find(([p]) => p.replace(/\\/g, '/').startsWith(`${DATA_ROOT}/sessions/`) && p.endsWith('.json') && !p.endsWith('index.json'))?.[1] ?? ''
  const pins = (JSON.parse(register || '{}').pins ?? []) as { uuid: string; part?: number; from: string }[]
  expect(pins.map(p => [p.uuid, p.part, p.from])).toEqual([['aaaaaaaa-0000-4000-8000-000000000002', 0, 'search']])
  expect(w.toasts()).toContain('pinned result #3')
  const pane = await mount($, PANE)
  expect((await pane.findAll({ type: 'Text' })).some(t => t.text === '★')).toBe(true)
})

test('the toggle row is drawn by default and not at all with the setting hidden', async ($, on) => {
  const w = searchWorld(on)
  await openSearch($, w)
  const pane = await mount($, PANE)
  expect((await pane.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('s-toggle-')).length).toBe(10)
})

const toggledOn = async (pane: Ui) => (await pane.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('s-toggle-') && (b.text ?? '').startsWith('●')).map(b => b.key)

test('searchView: the pane opens on the chosen view, its toggles on', { options: { searchView: 'you+claude+sessions+tools+outputs' } }, async ($, on) => {
  const w = searchWorld(on)
  await openSearch($, w)
  const pane = await mount($, PANE)
  expect(await toggledOn(pane)).toEqual(['s-toggle-user', 's-toggle-claude', 's-toggle-sessions', 's-toggle-tools', 's-toggle-outputs'])
})

test('searchView custom: the pane opens on the kinds turned on in the custom rows', { options: { searchView: 'custom', searchWithClaude: false, searchWithSessions: false, searchWithThinking: true } }, async ($, on) => {
  const w = searchWorld(on)
  await openSearch($, w)
  const pane = await mount($, PANE)
  expect(await toggledOn(pane)).toEqual(['s-toggle-user', 's-toggle-tools', 's-toggle-outputs', 's-toggle-thinking'])
})

test('short labels with 3 letters: the rows say cla and you, the toggles keep their words', { options: { searchLabels: 'short', searchShortLength: 3, searchLayout: 'inline' } }, async ($, on) => {
  const w = searchWorld(on)
  await openSearch($, w)
  const pane = await mount($, PANE)
  const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
  expect(texts).toContain('cla: ')
  expect(texts).toContain('out: ')
  expect((await pane.findAll({ type: 'Button' })).find(b => b.key === 's-toggle-claude')?.text).toBe('·claude')
})

// A tool with a long name, as an agent's or an MCP tool's kind is long.
const LONG = line({ type: 'assistant', uuid: 'aaaaaaaa-0000-4000-8000-000000000006', timestamp: '2026-10-26T01:05:00Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01Long', name: 'mcp__bookmarks__bookmark', input: { query: 'the loader' } }] } })

test('searchLayout stacked (the default): a long kind on its own line and the text below; a short kind stays beside its text', async ($, on) => {
  const w = searchWorld(on, FILE + LONG + '\n')
  await openSearch($, w)
  const pane = await mount($, PANE)
  // The stacked kind is drawn without the trailing space an inline kind has.
  const kinds = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
  expect(kinds).toContain('mcp__bookmarks__bookmark:')
  expect(kinds).toContain('Bash: ')
})

test('searchLayout inline: every kind beside its text', { options: { searchLayout: 'inline' } }, async ($, on) => {
  const w = searchWorld(on, FILE + LONG + '\n')
  await openSearch($, w)
  const pane = await mount($, PANE)
  const kinds = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
  expect(kinds).toContain('mcp__bookmarks__bookmark: ')
  expect(kinds).not.toContain('mcp__bookmarks__bookmark:')
})

test('claude alone: the replies carry no label; the setting always keeps it', async ($, on) => {
  const w = searchWorld(on)
  await openSearch($, w)
  const pane = await mount($, PANE)
  await pane.press({ key: 's-toggle-claude' }).catch(() => undefined)
  await run(w)
  const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
  expect(texts).not.toContain('claude: ')
  expect(await results(pane)).toEqual(['The loader is in src/loader.ts'])
})

test('searchImplied always: claude alone keeps the label', { options: { searchImplied: 'always' } }, async ($, on) => {
  const w = searchWorld(on)
  await openSearch($, w)
  const pane = await mount($, PANE)
  await pane.press({ key: 's-toggle-claude' }).catch(() => undefined)
  await run(w)
  expect((await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')).toContain('claude: ')
})

// djdarcy: "we're not importing as much text as we could for each item": the index's head is 160
// characters; a row allowed five lines shows the reply's own text past it.
const LONG_REPLY = line({ type: 'assistant', uuid: 'aaaaaaaa-0000-4000-8000-000000000007', timestamp: '2026-10-26T01:06:00Z', message: { role: 'assistant', content: [{ type: 'text', text: `${'start of a long reply '.repeat(10)}THE TAIL PAST THE HEAD` }] } })

test("a result shows the row's own text past the index's 160-character head", { options: { rowLines: 5 } }, async ($, on) => {
  const w = searchWorld(on, FILE + LONG_REPLY + '\n')
  await openSearch($, w)
  const pane = await mount($, PANE)
  const first = (await results(pane))[0] ?? ''
  expect(first.replace(/\s+/g, ' ').includes('THE TAIL PAST THE HEAD')).toBe(true)
})

test('searchToggles hidden: no toggle row',{ options: { searchToggles: 'hidden' } }, async ($, on) => {
  const w = searchWorld(on)
  await openSearch($, w)
  const pane = await mount($, PANE)
  expect((await pane.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('s-toggle-')).length).toBe(0)
})
