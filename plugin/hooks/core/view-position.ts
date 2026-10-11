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

export function promptNearView(
  prompts: readonly string[],
  visible: readonly VisibleMessage[],
  top: string | undefined,
  orderOf: (uuid: string) => number | undefined,
): number | undefined {
  const promptOrders = prompts.map(orderOf)
  // The exchange a message belongs to: the last prompt at or before it in order.
  const exchangeOf = (o: number): number | undefined => {
    let found: number | undefined
    for (const [i, po] of promptOrders.entries()) {
      if (po === undefined) continue
      if (po <= o) found = i
      else break
    }
    return found
  }
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
