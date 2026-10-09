// Which pane the probe shows, and the convo-bookmarks layers /probe-set switches on.
export type Mode = 'mark' | 'jump' | 'prompts' | 'read'
export type Flags = {
  bandField: boolean
  bandButtons: boolean
  autoFocus: boolean
  paneField: boolean
  openFocus: boolean
  readout: boolean
  vanish: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'focus-probe': {
      mode: Mode
      flags: Flags
      // The last few events, shown in the band's second row.
      readout: string[]
      // Bumped to redraw the band's field under a new key, so it starts empty.
      fieldRev: number
      // True while the band draws nothing focusable after an action (flag vanish).
      vanished: boolean
    }
  }
}
