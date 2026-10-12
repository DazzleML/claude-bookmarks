// Which on-screen reports are trusted as "on screen now".
//
// Claude Code reports a transcript row's visible range (`onScreen`) when it draws it,
// and on a scroll only the rows at the viewport's edges. A row left behind by a jump
// (a click in the prompts pane, Ctrl+End) is never reported gone, so only the latest
// burst of reports is trusted. Every row kind reports: messages, which the prompts pane
// places on a prompt, and the others (tool calls and results, tool groups, command
// output, the turn-duration line, notices), which it does not. The others still date
// the burst: a screen showing only tool rows sends no message report at all, and the
// newest message reports were the leftovers from before the jump (measured 2026-10-12
// 03:19:29: a 65-line tool result in #324's exchange on screen, #358's replies last
// reported 27 s earlier, and the yellow row went to #358).

/** A row's last report: its visible range and when that range last changed. */
export type Report = { first: number; last: number; of: number; at: number }

/**
 * When a non-message row's report counts as news: the first report, or a change of
 * lines. A repeat of the same lines is a redraw, and a row whose total grew is output
 * streaming in, drawn wherever the person reads; both keep the earlier time.
 */
export function reportTime(before: Report | undefined, onScreen: { first: number; last: number; of: number }, now: number): number {
  if (!before) return now
  const same = before.first === onScreen.first && before.last === onScreen.last && before.of === onScreen.of
  const grew = onScreen.of > before.of
  return same || grew ? before.at : now
}

/**
 * The messages reported within `freshMs` of the newest report of any kind, message or
 * other (`otherNewsAt`, the newest news time of a non-message row; 0 when none).
 */
export function latestBurst(messages: ReadonlyMap<string, { at: number }>, otherNewsAt: number, freshMs: number): string[] {
  const newest = Math.max(otherNewsAt, 0, ...[...messages.values()].map(v => v.at))
  return [...messages.entries()].filter(([, v]) => v.at >= newest - freshMs).map(([id]) => id)
}
