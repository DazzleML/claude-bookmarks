// The band cluster's handlers (moved whole out of register.tsx under /move-code, comments as
// they were; `ports.x()` where the code called `$` or a register.tsx function). It holds the
// band's keys (digits, steps, pin, claim, Enter), its focus probe and `?` help, the pane
// opening (handOff, bandOnly, openFor), and the close path: what an action leaves behind
// (settle), the band's mode ending, the pane closing, and `q`. The command line that calls
// most of these is handlers/command-line.ts. The band's state is core/band/band-state.ts BandState, owned by this
// cluster and reached through `ports.band`; the pane position is PanePosition's.
import { afterAction, isList, type Cause } from '../core/band/after-action.ts'
import { ownerOf } from '../core/bookmarks/anchor.ts'
import { promptNumberComplete, stepNumber } from '../core/band/band-entry.ts'
import { parseListNumber, type Operation, type Pane } from '../core/band/keys.ts'
import { short } from '../core/kit/message-id.ts'
import { claim } from '../core/bookmarks/register-file.ts'
import type { BandPorts } from '../engine/ports.ts'

// How long the band waits for the next key before going back to its buttons.
export const BAND_MODE_MS = 15_000

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

// A digit of a prompt number, pressed as a band Button: jumps on the digit that makes
// the number complete (with 25 prompts, `3` at once, `2` waits), or on `go`.
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

// Browse the prompts one by one from the band, vim's j and k. Why, and which way each key
// moves: core/band/band-entry.ts stepNumber, the rule this applies (one copy of the reason).
// j and k are the key table's defaults (core/band/keys.ts): `dir` arrives as 1 for next (j),
// -1 for previous (k), so a rebound key steps the same way.
export async function bandStep(ports: BandPorts, dir: -1 | 1) {
  const count = await listCount(ports)
  if (count === 0) return
  const n = stepNumber(await ports.bandNum(), count, dir)
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
// their own (#21): same message, id and link (core/bookmarks/register-file.ts, claim).
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
  if (operation.op === 'step') await bandStep(ports, operation.dir)
  else if (operation.op === 'pin') await bandPin(ports)
  else if (operation.op === 'group') await ports.groupStep(operation.dir)
  else if (operation.op === 'claim') await bandClaim(ports)
}

// Returns the refusal, if any.
export async function focusBand(ports: BandPorts, key: string): Promise<string | undefined> {
  const bandId = ports.band.id
  if (!bandId) return undefined
  const r = await ports.focus(bandId, key)
  const deny = 'deny' in r && r.deny ? String(r.deny) : undefined
  ports.log(`[bm] band focus ${key}: ${deny ? `DENY ${deny}` : 'ok'}`)
  return deny
}

// An element of the band's key mode that is drawn now, to aim the focus probe at:
// the ring's own element when it belongs to this mode, else a fixed one per mode.
export async function bandProbeKey(ports: BandPorts, mode: string): Promise<string | undefined> {
  const prefix = isList(mode as Pane) ? 'band-num-' : `band-${mode}-`
  const ring = ports.band.ring
  if (ring?.startsWith(prefix)) return ring
  if (isList(mode as Pane)) return 'band-num-go'
  if (mode === 'mark') return 'band-mark-cancel'
  const marks = await ports.loadMarks()
  if (marks[ports.readingLetter]) return 'band-jump-reading'
  const first = ports.letters.find(l => marks[l])
  return first ? `band-jump-${first}` : undefined
}

