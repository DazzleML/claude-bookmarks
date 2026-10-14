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

/** What navigation (handlers/navigation.ts) needs: the store for the jumplist, the scroll, the clipboard, the person's feedback, and the drawn and marked heads a refused jump quotes. */
export type NavigationPorts = {
  sessionId: () => Promise<string>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<unknown>
  scroll: (uuid: string, block: 'start' | 'end') => Promise<{ deny?: string }>
  copy: (text: string) => Promise<{ isCopied: boolean }>
  toast: (text: string, timeoutMs?: number) => void
  /** `text`: the line quotes the conversation (kept per the debugText setting). */
  log: (line: string, text?: boolean) => void
  note: (what: string) => void
  /** The head drawn for a message since load, if it was drawn. */
  drawnHead: (uuid: string) => string | undefined
  markHead: (uuid: string) => string | undefined
  /** Where the person is leaving from: the view before the pane, else the view now. */
  leavingFrom: () => Promise<{ uuid: string; block: 'start' | 'end' } | undefined>
  /** PanePosition's: a jump drops the way back; the restore reads and clears. */
  paneJumped: () => void
  takeRestore: () => { here: string | undefined; block: 'start' | 'end'; fromPane: boolean }
  freshOnScreen: () => string[]
}

/** What the band cluster (handlers/band.ts) needs: its own state, its atoms, the pane, and the after-action settings. */
export type BandPorts = {
  band: import('../core/band-state.ts').BandState
  settings: () => import('../core/settings.ts').Settings
  bandNum: () => Promise<string>
  setBandNum: (v: string) => Promise<unknown>
  bandMode: () => Promise<string>
  setBandMode: (v: string) => Promise<unknown>
  paneId: string
  panes: () => Promise<readonly { id: string; isFocused?: boolean }[]>
  closePaneUi: () => Promise<unknown>
  expectRedraw: (why: string) => void
  note: (what: string) => void
  /** `text`: the line quotes the conversation (kept per the debugText setting). */
  log: (line: string, text?: boolean) => void
  /** The placement and width the pane's render recorded (its writer is the render hook). */
  paneGeometry: () => string | undefined
  paneAnchored: () => boolean
  restoreView: () => Promise<unknown>
  // The band's keys (bandDigit, bandStep, bandPin, bandClaim, bandNumberGo, bandListKey):
  paneMode: () => Promise<string>
  prompts: () => Promise<readonly { uuid: string }[]>
  bookmarkList: () => Promise<readonly import('../core/anchor.ts').AnchorRecord[]>
  jumpToPromptNumber: (typed: string, via: string) => Promise<unknown>
  jumpToBookmarkNumber: (typed: string, via: string) => Promise<unknown>
  scrollPaneCentre: (key: string) => Promise<{ deny?: string }>
  toast: (text: string, timeoutMs?: number) => void
  togglePin: (typed: string) => Promise<unknown>
  groupStep: (dir: -1 | 1) => Promise<unknown>
  loadRegister: () => Promise<import('../core/register-file.ts').Register>
  saveRegister: (reg: import('../core/register-file.ts').Register) => Promise<unknown>
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  // The band's focus probe (focusBand, bandProbeKey, watchBand):
  focus: (requestId: string, key: string) => Promise<{ deny?: unknown } | object>
  loadMarks: () => Promise<Readonly<Record<string, unknown>>>
  letters: readonly string[]
  readingLetter: string
  every: (ms: number, fn: () => unknown) => { cancel: () => void }
  // The pane opening (openFor, bandOnly, handOff):
  diagState: (when: string) => Promise<unknown>
  setPaneMode: (mode: string) => Promise<unknown>
  topOnScreen: () => Promise<string | undefined>
  viewAnchor: () => Promise<{ uuid: string; block: 'start' | 'end' } | undefined>
  promptHere: () => Promise<string | undefined>
  /** PanePosition's: the pane opened, and the view before it. */
  paneOpened: (anchor: string | undefined, view: { uuid: string; block: 'start' | 'end' } | undefined) => void
  paneView: () => { uuid: string; block: 'start' | 'end' } | undefined
  openPane: (title: string) => Promise<{ isPlaced?: boolean; reason?: string } | undefined>
  scroll: (uuid: string, block: 'start' | 'end') => Promise<{ deny?: string }>
  setPendingCentre: (uuid: string) => void
  selection: () => Promise<{ requestId?: string; text: string } | undefined>
  /** The marks cluster's: the selection as it stood when the mark chord fired. */
  setSelectionAtChord: (sel: { requestId?: string; text: string } | undefined) => void
  draftText: () => Promise<string>
  cut: (text: string, n: number) => string
}

/** Finding a message in the transcript by uuid or by a verbatim fragment (register.tsx's resolveTarget). */
export type ResolveOutcome =
  | { kind: 'one'; row: import('../core/transcript-lines.ts').TranscriptRow; via: string; ms: number }
  | { kind: 'many'; rows: import('../core/transcript-lines.ts').TranscriptRow[]; earliest: import('../core/transcript-lines.ts').TranscriptRow; via: string; ms: number }
  | { kind: 'none'; via?: string; ms?: number; reason: string }

