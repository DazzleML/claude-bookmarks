// The band's command line: the field the leader lands on, and `perform`, the one place a
// band command is done. Moved whole from register.tsx (0.4.60, /move-code); it reads the
// router's table (core/band/keys.ts), which is where a configurable keymap will plug in.

import { afterAction } from '../core/band/after-action.ts'
import { lineHint, route, type Operation } from '../core/band/keys.ts'
import type { CommandLinePorts } from '../engine/ports.ts'
import { bandOnly, closeAll, handOff, openFor, showHelp } from './band.ts'

// Design 2026-10-07__02-58-22 (and its POC addendum). The band leader (abovePrompt:focus,
// Ctrl+] for djdarcy) puts the keyboard on the band, whose first element is a field
// that takes every printable key, ' and Space included, over a draft and mid-turn.
// The field's typing and Enter DO scroll the conversation, as long as the handler is
// still running when the scroll is asked (the engine credits the work to the keystroke
// only until the handler returns; a fire-and-forget `void` lost it, 2026-10-09). So the
// keys below act directly; the once-per-version probe that used to decide this is gone.

// Owned here: one command at a time.
// Since 0.4.83 it holds when the running command started: a command that never settles
// (an engine call that does not answer) frees the field after CMD_STUCK_MS instead of
// wedging it until a reload, and says so in the log (test-scenarios 2026-10-14__02-07-49,
// S7). A late finish clears only its own start, never a newer command's.
let cmdBusy: number | undefined
const CMD_STUCK_MS = 10_000

const ESC_REMINDER = 'Press Esc to type in the input box: the band still has the keyboard (Claude Code does not let a plugin hand it back yet).'
function owedAfterAction(ports: CommandLinePorts) {
  ports.band.oweReminder(afterAction({ pane: 'none', cause: 'band-command', settings: ports.settings() }).focus === 'input')
}

export async function runCommandLine(ports: CommandLinePorts, typed: string, via: 'input' | 'submit') {
  if (typed === '') return
  if (cmdBusy !== undefined) {
    if (Date.now() - cmdBusy < CMD_STUCK_MS) return
    ports.log(`[bm] band command line: the last command has not finished after ${Date.now() - cmdBusy} ms; taking this one`)
  }
  const started = Date.now()
  cmdBusy = started
  try {
    ports.log(`[bm] band command line ${via}: "${ports.cut(typed, 40)}"`, true)
    // What the keys mean lives in the router's table (core/band/keys.ts); perform does it.
    await perform(ports, route(typed, { pane: 'none' }, ports.tables()).operation, 'field')
  } finally {
    if (cmdBusy === started) cmdBusy = undefined
  }
}

// The one place a band command is done, whether its key was typed in the field (`field`)
// or its button was pressed -- clicked, or by a chord bound to its borrowed action (the
// action's name, which openFor in handlers/band.ts logs). The input DWP's `perform` (2026-10-12): a click and
// a key cannot do different things.
export async function perform(ports: CommandLinePorts, operation: Operation, via: 'field' | string) {
  switch (operation.op) {
    case 'wait':
      return // `P` waits for its letter
    case 'help':
      await ports.clearCommandLine()
      await showHelp(ports)
      return
    case 'close':
      await ports.clearCommandLine()
      await closeAll(ports, via)
      return
    case 'open':
      await ports.clearCommandLine()
      if (operation.pane === 'list' || operation.pane === 'bookmarks' || operation.pane === 'search') await ports.setBandNum('')
      if (operation.pane === 'bookmarks') await ports.setBandGroup(0) // start on the person's own bookmarks
      // Lists off (the `panes` setting): the band takes the key with no pane beside it. Not
      // search, whose results have nowhere else to be drawn.
      if (ports.settings().panes === 'off' && operation.pane !== 'search') return void (await bandOnly(ports, operation.pane))
      // A pressed button on the pane it opened closes it: the button is a toggle (the keys
      // design 2026-10-20, unit 4). Never the typed key (djdarcy at the gate: "the BUTTON on
      // the BAND should have a toggle feature, but elsewhere I think it would be more of an
      // annoyance"): `<leader> p` may be the start of `<leader> p 12`. Open means the
      // plugin's own mode AND the pane on screen, since the mode atom starts at 'list' and
      // closing the pane leaves it, so the mode alone would read a fresh session as open.
      if (via !== 'field' && (await ports.paneMode()) === operation.pane && (await ports.panes()).some(p => p.id === ports.paneId)) {
        return void (await closeAll(ports, via))
      }
      // A pressed button opens the pane as the chords always did; the band's own keys
      // are the fallback openFor sets up when the pane can't take the keyboard.
      if (via !== 'field') return void (await openFor(ports, operation.pane, via))
      // The jump pane is the readable list of marks, the band's letter buttons taking the
      // letter (v0.1.7's shape; djdarcy, 2026-10-09: "the panel isn't opening"). A mark
      // scrolls back after its highlight (restoreView), so its cancel button is pressed.
      await handOff(ports, operation.pane, operation.pane === 'mark' ? 'band-mark-cancel' : undefined)
      return
    case 'jump-mark':
      await ports.clearCommandLine()
      await ports.jumpToMark(operation.letter)
      owedAfterAction(ports)
      return
    case 'reading':
      await ports.clearCommandLine()
      await ports.readingToggle()
      owedAfterAction(ports)
      return
    case 'promote':
      await ports.clearCommandLine()
      await ports.promoteLetter(operation.letter)
      owedAfterAction(ports)
      return
    case 'delete':
      await ports.clearCommandLine()
      await ports.clearLetter(operation.letter)
      owedAfterAction(ports)
      return
    case 'forget':
      await ports.clearCommandLine()
      await ports.forgetLetter(operation.letter)
      owedAfterAction(ports)
      return
    case 'jumplist':
      // `<leader> ←` / `→` are wanted too; whether an arrow reaches this field is #23.
      await ports.clearCommandLine()
      await ports.jumplistMove(operation.dir)
      owedAfterAction(ports)
      return
    case 'hint':
      await ports.clearCommandLine()
      if (ports.band.reminderOwed) {
        ports.band.oweReminder(false)
        ports.log(`[bm] a key the band does not know, after an action: the Esc reminder`)
        ports.toast(ESC_REMINDER)
      } else ports.toast(operation.reason)
      return
    default:
      await ports.clearCommandLine()
      ports.toast(lineHint(ports.tables()))
  }
}
