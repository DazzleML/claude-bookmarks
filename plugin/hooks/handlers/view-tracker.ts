// The view tracker: which messages are on screen in conversation order, the prompt the
// person is nearest to, where the view is as a scroll can put it back, and the pane's
// yellow row following the view (the navigation cluster's first move out of register.tsx,
// Q261012-11 "hybrid"). Moved whole under /move-code, comments as they were; `ports.x()`
// where the code called `$` or a register.tsx function.
//
// It owns its state (the one-owner principle, notes/meta/2026-10-12__22-48-40): the screen
// order, the trusted set, the rule that held the yellow row, and the row last drawn yellow.
// The one write from outside -- the prompts pane recording what it drew -- is a named
// method, `drewHere`. The screen model is read, never written, from here.
import { byFirstFour, firstFour, short } from '../core/message-id.ts'
import type { ScreenModel } from '../core/screen-model.ts'
import { exchangeIndex, looksLikeRedraw, pickViewAnchor, promptNearView } from '../core/view-position.ts'
import type { ViewPorts } from '../engine/ports.ts'

const VIEW_MOVED_MS = 150

export class ViewTracker {
  // The messages on screen, top to bottom, as topOnScreen last ordered them.
  private lastScreenOrder: string[] = []
  // The messages the last accepted view held: the set a lone off-screen redraw is judged
  // against, and restored when one is ignored (promptHere).
  private trustedScreen = new Set<string>()
  // Which rule kept the yellow row where it was, logged under the `held` debug channel
  // (#35), so a rule that never changes an outcome can be found and removed. Read by
  // noteViewMoved.
  private heldBy: string | undefined
  private lastHeldLogged: string | undefined
  // The row the pane last drew yellow, and the debounce behind the dynamic update.
  private lastHere: string | undefined
  private viewTimer: { cancel: () => void } | undefined

  constructor(private readonly screen: Pick<ScreenModel, 'fresh' | 'report' | 'recentSelfRedraw' | 'sinceSelfRedraw' | 'selfRedrawWhy'>) {}

  /** The prompts pane drew this row yellow (the one write from outside). */
  drewHere(here: string | undefined): void {
    this.lastHere = here
  }

  private held(rule: string): string | undefined {
    this.heldBy = rule
    return this.lastHere
  }

  // The message at the top of the view: of those on screen, the earliest in the
  // conversation. Order is known for every prompt (back-filled) and for the replies
  // captured since load (each placed after the prompt before it).
  async conversationOrder(ports: ViewPorts): Promise<Map<string, number>> {
    const order = new Map<string, number>()
    const promptList = await ports.prompts()
    promptList.forEach((p, i) => order.set(p.uuid, i * 1000))
    let base = 0
    let k = 0
    // A row is a boundary when it is a prompt by kind or by the list: a message queued
    // before 0.4.1 was kept under the `attachment` door, and its reply-like order overwrote
    // its place as a prompt (2026-10-11, #341 inside #340's exchange).
    const promptSet = new Set(promptList.map(p => p.uuid))
    for (const r of await ports.rows()) {
      if (r.door === 'prompt' || promptSet.has(r.uuid)) {
        base = order.get(r.uuid) ?? base
        k = 0
      } else order.set(r.uuid, base + ++k)
    }
    return order
  }

  async topOnScreen(ports: ViewPorts): Promise<string | undefined> {
    const order = await this.conversationOrder(ports)
    // Only the latest burst of reports: what is on screen now, not what was before a jump.
    const visible = this.screen.fresh()
    const known = visible.filter(id => order.has(id)).sort((a, b) => order.get(a)! - order.get(b)!)
    // Not yet captured (a reply still arriving) sorts last: it is the newest.
    this.lastScreenOrder = [...known, ...visible.filter(id => !order.has(id))]
    return known[0] ?? visible[0]
  }

