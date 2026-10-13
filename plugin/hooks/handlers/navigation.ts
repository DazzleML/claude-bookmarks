// Navigation: every jump, the jumplist (back and forward over jumps), and the view's
// return after a pane or a highlight (the navigation cluster, moved whole out of
// register.tsx under /move-code, comments as they were; `ports.x()` where the code called
// `$` or a register.tsx function). It owns the jumplist's cache and its walking flag
// (the one-owner principle, notes/meta/2026-10-12__22-48-40); the pane position is the
// PanePosition class's, reached through two ports.
import { searchPhrase } from '../core/marks.ts'
import { sameMessage, short } from '../core/message-id.ts'
import type { NavigationPorts } from '../engine/ports.ts'

// --- Jumplist: back and forward over every jump (vim's Ctrl+O / Ctrl+I) ------------------
// djdarcy, 2026-10-09: a back button "like <leader><space><space>", but separate from the
// reading position, which is a place the person set on purpose. Browser-style history of
// view positions: `entries[index]` is where the view is now; a new jump drops anything
// after `index`, records where we left from, and appends where we landed. Kept per
// session in the store, capped at 100.
export type JumpEntry = { uuid: string; block: 'start' | 'end' }
type Jumplist = { entries: JumpEntry[]; index: number }
const JUMPLIST_MAX = 100
const sameEntry = (a: JumpEntry | undefined, b: JumpEntry) => !!a && sameMessage(a.uuid, b.uuid)

export class Navigation {
  private jumplistCache: Jumplist | undefined
  private jumplistMoving = false

  private async jumplistKey(ports: NavigationPorts): Promise<string> {
    return `jumplist:${await ports.sessionId()}`
  }
  private async loadJumplist(ports: NavigationPorts): Promise<Jumplist> {
    if (!this.jumplistCache) this.jumplistCache = ((await ports.storeGet(await this.jumplistKey(ports))) as Jumplist | undefined) ?? { entries: [], index: -1 }
    return this.jumplistCache
  }
  private async saveJumplist(ports: NavigationPorts, jl: Jumplist) {
    this.jumplistCache = jl
    await ports.storeSet(await this.jumplistKey(ports), jl)
  }

  async recordJump(ports: NavigationPorts, from: JumpEntry | undefined, to: JumpEntry) {
    if (this.jumplistMoving) return // a back or forward move is a walk, not a new jump
    const jl = await this.loadJumplist(ports)
    let entries = jl.entries.slice(0, jl.index + 1)
    if (from && !sameEntry(entries.at(-1), from)) entries.push(from)
    if (!sameEntry(entries.at(-1), to)) entries.push(to)
    entries = entries.slice(-JUMPLIST_MAX)
    await this.saveJumplist(ports, { entries, index: entries.length - 1 })
  }

  async jumplistMove(ports: NavigationPorts, step: -1 | 1) {
    const jl = await this.loadJumplist(ports)
    const next = jl.index + step
    if (next < 0 || next >= jl.entries.length) {
      ports.toast(step < 0 ? 'Nothing to go back to' : 'Nothing to go forward to')
      return
    }
    const target = jl.entries[next]!
    this.jumplistMoving = true
    try {
      const deny = await this.jumpTo(ports, target.uuid, step < 0 ? 'jumplist back' : 'jumplist forward', `${step < 0 ? 'back' : 'forward'} to ${short(target.uuid)}`, undefined, false, target.block)
      if (!deny) {
        await this.saveJumplist(ports, { ...jl, index: next })
        const where = ports.drawnHead(target.uuid) ?? ports.markHead(target.uuid)
        ports.toast(`${step < 0 ? 'back' : 'forward'}${where ? `: ${where.slice(0, 40)}` : ''} (${next + 1}/${jl.entries.length})`)
      }
    } finally {
      this.jumplistMoving = false
    }
  }

