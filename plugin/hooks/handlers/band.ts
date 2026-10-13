// The band cluster's handlers (moved whole out of register.tsx under /move-code, comments as
// they were; `ports.x()` where the code called `$` or a register.tsx function). This first
// part is the close path: what an action leaves behind (settle), the band's mode ending,
// the pane closing, and `q`. The band's state is core/band-state.ts BandState, owned by this
// cluster and reached through `ports.band`; the pane position is PanePosition's.
import { afterAction, type Cause } from '../core/after-action.ts'
import type { Pane } from '../core/keys.ts'
import type { BandPorts } from '../engine/ports.ts'

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
