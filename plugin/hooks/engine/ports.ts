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
// Settled by the layout pass (0.4.77): engine/ for the ports, handlers/ and views/ for what
// leaves register.tsx whole, core/<cluster>/ for the pure parts, core/kit/ for the reusable.

/** A toast the person sees. */
export type ToastPorts = { toast: (text: string) => void }

/** A line to the plugin's log: drawn into the conversation when `always`, else only while debugging; `text` marks a line that quotes the conversation (kept per the debugText setting). */
export type LogPorts = { log: (line: string, always?: boolean, text?: boolean) => void }

/** What the diagnostic commands read: the lists and caches register.tsx owns, each behind a function so the handler sees the current value. */
export type DiagnosticsPorts = LogPorts & {
  prompts: () => Promise<{ uuid: string; head: string }[]>
  rows: () => Promise<{ uuid: string; door: 'prompt' | 'response'; head: string }[]>
  marks: () => Promise<Record<string, { uuid: string; head: string }>>
  /** /bm-jump's: the navigation cluster's jump. */
  jumpTo: (uuid: string, via: string, label: string) => Promise<unknown>
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
  /** The chosen capability path per gap, one line (engine/select.ts pathsLine over the signals read at start). */
  capabilityPaths: () => string
  /** The loader's pass: rows, bytes read, chunks, running or done (handlers/transcript.ts). */
  loaderStatus: () => string
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
  /** The capability path that runs for a gap on this build (engine/select.ts, U59): a refused jump words itself by it. */
  pathFor: (gap: 'history.reach') => string
  /** Where the person is leaving from: the view before the pane, else the view now. */
  leavingFrom: () => Promise<{ uuid: string; block: 'start' | 'end' } | undefined>
  /** PanePosition's: a jump drops the way back; the restore reads and clears. */
  paneJumped: () => void
  takeRestore: () => { here: string | undefined; block: 'start' | 'end'; fromPane: boolean }
  freshOnScreen: () => string[]
}

/** The band itself (handlers/band.ts): its state and atoms, its timers, its focus probe, the after-action settings, and the person's feedback. Every band handler needs these. */
export type BandCorePorts = {
  band: import('../core/band/band-state.ts').BandState
  settings: () => import('../core/settings.ts').Settings
  bandNum: () => Promise<string>
  setBandNum: (v: string) => Promise<unknown>
  bandMode: () => Promise<string>
  setBandMode: (v: string) => Promise<unknown>
  note: (what: string) => void
  /** `text`: the line quotes the conversation (kept per the debugText setting). */
  log: (line: string, text?: boolean) => void
  toast: (text: string, timeoutMs?: number) => void
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  every: (ms: number, fn: () => unknown) => { cancel: () => void }
  /** The key tables the person's keymap makes (core/settings-state.ts keymap). */
  tables: () => import('../core/band/keys.ts').Tables
  /** Where the band takes a list number: its own field or its digit buttons (core/band/routes.ts listInputTarget, the setting and the capability path). */
  listInput: () => 'band-field' | 'band-buttons'
  /** The band field's key now (`band-num-field-<n>`), and a fresh one: the field is drawn anew under it, holding the band's number. */
  bandFieldKey: () => Promise<string>
  renewBandField: () => Promise<string>
  // The band's focus probe (focusBand, bandProbeKey, watchBand):
  focus: (requestId: string, key: string) => Promise<{ deny?: unknown } | object>
  diagState: (when: string) => Promise<unknown>
  cut: (text: string, n: number) => string
}

/** Opening and closing the pane, and the view around it (openFor, bandOnly, handOff, settle, closePane): the pane surface, PanePosition's anchor and view, and where the view is. */
export type PanePorts = {
  paneId: string
  panes: () => Promise<readonly { id: string; isFocused?: boolean }[]>
  closePaneUi: () => Promise<unknown>
  expectRedraw: (why: string) => void
  /** The placement and width the pane's render recorded (its writer is the render hook). */
  paneGeometry: () => string | undefined
  paneAnchored: () => boolean
  restoreView: () => Promise<unknown>
  paneMode: () => Promise<string>
  setPaneMode: (mode: string) => Promise<unknown>
  topOnScreen: () => Promise<string | undefined>
  viewAnchor: () => Promise<{ uuid: string; block: 'start' | 'end' } | undefined>
  promptHere: () => Promise<string | undefined>
  /** PanePosition's: the pane opened, and the view before it. */
  paneOpened: (anchor: string | undefined, view: { uuid: string; block: 'start' | 'end' } | undefined) => void
  paneView: () => { uuid: string; block: 'start' | 'end' } | undefined
  openPane: (title: string) => Promise<{ isPlaced?: boolean; reason?: string } | undefined>
  /** /bm-pane's: the pane opened with the keyboard and no size request (openPane asks 16x4). */
  openPaneFocused: (title: string) => Promise<unknown>
  scroll: (uuid: string, block: 'start' | 'end') => Promise<{ deny?: string }>
  scrollPaneCentre: (key: string) => Promise<{ deny?: string }>
  setPendingCentre: (uuid: string) => void
}

