// What is on screen, as the render hooks last reported it (the census's cluster 3,
// 2026-10-12__15-01-52; refactor-advisor 2026-10-12__15-06-26 row 6; the fifth move of the
// register.tsx split, Q261012-06). Moved from register.tsx under /move-code, comments as
// they were; the one change is that the clock is passed in (`now`) so the model is
// testable. The render hooks and promptHere in register.tsx call it.
import { latestBurst, reportTime, type Report } from './latest-burst.ts'

export type OnScreen = { first: number; last: number; of: number }
/** A message's last report, stamped, plus whether that report grew the message. */
export type MessageReport = OnScreen & { at: number; grew: boolean }

export class ScreenModel {
  // Which messages are on screen now, as the render hooks last reported them (a
  // message's `onScreen`; null or absent drops it). Lets the reading position tell
  // "am I there already?" and note where the person was before a jump.
  // Each report is stamped: Claude Code reports a message when drawn and, on a scroll,
  // only the messages at the viewport's edges, so one that leaves the screen in a single
  // jump (Ctrl+End) is never reported gone and goes stale here (2026-10-04: "nowhere to
  // go" right after Ctrl+End). Only the latest burst of reports is trusted.
  // `grew`: the latest report added rows to the message (`of` rose), which is a reply
  // streaming in, drawn at the bottom whether or not the person is looking there.
  private readonly onScreenNow = new Map<string, MessageReport>()

  // The other transcript rows (tool calls and results, tool groups, command output, the
  // turn-duration line, notices) are not placed on a prompt, but their reports date the
  // latest burst (core/kit/latest-burst.ts: a screen of tool rows after a jump otherwise left
  // the messages jumped away from as "on screen now").
  private readonly otherOnScreen = new Map<string, Report>()
  private otherNewsAt = 0

  // When the plugin itself last changed something that makes Claude Code redraw a message
  // (a highlight shown or cleared, a bookmark saved, a pane opened or closed), and what.
  // A whole-message report far from the view counts as a redraw only shortly after one of
  // these (promptHere): a real scroll over short messages reports them whole too, and
  // shape alone mistook one for a redraw and held the yellow row on #339 while the person
  // read #325 (djdarcy, 2026-10-11 22:55). The 20:50 redraw that started this followed a
  // bookmark mint and a pane opening.
  private selfRedrawAt = 0
  selfRedrawWhy = ''
  static readonly SELF_REDRAW_MS = 2000
  static readonly FRESH_MS = 1500

  noteMessage(requestId: string, onScreen: OnScreen | null | undefined, now: number): void {
    // A command run from a key (`command:bm-read`) is drawn for a moment under a
    // temporary `placeholder…` id; as the newest report it became "where you were", and
    // the way back was refused once it vanished (log, 2026-10-06 04:03:29). Only real
    // message ids count.
    if (!/^[0-9a-f]{8}-/.test(requestId)) return
    if (!onScreen) return void this.onScreenNow.delete(requestId)
    // A redraw that repeats the same lines is not news: clearing the reading position's
    // highlight after a "back" jump redrew it, off screen, with its old lines, which made
    // it look freshly on screen, so the next press "stayed put" at the bottom (djdarcy,
    // 2026-10-07; log 08:15:48 -> 08:15:53). Only a change of lines refreshes the time.
    const before = this.onScreenNow.get(requestId)
    const same = before && before.first === onScreen.first && before.last === onScreen.last && before.of === onScreen.of
    const grew = !!before && onScreen.of > before.of
    this.onScreenNow.set(requestId, { ...onScreen, at: same ? before.at : now, grew })
  }

  noteOther(requestId: string, onScreen: OnScreen | null | undefined, now: number): void {
    if (!onScreen) return void this.otherOnScreen.delete(requestId)
    const at = reportTime(this.otherOnScreen.get(requestId), onScreen, now)
    this.otherOnScreen.set(requestId, { ...onScreen, at })
    if (at > this.otherNewsAt) this.otherNewsAt = at
  }

  /** The messages in the latest burst of reports: what is on screen now, not what was before a jump. */
  fresh(): string[] {
    return latestBurst(this.onScreenNow, this.otherNewsAt, ScreenModel.FRESH_MS)
  }

  /** A message's last report, if it is on screen. */
  report(requestId: string): MessageReport | undefined {
    return this.onScreenNow.get(requestId)
  }

  entries(): [string, MessageReport][] {
    return [...this.onScreenNow.entries()]
  }

  expectRedraw(why: string, now: number): void {
    this.selfRedrawAt = now
    this.selfRedrawWhy = why
  }

  sinceSelfRedraw(now: number): number {
    return now - this.selfRedrawAt
  }

  /** Whether a whole-message report arriving now may be the plugin's own redraw. */
  recentSelfRedraw(now: number): boolean {
    return this.sinceSelfRedraw(now) < ScreenModel.SELF_REDRAW_MS
  }
}
