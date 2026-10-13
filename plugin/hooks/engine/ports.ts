// Ports: the engine, as a sub-file may hold it (the 17-18-16 DWP, Q261012-11, option (d)).
//
// The validator lets `$` reach only functions declared in register.tsx, and every call
// there is spelled `$.noun.event(...)`; a closure that makes such a call may cross a file
// (measured 2026-10-12, tests/one-offs/thinking/ports-poc/). So register.tsx builds an
// object of such closures, one per engine primitive a handler needs, and hands it over:
// the handler calls `ports.toast(...)`, never `$`. The types live here so every handler
// names its needs the same way; register.tsx owns the one place each is built.
//
// Location provisional (Q261012-11, question 3): `hooks/engine/` beside `select.ts`.

/** A toast the person sees. */
export type ToastPorts = { toast: (text: string) => void }

/** A line to the plugin's log: drawn into the conversation when `always`, else only while debugging; `text` marks a line that quotes the conversation (kept per the debugText setting). */
export type LogPorts = { log: (line: string, always?: boolean, text?: boolean) => void }

/** What the diagnostic commands read: the lists and caches register.tsx owns, each behind a function so the handler sees the current value. */
export type DiagnosticsPorts = LogPorts & {
  prompts: () => Promise<{ uuid: string; head: string }[]>
  rows: () => Promise<{ uuid: string; door: 'prompt' | 'response'; head: string }[]>
  marks: () => Promise<Record<string, { uuid: string; head: string }>>
  rendered: () => ReadonlyMap<string, string>
  timeline: () => readonly { t: number; what: string }[]
  note: (what: string) => void
  selection: () => Promise<{ requestId?: string; text: string } | undefined>
  cut: (text: string, n: number) => string
  settings: () => { values: Record<string, unknown> & { debugText: 'off' | 'with-debug' | 'always' | 'auto' }; sources: Record<string, string>; rejected: string[]; unknown: string[] }
  folderBuild: boolean
  pluginName: string
  configKeys: () => Promise<string[]>
  claudeVersion: () => Promise<string>
  pluginVersion: () => Promise<string>
  sessionId: () => Promise<string>
  // One port per variable: the validator wants $.env.get's name literal, so the variables a
  // module reads can be listed; a port taking the name would hide them.
  dccPatcher: () => Promise<string | undefined>
  dccPatchH: () => Promise<string | undefined>
  dccPatches: () => Promise<string | undefined>
  echoState: () => Promise<string>
}

/** What the view tracker (handlers/view-tracker.ts) needs: the lists it orders, the settings it reads, and for the pane's follow, a timer, the pane's state and a scroll in it. */
export type ViewPorts = {
  prompts: () => Promise<{ uuid: string }[]>
  rows: () => Promise<{ uuid: string; door: string }[]>
  log: (line: string) => void
  closeShare: () => number
  after: (ms: number, fn: () => void) => { cancel: () => void }
  /** The prompts list is the pane's mode and the pane is open. */
  listPaneOpen: () => Promise<boolean>
  heldChannel: () => boolean
  bumpView: () => Promise<unknown>
  followHere: () => 'when-idle' | 'always' | 'never'
  bandNumEmpty: () => Promise<boolean>
  scrollPaneTo: (key: string) => Promise<{ deny?: string }>
}

// Ownership of shared state (notes/meta/2026-10-12__22-48-40, one owner, read-only ports):
//   state                                   owner                         readers
//   screen (ScreenModel)                    register.tsx render hooks     view tracker (read-only Pick)
//   lastScreenOrder, trustedScreen,         handlers/view-tracker.ts      --
//     heldBy, lastHere, viewTimer
//   lastHere (the one outside write)        prompts pane, via drewHere    --
//   logLines, screenLines, timeline (Ring)  register.tsx log cluster       diagnostics (timeline, read-only)
//   rendered (drawn ids)                    register.tsx render hooks     diagnostics, list model (read-only)
//   markCache                               register.tsx marks cluster    render hooks, band (read-only)

/** What `/bm-debug` needs: the debug channels this conversation has on and how to change them, the echo's choice and policy, and where the file log is. */
export type DebugPorts = ToastPorts &
  LogPorts & {
    channelsOn: () => ReadonlySet<string>
    setChannels: (next: Set<string>) => Promise<void>
    setSessionEcho: (choice: boolean | undefined) => Promise<void>
    setEchoPolicy: (policy: { default: boolean; forced: boolean }) => Promise<void>
    echoState: () => Promise<string>
    logPath: () => string | null | undefined
  }