  // The prompt the person is nearest to, for the prompts pane: the earliest prompt on
  // screen, else the last prompt at or above the top of the screen (djdarcy, 2026-10-11:
  // between two prompts, the higher one, "so the person has more context"). The rule is
  // core/view-position.ts; this gathers its inputs.
  async promptHere(ports: ViewPorts): Promise<string | undefined> {
    const top = await this.topOnScreen(ports)
    const order = await this.conversationOrder(ports)
    const ids = (await ports.prompts()).map(p => p.uuid)
    // A message drawn on screen reports a requestId that shares its uuid's first four
    // groups and differs in the last (measured 2026-10-11: 5 on screen, 0 placed by exact
    // id), the same relation marksOnRow() and sameEntry() already allow for. Compare by
    // the first four groups throughout.
    const byFour = byFirstFour(order)
    // Each on-screen message with how many of its lines show, so the exchange that fills
    // the screen wins, not the prompt that happens to peek in at the bottom.
    // A reply streaming in is reported as freshly drawn at every growth, so while the
    // person is scrolled up it is the only "fresh" message and the yellow row would jump
    // to the newest exchange (2026-10-11: at #256, a scroll up jumped to #309). A growing
    // message never decides the view: it is dropped from the weights, and when nothing
    // else is fresh the answer is the one before.
    const stable = this.lastScreenOrder.filter(id => !this.screen.report(id)?.grew)
    if (stable.length === 0 && this.lastScreenOrder.length > 0) return this.held('a reply streaming in')
    // A message redrawn off screen (a bookmark link minted into it, a highlight cleared)
    // reports its whole range as if every row showed, and as the newest report it evicts
    // the real screen set (2026-10-11 20:50: a 39-line reply from an hour earlier was the
    // only fresh report while the person read five exchanges later; the yellow jumped from
    // #323 to #316). The engine gives a mod no view event to check against, so the shape
    // decides (core/view-position.ts looksLikeRedraw): whole-range reports, none in the
    // trusted set, all far from where the person was -> keep the trusted set and answer.
    const promptOrders = ids.map(u => order.get(u))
    const exchangeOfId = (id: string) => {
      const o = byFour.get(firstFour(id))
      return o === undefined ? undefined : exchangeIndex(promptOrders, o)
    }
    const fresh = stable.flatMap(id => {
      const s = this.screen.report(id)
      return s ? [{ id, first: s.first, last: s.last, of: s.of }] : []
    })
    const now = Date.now()
    if (this.screen.recentSelfRedraw(now) && looksLikeRedraw(fresh, this.trustedScreen, this.lastHere ? exchangeOfId(this.lastHere) : undefined, exchangeOfId)) {
      ports.log(`[bm] redraw ignored, not a view: ${fresh.map(r => `${r.id.slice(0, 13)} ${r.first}-${r.last}/${r.of}`).join(' ')}; kept ${this.lastHere ? short(this.lastHere) : '(none)'} (${this.screen.sinceSelfRedraw(now)} ms after ${this.screen.selfRedrawWhy})`)
      this.lastScreenOrder = [...this.trustedScreen]
      return this.held('a redraw')
    }
    this.trustedScreen = new Set(stable)
    const visible = stable.map(id => {
      const seen = this.screen.report(id)
      return { id: firstFour(id), lines: seen ? seen.last - seen.first + 1 : 1 }
    })
    const stableTop = stable.includes(top ?? '') ? top : stable[0]
    const i = promptNearView(ids.map(firstFour), visible, stableTop && firstFour(stableTop), k => byFour.get(k), ports.closeShare())
    // Nothing placeable in the latest burst of reports happens when a new prompt or a
    // streaming reply is drawn below a view that stays scrolled up (djdarcy, 2026-10-11:
    // sending a prompt "wipes out the yellow"): the view did not move, so the answer is
    // the one before.
    if (i === undefined && !visible.some(m => byFour.has(m.id))) return this.held(visible.length ? 'nothing placeable' : 'no fresh message (tool rows or none)')
    this.heldBy = undefined
    return i === undefined ? undefined : ids[i]
  }

