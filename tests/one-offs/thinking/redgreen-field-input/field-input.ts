// What a list's number field does with its text: one contract for every field that takes a
// list number -- the prompts pane's `#`, the bookmarks pane's `#`, and the band's own field
// (the input-routing design, 2026-10-25, unit 1). #29's rule, "no layer is a sink. Whatever
// the band accepts, the pane accepts", is this function: a surface draws the field and runs
// the step it gets back, and none decides for itself what a key means.
//
// Pure. It returns the step instead of running it, so a surface can return the action's
// promise from its own handler: Claude Code credits a scroll to the person only while the
// control's handler is still running (docs/engine-quirks.md, "A plugin's work counts as
// the person's only while the handler is still running").
//
// The decisions moved verbatim from the two panes' onInput (views/prompts-pane.tsx and
// views/bookmarks-pane.tsx, 0.6.26), in the same order.
import { promptNumberComplete } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/band/band-entry.ts'
import { fieldRest, route, type Tables } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/band/keys.ts'

/** The list a field numbers: the prompts (`list`) or the bookmarks. */
export type FieldList = 'list' | 'bookmarks'

/** What the field's surface does with the text typed so far. */
export type FieldStep =
  /** One key the table routes to `close` (`q` by default): close the list. */
  | { op: 'close' }
  /** A bookmark's number then the table's remove key (`12d`): that bookmark leaves the list. */
  | { op: 'remove'; number: string }
  /**
   * Anything else. `filter` is the prompts list's filter text (`/words` gives `words`;
   * anything not starting with the filter key gives '', which clears it): the surface sets
   * it and stops when that changed the filter. `go` is a number complete enough to jump.
   */
  | { op: 'text'; filter?: string; go?: string }

export function fieldInput(typed: string, list: FieldList, total: number, tables: Tables): FieldStep {
  // One key is read through the key table (core/band/keys.ts): `q` closes the pane, as in
  // the band (Q261012-09), whatever key a keymap gives it.
  if (typed.length === 1 && route(typed, { pane: list }, tables).operation.op === 'close') return { op: 'close' }
  if (list === 'bookmarks') {
    // A number then the table's remove key (`d`): that bookmark leaves the list (the keys design, unit 5).
    const last = typed.slice(-1)
    if (typed.length > 1 && /^\d+$/.test(typed.slice(0, -1)) && route(last, { pane: 'bookmarks' }, tables).operation.op === 'remove') return { op: 'remove', number: typed.slice(0, -1) }
    return promptNumberComplete(typed, total) ? { op: 'text', go: typed } : { op: 'text' }
  }
  // `/words` filters the list (#28), `/` being the field's filter key in the table;
  // anything else clears the filter.
  const filter = fieldRest(typed, 'list', 'filter', tables) ?? ''
  return promptNumberComplete(typed, total) ? { op: 'text', filter, go: typed } : { op: 'text', filter }
}
