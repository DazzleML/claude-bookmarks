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
      // What the band shows after a mark or jump: the letter and the marked text.
      shown: { letter: string; text: string } | null
    }
  }
}