export async function watchBand(ports: BandPorts, mode: string) {
  const bandId = ports.band.id
  if (!bandId || (await ports.bandMode()) === 'idle') return
  const key = await bandProbeKey(ports, mode)
  if (!key) return // nothing focusable on the band: the timeout or the next edit ends it
  const r = await ports.focus(bandId, key)
  if ('deny' in r && r.deny) {
    // Into the pane (a click in it): the band steps back and the pane keeps the keyboard,
    // its own keys and field included. Closing it there shut the pane the moment its
    // field was clicked (djdarcy, 2026-10-07).
    if (await paneFocused(ports)) {
      ports.log(`[bm] the keyboard moved into the pane: the band steps back, the pane stays`)
      await endBandMode(ports)
      return
    }
    // A list pane (prompts, bookmarks) is a reference the person reads while typing:
    // the band steps back and the list stays open, with its yellow row following the
    // view (djdarcy, 2026-10-11: a click in the input box "auto-closes the Panel on the
    // right, which it shouldn't"). The mark and jump panes only exist for the next
    // letter, so they still close. The after-action rule decides (paneWhileTyping).
    const outcome = await settle(ports, mode as Pane, 'focus-left')
    ports.log(`[bm] band lost the keyboard (${r.deny}): ${outcome.pane === 'close' ? 'closing the pane' : 'the band steps back, the list stays'}`)
  }
}

export const BAND_WATCH_MS = 400

// `?` (djdarcy, 2026-10-12): the commands the bar does not show, and the rest, in the
// band itself so it works with lists off too. Enter or Esc, or a minute, ends it.
const HELP_MS = 60_000
export async function showHelp(ports: BandPorts) {
  await ports.setBandMode('help')
  ports.band.restartWait(() => ports.after(HELP_MS, () => void endBandMode(ports)))
  ports.band.stopWatching()
  const deny = await focusBand(ports, 'band-help-close')
  // A click on `?` leaves the keyboard where it was, so the band never held it: the help
  // stays until `close`, a line pressed, the minute, or a prompt typed. Watching it here
  // closed it at once (djdarcy, 2026-10-12: "when we click the "?" on the band ... the
  // info-box instantly closes"), as it once did the list panes (see openFor).
  if (deny && /does not hold the keyboard/i.test(deny)) return void ports.log('[bm] help opened by a click: it stays until closed')
  // Esc hands the keyboard back with no event (see openFor): ask, as the list modes do,
  // and end the help once the band no longer holds it. Asking focuses `close`, which
  // scrolls a help taller than the band back to the top (djdarcy: "the UI element seems
  // to refresh and scrolls back to the top"), so the help is drawn to fit (the render).
  ports.band.startWatch(() => ports.every(BAND_WATCH_MS, async () => {
    const bandId = ports.band.id
    if (!bandId || (await ports.bandMode()) !== 'help') return
    const r = await ports.focus(bandId, 'band-help-close')
    if ('deny' in r && r.deny) await endBandMode(ports)
  }))
}

// The band's key mode for `mode`, with the ring on `focusKey` when given (Enter presses
// it). openFor opens the pane as the list; from the band its focus is refused, so the
// band takes the key (see openFor).
export async function handOff(ports: BandPorts, mode: string, focusKey?: string) {
  await openFor(ports, mode, 'band command line')
  if (focusKey) await focusBand(ports, focusKey)
}

// Lists off (the `panes` setting): the band's own key mode with no pane beside it --
// digits, j/k and Enter for a list, the letters for a mark or a jump (the keys are the key
// table's defaults, core/band/keys.ts).
export async function bandOnly(ports: BandPorts, mode: string) {
  if (mode === 'mark') ports.setSelectionAtChord(await ports.selection())
  await ports.setPaneMode(mode)
  await ports.setBandMode(mode)
  ports.log(`[bm] ${mode}: lists are off, the band takes the key`)
  keepBandWaiting(ports)
  const deny = await focusBand(ports, isList(mode as Pane) ? 'band-num-go' : mode === 'jump' ? 'band-jump-reading' : 'band-mark-cancel')
  if (deny && /does not hold the keyboard/i.test(deny)) ports.toast('With lists off, the band takes the keys: press the leader (Ctrl+] by default) first.')
}

