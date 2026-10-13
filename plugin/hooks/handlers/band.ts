// The band cluster's handlers (moved whole out of register.tsx under /move-code, comments as
// they were; `ports.x()` where the code called `$` or a register.tsx function). This first
// part is the close path: what an action leaves behind (settle), the band's mode ending,
// the pane closing, and `q`. The band's state is core/band-state.ts BandState, owned by this
// cluster and reached through `ports.band`; the pane position is PanePosition's.
import { afterAction, type Cause } from '../core/after-action.ts'
import { ownerOf } from '../core/anchor.ts'
import { promptNumberComplete, stepNumber } from '../core/band-entry.ts'
import { parseListNumber, type Operation, type Pane } from '../core/keys.ts'
import { short } from '../core/message-id.ts'
import { claim } from '../core/register-file.ts'
import type { BandPorts } from '../engine/ports.ts'

// How long the band waits for the next key before going back to its buttons.
export const BAND_MODE_MS = 15_000

// A digit of a prompt number, pressed as a band Button: jumps on the digit that makes
// the number complete (with 25 prompts, `3` at once, `2` waits), or on `go`.
// The list the band's number entry works on: the prompts, or the bookmarks.
export async function listCount(ports: BandPorts): Promise<number> {
  return (await ports.paneMode()) === 'bookmarks' ? (await ports.bookmarkList()).length : (await ports.prompts()).length
}
export async function jumpToListNumber(ports: BandPorts, typed: string, via: string) {
  if ((await ports.paneMode()) === 'bookmarks') await ports.jumpToBookmarkNumber(typed, via)
  else await ports.jumpToPromptNumber(typed, via)
}

// `.` after a prompt number: the footnote part follows (#33). Enter on `3.` unfolds #3.
export async function bandDot(ports: BandPorts) {
  const typed = await ports.bandNum()
  if (!typed || typed.includes('.')) return
  await ports.setBandNum(`${typed}.`)
  keepBandWaiting(ports)
}

export async function bandDigit(ports: BandPorts, digit: string) {
  const typed = (await ports.bandNum()) + digit
  const count = await listCount(ports)
  if (promptNumberComplete(typed, count)) {
    await ports.setBandNum('')
    await jumpToListNumber(ports, typed, 'band list')
    return
  }
  await ports.setBandNum(typed)
  await showInPane(ports, parseListNumber(typed)?.n ?? Number(typed))
  keepBandWaiting(ports)
}

// Bring item #n into view in the pane's list, so it can be checked before Enter (its ▶
// is drawn by the pane). Prompts are keyed `p-<uuid>`, bookmarks `b-<uuid>`.
export async function showInPane(ports: BandPorts, n: number) {
  const bookmarks = (await ports.paneMode()) === 'bookmarks'
  const target = bookmarks ? (await ports.bookmarkList())[n - 1] : (await ports.prompts())[n - 1]
  if (!target) return
  const r = await ports.scrollPaneCentre(`${bookmarks ? 'b' : 'p'}-${target.uuid}`)
  if (r.deny) ports.log(`[bm] pane scroll to #${n} -> DENY: ${r.deny}`)
}

// Browse the prompts one by one from the band, vim's j and k: the band holds the keyboard,
// so the pane can't take the arrows (djdarcy, 2026-10-07: "the nice thing about the panel
// is that you can scroll through the prompts 1 by 1"). The list is newest first: j moves
// the ▶ down (older), k up (newer); the first press lands on the newest. Enter jumps.
export async function bandStep(ports: BandPorts, key: 'j' | 'k') {
  const count = await listCount(ports)
  if (count === 0) return
  const n = stepNumber(await ports.bandNum(), count, key)
  await ports.setBandNum(String(n))
  await showInPane(ports, n)
  keepBandWaiting(ports)
}

// Pin or unpin the prompt under the ▶, from the band's prompt mode: where the list is in
// view, so the person sees which prompt it is (djdarcy, 2026-10-07: a pin by number
// alone, with no list in sight, is not useful). `s` for star: `*` can't be a hotkey.
// The band stays in prompt mode, to pin several.
export async function bandPin(ports: BandPorts) {
  const typed = await ports.bandNum()
  if (!typed) {
    ports.toast('Pick a prompt first: j/k or the arrows (or its number), then s to pin it')
    return
  }
  await ports.togglePin(typed)
  keepBandWaiting(ports)
}

