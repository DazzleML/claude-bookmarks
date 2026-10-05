// One transcript row the probe saw appended: its uuid, the door it came in by,
// and the head of its text for display.
export type Row = { uuid: string; door: 'prompt' | 'response'; head: string; text?: string }

// What the probe pane is doing: listing prompts to jump to, or waiting for the
// register letter after a chord.
export type PaneMode = 'list' | 'mark' | 'jump'

declare module 'claude-code' {
  interface PluginState {
    'convo-bookmarks': {
      rows: Row[]
      paneMode: PaneMode
      // When a pane opened from the band can't take the keyboard, the band itself
      // collects the next key; 'idle' shows the usual buttons.
      bandMode: PaneMode | 'idle'
      // Bumped when the pinned prompts change, so the prompts pane redraws.
      pinsRev: number
      // What the band shows after a mark or jump: the letter and the marked text.
      shown: { letter: string; text: string } | null
    }
  }
}
