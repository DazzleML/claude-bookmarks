// The plugin's typed commands, name and description, registered at every session start
// (moved out of register.tsx's session.start hook, 0.4.67; the hook loops over this).

export const COMMANDS: readonly (readonly [string, string])[] = [
  ['bm-ids', 'Diagnostics: compare captured prompt ids with the ids drawn on screen'],
  ['bm-jump', 'Diagnostics: scroll to a prompt (first | last | N | r<N> | uuid)'],
  ['bm-pane', 'Diagnostics: open the prompts pane without the band; type a number and Enter to jump'],
  ['bm-marks', 'List the marks set in this conversation'],
  ['bm-delmarks', 'Delete marks: /bm-delmarks a b (letters), or /bm-delmarks all'],
  ['bm-env', 'Show the version, the session id and what has been captured'],
  ['bm-config', 'Show every setting, its value and where it came from'],
  ['bm-check', 'Check the bookmark files on disk: formats, backups, the index, the store; reports, changes nothing'],
  ['bm-timeline', 'Diagnostics: show the last N plugin events (draws, appends, pane, store, toast, scroll)'],
  ['bm-sel', 'Diagnostics: show what Claude Code reports for your mouse selection'],
  ['bm-pin', 'Pin or unpin prompt #N in the prompts pane (no number: the newest)'],
  // Typed commands for the same actions as the band leader (they also work as
  // `command:<name>` keybindings, 2.1.290). A pane they open takes the keyboard from
  // an empty input box; over a draft they point to the band leader instead.
  ['bm-mark', 'Set a mark: opens the mark pane, then press a letter'],
  ['bm-goto', 'Jump to a mark: opens the jump pane, then press a letter'],
  ['bm-prompts', 'Jump to a prompt: opens the prompts pane, then type its number'],
  ['bm-read', 'Reading position: go there, or back to where you were'],
  ['bm-bookmarks', 'List the bookmarks of this conversation; type a number and Enter to jump'],
  ['bm-promote', 'Promote a mark into a bookmark: /bm-promote a'],
  ['bm-diag-keys', 'Diagnostics: log each keystroke in the input box (on | off | toggle)'],
  ['bm-debug', 'Echo the plugin\'s log lines into this conversation as dim rows (on | off | status), or turn debug channels on (channels | enable | disable); off by default'],
]