  // Called by the message render hooks on every screen report. A short debounce later,
  // if the prompts pane is open and the nearest prompt has moved, viewRev is bumped so
  // the pane redraws its yellow row (djdarcy, 2026-10-11: "as a user scrolls up the
  // color changes dynamically"). The bump runs in the timer, outside the render hook,
  // which may not write state.
  noteViewMoved(ports: ViewPorts): void {
    this.viewTimer?.cancel()
    this.viewTimer = ports.after(VIEW_MOVED_MS, () => {
      void (async () => {
        if (!(await ports.listPaneOpen())) return
        const here = await this.promptHere(ports)
        if (ports.heldChannel() && this.heldBy && this.heldBy !== this.lastHeldLogged) ports.log(`[bm] held by ${this.heldBy}: kept ${this.lastHere ? short(this.lastHere) : '(none)'}`)
        this.lastHeldLogged = this.heldBy
        if (here === this.lastHere) return
        // Diagnostic (2026-10-11): the yellow row flipped between #295 and #34 within one
        // screen; list what was on screen and where each was placed.
        const byFour = byFirstFour(await this.conversationOrder(ports))
        const seen = this.lastScreenOrder
          .map(id => {
            const s = this.screen.report(id)
            // lines/of: a report whose visible lines equal the message's whole row count is
            // suspect when it arrives alone; a message redrawn off screen (a bookmark link
            // minted into it) reported all 39 of its rows while the person read elsewhere
            // (2026-10-11 20:50, the yellow jumped from #323 to #316).
            return `${id.slice(0, 13)}:${byFour.get(firstFour(id)) ?? '?'}:${s ? `${s.first}-${s.last}/${s.of}` : '?'}`
          })
          .join(' ')
        ports.log(`[bm] nearest prompt moved: ${this.lastHere ? short(this.lastHere) : '(none)'} -> ${here ? short(here) : '(none)'} | on screen (id:order:first-last/of) ${seen}`)
        await ports.bumpView()
        // Keep the yellow row in the pane's view, moving the list the least that does it
        // ('nearest': no move while the row is already showing), and not while the person
        // is browsing the list from the band (a number or j/k typed), so the list never
        // jumps under them (djdarcy, 2026-10-11). The `followHere` setting (#7).
        const follow = ports.followHere()
        if (here && follow !== 'never' && (follow === 'always' || (await ports.bandNumEmpty()))) {
          const r = await ports.scrollPaneTo(`p-${here}`)
          ports.log(`[bm] pane follow to ${short(here)} -> ${r.deny ? `DENY: ${r.deny}` : 'ok'}`)
        }
      })()
    })
  }

  // Where the view is, as a scroll can put it back: the bottom message's end when its last
  // line shows (at the bottom of the conversation, that is exactly Ctrl+End), else the top
  // message's start. "Back" from the reading position went to the top message's start
  // even from the very bottom, a little above where the person was (djdarcy, 2026-10-07).
  // The candidate with the least drift wins (core/view-position.ts pickViewAnchor): the top
  // message's start, the next message's start, or the bottom message's end (#29).
  async viewAnchor(ports: ViewPorts): Promise<{ uuid: string; block: 'start' | 'end' } | undefined> {
    const top = await this.topOnScreen(ports)
    if (!top) return undefined
    const reports = this.lastScreenOrder.flatMap(id => {
      const s = this.screen.report(id)
      return s ? [{ id, first: s.first, last: s.last, of: s.of }] : []
    })
    const pick = pickViewAnchor(reports)
    if (!pick) return { uuid: top, block: 'start' }
    if (pick.drift > 0) ports.log(`[bm] view anchor ${short(pick.id)} at the ${pick.block}, ${pick.drift} rows off at best`)
    return { uuid: pick.id, block: pick.block }
  }
}
