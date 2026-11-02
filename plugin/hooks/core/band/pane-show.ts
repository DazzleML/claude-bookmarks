// What a pane's command does -- its band key, its bar button, its slash command -- given the
// panes open now. djdarcy, 2026-11-01, after `<leader> l` with Prompts in front of Lists did
// not switch back: "if the person is ON the "lists" panel then and ONLY then should <leader>l
// act as a close toggle. Otherwise any time we are NOT on the associated tab it should be a
// direction to switch to." His three rules:
//
//   1. not open                -> open it
//   2. open but not on it      -> switch to it (bring it to the front)
//   3. open and on it          -> close it
//
// "On it" is the pane's tab being the shown one and, for the pane that several modes share
// (prompts, bookmarks, search, the jump list), showing this command's mode. The rules hold
// for the key and the button alike; they replace 0.6.x's "buttons toggle, keys never".
//
// Pure: the caller reads $.ui.panes() and the mode, and runs what comes back.

/** One of the plugin's open panes, as $.ui.panes() describes it. */
export type ShownPane = { id: string; title?: string; isShown?: boolean }

/** `open` and `front` both end with the pane in front; `close` closes it. */
export type ShowAction = 'open' | 'front' | 'close'

/**
 * The command's action for pane `id`. `sameContent` is false when the shared pane is open in
 * another mode (rule 2: switching to this mode is not a close).
 */
export function showAction(panes: readonly ShownPane[], id: string, sameContent = true): ShowAction {
  const pane = panes.find(p => p.id === id)
  if (!pane) return 'open'
  // A pane the engine does not say is hidden counts as shown (an older build, or a kit that
  // does not report it), so rule 3 keeps its toggle there.
  if (pane.isShown !== false && sameContent) return 'close'
  return 'front'
}

/**
 * The plugin's panes shown in front of `id`: empty when `id` is the shown tab or none of the
 * plugin's panes is shown, and then a plain open does. Otherwise `id` must be opened anew
 * without a keyboard request to come forward (register.tsx bringForward): Claude Code raises
 * only such an open, never an already-open pane (seen live 2026-11-02).
 */
export function covering(panes: readonly ShownPane[], id: string): ShownPane[] {
  if (panes.some(p => p.id === id && p.isShown !== false)) return []
  return panes.filter(p => p.id !== id && p.isShown !== false)
}