  // Every jump goes through here: scroll, then report exactly what the engine answered. Returns the
  // refusal, if any. `probe`: a try whose "not person-initiated" refusal the caller
  // handles (the band command line's one-time check), so no toast for that one.
  async jumpTo(ports: NavigationPorts, uuid: string, via: string, label: string, words?: string, probe = false, block: 'start' | 'end' = 'start'): Promise<string | undefined> {
    // Where the person is leaving from, for the jumplist: the view before the pane opened
    // when a pane is up (the pane shifts the view), else the view now.
    const from = await ports.leavingFrom()
    const result = await ports.scroll(uuid, block)
    // The jump is where the person wants to be: no going back to before the pane.
    if (!result.deny) {
      ports.paneJumped()
      await this.recordJump(ports, from, { uuid, block })
    }
    const verdict = result.deny ? `DENY: ${result.deny}` : 'ok'
    if (probe && result.deny && /person-initiated/i.test(result.deny)) {
      ports.log(`[bm] ${via} scroll -> ${verdict} | target ${label} ${short(uuid)} (probe)`)
      return result.deny
    }
    // A message Claude Code has not drawn cannot be scrolled to ("nothing drawn under
    // that requestId": prompts from before this conversation's compaction, 2026-10-05).
    // The view stays put, which looked like "it took me somewhere else"; say so, and
    // offer the planned fallback (issue #4): search the transcript view.
    // Any other refusal ("not person-initiated", ...) is not about the message: say what
    // Claude Code said, not "older than a compaction" (log, 2026-10-07 06:26:12).
    if (result.deny && !/nothing drawn/i.test(result.deny)) {
      ports.toast(`Can't jump there: Claude Code refused the scroll (${result.deny}).`)
      ports.log(`[bm] jump refused for another reason: ${result.deny}`)
    } else if (result.deny) {
      const text = words ?? ports.drawnHead(uuid) ?? ports.markHead(uuid)
      // The mod cannot open Ctrl+O or fill a search (nothing in $.ui drives the
      // transcript view), but it can put a search phrase on the clipboard (djdarcy,
      // 2026-10-05: "give the user the text ... so it autopopulates"). The phrase skips
      // the generic openings many prompts share ("RE:{", a pasted-content tag).
      const phrase = searchPhrase(text)
      const copied = phrase ? (await ports.copy(phrase)).isCopied : false
      // Where to search: transcript mode's `/` only sees what the view holds, which after
      // a compaction excludes earlier messages (2026-10-05: not found). `[` in transcript
      // mode writes the FULL conversation to the terminal's scrollback, where the
      // terminal's own find does reach them (user-verified, 2026-10-05).
      const how = `press Ctrl+O, then [ (full conversation), then your terminal's Find (Ctrl+Shift+F or Cmd+F)`
      ports.toast(
        copied
          ? `Can't jump there: that message isn't on screen (older than a compaction?). Copied "${phrase}": ${how} and paste.`
          : `Can't jump there: that message isn't on screen (older than a compaction?). ${how} and search for ` +
              `${phrase ? `"${phrase}"` : 'a few words of it'}.`,
        12000,
      )
      ports.log(`[bm] jump refused; search phrase ${copied ? 'copied' : 'shown'}: "${phrase ?? ''}"`, true)
    }
    ports.note(`scroll ${uuid} via ${via} -> ${verdict}`)
    ports.log(
      `[bm] ${via} scroll -> ${verdict} | target ${label} ${short(uuid)} | ` +
        `drawn since load: ${ports.drawnHead(uuid) !== undefined ? 'yes' : 'NO'}`,
    )
    return result.deny
  }

  // The shift is Claude Code's, on every route: the old Ctrl+X m chord moved the view by
  // about a screen as well (djdarcy, 2026-10-07, with this scroll-back switched off).
  async restoreView(ports: NavigationPorts) {
    const { here, block, fromPane } = ports.takeRestore()
    if (!here) return
    // Otherwise only when the view actually moved: scrolling back regardless lined up the
    // top message's first line and moved a view that had not dropped (djdarcy, 2026-10-07).
    if (!fromPane && ports.freshOnScreen().some(id => sameMessage(id, here))) {
      ports.log(`[bm] view kept after highlight (${short(here)} still on screen)`)
      return
    }
    const r = await ports.scroll(here, block)
    ports.log(`[bm] view restored after highlight -> ${r.deny ? `DENY: ${r.deny}` : 'ok'} | ${short(here)}`)
  }
}