/** The lists the band browses and acts on (bandDigit, bandStep, bandPin, bandClaim, bandNumberGo, bandListKey, the jump and mark modes): prompts, bookmarks, marks, pins, the selection and the draft. */
export type ListPorts = {
  prompts: () => Promise<readonly { uuid: string }[]>
  bookmarkList: () => Promise<readonly import('../core/bookmarks/anchor.ts').AnchorRecord[]>
  jumpToPromptNumber: (typed: string, via: string) => Promise<unknown>
  /** The prompts list's `/words` filter, as the pane's own field sets it; true when the filter changed. */
  setPromptFilter: (query: string) => boolean
  jumpToBookmarkNumber: (typed: string, via: string) => Promise<unknown>
  /** `d` after a number in the bookmarks list: that bookmark leaves the list (handlers/bookmarks.ts removeBookmark). */
  removeBookmarkNumber: (typed: string) => Promise<unknown>
  togglePin: (typed: string) => Promise<unknown>
  /** The search pane's results, newest first, each with its row position (handlers/search.ts searchView). */
  searchResults: () => readonly { i: number }[]
  /** The search field's text changed: search for it (handlers/search.ts searchFor). */
  searchFor: (query: string) => void
  /** The search's query now, to search again when the pane opens. */
  searchQuery: () => string
  /** The pane opens: on the `searchView` setting's view, unless a toggle was pressed in this conversation (handlers/search.ts openOn). */
  searchOpened: () => void
  goToSearchResult: (typed: string, via: string) => Promise<unknown>
  pinSearchResult: (typed: string) => Promise<unknown>
  groupStep: (dir: -1 | 1) => Promise<unknown>
  /** /bm-bookmarks': which bookmarks group the list shows (0, the first). */
  setBandGroup: (index: number) => Promise<unknown>
  /** `c`: one of Claude's bookmarks becomes the person's (handlers/bookmarks.ts claimBookmark). */
  claimBookmark: (uuid: string) => Promise<ReturnType<typeof import('../core/bookmarks/register-file.ts').claim>>
  loadMarks: () => Promise<Readonly<Record<string, unknown>>>
  letters: readonly string[]
  readingLetter: string
  selection: () => Promise<{ requestId?: string; text: string } | undefined>
  /** The marks cluster's: the selection as it stood when the mark chord fired. */
  setSelectionAtChord: (sel: { requestId?: string; text: string } | undefined) => void
  draftText: () => Promise<string>
}

/** What the band cluster (handlers/band.ts) is handed: the three groups. Each handler names the groups it uses, so one that needs a digit is not given the register's writer. */
export type BandPorts = BandCorePorts & PanePorts & ListPorts

/** What the debug echo (handlers/log.ts) needs: the plugin store, the settings, and this conversation's debug variable, read and written by literal name in register.tsx (one port each, as the validator wants). */
export type EchoPorts = {
  /** The machine-wide echo policy, its one store entry (core/store-keys.ts ECHO_POLICY_KEY). */
  echoPolicyStored: () => Promise<unknown>
  storeEchoPolicy: (policy: unknown) => Promise<unknown>
  settings: () => import('../core/settings.ts').Settings
  /** `CONVO_BOOKMARKS_DEBUG`, this conversation's echo choice and debug channels. */
  debugEnv: () => Promise<string | undefined>
  /** `undefined` clears the variable. */
  setDebugEnv: (value: string | undefined) => Promise<unknown>
}

/** What the file log and the screen channel's file (handlers/log.ts LogFiles) need: the session's id, the data root and its files, and a timer. */
export type LogFilesPorts = {
  sessionId: () => Promise<string>
  dataRoot: () => Promise<string | undefined>
  fsExists: (path: string) => Promise<boolean>
  fsRead: (path: string) => Promise<string>
  fsWrite: (path: string, text: string) => Promise<unknown>
  after: (ms: number, fn: () => void) => { cancel: () => void }
}