export async function openFor(ports: BandPorts, mode: string, action: string) {
  // A new pane replaces the one before, so the Esc watcher of that pane stops here: it
  // captured that pane's mode, and a pane that takes the keyboard (below) starts no new
  // watcher to replace it, so the old one would later settle the wrong pane kind (0.4.82;
  // test-scenarios 2026-10-14__02-07-49, S6). A pane that cannot take the keyboard starts
  // its own watcher further down.
  ports.band.stopWatching()
  ports.expectRedraw('the pane opening')
  ports.log(`[bm] ${action.startsWith('command:') ? `leader ran ${action}` : `chord for ${action} pressed the band Button`}`)
  await ports.diagState(`${mode} (before open)`)
  await ports.setPaneMode(mode)
  const title = mode === 'mark' ? 'mark: press a-z' : mode === 'jump' ? 'jump: press a-z' : mode === 'bookmarks' ? 'bookmarks: type #' : 'prompts: type #'
  ports.note(`pane open (${mode}, focus)`)
  // Narrow on purpose (djdarcy, 2026-10-04: "collapse the panel so it has almost no
  // width"): it only has to take one letter. Both sizes are requests; a size the
  // person dragged the pane to wins. `focus` is refused while the composer holds
  // text, so over typed text the letter goes to the prompt instead (issue #4).
  // The docked pane narrows the conversation, which rewraps and shifts the view
  // (djdarcy, 2026-10-07: "the pane itself is what shifts the viewport"). So note the
  // message at the top of the screen first, a hidden mark, and return to it "as though
  // the user was auto-firing a ctrl]' to the hidden mark we just created" (djdarcy):
  // at once where Claude Code allows the scroll (a press: a chord, a click), else at the
  // next press (the letter), or when the person closes the pane.
  ports.paneOpened(await ports.topOnScreen(), await ports.viewAnchor())
  const paneView = ports.paneView()
  // For the prompts pane: the prompt nearest the view, read before the pane shifts it,
  // so the list can open centred on it instead of on the newest (djdarcy, 2026-10-11:
  // scrolled up 30 or 40 pages, "the user doesn't have to scroll in the panel"). The
  // `listOpensAt` setting: 'newest' skips it, and the list opens at its top, the newest.
  const hereAtOpen = mode === 'list' && ports.settings().listOpensAt === 'nearest' ? await ports.promptHere() : undefined
  const opened = await ports.openPane(title)
  // Probe (2026-10-09): below the engine's width floor the pane waits undrawn and the
  // person sees nothing. Say why, instead of looking broken (djdarcy's shrunk RDP terminal).
  if (opened && opened.isPlaced === false) {
    ports.log(`[bm] pane not placed: ${opened.reason ?? '(no reason given)'}`)
    ports.toast(`Claude Code didn't draw the pane: ${opened.reason ?? 'no reason given'}. A wider terminal (or a smaller font, Ctrl+-) fixes it.`, 8000)
  }
  if (paneView) {
    const r = await ports.scroll(paneView.uuid, paneView.block)
    ports.log(`[bm] view back to ${short(paneView.uuid)} (${paneView.block}) after the pane opened -> ${r.deny ? `DENY: ${r.deny} (again at the next press)` : 'ok'}`)
  }
  // The row cannot be scrolled to before the pane has drawn it (DENY: "no element of
  // its own is drawn under that key", 2026-10-11): the pane's render hook does it right
  // after its first draw, through pendingCentre (register.tsx's, the render hook's to
  // read and clear; written here only through ports.setPendingCentre).
  if (hereAtOpen) ports.setPendingCentre(hereAtOpen)
  // The selection is read AFTER the pane opens: an awaited call before $.ui.open (ports.openPane) looks
  // to cost the pane the keyboard (the mark pane, which read it first, was refused in 8
  // of 12 runs; the jump pane, which didn't, almost never; log 2026-10-06/07). The
  // reason for reading it first was an inline pane shifting the transcript (round 1);
  // the pane is docked now, and the mark resolves by the selection's message id.
  if (mode === 'mark') {
    const sel = await ports.selection()
    ports.setSelectionAtChord(sel)
    ports.note(`selection at chord: ${sel?.requestId ?? 'none'}`)
  }
  const focused = await paneFocused(ports)
  const draft = await ports.draftText()
  const selNow = await ports.selection()
  ports.log(
    `[bm] ${mode} pane has the keyboard: ${focused ? 'yes' : 'NO'} (input box holds ${draft.length} chars; ` +
      `selection ${selNow?.text.trim() ? `"${ports.cut(selNow.text.trim(), 24)}"` : 'none'})`,
    true,
  )
  // From a typed command (/bm-mark, /bm-goto, /bm-prompts) the band never holds the
  // keyboard, so the band key mode below can't take the key (log, 2026-10-07 04:56:51).
  // Claude Code refuses the pane over a draft, and often just after a mouse selection
  // (2026-10-06/07); working around that from the input box failed (a scroll from
  // prompt.edit is "not person-initiated"). So say where the keys work instead: the
  // band leader holds the keyboard by the person's own focus move, draft or not.
  if (!focused && action.startsWith('command:')) {
    await settle(ports, mode as Pane, 'timer')
    ports.toast(
      draft.trim()
        ? 'The keyboard is in the input box (it holds a draft). Use the band leader, Ctrl+] by default, which works over a draft.'
        : "Claude Code didn't give the pane the keyboard. Use the band leader, Ctrl+] by default.",
      8000,
    )
    return
  }
  // Pressed from the band (its hotkey after `abovePrompt:focus`, Ctrl+X Tab or a
  // rebound key), the focus request is refused: "an element of the band ... the person
  // holds" has the keys, so the pane opened without them and the next letter went
  // nowhere (djdarcy, 2026-10-05: "the cursor is staying in the normal input box"). A
  // re-request 120 ms later was refused too (log 12:24:16, 12:24:28): the band still
  // holds them. So the band itself takes the next key; the pane stays open as the list.
  if (!(await paneFocused(ports))) {
    await ports.setBandMode(mode)
    ports.log(`[bm] pane opened without the keyboard; the band takes the ${mode} key`)
    ports.band.restartWait(() => ports.after(BAND_MODE_MS, () => void endBandMode(ports)))
    // Enter's default: `go` for a prompt number, the reading position for a jump (a
    // missing element, no reading position, is simply denied), and never a letter for a
    // mark: Enter on `a` overwrote mark a (djdarcy, 2026-10-07).
    const deny = await focusBand(ports, isList(mode as Pane) ? 'band-num-go' : mode === 'jump' ? 'band-jump-reading' : 'band-mark-cancel')
    // The band never had the keyboard: the button was clicked (over a draft, a click
    // presses it without moving the keys). The watcher below would then close the pane
    // at once (djdarcy, 2026-10-07: "the panel popped up for a second but then
    // disappeared"; log 08:32:22). So it stays open as a list to click, closed by its ×.
    if (deny && /does not hold the keyboard/i.test(deny)) {
      ports.band.stopWaiting()
      await ports.setBandMode('idle')
      ports.log(`[bm] ${mode} pane opened by a click: it stays open as a list (close it with its ×)`)
      return
    }
    // Esc hands the keyboard back to the prompt, and no event says so (djdarcy,
    // 2026-10-05: "it goes back to the normal text input bar but the panel stays
    // open"). $.ui.focus (ports.focus, in watchBand) on the band is refused once the band no longer holds the
    // keys, so ask every BAND_WATCH_MS, onto the element the ring is already on
    // (no visible move), and close the pane as soon as it is refused.
    ports.band.startWatch(() => ports.every(BAND_WATCH_MS, () => void watchBand(ports, mode)))
  }
}

/** The pane a band mode belongs to, for the after-action policy. */
export const paneOf = (mode: string): Pane => (mode === 'idle' || mode === 'help' ? 'none' : (mode as Pane))

// After an action, close the pane or end only the band's key mode, as the after-action
// policy says (core/band/after-action.ts): the operation's need, then the person's setting,
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