/** What the bookmarks cluster (handlers/bookmarks.ts) needs: the register's files, who and where this session is, the transcript, the jump, the mark highlight, the clipboard and the person's feedback. */
export type BookmarksPorts = {
  /** `text`: the line quotes the conversation (kept per the debugText setting). */
  log: (line: string, text?: boolean) => void
  toast: (text: string, timeoutMs?: number) => void
  cut: (text: string, n: number) => string
  expectRedraw: (why: string) => void
  dataRoot: () => Promise<string | undefined>
  sessionId: () => Promise<string>
  cwd: () => Promise<string>
  pluginName: string
  pluginVersion: () => Promise<string>
  // One port per variable: the validator wants $.env.get's name literal.
  userProfile: () => Promise<string | undefined>
  home: () => Promise<string | undefined>
  claudeConfigDir: () => Promise<string | undefined>
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  fsExists: (path: string) => Promise<boolean>
  fsRead: (path: string) => Promise<string>
  fsWrite: (path: string, text: string) => Promise<unknown>
  resolveTarget: (want: { uuid?: string; fragment?: string }) => Promise<ResolveOutcome>
  transcriptPath: () => Promise<string | undefined>
  allRows: () => Promise<readonly { uuid: string }[]>
  jumpTo: (uuid: string, via: string, label: string, words?: string) => Promise<string | undefined>
  loadMarks: () => Promise<import('../core/marks.ts').Marks>
  copy: (text: string) => Promise<{ isCopied: boolean }>
  /** The marks cluster's: a transient highlight entry, and showing it. */
  markCache: import('../core/marks.ts').MarkCache
  showMark: (letter: string, text: string) => Promise<unknown>
}

/** What the marks cluster (handlers/marks.ts) needs: its state, the mark cache, the `shown` atom, the view, the store, the jump, and the person's feedback. */
export type MarksPorts = {
  state: import('../core/mark-state.ts').MarkState
  markCache: import('../core/marks.ts').MarkCache
  shown: () => Promise<{ letter: string; text: string } | null>
  setShown: (v: { letter: string; text: string } | null) => Promise<unknown>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  expectRedraw: (why: string) => void
  note: (what: string) => void
  /** `text`: the line quotes the conversation (kept per the debugText setting). */
  log: (line: string, text?: boolean) => void
  toast: (text: string, timeoutMs?: number) => void
  cut: (text: string, n: number) => string
  selection: () => Promise<{ requestId?: string; text: string } | undefined>
  allRows: () => Promise<readonly { uuid: string; head: string; text?: string }[]>
  /** The text drawn for a message since load (the render hooks' map), if drawn. */
  drawnText: (uuid: string) => string | undefined
  topOnScreen: () => Promise<string | undefined>
  viewAnchor: () => Promise<{ uuid: string; block: 'start' | 'end' } | undefined>
  freshOnScreen: () => string[]
  screenEntries: () => readonly [string, import('../core/screen-model.ts').MessageReport][]
  /** PanePosition's: the view before the pane opened, and where a highlight returns to. */
  paneAnchor: () => string | undefined
  noteRestore: (top: string | undefined) => void
  restoreView: () => Promise<unknown>
  jumpTo: (uuid: string, via: string, label: string, words?: string, probe?: boolean, block?: 'start' | 'end') => Promise<string | undefined>
  now: () => Promise<number>
  loadMarks: () => Promise<import('../core/marks.ts').Marks>
  saveMarks: (marks: import('../core/marks.ts').Marks) => Promise<unknown>
  sessionId: () => Promise<string>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<unknown>
  readingLetter: string
}

/** What the band's command line (handlers/command-line.ts) needs beyond the band's own: the field's redraw, the bookmarks group, and the commands it runs that other clusters own. */
export type CommandLinePorts = BandPorts & {
  /** Draw the field anew, empty (the cmdRev atom; its writer is this port). */
  clearCommandLine: () => Promise<unknown>
  setBandGroup: (group: number) => Promise<unknown>
  jumpToMark: (letter: string) => Promise<unknown>
  readingToggle: () => Promise<unknown>
  promoteLetter: (letter: string) => Promise<unknown>
  jumplistMove: (dir: -1 | 1) => Promise<unknown>
}

// Ownership of shared state (notes/meta/2026-10-12__22-48-40, one owner, read-only ports):
//   state                                   owner                         readers
//   screen (ScreenModel)                    register.tsx render hooks     view tracker (read-only Pick)
//   lastScreenOrder, trustedScreen,         handlers/view-tracker.ts      --
//     heldBy, lastHere, viewTimer
//   lastHere (the one outside write)        prompts pane, via drewHere    --
//   paneAnchor, paneView, restoreTo         core/pane-position.ts         navigation (paneJumped, takeRestore), openFor (opened)
//   jumplistCache, jumplistMoving           handlers/navigation.ts        --
//   band wait/watch timers, ring, id,       core/band-state.ts BandState  band render (drawn), ui.focus (ringMoved),
//     Esc reminder                                                         prompt.edit (oweReminder), session.start
//   cmdBusy (one command at a time)         handlers/command-line.ts      --
//   registerCache, proseQueued              handlers/bookmarks.ts         --
//   logLines, screenLines, timeline (Ring)  register.tsx log cluster       diagnostics (timeline, read-only)
//   rendered (drawn ids)                    register.tsx render hooks     diagnostics, list model (read-only)
//   highlight clear timer, selection at     core/mark-state.ts MarkState  band (setAtChord, via its port),
//     the chord, selection seen, its poll     (handlers/marks.ts)           session.start (stopPoll, startPoll)
//   markCache (core/marks.ts MarkCache)     the marks cluster:            render hooks, band, navigation
//                                             handlers/marks.ts (replace), (readers: all, headOf)
//                                             and in register.tsx the start
//                                             hook and /bm-delmarks (replace),
//                                             highlightWords (showTransient,
//                                             moves with the bookmarks)

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