/** What the Logger (handlers/log.ts) needs: the echo's and the file log's ports, the engine's $.ui.log, and whether this build was loaded from a folder (for `debugText`'s `auto`). */
export type LoggerPorts = EchoPorts & LogFilesPorts & {
  uiLog: (line: string) => void
  folderBuild: boolean
}

/** What the prompt store (handlers/prompts.ts) needs: the session's id, the plugin store, the data root and its files, a timer, and the settings (the text budget). */
export type PromptsPorts = {
  sessionId: () => Promise<string>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<unknown>
  storeKeys: () => Promise<readonly string[]>
  storeDelete: (key: string) => Promise<unknown>
  dataRoot: () => Promise<string | undefined>
  fsExists: (path: string) => Promise<boolean>
  fsRead: (path: string) => Promise<string>
  fsWrite: (path: string, text: string) => Promise<unknown>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  settings: () => import('../core/settings.ts').Settings
  /** The store's prune and the back-fill (0.4.101): */
  now: () => Promise<number>
  log: (line: string) => void
  transcriptPath: () => Promise<string | undefined>
  /** The transcript's user rows, by the program run in register.tsx userRows (its commands literal there for the validator). */
  userRows: (path: string) => Promise<{ via: 'powershell' | 'sh'; ms: number; stdout: string; isStdoutTruncated?: boolean } | undefined>
}

/** What the loader's pass (handlers/transcript.ts, slice F) needs: the conversation and its file, a chunk of it by offset (the one program register.tsx runs for it), the data root for the index and the replies' pieces, the prompts' text cache to seed from, the clock, and the back-fill's publisher. */
export type TranscriptPorts = {
  sessionId: () => Promise<string>
  transcriptPath: () => Promise<string | undefined>
  fileSize: (path: string) => Promise<number | undefined>
  /** Up to CHUNK_BYTES of the file from `offset`, as the program returned them; undefined when no program could run. */
  readChunk: (path: string, offset: number) => Promise<{ stdout: string; via: 'sh' | 'powershell' } | undefined>
  dataRoot: () => Promise<string | undefined>
  fsExists: (path: string) => Promise<boolean>
  fsRead: (path: string) => Promise<string>
  fsWrite: (path: string, text: string) => Promise<unknown>
  promptTexts: () => Promise<ReadonlyMap<string, string>>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  log: (line: string) => void
  /** The prompts and footnotes into the store, as the grep back-fill did (handlers/prompts.ts applyBackfill). */
  publish: (backfill: import('../core/prompts/prompt-store.ts').Backfill, truncated: boolean) => Promise<unknown>
}

/** What the place reader's pass (handlers/places.ts, the 0.7 groundwork's unit 3) needs: the conversation and its transcript, a folder's listing (its agents' files and stored outputs), a chunk of a file by offset (the same program the loader's pass runs), the data root for the pieces and the index, and the clock. */
export type PlacesPorts = {
  sessionId: () => Promise<string>
  transcriptPath: () => Promise<string | undefined>
  fileSize: (path: string) => Promise<number | undefined>
  readChunk: (path: string, offset: number) => Promise<{ stdout: string; via: 'sh' | 'powershell' } | undefined>
  fsList: (path: string) => Promise<readonly { name: string; kind: string }[]>
  dataRoot: () => Promise<string | undefined>
  fsExists: (path: string) => Promise<boolean>
  fsRead: (path: string) => Promise<string>
  fsWrite: (path: string, text: string) => Promise<unknown>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  log: (line: string) => void
}

/** What the search pane's handler (handlers/search.ts) needs: the place reader's ports, a redraw of the pane, the landing, and the pins made in it. */
export type SearchPorts = PlacesPorts & {
  /** Redraw the pane: the results changed. */
  redraw: () => Promise<unknown>
  /** Land on a result: by the id it is drawn under when it has one, else its uuid with the words highlighted (handlers/bookmarks.ts arriveAtBookmark). */
  arrive: (target: { uuid: string; drawn?: string; words?: string; label: string }, via: string) => Promise<string | undefined>
  /** Turn the person's pin on a place in the search list on or off; the pins' place keys after it, or why it failed. */
  setPin: (place: import('../core/bookmarks/pins.ts').PinPlace, on: boolean) => Promise<{ pinned: ReadonlySet<string> } | { error: string }>
  /** The place keys (pins.ts pinPlaceKey) the person's pins mark in the search list, as the pinScope setting shows them. */
  pinned: () => Promise<ReadonlySet<string>>
  toast: (text: string, timeoutMs?: number) => void
  /** Whether a quoted phrase's case counts (true until a setting says otherwise). */
  phraseCase: () => boolean
}