// `c` in the bookmarks list: the person takes the chosen one of Claude's records as
// their own (#21): same message, id and link (core/register-file.ts, claim).
export async function bandClaim(ports: BandPorts) {
  const typed = await ports.bandNum()
  const target = typed ? (await ports.bookmarkList())[Number(typed) - 1] : undefined
  if (!target) {
    ports.toast('Pick a bookmark first: j/k or the arrows (or its number), then c to claim it')
    return
  }
  if (ownerOf(target) !== 'claude') {
    ports.toast('That one is already on your list')
    return
  }
  const r = claim(await ports.loadRegister(), target.uuid, await ports.now())
  if ('error' in r) return void ports.toast(r.error)
  await ports.saveRegister(r.register)
  ports.log(`[bm] bookmark claimed from the pane: ${short(target.uuid)}`)
  ports.toast(`#${typed} is yours now`)
  keepBandWaiting(ports)
}

// Browsing takes as long as it takes: each key restarts the band's wait (BAND_MODE_MS).
export function keepBandWaiting(ports: BandPorts) {
  ports.band.restartWait(() => ports.after(BAND_MODE_MS, () => void endBandMode(ports)))
}
export async function bandNumberGo(ports: BandPorts) {
  const typed = await ports.bandNum()
  await ports.setBandNum('')
  // "go" with nothing typed: the person is done with the list.
  if (!typed) return void (await settle(ports, paneOf(await ports.bandMode()), 'esc'))
  await jumpToListNumber(ports, typed, 'band list')
}

// A list key pressed on the band's number row (its buttons come from LIST_KEYS).
export async function bandListKey(ports: BandPorts, operation: Operation) {
  if (operation.op === 'close') return void (await closeAll(ports, 'band list'))
  if (operation.op === 'step') await bandStep(ports, operation.dir === 1 ? 'j' : 'k')
  else if (operation.op === 'pin') await bandPin(ports)
  else if (operation.op === 'group') await ports.groupStep(operation.dir)
  else if (operation.op === 'claim') await bandClaim(ports)
}

/** The pane a band mode belongs to, for the after-action policy. */
export const paneOf = (mode: string): Pane => (mode === 'idle' || mode === 'help' ? 'none' : (mode as Pane))

// After an action, close the pane or end only the band's key mode, as the after-action
// policy says (core/after-action.ts): the operation's need, then the person's setting,
// then the default. `focus: 'input'` is what is wanted after most actions; the engine
// cannot hand the keyboard back yet (#24, docs/engine-quirks.md), so nothing more is done.
export async function settle(ports: BandPorts, pane: Pane, cause: Cause, needsMore = false) {
  const outcome = afterAction({ pane, cause, needsMore, settings: ports.settings() })
  if (outcome.pane === 'close') await closePane(ports)
  else if (outcome.band === 'end') await endBandMode(ports)
  return outcome
}

export async function endBandMode(ports: BandPorts) {
  ports.band.ended()
  if ((await ports.bandNum()) !== '') await ports.setBandNum('')
  if ((await ports.bandMode()) !== 'idle') await ports.setBandMode('idle')
}

export async function paneFocused(ports: BandPorts): Promise<boolean> {
  return (await ports.panes()).some(p => p.id === ports.paneId && p.isFocused)
}

export async function closePane(ports: BandPorts) {
  ports.expectRedraw('the pane closing')
  ports.note('pane close')
  const geometry = ports.paneGeometry()
  if (geometry) ports.log(`[bm] pane was ${geometry}`)
  await endBandMode(ports)
  await ports.closePaneUi()
  // The conversation widens again as the pane goes, and shifts. Unless a jump moved the
  // view on purpose (it clears the anchor), go back to where it was before the pane
  // opened: the inverse of the return when it opened (djdarcy, 2026-10-07). From a
  // timer (the band's Esc check) Claude Code refuses the scroll; the log says so.
  if (ports.paneAnchored()) await ports.restoreView()
}

// `q` (Q261012-09): the plugin's pane closed and the band back to its bar, from the band at
// rest, the band's list row, or a pane's own field.
export async function closeAll(ports: BandPorts, via: string) {
  ports.log(`[bm] close (${via}): the pane and the band's mode`)
  if ((await ports.panes()).some(p => p.id === ports.paneId)) await closePane(ports)
  await endBandMode(ports)
}
