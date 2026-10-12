// Which prompt the person is nearest to, for the prompts pane to highlight.
//
// The rule (djdarcy, 2026-10-11). Each prompt and the replies that follow it are one
// exchange. The exchange that takes the most screen lines is where the person is;
// when two are close, the earlier one wins, "so the person has more context": an
// earlier exchange is chosen as long as it holds at least CLOSE_SHARE of the most
// lines any exchange holds. That is what made a prompt showing at the bottom of the
// screen lose to the long reply above it that the person was actually reading
// (2026-10-11: prompt 200 drawn at the foot of 199's reply). With no placeable
// message on screen, the last prompt at or above the top of the screen wins. Nothing
// is chosen when nothing on screen can be placed in order.
//
// `prompts` are the prompt uuids in conversation order (index 0 is the first prompt).
// `visible` are the messages on screen with how many of their lines show. `top` is
// the message at the top of the screen. `orderOf` places any known message in
// conversation order; a prompt's own order is read through it too.
export const CLOSE_SHARE = 0.6

export type VisibleMessage = { id: string; lines: number }

// The exchange a conversation order belongs to: the index of the last prompt at or
// before it. `promptOrders` are the prompts' orders in list order; a prompt without a
// known order is skipped.
export function exchangeIndex(promptOrders: readonly (number | undefined)[], o: number): number | undefined {
  let found: number | undefined
  for (const [i, po] of promptOrders.entries()) {
    if (po === undefined) continue
    if (po <= o) found = i
    else break
  }
  return found
}

// One on-screen report as the engine gives it: the message's visible rows `first`..`last`
// of its `of` rows in all.
export type ScreenReport = { id: string; first: number; last: number; of: number }

// Whether a burst of fresh reports is a redraw rather than a view. The engine reports a
// message when it is drawn, and a message is redrawn off screen when something in it
// changes (a bookmark link minted into it, a highlight cleared); that report arrives
// with the message's whole range, as if every row were visible (2026-10-11 20:50: a
// 39-line reply from an hour earlier, `0-38/39`, was the only fresh report while the
// person read five exchanges later, and the yellow row jumped to it). A real view
// never looks like that: a scroll reports the messages at the viewport's edges, cut
// off, and a jump draws a burst of neighbours. So: every fresh message reports its
// whole range, none of them was in the trusted set a moment ago, and every one is
// more than one exchange from where the person was -> a redraw; keep the previous
// answer. `hereIndex` is the exchange the person was last placed in.
export function looksLikeRedraw(
  fresh: readonly ScreenReport[],
  trusted: ReadonlySet<string>,
  hereIndex: number | undefined,
  exchangeOf: (id: string) => number | undefined,
): boolean {
  if (hereIndex === undefined || fresh.length === 0) return false
  return fresh.every(r => {
    if (!(r.first === 0 && r.last === r.of - 1)) return false
    if (trusted.has(r.id)) return false
    const i = exchangeOf(r.id)
    return i !== undefined && Math.abs(i - hereIndex) > 1
  })
}

export function promptNearView(
  prompts: readonly string[],
  visible: readonly VisibleMessage[],
  top: string | undefined,
  orderOf: (uuid: string) => number | undefined,
): number | undefined {
  const promptOrders = prompts.map(orderOf)
  // The exchange a message belongs to: the last prompt at or before it in order.
  const exchangeOf = (o: number): number | undefined => exchangeIndex(promptOrders, o)
  const weight = new Map<number, number>()
  for (const m of visible) {
    const o = orderOf(m.id)
    if (o === undefined) continue
    const i = exchangeOf(o)
    if (i === undefined) continue
    weight.set(i, (weight.get(i) ?? 0) + Math.max(1, m.lines))
  }
  if (weight.size > 0) {
    const most = Math.max(...weight.values())
    const candidates = [...weight.entries()].filter(([, w]) => w >= most * CLOSE_SHARE).map(([i]) => i)
    return Math.min(...candidates)
  }
  if (!top) return undefined
  const t = orderOf(top)
  return t === undefined ? undefined : exchangeOf(t)
}