/** Finding a message in the transcript by uuid or by a verbatim fragment (register.tsx's resolveTarget). */
export type ResolveOutcome =
  | { kind: 'one'; row: import('../core/bookmarks/transcript-lines.ts').TranscriptRow; via: string; ms: number }
  | { kind: 'many'; rows: import('../core/bookmarks/transcript-lines.ts').TranscriptRow[]; earliest: import('../core/bookmarks/transcript-lines.ts').TranscriptRow; via: string; ms: number }
  | { kind: 'none'; via?: string; ms?: number; reason: string }

/**
 * What the lineage (handlers/lineage.ts, U83) needs: this conversation's id and transcript, the
 * store it keeps the answer in, and the one scan of the transcript (tests/fixtures/session-lineage: `grep -o -E
 * <LINEAGE_SCAN_PATTERN> | uniq`); undefined when no program could run it.
 */
export type LineagePorts = {
  log: (line: string) => void
  /** Logged whatever the debug setting: the lineage found, once per session id ever. */
  logAlways: (line: string) => void
  sessionId: () => Promise<string>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<unknown>
  transcriptPath: () => Promise<string | undefined>
  scanLineage: (path: string) => Promise<{ text: string; truncated: boolean; ms: number } | undefined>
  /** Whether the earlier sessions' bookmarks are copied in: the adoptEarlier setting (on by default). */
  adoptOn: () => Promise<boolean>
  /** The copy itself (handlers/bookmarks.ts adoptEarlier), the earlier ids oldest first. */
  adoptEarlier: (ancestors: readonly string[]) => Promise<unknown>
  /** The jumplist's copy (handlers/navigation.ts adoptJumplist): the session it came from, if one. */
  adoptJumplist: (ancestors: readonly string[]) => Promise<string | undefined>
}

/** What the lists (handlers/lists.ts, #45) need: the project's file under the data root, a place found and landed on, the pane, the clipboard and the person's feedback. */
export type ListsPorts = {
  log: (line: string) => void
  toast: (text: string, timeoutMs?: number) => void
  cut: (text: string, n: number) => string
  dataRoot: () => Promise<string | undefined>
  cwd: () => Promise<string>
  sessionId: () => Promise<string>
  now: () => Promise<number>
  pluginName: string
  pluginVersion: () => Promise<string>
  /** A stable hash of a string, hex (core/bookmarks/migrations.ts fnv1a64): names a second project of the same folder name. */
  hash: (text: string) => string
  fsExists: (path: string) => Promise<boolean>
  fsRead: (path: string) => Promise<string>
  fsWrite: (path: string, text: string) => Promise<unknown>
  copy: (text: string) => Promise<{ isCopied: boolean }>
  /** Redraw the lists pane (bumps its rev). */
  redraw: () => Promise<void>
  /** Open the lists pane, without the keyboard; what the engine answered. */
  openPane: () => Promise<unknown>
  /** Whether the lists pane is open now; close it (`/bm-lists` toggles). */
  paneOpen: () => Promise<boolean>
  closePane: () => Promise<unknown>
  /** One of the plugin's own files by its path relative to the plugin folder (the page's template), or undefined when missing. */
  pluginFile: (relative: string) => Promise<string | undefined>
  /** A place of this conversation by a verbatim fragment or a uuid, as the bookmark tool finds one; the outcome as found (handlers/lists.ts reads it). `quick`: prompts and replies only, never the place reader's wait. */
  resolveTarget: (want: { fragment?: string; uuid?: string; quick?: boolean }) => Promise<ResolveOutcome>
  /** Go to a place of this conversation and highlight its words (handlers/bookmarks.ts arriveAtBookmark, with the landing fallback), as SearchPorts' arrive; the refusal, if any. */
  arrive: (target: { uuid: string; label: string; words?: string; drawn?: string; file?: string; part?: number }, via: string) => Promise<string | undefined>
  /**
   * A place of this conversation minted as Claude's perma record through the bookmark tool itself
   * (handlers/bookmarks.ts bookmarkTool), so its note exists and a list item's link to it opens
   * (the links-in-files design, B4); the record's anchor URL, or why not.
   */
  mintPlace: (want: { query?: string; uuid?: string; label: string; words?: string }) => Promise<{ anchor: string } | { error: string }>
  /**
   * Another conversation of this machine, by its session id: whether its transcript is here, and
   * its title from this plugin's own register (register.tsx conversationOf). Lists folders and
   * checks a path exists; reads no transcript (the links-in-files design, B5).
   */
  findConversation: (sessionId: string) => Promise<{ found: boolean; title?: string }>
  /**
   * A `bm:` reference (either form) as the exact place it names, through the bookmarks resolver
   * (handlers/bookmarks.ts resolveRefText); undefined when it does not name one place whose rows
   * are readable here (the bm: short-reference design, unit 6: the item then keeps it as typed).
   */
  resolveRef: (text: string) => Promise<import('../core/lists/item-links.ts').PlaceLink | undefined>
}

