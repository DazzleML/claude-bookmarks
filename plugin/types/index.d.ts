// One transcript row the probe saw appended: its uuid, the door it came in by,
// and the head of its text for display.
export type Row = { uuid: string; door: 'prompt' | 'response'; head: string; text?: string }

// What the pane is doing: listing prompts to jump to, listing bookmarks, or waiting for
// the register letter after a chord.
export type PaneMode = 'list' | 'mark' | 'jump' | 'bookmarks'

declare module 'claude-code' {
  interface PluginState {
    'bookmarks': {
      rows: Row[]
      paneMode: PaneMode
      // When a pane opened from the band can't take the keyboard, the band itself
      // collects the next key; 'idle' shows the usual buttons.
      bandMode: PaneMode | 'idle'
      // Bumped when the pinned prompts change, so the prompts pane redraws.
      pinsRev: number
      // Bumped after the band's command line runs a command: the field is drawn
      // under a new key, so it starts empty (POC 2026-10-07).
      cmdRev: number
      // The digits of a prompt number typed into the band, one Button press each.
      bandNum: string
      // Which group the bookmarks pane shows: the person's, Claude's, (later: a team
      // member's). Cycled from the band; an index into BOOKMARK_GROUPS.
      bandGroup: number
      // What the band shows after a mark or jump: the letter and the marked text.
      shown: { letter: string; text: string } | null
    }
  }
}
