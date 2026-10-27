// Which arm draws: pass (Claude Code's own rows), hide (an empty Box for row and result), fold
// (one pressable line for the run; open, the rows as normal), control (hides rows of a tool that
// is never called, so pocecho's rows must stay).
export type Mode = string

declare module 'claude-code' {
  interface PluginState {
    'bmtoolfoldpoc': {
      mode: Mode
      // The fold's line was pressed open.
      open: boolean
    }
  }
}