/** What the bookmarks cluster (handlers/bookmarks.ts) needs: the register's files, who and where this session is, the transcript, the jump, the mark highlight, the clipboard and the person's feedback. */
export type BookmarksPorts = {
  /** `text`: the line quotes the conversation (kept per the debugText setting). */
  log: (line: string, text?: boolean) => void
  /** A line drawn into the conversation whether or not debugging is on (a failure the person should see). */
  logAlways: (line: string) => void
  toast: (text: string, timeoutMs?: number) => void
  cut: (text: string, n: number) => string
  expectRedraw: (why: string) => void
  dataRoot: () => Promise<string | undefined>
  /** One of the plugin's own files by its path relative to the plugin folder ($.plugin.root): its text, or undefined when it is missing (a packaging bug the caller reports). */
  pluginFile: (relative: string) => Promise<string | undefined>
  sessionId: () => Promise<string>
  cwd: () => Promise<string>
  /** The conversation's title: its /rename name as the start event gave it (register.tsx's `sessionTitle`, set at session.start), else the first prompt's head; written into the register header on save (unit 6). */
  title: () => Promise<string | undefined>
  pluginName: string
  pluginVersion: () => Promise<string>
  /** Claude Code's config folder, forward slashes (register.tsx configDir; the env names stay literal there for the validator). */
  configDir: () => Promise<string | undefined>
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  fsExists: (path: string) => Promise<boolean>
  fsRead: (path: string) => Promise<string>
  fsWrite: (path: string, text: string) => Promise<unknown>
  /** A folder's entries by name (`$.fs.list`): the migrations list the registers and the backups. */
  fsList: (path: string) => Promise<readonly { name: string; kind: string }[]>
  /** The store, for what the migrations move out of it (pins, marks), the keys that name store-only conversations, and the marks' fallback when there is no data root. */
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<unknown>
  storeDelete: (key: string) => Promise<unknown>
  storeKeys: () => Promise<readonly string[]>
  /**
   * `file` and `part`: a row that is not a prompt or a reply, found among the places (the search-pane-and-links design, 2026-10-26).
   * `quick`: prompts and replies only, never the place reader, whose wait for its pass is the calling hook's own time (a note's references, the bm: design, unit 7).
   */
  resolveTarget: (want: { uuid?: string; fragment?: string; file?: string; part?: number; quick?: boolean }) => Promise<ResolveOutcome>
  transcriptPath: () => Promise<string | undefined>
  allRows: () => Promise<readonly { uuid: string }[]>
  /** `quiet`: a first try; a "nothing drawn" refusal returns with no toast, for the caller to try another id (handlers/bookmarks.ts jumpToRecord). */
  jumpTo: (uuid: string, via: string, label: string, words?: string, quiet?: boolean) => Promise<string | undefined>
  /** The message a row belongs to, from the place reader's index as far as it has read (core/places/resolve.ts messageOf); undefined when no pass has run. Never starts one. */
  messageOf: (want: { uuid: string; file?: string; part?: number }) => { uuid: string; why?: string } | undefined
  loadMarks: () => Promise<import('../core/marks/marks.ts').Marks>
  copy: (text: string) => Promise<{ isCopied: boolean }>
  /** The marks cluster's: highlight `words` on a message under `letter` (handlers/marks.ts showWords). */
  highlightWords: (letter: string, uuid: string, words: string) => Promise<unknown>
}

