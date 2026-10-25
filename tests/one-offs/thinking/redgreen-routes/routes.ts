// Where a list number is typed: the band's own field, the band's digit buttons, or the
// pane's own field (the input-routing design, 2026-10-25, unit 2;
// private/claude/2026-10-25__00-24-05__dev-workflow-process__input-routing-the-band-field-and-swappable-pathways.md).
//
// One pure chooser, fed by the situation, the person's `listInput` setting and the
// capability path this build has for the band handing its own pane the keyboard
// (engine/select.ts, `focus.paneFromBand`). A surface draws what the chooser says and never
// reads the setting itself, so a pathway is swapped by a setting or a build, never by
// editing a surface.
//
// The main input box is not a target: nothing lets a plugin move the keyboard there
// ("the keyboard is the person's to give", the typings' UiFocusArgs). A key the active
// target does not take falls through to it, and the person's Esc hands the keyboard back.
import type { Chosen } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/engine/select.ts'

/** Where the number is typed. */
export type ListInputTarget = 'band-field' | 'band-buttons' | 'pane-field'

/** The `listInput` setting (core/settings.ts). */
export type ListInputSetting = 'auto' | 'field' | 'buttons'

/** What the chooser needs to know about the moment the list opens. */
export type ListSituation = {
  /** The pane took the keyboard itself: a typed command from an empty input box, a click into it. */
  paneHasKeyboard: boolean
}

/**
 * The target for a list number, and why, in a clause for the log.
 *
 * 1. The pane already holds the keyboard: its own field takes the keys.
 * 2. The build can hand the band's pane the keyboard (`handoff` is `patched` or `ideal`):
 *    the pane's field, through that hand-off. No build can yet, so this waits for a patch.
 * 3. Otherwise the setting: `auto` and `field` give the band's own field, `buttons` the
 *    digit buttons.
 */
export function listInputTarget(situation: ListSituation, setting: ListInputSetting, handoff: Chosen): { target: ListInputTarget; why: string } {
  if (situation.paneHasKeyboard) return { target: 'pane-field', why: 'the pane holds the keyboard' }
  if (handoff === 'patched' || handoff === 'ideal') return { target: 'pane-field', why: `the band hands its pane the keyboard (${handoff})` }
  if (setting === 'buttons') return { target: 'band-buttons', why: 'listInput is buttons' }
  return { target: 'band-field', why: `listInput is ${setting}: the band's own field` }
}
