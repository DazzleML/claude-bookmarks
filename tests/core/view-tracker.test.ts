import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ScreenModel } from '../../plugin/hooks/core/kit/screen-model.ts'
import { ViewTracker } from '../../plugin/hooks/handlers/view-tracker.ts'
import type { ViewPorts } from '../../plugin/hooks/engine/ports.ts'

// The view tracker's own decisions (handlers/view-tracker.ts): the conversation order it
// builds, the top of the screen, which rule holds the yellow row, the debounced pane
// update and the view anchor. The pick between exchanges is core/prompts/view-position.ts's,
// tested there; here it is only the input the tracker gathers.

const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`
const [P1, R1, P2, R2, P3, R3, P4, R4] = [1, 2, 3, 4, 5, 6, 7, 8].map(id)
const U = id(99) // on screen, captured nowhere
const PROMPTS = [P1, P2, P3, P4].map(uuid => ({ uuid }))
const ROWS = [
  { uuid: P1, door: 'prompt' }, { uuid: R1, door: 'response' },
  { uuid: P2, door: 'prompt' }, { uuid: R2, door: 'response' },
  { uuid: P3, door: 'prompt' }, { uuid: R3, door: 'response' },
  { uuid: P4, door: 'prompt' }, { uuid: R4, door: 'response' },
]
const lines = (first: number, last: number, of: number) => ({ first, last, of })

function fakePorts(over: Partial<ViewPorts> = {}) {
  const seen = { logs: [] as string[], timers: [] as (() => void)[], cancelled: 0, bumps: 0, scrolls: [] as string[] }
  const ports: ViewPorts = {
    prompts: async () => PROMPTS,
    rows: async () => ROWS,
    log: line => void seen.logs.push(line),
    closeShare: () => 0.6,
    after: (_ms, fn) => {
      seen.timers.push(fn)
      return { cancel: () => void seen.cancelled++ }
    },
    listPaneOpen: async () => true,
    heldChannel: () => false,
    bumpView: async () => void seen.bumps++,
    followHere: () => 'always',
    bandNumEmpty: async () => true,
    scrollPaneTo: async key => (seen.scrolls.push(key), {}),
    ...over,
  }
  return { ports, seen }
}

// The debounced update runs its work in an un-awaited async block.
const settle = () => new Promise(r => setTimeout(r, 0))

test('conversation order: prompts by list, each reply after its prompt; a listed prompt kept under another door is a boundary', async () => {
  const t = new ViewTracker(new ScreenModel())
  const { ports } = fakePorts()
  const order = await t.conversationOrder(ports)
  assert.deepEqual([P1, R1, P2, R2, P3, R3].map(u => order.get(u)), [0, 1, 1000, 1001, 2000, 2001])
  const queued = fakePorts({ rows: async () => [{ uuid: P1, door: 'prompt' }, { uuid: P2, door: 'attachment' }, { uuid: R2, door: 'response' }] })
  const o2 = await t.conversationOrder(queued.ports)
  assert.equal(o2.get(P2), 1000)
  assert.equal(o2.get(R2), 1001)
})

test('the top of the screen is the earliest in the conversation; a message not yet captured sorts last', async () => {
  const s = new ScreenModel()
  const t = new ViewTracker(s)
  const { ports } = fakePorts()
  assert.equal(await t.topOnScreen(ports), undefined)
  s.noteMessage(U, lines(0, 2, 3), 1000)
  s.noteMessage(P3, lines(0, 2, 3), 1000)
  s.noteMessage(R2, lines(4, 9, 10), 1000)
  assert.equal(await t.topOnScreen(ports), R2)
  const only = new ScreenModel()
  only.noteMessage(U, lines(0, 2, 3), 1000)
  assert.equal(await new ViewTracker(only).topOnScreen(ports), U)
})

test('the prompt here is the exchange that fills the screen, by rows shown, not by messages', async () => {
  const s = new ScreenModel()
  const t = new ViewTracker(s)
  const { ports } = fakePorts()
  s.noteMessage(R2, lines(0, 19, 20), 1000)
  s.noteMessage(P3, lines(0, 0, 1), 1000)
  s.noteMessage(R3, lines(0, 0, 1), 1000)
  assert.equal(await t.promptHere(ports), P2)
})

test('the prompt here reads the prompt list and the rows once each', async () => {
  const s = new ScreenModel()
  s.noteMessage(R2, lines(0, 9, 10), 1000)
  const reads = { prompts: 0, rows: 0 }
  const { ports } = fakePorts({
    prompts: async () => (reads.prompts++, PROMPTS),
    rows: async () => (reads.rows++, ROWS),
  })
  assert.equal(await new ViewTracker(s).promptHere(ports), P2)
  assert.deepEqual(reads, { prompts: 1, rows: 1 })
})

test('a reply streaming in alone holds the row last drawn yellow, until a new conversation forgets it', async () => {
  const s = new ScreenModel()
  const t = new ViewTracker(s)
  const { ports } = fakePorts()
  s.noteMessage(R4, lines(0, 4, 5), 1000)
  s.noteMessage(R4, lines(0, 9, 10), 1010)
  t.drewHere(P1)
  assert.equal(await t.promptHere(ports), P1)
  t.newConversation()
  assert.equal(await t.promptHere(ports), undefined)
})

test('nothing placeable on screen holds the row last drawn yellow', async () => {
  const s = new ScreenModel()
  const t = new ViewTracker(s)
  const { ports } = fakePorts()
  s.noteMessage(U, lines(0, 2, 3), 1000)
  t.drewHere(P2)
  assert.equal(await t.promptHere(ports), P2)
})

test('a whole-message report far away, just after the plugin redrew something, is a redraw: the row stays', async () => {
  const run = async (selfRedraw: boolean) => {
    const s = new ScreenModel()
    const t = new ViewTracker(s)
    const { ports, seen } = fakePorts()
    s.noteMessage(R1, lines(2, 7, 10), 1000)
    assert.equal(await t.promptHere(ports), P1)
    t.drewHere(P1)
    s.noteMessage(R4, lines(0, 38, 39), 9000)
    if (selfRedraw) s.expectRedraw('bookmark minted', Date.now())
    return { here: await t.promptHere(ports), logs: seen.logs }
  }
  const redrawn = await run(true)
  assert.equal(redrawn.here, P1)
  assert.match(redrawn.logs.join('\n'), /redraw ignored/)
  const scrolled = await run(false)
  assert.equal(scrolled.here, P4)
})

test('the pane update is debounced, waits for the list pane, then redraws and follows', async () => {
  const s = new ScreenModel()
  s.noteMessage(R2, lines(0, 9, 10), 1000)
  const t = new ViewTracker(s)
  const { ports, seen } = fakePorts()
  t.noteViewMoved(ports)
  t.noteViewMoved(ports)
  assert.equal(seen.cancelled, 1)
  seen.timers.at(-1)!()
  await settle()
  assert.equal(seen.bumps, 1)
  assert.deepEqual(seen.scrolls, [`p-${P2}`])
  assert.match(seen.logs.join('\n'), /nearest prompt moved/)

  const closed = fakePorts({ listPaneOpen: async () => false })
  t.noteViewMoved(closed.ports)
  closed.seen.timers[0]!()
  await settle()
  assert.equal(closed.seen.bumps, 0)

  const never = fakePorts({ followHere: () => 'never' })
  t.noteViewMoved(never.ports)
  never.seen.timers[0]!()
  await settle()
  assert.equal(never.seen.bumps, 1)
  assert.deepEqual(never.seen.scrolls, [])
})

test('no update when the row here has not moved', async () => {
  const s = new ScreenModel()
  s.noteMessage(R2, lines(0, 9, 10), 1000)
  const t = new ViewTracker(s)
  t.drewHere(P2)
  const { ports, seen } = fakePorts()
  t.noteViewMoved(ports)
  seen.timers[0]!()
  await settle()
  assert.equal(seen.bumps, 0)
})

test('the view anchor: none on an empty screen; else the edge with the least drift, from the screen in order', async () => {
  const s = new ScreenModel()
  const t = new ViewTracker(s)
  const { ports } = fakePorts()
  assert.equal(await t.viewAnchor(ports), undefined)
  // R2's first five rows are above the view; P3 shows whole at the bottom: its end is exact.
  s.noteMessage(P3, lines(0, 2, 3), 1000)
  s.noteMessage(R2, lines(5, 9, 10), 1000)
  assert.deepEqual(await t.viewAnchor(ports), { uuid: P3, block: 'end' })
})