/** What the marks cluster (handlers/marks.ts) needs: its state, the mark cache, the `shown` atom, the view, the store, the jump, and the person's feedback. */
export type MarksPorts = {
  state: import('../core/marks/mark-state.ts').MarkState
  markCache: import('../core/marks/marks.ts').MarkCache
  shown: () => Promise<{ letter: string; text: string } | null>
  setShown: (v: { letter: string; text: string } | null) => Promise<unknown>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  every: (ms: number, fn: () => unknown) => { cancel: () => void }
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
  screenEntries: () => readonly [string, import('../core/kit/screen-model.ts').MessageReport][]
  /** PanePosition's: the view before the pane opened, and where a highlight returns to. */
  paneAnchor: () => string | undefined
  noteRestore: (top: string | undefined, paneAction?: boolean) => void
  restoreView: () => Promise<unknown>
  jumpTo: (uuid: string, via: string, label: string, words?: string, probe?: boolean, block?: 'start' | 'end') => Promise<string | undefined>
  now: () => Promise<number>
  loadMarks: () => Promise<import('../core/marks/marks.ts').Marks>
  /** A letter (or the reading position's key) set on a place: the register's slots since 0.5.5 (handlers/bookmarks.ts setMarkOp); the store when there is no data root. */
  setMark: (letter: string, mark: import('../core/marks/marks.ts').Mark) => Promise<{ error?: string }>
  /** Letters cleared: the slot's current becomes null, its history kept; the record stays. */
  clearMarks: (letters: string[]) => Promise<{ error?: string }>
  /** `D` + letter: the letter's current record leaves the file and the history (handlers/bookmarks.ts forgetOp); `tombstoned` says whether a tombstone kept its place. */
  forgetMark: (letter: string) => Promise<{ error?: string; tombstoned?: boolean }>
  /** The reading position's way back, this conversation's (core/store-keys.ts readingStateKey). */
  readingStateStored: () => Promise<unknown>
  storeReadingState: (state: unknown) => Promise<unknown>
  /** The mark letters (a-z), for /bm-delmarks' `all`. */
  letters: readonly string[]
  readingLetter: string
}

/** What the band's command line (handlers/command-line.ts) needs beyond the band's own: the field's redraw, the bookmarks group, and the commands it runs that other clusters own. */
export type CommandLinePorts = BandPorts & {
  /** Draw the field anew, empty (the cmdRev atom; its writer is this port). */
  clearCommandLine: () => Promise<unknown>
  setBandGroup: (group: number) => Promise<unknown>
  jumpToMark: (letter: string) => Promise<unknown>
  readingToggle: () => Promise<unknown>
  /** `<leader> l`: open the lists pane, or close it when open (handlers/lists.ts listsCommand). */
  toggleLists: () => Promise<unknown>
  promoteLetter: (letter: string) => Promise<unknown>
  /** `d` + letter and `D` + letter (handlers/marks.ts clearLetter, forgetLetter). */
  clearLetter: (letter: string) => Promise<unknown>
  forgetLetter: (letter: string) => Promise<unknown>
  jumplistMove: (dir: -1 | 1) => Promise<unknown>
  /** The key tables the person's keymap makes (core/settings-state.ts keymap). */
  tables: () => import('../core/band/keys.ts').Tables
}

