// One transcript row the probe saw appended: its uuid, the door it came in by,
// and the head of its text for display.
export type Row = { uuid: string; door: 'prompt' | 'response'; head: string; text?: string }

// What the pane is doing: listing prompts to jump to, listing bookmarks, or waiting for
// the register letter after a chord.
export type PaneMode = 'list' | 'mark' | 'jump' | 'bookmarks' | 'search'

declare module 'claude-code' {
  interface PluginState {
    'bookmarks': {
      rows: Row[]
      paneMode: PaneMode
      // When a pane opened from the band can't take the keyboard, the band itself
      // collects the next key; 'idle' shows the usual buttons; 'help' shows what `?` lists.
      bandMode: PaneMode | 'idle' | 'help'
      // Bumped when the pinned prompts change, so the prompts pane redraws.
      pinsRev: number
      // Bumped when the prompt nearest the view changes while the prompts pane is
      // open, so its yellow row follows a scroll.
      viewRev: number
      // Bumped when one of the plugin's /config fields changes, so what reads a setting
      // redraws.
      settingsRev: number
      // Bumped after the band's command line runs a command: the field is drawn
      // under a new key, so it starts empty (POC 2026-10-07).
      cmdRev: number
      // The prompt or bookmark number typed into the band: its field's text, or the digit
      // Buttons pressed (listInput: buttons).
      bandNum: string
      // Bumped when the plugin itself changes the band field's number (a step, a pin, a
      // removal): the field is drawn under a new key, so its cursor starts at the end
      // (input routing, 2026-10-25; djdarcy's "1j5").
      bandFieldRev: number
      // Which group the bookmarks pane shows: the person's, Claude's, (later: a team
      // member's). Cycled from the band; an index into BOOKMARK_GROUPS.
      bandGroup: number
      // Bumped when the search pane's results change (handlers/search.ts), so it redraws.
      searchRev: number
      // Bumped when the bookmark tool's fold changes (a call arrives, a line is pressed), so its rows redraw (0.7.5).
      toolFoldRev: number
      // What the band shows after a mark or jump: the letter and the marked text.
      shown: { letter: string; text: string } | null
    }
  }
}
