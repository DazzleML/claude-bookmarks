// What happens after an action: does the pane close, does the band's mode end, and
// where should the keyboard go. One pure decision in place of the choices made at each
// call site (eleven places closed a pane on their own terms; issue #29, the refactor
// advisor's row 5).
//
// The order of precedence is djdarcy's (2026-10-11): "each tool should dictate the
// behavior with a 'lean' towards user preference". So: first the operation's own need
// (one still waiting for a letter or a number keeps the band and the keyboard where they
// are); then the person's settings; then the defaults below, which reproduce the
// plugin's behaviour before this module except where djdarcy asked otherwise:
//   - typing in the input box, or clicking it, ends the band's mode but leaves a list
//     open (0.4.0 did this for the click; the typing case is the same request);
//   - after a completed action the keyboard returns to the input box (#24, widened from
//     `o`/`i` to every action). The engine cannot yet hand the keyboard back (see
//     docs/engine-quirks.md, "A plugin can't hand the keyboard back to the input box"), so
//     `focus: 'input'` is what is wanted; the adapter does what the engine allows, which
//     today is nothing (the person presses Esc).

import type { Pane } from './keys.ts'

export type Cause =
  | 'jump' // a jump made from the band or a list (a mark, a prompt, a bookmark)
  | 'row-press' // a list row clicked
  | 'mark-set' // a mark placed from the mark pane
  | 'pin' // a prompt pinned or unpinned in the list
  | 'band-command' // any other completed band command (reading position, jumplist, promote)
  | 'prompt-edit' // the person typed in the input box
  | 'focus-left' // the keyboard left the band and the pane (a click in the input box)
  | 'esc' // Esc
  | 'timer' // the plugin closed the pane itself (the band lost the keyboard, a timeout)

// `view`: after a pane closes, whether the conversation goes back to where it was before
// the pane opened (#29, 2026-10-11). `return` now; `leave` when the action moved the view
// on purpose (a jump) or nothing closed; `defer` when the close was the plugin's own and
// Claude Code would refuse the scroll ("not person-initiated"), so the return waits for
// the person's next key or scroll.
export type Outcome = {
  pane: 'close' | 'stay'
  band: 'end' | 'keep'
  focus: 'input' | 'band' | 'pane'
  view: 'return' | 'leave' | 'defer'
}

export type AfterActionSettings = {
  paneAfterJump: 'close' | 'stay'
  paneWhileTyping: 'close' | 'stay'
  afterActionFocus: 'input' | 'band'
}

/** The two list-shaped panes (prompts and bookmarks), which share the band's number entry. */
export const isList = (pane: Pane | 'idle') => pane === 'list' || pane === 'bookmarks'

export function afterAction(input: { pane: Pane; cause: Cause; needsMore?: boolean; settings: AfterActionSettings }): Outcome {
  const { pane, cause, needsMore, settings } = input
  // 1. The operation still needs a key: nothing moves.
  if (needsMore && cause !== 'esc' && cause !== 'prompt-edit' && cause !== 'focus-left' && cause !== 'timer') {
    return { pane: 'stay', band: 'keep', focus: pane === 'none' ? 'band' : 'pane', view: 'leave' }
  }
  const back = settings.afterActionFocus
  // 2. What the pane, band and keyboard do, then whether the view goes back: only when the
  // pane closed and the action did not itself move the view.
  const base = ((): Omit<Outcome, 'view'> & { moved: boolean } => {
    switch (cause) {
      case 'esc':
      case 'timer':
        return { pane: 'close', band: 'end', focus: 'input', moved: false }
      case 'prompt-edit':
      case 'focus-left':
        // The person is already in the input box. A list may stay open beside it; the mark
        // and jump panes are waiting for a letter the person has stopped typing.
        return { pane: isList(pane) && settings.paneWhileTyping === 'stay' ? 'stay' : 'close', band: 'end', focus: 'input', moved: false }
      case 'pin':
        // Pinning is part of browsing the list: stay in it.
        return { pane: 'stay', band: 'keep', focus: pane === 'none' ? 'band' : 'pane', moved: false }
      case 'jump':
      case 'row-press': {
        const stay = isList(pane) && settings.paneAfterJump === 'stay'
        return { pane: stay ? 'stay' : 'close', band: 'end', focus: back, moved: true }
      }
      case 'band-command':
        // The reading position and back/forward move the view on purpose.
        return { pane: 'close', band: 'end', focus: back, moved: true }
      case 'mark-set':
        // Setting a mark highlights in place; the view should come back to where it was.
        return { pane: 'close', band: 'end', focus: back, moved: false }
    }
  })()
  const view: Outcome['view'] = base.pane === 'stay' || base.moved ? 'leave' : cause === 'timer' ? 'defer' : 'return'
  return { pane: base.pane, band: base.band, focus: base.focus, view }
}