// Ownership of shared state (notes/meta/2026-10-12__22-48-40, one owner, read-only ports).
// tests/core/ownership.test.ts checks it: the writers of BandState, MarkState and
// MarkCache are called only from their owners' files (BandState's: handlers/band.ts and
// the band's command line, handlers/command-line.ts), no handler or view imports
// register.tsx, and every module-level variable in a handler is named below.
//   state                                   owner                         readers
//   screen (ScreenModel)                    register.tsx render hooks     view tracker (read-only Pick)
//   lastScreenOrder, trustedScreen,         handlers/view-tracker.ts      --
//     heldBy, lastHere, viewTimer             (viewTracker, its one instance
//                                             in register.tsx)
//   lastHere (the one outside write)        prompts pane, via drewHere    --
//   paneAnchor, paneView, restoreTo         core/kit/pane-position.ts         navigation (paneJumped, takeRestore), openFor (opened)
//                                             (panePosition, in register.tsx)
//   jumplistCache, jumplistMoving           handlers/navigation.ts        --
//   band wait/watch timers, ring, id,       core/band/band-state.ts BandState  band render (drawn), ui.focus (ringMoved),
//     Esc reminder                                                         prompt.edit (oweReminder), session.start
//   cmdBusy (one command at a time)         handlers/command-line.ts      --
//   the prompts filter, unfolded            core/prompts/prompts-pane-    the prompts pane's render (filter,
//     footnotes, the centre at next draw      state.ts PromptsPaneState     unfolded, takeCentre); openFor
//                                             (promptsPane, in register.tsx,  (centreOnNextDraw, via its port)
//                                             0.4.102)
//   the bookmark tool's fold: each call's   core/bookmarks/tool-fold.ts   the ToolUse/ToolResult render hooks
//     turn, what is open (0.7.5)              ToolFold (toolFold, in        (read; presses toggle), tool.call
//                                             register.tsx)                 (noteCall), turn.start (newTurn), reset
//   conversationId (the conversation the    register.tsx sameConversation sameConversationSoon (read-only)
//     plugin works for, Q261014-01)
//   capabilitySignals (the build and the    register.tsx session.start    pathFor (navPorts), capabilityPaths
//     patch markers, read once; U59)         (the one writer)              (diagnosticsPorts), read-only
//   settings (SettingsState: the /config    core/settings-state.ts        every reader through currentSettings(),
//     values, theme, resolution, palette)     (register's load, the two     style(); /bm-config (resolved)
//                                             config.set hooks; 0.4.104)
//   registerCache, proseQueued,             handlers/bookmarks.ts         newConversation (anchorRowsLogged
//     anchorRowsLogged (replies whose                                       only; the reply render hook via
//     links were logged and queued)                                         noteAnchoredReply)
//   debug channels (DebugChannels)          handlers/log.ts (writers:     log, the screen channel, the view
//                                             read, set); the Logger's    tracker (held), /bm-debug (on)
//                                             (0.4.95), one in register.tsx
//   pass (the loader's state for this        handlers/transcript.ts        startPass, appendLive, newConversation;
//     conversation, slice F)                  (the one writer)              read by resolveLoaded, loaderStatus
//   placesPass (the place reader's state    handlers/places.ts            startPlacesPass, newConversation;
//     for this conversation: its index,       (the one writer)              read by placesStatus, placesIndex
//     the file cursors; 0.7 unit 3)
//   current, pending (the lineage of this   handlers/lineage.ts           lineageNow (read-only); ensureLineage
//     conversation, and a scan running for    (the one writer:              from startLineage in register.tsx
//     it; U83)                                ensureLineage)
//   lists (handlers/lists.ts Lists: the     handlers/lists.ts (the one     the lists pane's render hook through
//     project's lists file cached, the      writer: load, change, pick,   paneModel; the lists tool and
//     list the pane shows, the items        show, toggleShown)            /bm-lists through the same class
//     opened in place; #45)
//   promptTextCache, promptTextSave,        handlers/prompts.ts (the      --
//     storedPromptTextDropped                 back-fill fills it there too,
//                                             since 0.4.101)
//   logLines, screenLines, logPath, the     handlers/log.ts LogFiles      /bm-debug (path, read-only)
//     write chain, the screen file's        (writers: keep, screenReport,
//     flush and load flags                  newConversation); the
//                                           Logger's (0.4.95)
//   timeline (handlers/log.ts Timeline)     note(); the Logger's          diagnostics (items, read-only)
//                                             (0.4.95)
//   Logger (handlers/log.ts)                log() (Logger.log, keepLine)  --; one instance in register.tsx (logger)
//   drawn ids and their first four groups   core/kit/drawn-messages.ts    diagnostics (texts, read-only), the panes
//     (DrawnMessages)                         (writer: note, from the       (firstFours), navigation and marks (texts)
//                                             UserMessage render hook)
//   highlight clear timer, selection at     core/marks/mark-state.ts MarkState  band (setAtChord, via its port),
//     the chord, selection seen, its poll     (handlers/marks.ts; markState  session.start (stopPoll, startPoll)
//                                             in register.tsx)
//   markCache (core/marks/marks.ts MarkCache)     the marks cluster:            render hooks, band, navigation
//                                             handlers/marks.ts only: writeMarks (readers: all, headOf)
//                                             and startMarks (replace), showWords
//                                             (showTransient, for a bookmark's
//                                             arrival through its port)

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
