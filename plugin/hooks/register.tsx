// claude-bookmarks: the plugin's engine adapter.
//
// Everything that talks to Claude Code lives here: the render hooks, the panes, the
// band (the one-line command strip after the leader key), the `/bm-*` commands, the
// `bookmark` tool, the store and the debug log. The rules themselves are pure modules
// in core/, each with its tests in the repository's tests/core (`node --test tests/core/*.test.ts`), and
// docs/engine-quirks.md records what the engine does and does not let a plugin do.
//
// Diagnostics report with $.ui.log (a dim transcript row Claude never reads) or a
// toast, never as command `text`, because that text becomes a row Claude reads.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PaneMode, Row } from '../types'
import {
  markLinks, markdownLinks, parseAnchor, tierOf,
  type AnchorOwner, type MarkerStyle,
} from './core/bookmarks/anchor'
import { findRecord } from './core/bookmarks/register-file'
import { headOf, jsonEscaped, resolveRows, rowsFromGrep, uuidPattern, type Resolution } from './core/bookmarks/transcript-lines'
import { excerpt, type Channel } from './core/log/debug'
import { bandButtons, helpLines, helpShort, listHint, listKeysFor, route, type Chord, type Operation, type Pane } from './core/band/keys'
import type { Cause } from './core/band/after-action'
import { installedFromCache, type Settings } from './core/settings'
import { SettingsState } from './core/settings-state'
import type { Role, Style } from './core/palette'
import { footnoteOf, looksLikePrompt, unwrapQueued, type FootnoteRef } from './core/prompts/prompt-rows'
import { short } from './core/kit/message-id'
import { configDirOf, dataRootOf } from './core/kit/paths'
import { ECHO_POLICY_KEY, readingStateKey } from './core/store-keys'
import { diagLine, keyLabel } from './core/log/diagnostics'
import { colorSplit, tagMarksMarkdown, tagMarksPlain } from './core/marks/highlight'
import { ScreenModel } from './core/kit/screen-model'
import { MarkCache, marksShowing, type Mark, type Marks } from './core/marks/marks'
import { footnoteAt, listPosition, nextGroup, promptEntry } from './core/band/band-entry'
import { debugCommand } from './handlers/debug-command'
import { anchoredReply, markedColumn, markedReply, type MarkStyles } from './views/marked-message'
import { bandView } from './views/band'
import { bookmarksPaneView } from './views/bookmarks-pane'
import { marksPaneView } from './views/marks-pane'
import { promptsPaneView } from './views/prompts-pane'
import { VERIFIED_CLIENTS, configCommand, envCommand, idsCommand, jumpCommand, marksCommand, selCommand, timelineCommand } from './handlers/diagnostics-commands'
import type { BandPorts, BookmarksPorts, CommandLinePorts, DiagnosticsPorts, EchoPorts, LogFilesPorts, LoggerPorts, MarksPorts, NavigationPorts, PromptsPorts, ResolveOutcome, ViewPorts } from './engine/ports'
import { closeAll as bandCloseAll, endBandMode as bandEnd, settle as bandSettle, paneOf } from './handlers/band'
import * as band_ from './handlers/band'
import * as commandLine from './handlers/command-line'
import * as marks_ from './handlers/marks'
import * as bookmarks_ from './handlers/bookmarks'
import * as prompts_ from './handlers/prompts'
import * as log_ from './handlers/log'
import { MarkState } from './core/marks/mark-state'
import { Navigation } from './handlers/navigation'
import { ViewTracker } from './handlers/view-tracker'
import { PanePosition } from './core/kit/pane-position'
import { BandState } from './core/band/band-state'
import { PromptsPaneState } from './core/prompts/prompts-pane-state'
import { DrawnMessages } from './core/kit/drawn-messages'
import { BOOKMARK_TOOL } from './core/bookmarks/bookmark-tool'
import { COMMANDS } from './core/band/commands'
import { promptList, transcriptGuess, type PromptRef } from './core/prompts/prompt-store'


// The plugin's settings as they stand, and the palette: core/settings-state.ts
// SettingsState, kept current by `register`'s load and the config.set hooks below;
// resolved once per change.
const settings = new SettingsState()
function currentSettings(): Settings {
  return settings.current()
}

// The plugin's one pane id (prompts, bookmarks, mark and jump panes all open under it).
const PANE = 'bm-pane'

// Claude Code builds the borrowed-action chords (below) were verified on:
// handlers/diagnostics-commands.ts VERIFIED_CLIENTS, the one list the start-up tripwire
// and /bm-env both read.

// Engine keybinding actions the chords borrow (docs/engine-quirks.md, "A plugin can't
// define its own keyboard shortcut"). None should have a handler mounted while the built-in diff mod
// is enabled; the version check in session.start is how we notice when a new build
// might have changed that.
const MARK_ACTION = 'app:toggleDiffNoiseFilter'
const JUMP_ACTION = 'app:toggleDiffPreSession'
// A third borrowed action (2026-10-04, user: "ctrl-x p" for the recent-prompts pane,
// then 1-9): `ctrl+x p` in keybindings.json. The engine's own docs use it as their
// example of a Button `action`; another diff-viewer toggle, idle in a conversation.
const PROMPTS_ACTION = 'app:cycleDiffBase'
// A fourth (2026-10-04, user: "Ctrl+x space" for the reading position). Scrolls the
// diff panel's file list, so idle in a conversation like the other three. `ctrl+x x`,
// djdarcy's first idea, is Claude Code's own chord for closing a pane.
const READING_ACTION = 'app:diffFileListDown'
// The reading position is kept as a mark under this key, so the highlight and the
// band show it like any other; the panes list only a-z, so it never appears there.
const READING = '`'

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

const rows = atom({ plugin: 'bookmarks', key: 'rows' } as const, [])
const paneMode = atom({ plugin: 'bookmarks', key: 'paneMode' } as const, 'list')
const shown = atom({ plugin: 'bookmarks', key: 'shown' } as const, null)
const bandMode = atom({ plugin: 'bookmarks', key: 'bandMode' } as const, 'idle')
const pinsRev = atom({ plugin: 'bookmarks', key: 'pinsRev' } as const, 0)
// The band's command line (design 2026-10-07__02-58-22): bumped after each command so
// the field is drawn under a new key and starts empty; and the prompt number's digits.
const cmdRev = atom({ plugin: 'bookmarks', key: 'cmdRev' } as const, 0)
const bandNum = atom({ plugin: 'bookmarks', key: 'bandNum' } as const, '')
// The bookmarks pane shows one group at a time, cycled from the band (djdarcy, 2026-10-09:
// start on "their" bookmarks, a key cycles to Claude's, and a third group such as team
// members' can join later). An ordered list, so a group is one entry, not a code path.
// The keys are vim's sideways pair; `o`/`i` already mean back/forward at the band's top
// level. Both become settings (#7).
const bandGroup = atom({ plugin: 'bookmarks', key: 'bandGroup' } as const, 0)
// Bumped when the prompt nearest the view changes while the prompts pane is open, so
// the pane redraws its yellow row as the person scrolls (djdarcy, 2026-10-11).
const viewRev = atom({ plugin: 'bookmarks', key: 'viewRev' } as const, 0)
// Bumped when one of the plugin's /config fields changes, so the panes and the band,
// which read settings while drawing, draw again.
const settingsRev = atom({ plugin: 'bookmarks', key: 'settingsRev' } as const, 0)
const BOOKMARK_GROUPS: { owner: AnchorOwner | 'all'; title: string }[] = [
  { owner: 'user', title: 'yours' },
  { owner: 'claude', title: "Claude's" },
  { owner: 'all', title: 'all' },
]


// What is on screen, and when the plugin itself last caused a redraw: core/kit/screen-model.ts.
const screen = new ScreenModel()
function expectRedraw(why: string) {
  screen.expectRedraw(why, Date.now())
}

// The marks cluster (the highlight, setting a mark, the reading position, jumping to a
// mark) is handlers/marks.ts; its own state is core/marks/mark-state.ts MarkState.
const markState = new MarkState()

// The session's marks, kept in memory so render hooks can read them without a store
// call per row. Loaded at session.start and refreshed on every mark write.
// (core/marks/marks.ts MarkCache: `replace` and `showTransient` are its only writers.)
const markCache = new MarkCache()
function marksPorts($: EngineInterface): MarksPorts {
  return {
    state: markState,
    markCache,
    shown: () => read($, shown),
    setShown: v => update($, shown, () => v),
    after: (ms, fn) => $.clock.after(ms, fn),
    every: (ms, fn) => $.clock.every(ms, fn),
    expectRedraw,
    note,
    log: (line, text) => log($, line, text ? { text: true } : undefined),
    toast: (text, timeoutMs) => (timeoutMs ? $.ui.toast(text, { timeoutMs }) : $.ui.toast(text)),
    cut,
    selection: () => $.ui.selection(),
    allRows: () => allRows($),
    drawnText: uuid => drawn.texts.get(uuid),
    topOnScreen: () => topOnScreen($),
    viewAnchor: () => viewAnchor($),
    freshOnScreen,
    screenEntries: () => screen.entries(),
    paneAnchor: () => panePosition.anchor,
    noteRestore: (top, paneAction) => panePosition.noteRestore(top, paneAction),
    restoreView: () => restoreView($),
    jumpTo: (uuid, via, label, words, probe, block) => jumpTo($, uuid, via, label, words, probe, block),
    now: () => $.clock.now(),
    loadMarks: () => loadMarks($),
    setMark: (letter, mark) => bookmarks_.setMarkOp(bookmarksPorts($), letter, mark),
    clearMarks: letters => bookmarks_.clearMarksOp(bookmarksPorts($), letters),
    readingStateStored: async () => $.store.get(readingStateKey(await $.session.id())),
    storeReadingState: async state => $.store.set(readingStateKey(await $.session.id()), state),
    letters: LETTERS,
    readingLetter: READING,
  }
}

// Every colour, background, dim and bold the plugin draws comes from the palette by role
// (#27, core/palette.ts; resolved and kept by SettingsState.palette).
const style = (role: Role): Style => settings.palette()[role]
// A Button's label can't be coloured at rest (docs/engine-quirks.md): only its dimness.
const buttonStyle = (role: Role): { dimColor?: boolean } => (style(role).dimColor ? { dimColor: true } : {})

// Where the marked line sits in a message, and the bold «a» form: core/marks/highlight.ts. How
// it is drawn: views/marked-message.tsx, with these two palette roles.
const markStyles = (): MarkStyles => ({ band: style('markBand'), mark: style('mark') })

// The shown mark, if it is on this row (core/marks/marks.ts marksShowing), from the cache.
function marksOnRow(requestId: string, showing: string | undefined): [string, Mark][] {
  return marksShowing(markCache.all, requestId, showing)
}

// Ids seen at UserMessage render time since this module loaded. A module variable on
// purpose: a render hook may not write $.state, and a reload should forget these, so
// "never drawn since load" (a jump target Claude Code may refuse) means what it says.
// core/kit/drawn-messages.ts DrawnMessages, which also keeps the panes' first-four set.
const drawn = new DrawnMessages()

// A message's on-screen report (core/kit/screen-model.ts noteMessage: which ids count, what is news).
function noteOnScreen(requestId: string, onScreen: { first: number; last: number; of: number } | null | undefined) {
  screen.noteMessage(requestId, onScreen, Date.now())
}
// The `screen` debug channel (#35): handlers/log.ts LogFiles.screenReport, when the channel is on.
function rawScreen($: EngineInterface, component: string, requestId: string, onScreen: { first: number; last: number; of: number } | null | undefined) {
  logger.channels.read(echoPorts($))
  if (!logger.channels.has('screen')) return
  logger.files.screenReport(logFilesPorts($), component, requestId, onScreen)
}

// One render report from a non-message row: the screen channel's log, the news time
// (a non-message row's report dates the latest burst: core/kit/screen-model.ts noteOther),
// and the pane's view check.
function noteOtherRow($: EngineInterface, tag: string, requestId: string, onScreen: { first: number; last: number; of: number } | null | undefined) {
  rawScreen($, tag, requestId, onScreen)
  screen.noteOther(requestId, onScreen, Date.now())
  noteViewMoved($)
}

function freshOnScreen(): string[] {
  return screen.fresh()
}

// The logger (handlers/log.ts Logger): the one instance. It owns the timeline
// (`logger.timeline`), the file log (`logger.files`) and the debug channels
// (`logger.channels`); readers here reach each part through it.
const logger = new log_.Logger()
// The timeline's one writer.
function note(what: string) {
  logger.timeline.note(what)
}
// The file log, the screen channel's file and their rings: handlers/log.ts LogFiles, the
// logger's, over logFilesPorts($).
function logFilesPorts($: EngineInterface): LogFilesPorts {
  return {
    sessionId: () => $.session.id(),
    dataRoot: () => dataRoot($),
    fsExists: path => $.fs.exists(path),
    fsRead: path => $.fs.read(path),
    fsWrite: (path, text) => $.fs.write(path, text),
    after: (ms, fn) => $.clock.after(ms, fn),
  }
}

// The debug echo (the machine-wide policy and this conversation's choice) is
// handlers/log.ts, over echoPorts($); its callers call it directly with these ports.
function echoPorts($: EngineInterface): EchoPorts {
  return {
    echoPolicyStored: () => $.store.get(ECHO_POLICY_KEY),
    storeEchoPolicy: policy => $.store.set(ECHO_POLICY_KEY, policy),
    settings: currentSettings,
    debugEnv: () => $.env.get('CONVO_BOOKMARKS_DEBUG'),
    setDebugEnv: value => $.env.set('CONVO_BOOKMARKS_DEBUG', value),
  }
}

// log() is handlers/log.ts Logger.log, over these ports: the echo's, the file log's, the
// engine's $.ui.log, and whether this build was loaded from a folder.
function logPorts($: EngineInterface): LoggerPorts {
  return {
    ...echoPorts($),
    ...logFilesPorts($),
    uiLog: line => $.ui.log(line),
    folderBuild: !installedFromCache($.plugin.root),
  }
}
function log($: EngineInterface, line: string, opts?: { always?: boolean; text?: boolean }) {
  logger.log(logPorts($), line, opts)
}

// A quoted excerpt in a log line: short, or whole when `debugTextLength` is `full`.
const cut = (text: string, n: number) => excerpt(text, n, currentSettings().debugTextLength)

// The person's home folder: USERPROFILE (Windows), else HOME. Read here, where the
// validator follows `$.env.get`; what is built from it is core/kit/paths.ts.
async function homeDir($: EngineInterface): Promise<string | undefined> {
  return (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
}
// Claude Code's config folder (core/kit/paths.ts configDirOf).
async function configDir($: EngineInterface): Promise<string | undefined> {
  return configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), await homeDir($))
}
// The data root: where this plugin keeps what is the person's (bookmarks, exports, the
// debug log); core/kit/paths.ts dataRootOf.
async function dataRoot($: EngineInterface): Promise<string | undefined> {
  const fromEnv = await $.env.get('CLAUDE_USER_DIR')
  return dataRootOf(fromEnv, fromEnv ? undefined : await homeDir($))
}

// --- Conversations (Q261014-01) ---------------------------------------------------------
// The process outlives a conversation: /clear starts a new one under a new session id, and
// a resume puts another in its place, its own transcript drawn instead (the source's
// REPL.tsx: the messages are replaced, not extended). No session.start fires for either.
// So the plugin notes the id it is working for, and wherever it next looks (a stored row,
// a submitted prompt, the band or a pane drawn, a band command, a session's end) a changed
// id means a new conversation: what was held for the one before is reset, and what is
// kept per conversation (its marks, jumplist, register, log) is read for the new one.
// Compaction keeps the id, so it resets nothing.
let conversationId: string | undefined
async function sameConversation($: EngineInterface): Promise<void> {
  const id = await $.session.id()
  if (conversationId === undefined || id === conversationId) {
    conversationId = id
    return
  }
  const before = conversationId
  conversationId = id
  await resetConversationMemory()
  await bookmarks_.startRegister(bookmarksPorts($))
  await marks_.startMarks(marksPorts($))
  pruneThenBackfill($)
  log($, `[bm] a new conversation: ${short(before)} -> ${short(id)}; what the one before left in memory is reset`)
}
// The store's prune, then this conversation's back-fill (done once per conversation, by its
// flag): at session.start, and when the process moves to another conversation (0.4.79;
// acceptance check 2026-10-14__16-55-20, #15: a resumed conversation was never back-filled
// until the next process start). Not awaited, by either.
function pruneThenBackfill($: EngineInterface) {
  void prompts_.pruneStoreNow(promptsPorts($))
    .catch(err => log($, `[bm] store prune failed: ${String(err)}`))
    .then(() => prompts_.backfillPrompts(promptsPorts($)))
    .catch(err => log($, `[bm] backfill failed: ${String(err)}`))
}
// From a render hook, which may not write state (the reset clears the highlight): notice
// a changed id there and do the reset on a clock tick.
function sameConversationSoon($: EngineInterface) {
  void $.session.id().then(id => {
    if (conversationId !== undefined && id !== conversationId) $.clock.after(0, () => void sameConversation($).catch(() => {}))
  }).catch(() => {})
}
// What a conversation leaves in memory: one list of its owners, each forgetting its own
// part (newConversation): the log files' place and rings (0.4.74), the prompts pane's
// filter, folds and pending centre, the band's state, the pane position and the view
// tracker (0.4.73). Left out on purpose, so adding an owner is a decision made here:
// the register and the marks reset through their own start parts (startRegister,
// startMarks); the settings are the person's, not a conversation's; the drawn ids
// (DrawnMessages) are "drawn since load", and whether a resumed conversation's messages
// are drawn before or after this reset is not known; paneGeometry is the pane's.
async function resetConversationMemory() {
  for (const owner of [logger.files, promptsPane, band, panePosition, viewTracker]) await owner.newConversation()
}

// Mark and Marks: core/marks/marks.ts.

// This plugin's own version, from its manifest (the one Claude Code installs by).
async function pluginVersion($: EngineInterface): Promise<string> {
  try {
    const manifest = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
    return typeof manifest.version === 'string' ? manifest.version : '?'
  } catch {
    return '?'
  }
}

async function allRows($: EngineInterface): Promise<Row[]> {
  return (await read($, rows)) as Row[]
}

// The prompt store (the session's prompts and footnotes, the prompts' text for the filter)
// is handlers/prompts.ts, over promptsPorts($).
function promptsPorts($: EngineInterface): PromptsPorts {
  return {
    sessionId: () => $.session.id(),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    storeKeys: () => $.store.keys(),
    storeDelete: key => $.store.delete(key),
    dataRoot: () => dataRoot($),
    fsExists: path => $.fs.exists(path),
    fsRead: path => $.fs.read(path),
    fsWrite: (path, text) => $.fs.write(path, text),
    after: (ms, fn) => $.clock.after(ms, fn),
    settings: currentSettings,
    now: () => $.clock.now(),
    log: line => log($, line),
    transcriptPath: () => transcriptPath($),
    userRows: path => userRows($, path),
  }
}
async function keptPrompts($: EngineInterface): Promise<PromptRef[]> {
  return prompts_.keptPrompts(promptsPorts($))
}
async function keptFootnotes($: EngineInterface): Promise<FootnoteRef[]> {
  return prompts_.keptFootnotes(promptsPorts($))
}

// --- Back-fill: the prompts sent before the mod was loaded ------------------------
// The transcript holds them but is too big for $.fs.read (4 MiB; 18 MB here). The
// platform's own tool filters it to the user rows (no install: Windows PowerShell 5.1
// on Windows, sh + grep elsewhere) and the mod parses the JSON lines. Settled by the
// measurement in tests/one-offs/thinking/prompt-history/ (2026-10-04: 152/152 prompts,
// identical text; ~1 MB of output; 328 ms PowerShell, 81 ms sh + grep). Runs once per
// conversation; after that the live capture keeps the list current.
// Which rows are prompts, and the words of a queued one: core/prompts/prompt-rows.ts (tested),
// shared by the transcript back-fill below and the live capture in session.append.

// The PowerShell fallbacks are scripts shipped with the plugin (hooks/scripts/*.ps1),
// run with -File and named parameters. Until v0.3.0 they were inline scripts passed as
// base64 UTF-16LE text, to keep their double quotes intact; a measurement on 2026-10-09
// showed -File parameters keep `"type":"user"` verbatim from a non-shell spawn, and
// base64-encoded PowerShell is what a security scan flags. Each $.process.run below
// receives its argv as a literal array at the call, program name and flags spelled
// out, so a static reader can see what runs; only the file path, the search text and
// the plugin's own folder are variables.

// The session's transcript: <config dir>/projects/<project>/<session id>.jsonl. The
// project folder is the cwd with every non-alphanumeric character turned into `-`;
// if that guess misses, every project folder is looked in.
async function transcriptPath($: EngineInterface): Promise<string | undefined> {
  const config = await configDir($)
  if (!config) return undefined
  const sid = await $.session.id()
  const file = `${sid}.jsonl`
  const guess = transcriptGuess(config, await $.session.cwd(), sid)
  if (await $.fs.exists(guess)) return guess
  for (const entry of await $.fs.list(`${config}/projects`)) {
    const candidate = `${config}/projects/${entry.name}/${file}`
    if (entry.kind === 'dir' && (await $.fs.exists(candidate))) return candidate
  }
  return undefined
}

// --- For reviewers: the only two places this plugin runs a program ----------------
// userRows() and grepTranscript() below are the plugin's only $.process.run calls.
// Why a program at all: the transcript is often larger than the 4 MiB that $.fs.read
// accepts (it rejects above that), so the file is searched by a tool already on the
// machine. What runs: `sh -c 'grep ...'` where sh and grep exist, else `powershell
// -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <one of the two .ps1 files
// shipped in hooks/scripts/>`. The transcript path and the search text are always
// separate argv elements ("$1"/"$2" to sh, named -Path/-Pattern parameters to
// PowerShell), never spliced into the command string, so selected or model-chosen
// text cannot become a command. Output is read back here and parsed as JSON lines;
// it is not sent anywhere, and the plugin opens no network connection. Each run is
// capped at 60 seconds and at 4 MiB of output by the engine. See README "What it
// runs, reads, writes and sends" and PRIVACY.md.

// The user rows of the transcript, one JSON line each, from the platform's own tool.
async function userRows($: EngineInterface, path: string) {
  const windows = /^[A-Za-z]:[\\/]/.test(path)
  if (windows) {
    // Windows PowerShell 5.1 first on a Windows path. The row markers ("type":"user",
    // "type":"tool_result") are spelled out at each call so the command reads as fixed
    // text; the sh form below uses the same two.
    try {
      const started = Date.now()
      const r = await $.process.run(
        ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${$.plugin.root}/hooks/scripts/user-rows.ps1`,
          '-Path', path, '-UserRow', '"type":"user"', '-QueuedRow', '"type":"queued_command"', '-ToolResultRow', '"type":"tool_result"', '-MetaRow', '"isMeta":true'],
        { timeoutMs: 60_000 },
      )
      if (r.exitCode === 0 || r.stdout) return { via: 'powershell' as const, ms: Date.now() - started, ...r }
    } catch {
      // PowerShell is not there: try sh.
    }
  }
  try {
    const started = Date.now()
    const r = await $.process.run(
      ['sh', '-c', 'grep -F -e \'"type":"user"\' -e \'"type":"queued_command"\' "$1" | grep -vF -e \'"type":"tool_result"\' -e \'"isMeta":true\'', 'sh', path],
      { timeoutMs: 60_000 },
    )
    if (r.exitCode === 0 || r.stdout) return { via: 'sh' as const, ms: Date.now() - started, ...r }
  } catch {
    // sh is not there either.
  }
  return undefined
}

// `grep -bn` over the transcript: every line containing `pattern`, as `line:byteoffset:
// text`. sh + grep first on every platform (29 ms on a 10 MB file here; Git Bash has
// grep on Windows); PowerShell second, computing the byte offsets itself since
// Select-String has none. The output cap (4 MiB) cuts the newest matches first; a cut
// line fails to parse and is skipped.
async function grepTranscript($: EngineInterface, path: string, pattern: string) {
  try {
    const started = Date.now()
    const r = await $.process.run(
      ['sh', '-c', 'grep -bnF -- "$1" "$2"', 'sh', pattern, path],
      { timeoutMs: 60_000 },
    )
    // grep exits 1 for "no match" with empty output: that is an answer, not a failure.
    if (r.exitCode === 0 || r.exitCode === 1 || r.stdout) return { via: 'sh' as const, ms: Date.now() - started, ...r }
  } catch {
    // sh is not there: try PowerShell.
  }
  try {
    const started = Date.now()
    const r = await $.process.run(
      ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${$.plugin.root}/hooks/scripts/grep-offsets.ps1`,
        '-Path', path, '-Pattern', pattern],
      { timeoutMs: 60_000 },
    )
    if (r.exitCode === 0 || r.exitCode === 1 || r.stdout) return { via: 'powershell' as const, ms: Date.now() - started, ...r }
  } catch {
    // PowerShell is not there either.
  }
  return undefined
}

// The message a request names, with its line and byte range: by uuid (full or 8+
// prefix), or by a fragment of its text (earliest real message that contains it; several
// are returned as candidates). The anchors DWP's resolver (2026-10-09). Its outcome type,
// ResolveOutcome, is in engine/ports.ts since 0.4.64: handlers/bookmarks.ts names it too.
async function resolveTarget($: EngineInterface, want: { uuid?: string; fragment?: string }): Promise<ResolveOutcome> {
  const path = await transcriptPath($)
  if (!path) return { kind: 'none', reason: 'transcript not found' }
  const pattern = want.uuid ? uuidPattern(want.uuid) : want.fragment ? jsonEscaped(want.fragment) : undefined
  if (!pattern) return { kind: 'none', reason: 'nothing to look for' }
  const g = await grepTranscript($, path, pattern)
  if (!g) return { kind: 'none', reason: 'neither sh + grep nor PowerShell ran' }
  const rows = rowsFromGrep(g.stdout)
  const r: Resolution = resolveRows(rows, want)
  if (r.kind === 'none') return { kind: 'none', via: g.via, ms: g.ms, reason: g.isStdoutTruncated ? 'no match (output was cut at 4 MiB)' : 'no match' }
  return { ...r, via: g.via, ms: g.ms }
}

// The store's prune and the back-fill are handlers/prompts.ts (pruneStoreNow,
// backfillPrompts), over promptsPorts($); userRows above is their program run.

// Who-caused-the-row stamps (session.append's `origin.kind`) that are never the person.
const AUTOMATED_ORIGINS = new Set(['task-notification', 'scheduled-trigger', 'peer-send-message', 'coordinator', 'observer', 'observer-activity', 'auto-continuation', 'projects-relay', 'channel'])

// The stored prompts that are prompts, then the rows captured live this session that the
// store lacks (core/prompts/prompt-store.ts promptList). Rows kept before the list knew them for
// notices drop out, so the numbers match the transcript's; a `<task-notification>` row
// the rebuild dropped once came back as the newest prompt and sent the yellow row to the
// bottom (djdarcy, 2026-10-11: scrolling up from #325 moved it to #342).
async function prompts($: EngineInterface): Promise<PromptRef[]> {
  return promptList(await keptPrompts($), await allRows($))
}

// Since 0.5.5 the marks are records in the register, pointed at by its slots (the data
// design, 2026-10-16); the v2 -> v3 migration moves them out of the store (`marks:<sid>`,
// core/store-keys.ts) at the conversation's start, and the store is the fallback when there
// is no data root. handlers/bookmarks.ts derives the `Marks` the panes draw.
async function loadMarks($: EngineInterface): Promise<Marks> {
  return bookmarks_.marksOf(bookmarksPorts($))
}

// The conversation's title for the register header (unit 6): the /rename name the start
// event carried (`session_title`, the only place the engine says it), else the head of the
// first prompt. No engine call reads the title after the start, so it is kept here.
let sessionTitle: string | undefined
async function conversationTitle($: EngineInterface): Promise<string | undefined> {
  if (sessionTitle) return sessionTitle
  return (await prompts($))[0]?.head || undefined
}

// Bookmark anchors and the register (its file, minting, exports, prose anchors, the
// anchor press, the model's tool): handlers/bookmarks.ts, over bookmarksPorts($).
function bookmarksPorts($: EngineInterface): BookmarksPorts {
  return {
    log: (line, text) => log($, line, text ? { text: true } : undefined),
    logAlways: line => log($, line, { always: true }),
    toast: (text, timeoutMs) => (timeoutMs ? $.ui.toast(text, { timeoutMs }) : $.ui.toast(text)),
    cut,
    expectRedraw,
    dataRoot: () => dataRoot($),
    sessionId: () => $.session.id(),
    cwd: () => $.session.cwd(),
    title: () => conversationTitle($),
    pluginName: $.plugin.name,
    pluginVersion: () => pluginVersion($),
    configDir: () => configDir($),
    now: () => $.clock.now(),
    after: (ms, fn) => $.clock.after(ms, fn),
    fsExists: path => $.fs.exists(path),
    fsRead: path => $.fs.read(path),
    fsWrite: (path, text) => $.fs.write(path, text),
    fsList: path => $.fs.list(path),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    storeDelete: key => $.store.delete(key),
    storeKeys: () => $.store.keys(),
    resolveTarget: want => resolveTarget($, want),
    transcriptPath: () => transcriptPath($),
    allRows: () => allRows($),
    jumpTo: (uuid, via, label, words) => jumpTo($, uuid, via, label, words),
    loadMarks: () => loadMarks($),
    copy: text => $.ui.copy({ text }),
    highlightWords: (letter, uuid, words) => marks_.showWords(marksPorts($), letter, uuid, words),
  }
}

// How link kinds are told apart in a reply (djdarcy, 2026-10-09: "how can we denote that
// a link has secondary metadata ... so I don't have to ctrl-click every link"). Settings
// in a later version (#7); constants until then.
const LINK_MARKERS: MarkerStyle = 'glyph'
const LINK_LEGEND = true

// Replies whose links were already logged and queued (a reply is drawn many times).
const anchorRowsLogged = new Set<string>()

// Every jump, the jumplist and the view's return: handlers/navigation.ts, over these ports.
const navigation = new Navigation()
function navPorts($: EngineInterface): NavigationPorts {
  return {
    sessionId: () => $.session.id(),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    scroll: (uuid, block) => $.ui.scroll({ to: { requestId: uuid }, block }),
    copy: text => $.ui.copy({ text }),
    toast: (text, timeoutMs) => (timeoutMs ? $.ui.toast(text, { timeoutMs }) : $.ui.toast(text)),
    log: (line, text) => log($, line, text ? { text: true } : undefined),
    note,
    drawnHead: uuid => drawn.texts.get(uuid),
    markHead: uuid => markCache.headOf(uuid),
    leavingFrom: async () => panePosition.view ?? (await viewAnchor($)),
    paneJumped: () => panePosition.jumped(),
    takeRestore: () => panePosition.takeRestore(),
    freshOnScreen,
  }
}
async function jumplistMove($: EngineInterface, step: -1 | 1) {
  await navigation.jumplistMove(navPorts($), step)
}
async function jumpTo($: EngineInterface, uuid: string, via: string, label: string, words?: string, probe = false, block: 'start' | 'end' = 'start'): Promise<string | undefined> {
  return navigation.jumpTo(navPorts($), uuid, via, label, words, probe, block)
}

// Where the view was before a pane opened, and where it goes back to: core/kit/pane-position.ts
// (the three fields and their writers, each a named method).
const panePosition = new PanePosition()
async function restoreView($: EngineInterface) {
  await navigation.restoreView(navPorts($))
}

async function setMark($: EngineInterface, letter: string) {
  await marks_.setMark(marksPorts($), letter)
}

// The view tracker (handlers/view-tracker.ts) owns which messages are on screen in
// conversation order, the prompt nearest the view, the view anchor and the pane's
// follow; it reads the screen model. Its ports are spelled once here.
const viewTracker = new ViewTracker(screen)
function viewPorts($: EngineInterface): ViewPorts {
  return {
    prompts: () => prompts($),
    rows: () => allRows($),
    log: line => log($, line),
    closeShare: () => currentSettings().closeShare,
    after: (ms, fn) => $.clock.after(ms, fn),
    listPaneOpen: async () => (await read($, paneMode)) === 'list' && (await $.ui.panes()).some(p => p.id === PANE),
    heldChannel: () => logger.channels.has('held'),
    bumpView: () => update($, viewRev, v => v + 1),
    followHere: () => currentSettings().followHere,
    bandNumEmpty: async () => (await read($, bandNum)) === '',
    scrollPaneTo: key => $.ui.scroll({ in: PANE, to: { key }, block: 'nearest' }),
  }
}
async function topOnScreen($: EngineInterface): Promise<string | undefined> {
  return viewTracker.topOnScreen(viewPorts($))
}

async function promptHere($: EngineInterface): Promise<string | undefined> {
  return viewTracker.promptHere(viewPorts($))
}
// The prompts pane's own state -- the filter, the unfolded footnotes, the prompt to centre
// on -- is core/prompts/prompts-pane-state.ts PromptsPaneState, written only through its
// named methods.
const promptsPane = new PromptsPaneState()
function noteViewMoved($: EngineInterface) {
  viewTracker.noteViewMoved(viewPorts($))
}
async function viewAnchor($: EngineInterface): Promise<{ uuid: string; block: 'start' | 'end' } | undefined> {
  return viewTracker.viewAnchor(viewPorts($))
}

async function goToReading($: EngineInterface, reading: Mark, via: string) {
  await marks_.goToReading(marksPorts($), reading, via)
}
async function readingToggle($: EngineInterface) {
  await marks_.readingToggle(marksPorts($))
}
async function jumpToMark($: EngineInterface, letter: string, probe = false): Promise<string | undefined> {
  return marks_.jumpToMark(marksPorts($), letter, probe)
}

// --- The band's command line -----------------------------------------------------------
// The band's command line (the field the leader lands on, and `perform`) is
// handlers/command-line.ts.
// The borrowed engine action each chord command's button carries while chords are on.
const CHORD_ACTION: Record<Chord, string> = { mark: MARK_ACTION, jump: JUMP_ACTION, prompts: PROMPTS_ACTION, read: READING_ACTION }

// Draw the field anew, empty.
async function clearCommandLine($: EngineInterface) {
  await update($, cmdRev, v => v + 1)
}

// The band's own state -- its wait and watch timers, the focus ring, its requestId, the
// Esc reminder -- is core/band/band-state.ts BandState, written only through its named methods.
const band = new BandState()
async function runCommandLine($: EngineInterface, typed: string, via: 'input' | 'submit') {
  await sameConversation($)
  await commandLine.runCommandLine(commandLinePorts($), typed, via)
}
async function perform($: EngineInterface, operation: Operation, via: 'field' | string) {
  await commandLine.perform(commandLinePorts($), operation, via)
}

async function closeAll($: EngineInterface, via: string) {
  await bandCloseAll(bandPorts($), via)
}

// DIAGNOSTIC (2026-10-07): who holds the keyboard around a key, to explain a pane that is
// kept or refused. Lengths only, never the draft's text. Keystrokes are logged only
// while /bm-diag-keys is on.
const diag = { lastEditAt: 0, busy: false, logKeys: false }
async function diagState($: EngineInterface, when: string) {
  log($, diagLine(when, (await $.prompt.read()).text.length, diag.lastEditAt, Date.now(), diag.busy, await $.ui.panes()))
}

async function openFor($: EngineInterface, mode: PaneMode, action: string) {
  await band_.openFor(bandPorts($), mode, action)
}


// Jumps to prompt #n, from the prompts pane's field or the band's.
// --- Pinned prompts ------------------------------------------------------------------
// Favourite prompts to come back to (djdarcy, 2026-10-05), per conversation, kept in
// the order they were pinned. Drawn as `245★)` and listed again at the top of the
// prompts pane. Toggled by `*21` (or `*` for the newest) in the `#` field, or /bm-pin.
// Since 0.5.4 the pins live in the register file (the data design, 2026-10-16: pins are
// authored, so they are the person's and not Claude Code's housekeeping); the v1 -> v2
// migration moves them out of the store (`pins:<sid>`, core/store-keys.ts) at the
// conversation's start. handlers/bookmarks.ts owns the read and the toggle.
async function loadPins($: EngineInterface): Promise<string[]> {
  return bookmarks_.pinnedPrompts(bookmarksPorts($))
}

// Toggles the pin on prompt #n (the newest when `typed` names none). Returns false when
// there is no such prompt. `known`: the list the caller already read (move audit F6).
async function togglePin($: EngineInterface, typed: string, known?: PromptRef[]): Promise<boolean> {
  const all = known ?? (await prompts($))
  const n = listPosition(typed, all.length, true)
  const target = n === undefined ? undefined : all[n - 1]
  if (!target) {
    $.ui.toast(`no prompt #${typed.trim()} (1-${all.length})`)
    return false
  }
  const pins = await loadPins($)
  const pinned = pins.includes(target.uuid)
  const r = await bookmarks_.togglePinned(bookmarksPorts($), target.uuid, !pinned)
  if ('error' in r) {
    $.ui.toast(r.error, { timeoutMs: 8000 })
    return false
  }
  await update($, pinsRev, v => v + 1)
  $.ui.toast(`${pinned ? 'unpinned' : 'pinned'} #${n}: ${target.head.slice(0, 40)}`)
  log($, `[bm] ${pinned ? 'unpinned' : 'pinned'} prompt #${n} ${short(target.uuid)}`)
  return true
}

// What the entry means (pin, filter, unfold, footnote, jump): core/band/band-entry.ts promptEntry.
async function jumpToPromptNumber($: EngineInterface, typed: string, via: string) {
  const all = await prompts($)
  const entry = promptEntry(typed, all.length)
  if (entry.kind === 'pin') {
    await togglePin($, entry.typed, all)
    return
  }
  if (entry.kind === 'filter') {
    promptsPane.setFilter(entry.words)
    await update($, viewRev, v => v + 1)
    return
  }
  if (entry.kind === 'unfold') {
    // Hidden footnotes: `N.k` still jumps (djdarcy, 2026-10-12: "Rows hidden, keys work"),
    // but `N.` has nothing to show, so it says why.
    if (currentSettings().footnotes === 'hidden') return void $.ui.toast('Footnotes are hidden: "Footnotes in the prompts list" in /config shows them')
    promptsPane.toggleFold(entry.n)
    await update($, viewRev, v => v + 1)
    return
  }
  if (entry.kind === 'footnote') {
    const f = footnoteAt(all.map(p => p.uuid), await keptFootnotes($), entry.n, entry.k)
    if (!f) {
      $.ui.toast(`no footnote ${entry.n}.${entry.k}`)
      return
    }
    await jumpTo($, f.uuid, via, `footnote ${entry.n}.${entry.k}`)
    await settle($, 'list', 'jump')
    return
  }
  if (entry.kind === 'invalid') {
    $.ui.toast(`no prompt #${entry.typed} (1-${all.length})`)
    return
  }
  const target = all[entry.n - 1]!
  await jumpTo($, target.uuid, via, `prompt #${entry.n}`, target.head)
  await settle($, 'list', 'jump')
}

// Bookmarks in the pane and the band: the list, a bookmark's arrival and its highlight
// are handlers/bookmarks.ts.
async function bookmarkList($: EngineInterface) {
  return bookmarks_.bookmarkList(bookmarksPorts($))
}
async function arriveAtBookmark($: EngineInterface, record: { uuid: string; words?: string; label: string }, via: string): Promise<string | undefined> {
  return bookmarks_.arriveAtBookmark(bookmarksPorts($), record, via)
}

// Cycle the bookmarks pane's group from the band: yours -> Claude's -> all -> yours.
async function bandGroupStep($: EngineInterface, step: -1 | 1) {
  await update($, bandGroup, g => nextGroup(g, step, BOOKMARK_GROUPS.length))
  band_.keepBandWaiting(bandPorts($))
}

async function jumpToBookmarkNumber($: EngineInterface, typed: string, via: string) {
  const all = await bookmarkList($)
  const n = listPosition(typed, all.length)
  const target = n === undefined ? undefined : all[n - 1]
  if (!target) {
    $.ui.toast(`no bookmark #${typed.trim()} (1-${all.length})`)
    return
  }
  await arriveAtBookmark($, target, via)
  await settle($, 'bookmarks', 'jump')
}

async function promoteLetter($: EngineInterface, letter: string) {
  await bookmarks_.promoteLetter(bookmarksPorts($), letter)
}


// Set by the pane's render hook (which may not write state): the placement and width
// the surface actually gave it, logged when it closes.
let paneGeometry: string | undefined

// The band cluster's close path is handlers/band.ts, over these ports.
function bandPorts($: EngineInterface): BandPorts {
  return {
    band,
    settings: currentSettings,
    bandNum: () => read($, bandNum),
    setBandNum: v => update($, bandNum, () => v),
    bandMode: () => read($, bandMode),
    setBandMode: v => update($, bandMode, () => v),
    paneId: PANE,
    panes: () => $.ui.panes(),
    closePaneUi: () => $.ui.close({ id: PANE }),
    expectRedraw,
    note,
    log: (line, text) => log($, line, text ? { text: true } : undefined),
    paneGeometry: () => paneGeometry,
    paneAnchored: () => !!panePosition.anchor,
    restoreView: () => restoreView($),
    paneMode: () => read($, paneMode),
    prompts: () => prompts($),
    bookmarkList: () => bookmarkList($),
    jumpToPromptNumber: (typed, via) => jumpToPromptNumber($, typed, via),
    jumpToBookmarkNumber: (typed, via) => jumpToBookmarkNumber($, typed, via),
    scrollPaneCentre: key => $.ui.scroll({ in: PANE, to: { key }, block: 'center' }),
    toast: (text, timeoutMs) => (timeoutMs ? $.ui.toast(text, { timeoutMs }) : $.ui.toast(text)),
    togglePin: typed => togglePin($, typed),
    groupStep: dir => bandGroupStep($, dir),
    claimBookmark: uuid => bookmarks_.claimBookmark(bookmarksPorts($), uuid),
    now: () => $.clock.now(),
    after: (ms, fn) => $.clock.after(ms, fn),
    focus: (requestId, key) => $.ui.focus({ requestId, key }),
    loadMarks: () => loadMarks($),
    letters: LETTERS,
    readingLetter: READING,
    every: (ms, fn) => $.clock.every(ms, fn),
    diagState: when => diagState($, when),
    setPaneMode: mode => update($, paneMode, () => mode as PaneMode),
    topOnScreen: () => topOnScreen($),
    viewAnchor: () => viewAnchor($),
    promptHere: () => promptHere($),
    paneOpened: (anchor, view) => panePosition.opened(anchor, view),
    paneView: () => panePosition.view,
    openPane: async title =>
      (await $.ui.open({ id: PANE, title, focus: true, closeOnEscape: true, columns: 16, rows: 4 })) as
        { isPlaced?: boolean; reason?: string } | undefined,
    openPaneFocused: title => $.ui.open({ id: PANE, title, focus: true, closeOnEscape: true }),
    setBandGroup: index => update($, bandGroup, () => index),
    scroll: (uuid, block) => $.ui.scroll({ to: { requestId: uuid }, block }),
    setPendingCentre: uuid => promptsPane.centreOnNextDraw(uuid),
    selection: () => $.ui.selection(),
    setSelectionAtChord: sel => markState.setAtChord(sel),
    draftText: async () => (await $.prompt.read()).text,
    cut,
  }
}
function commandLinePorts($: EngineInterface): CommandLinePorts {
  return {
    ...bandPorts($),
    clearCommandLine: () => clearCommandLine($),
    setBandGroup: group => update($, bandGroup, () => group),
    jumpToMark: letter => jumpToMark($, letter),
    readingToggle: () => readingToggle($),
    promoteLetter: letter => promoteLetter($, letter),
    jumplistMove: dir => jumplistMove($, dir),
  }
}
async function settle($: EngineInterface, pane: Pane, cause: Cause, needsMore = false) {
  return bandSettle(bandPorts($), pane, cause, needsMore)
}

// An action and what it leaves behind, named once, so a render hook gathers what it draws
// and hands the press here rather than deciding the sequence itself (advisor row R18).
// A mark set from the band or the marks pane: then the after-action rule, then the view
// back to where the highlight found it.
async function markThenSettle($: EngineInterface, pane: Pane, letter: string) {
  await setMark($, letter)
  await settle($, pane, 'mark-set')
  await restoreView($)
}
// A jump to a mark: the marks pane also puts the view back (`restoreAfter`); the band's
// jump does not. The difference is the one the two had before this was named.
async function jumpToMarkThenSettle($: EngineInterface, pane: Pane, letter: string, restoreAfter: boolean) {
  await jumpToMark($, letter)
  await settle($, pane, 'jump')
  if (restoreAfter) await restoreView($)
}
// A press on a row of the prompts list (a prompt or a footnote).
async function pressPromptRow($: EngineInterface, uuid: string, label: string, words?: string) {
  await jumpTo($, uuid, 'prompts pane', label, words)
  await settle($, 'list', 'row-press')
}
// A press on a row of the bookmarks list.
async function pressBookmarkRow($: EngineInterface, record: { uuid: string; words?: string; label: string }) {
  await arriveAtBookmark($, record, 'bookmarks pane')
  await settle($, 'bookmarks', 'row-press')
}
async function endBandMode($: EngineInterface) {
  await bandEnd(bandPorts($))
}

// The engine, as the diagnostic commands may hold it (hooks/engine/ports.ts): one closure
// per primitive, each spelled `$.noun.event(...)` here, where the validator follows `$`.
function diagnosticsPorts($: EngineInterface): DiagnosticsPorts {
  return {
    log: (line, always, text) => log($, line, always || text ? { ...(always ? { always: true } : {}), ...(text ? { text: true } : {}) } : undefined),
    prompts: () => prompts($),
    rows: () => allRows($),
    marks: () => loadMarks($),
    jumpTo: (uuid, via, label) => jumpTo($, uuid, via, label),
    rendered: () => drawn.texts,
    timeline: () => logger.timeline.items,
    note,
    selection: () => $.ui.selection(),
    cut,
    settings: () => settings.resolved(),
    folderBuild: !installedFromCache($.plugin.root),
    pluginName: $.plugin.name,
    configKeys: async () => (await $.config.list().catch(() => [])).map(row => row.key),
    claudeVersion: async () => (await $.session.version()).version,
    pluginVersion: () => pluginVersion($),
    sessionId: () => $.session.id(),
    dccPatcher: () => $.env.get('DCC_PATCHER'),
    dccPatchH: () => $.env.get('DCC_PATCH_H'),
    dccPatches: () => $.env.get('DCC_PATCHES'),
    echoState: () => log_.echoStateLine(echoPorts($)),
  }
}

export const register: Register = (on, options) => {
  settings.loaded(options)

  // A change in /config to one of this plugin's fields: keep the values current and
  // redraw what reads them (settingsRev), whether or not Claude Code also reloads us.
  on('config.set', { key: /^bookmarks\./ }, async ($, e, next) => {
    const result = await next(e)
    if (!result.deny) {
      settings.changed(e.key.slice('bookmarks.'.length), result.value)
      // A smaller text budget frees memory and store now, not at the next prompt.
      if (e.key === 'bookmarks.promptTextBudget') await prompts_.savePromptTexts(promptsPorts($))
      await update($, settingsRev, v => v + 1)
    }
    return result
  })
  // The theme decides the mark band's light or dark value (#27).
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (!result.deny) {
      settings.themeIs(String(result.value))
      await update($, settingsRev, v => v + 1)
    }
    return result
  })

  on('session.start', async ($, e, next) => {
    // A session start is a conversation boundary (a new conversation, /clear, /resume)
    // in a process whose module state outlives it; what belonged to the conversation
    // that ended goes back to its defaults (test-plan 2026-10-12__15-25-30, row M).
    // Since 0.4.67 each cluster resets its own below (startRegister, startMarks), and the
    // register in memory is held per conversation (0.4.65); the panes' and the band's are here.
    // Corrected 0.4.75 (Q261014-01): session.start runs once per process and once per fresh
    // load of the plugin (a reload, an enable), "never /clear", and no session.start fires
    // after a resume (the engine's types, 2.1.296). So a new conversation is noticed by its
    // id instead (sameConversation, below); these resets stay for a reload, and the
    // conversation the process starts in is noted.
    conversationId = await $.session.id()
    // The start event's type carries no title today (only the SessionStart hook input does); read it if a build adds it.
    const started = e as unknown as { session_title?: unknown }
    sessionTitle = typeof started.session_title === 'string' ? started.session_title : undefined
    await resetConversationMemory()
    void $.config.list().then(rows => {
      const theme = rows.find(r => r.key === 'theme')?.value
      if (typeof theme === 'string') settings.themeIs(theme)
    }).catch(() => {})
    // The command table is core/band/commands.ts.
    for (const [name, description] of COMMANDS) {
      await $.command.register({ name, description, immediate: true })
    }

    // The model's tool: what it takes and how it answers is core/bookmarks/bookmark-tool.ts.
    try {
      const t = await $.tool.register(BOOKMARK_TOOL)
      log($, `[bm] tool registered: ${t.tool}`)
    } catch (err) {
      log($, `[bm] tool.register failed: ${String(err)}`, { always: true })
    }
    // Each cluster's own part of a conversation's start: handlers/bookmarks.ts (the
    // register), handlers/marks.ts (the marks and the selection poll).
    await bookmarks_.startRegister(bookmarksPorts($))
    await marks_.startMarks(marksPorts($))
    // Not awaited: session start should not wait on a third of a second of PowerShell.
    pruneThenBackfill($)

    // The tracking mechanism for the borrowed actions: say so whenever the build is
    // not one the chords were verified on.
    const v = await $.session.version()
    if (!VERIFIED_CLIENTS.includes(v.base ?? v.version)) {
      $.ui.toast(
        `${$.plugin.name} ${await pluginVersion($)}: chords verified on Claude Code ` +
          `${VERIFIED_CLIENTS.join(', ')}; this is ${v.version}`,
      )
    }
    return next(e)
  })

  // A conversation ends at /clear, a resume, or an exit (`e.reason`). After the engine's
  // end step the process may already be under the next conversation's id: if so, reset now
  // rather than at the next look (sameConversation). Never in the way of the end itself.
  on('session.end', async ($, e, next) => {
    const ended = await next(e)
    if (e.reason === 'clear' || e.reason === 'resume') await sameConversation($).catch(() => {})
    return ended
  })

  // The next prompt ends the temporary highlight.
  on('prompt.submit', async ($, e, next) => {
    await sameConversation($)
    await marks_.clearShown(marksPorts($))
    await endBandMode($)
    return next(e)
  })

  // Leaving the band's key mode without picking anything (djdarcy, 2026-10-05: "it
  // gets stranded if I don't actually want to jump"). Esc hands the keyboard back to
  // the prompt, but no event says so: ui.focus covers moves within the band only. So
  // the first edit in the prompt box ends the mode and closes the pane; the edit
  // itself goes through untouched.
  on('prompt.edit', async ($, e, next) => {
    const now = Date.now()
    // Typing in the input box: the person has the keyboard back, no reminder owed.
    band.oweReminder(false)
    if (diag.logKeys) {
      log($, `[diag] edit ${keyLabel(e.key)}: draft ${e.text.length} -> +${e.inputText.length}, ${diag.lastEditAt ? now - diag.lastEditAt : '-'} ms since last`)
    }
    diag.lastEditAt = now
    const mode = await read($, bandMode)
    if (mode !== 'idle') {
      // A list may stay open beside the input box (paneWhileTyping); the mark and jump
      // panes were waiting for a letter the person has stopped typing.
      const outcome = await settle($, paneOf(mode), 'prompt-edit')
      log($, `[bm] prompt edited while the band waited for a key: band ended, pane ${outcome.pane === 'close' ? 'closed' : 'kept'}`)
    }
    return next(e)
  })

  // Where the band's focus ring is, so the keyboard probe (watchBand) aims at the
  // element already holding it and never moves the ring.
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    // A focus move of the person's own onto the band starts a new command: no reminder owed.
    if (e.origin.kind === 'person') band.oweReminder(false)
    // While the band is idle, the person's focus moves stay on the command field. After
    // a command the band keeps the keyboard (a plugin can't hand it back; Esc does), so
    // a second Ctrl+] moved the ring onto the `mark` button, Space pressed it, and Enter
    // marked `a` (djdarcy, 2026-10-07; log 08:10:23). Clicks and chords still press the
    // buttons; only the ring is kept on the field.
    // The arrows in the band's prompt mode: they move the ring (they can't be hotkeys),
    // so a move off `go` onto its neighbour is read as a step through the pane's list,
    // k (previous: Up, Left, Shift+Tab) or j (next: Down, Right, Tab), and the ring
    // stays on `go` for Enter (djdarcy, 2026-10-07: "we'd of course also want to add
    // <up> <down> if possible").
    if (e.origin.kind === 'person' && band.ring === 'band-num-go' && (await read($, bandMode)) === 'list' &&
        (e.element === 'band-num-k' || e.element === 'band-num-j')) {
      log($, `[bm] band arrow -> ${e.element === 'band-num-k' ? 'k (up)' : 'j (down)'}`)
      await band_.bandStep(bandPorts($), e.element === 'band-num-k' ? -1 : 1)
      return next({ ...e, element: 'band-num-go' })
    }
    if (e.origin.kind === 'person' && e.element?.startsWith('chord-') && (await read($, bandMode)) === 'idle') {
      const field = `band-cmd-${await read($, cmdRev)}`
      log($, `[bm] band focus kept on the command field (not ${e.element})`)
      band.ringMoved(field)
      return next({ ...e, element: field })
    }
    if (e.element) band.ringMoved(e.element)
    return next(e)
  })

  // The person closed the pane (its close mark, or Ctrl+X x): end the band's key mode too.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    // Esc with a filter active (#28): the first clears the filter, the second closes.
    if (e.origin.kind === 'person' && promptsPane.filter) {
      log($, '[bm] Esc cleared the prompts filter; the pane stays')
      promptsPane.setFilter('')
      await update($, viewRev, v => v + 1)
      return { deny: 'the prompts filter was cleared; Esc again closes the list' }
    }
    await endBandMode($)
    const closed = await next(e)
    // The person closed it (Esc, its ×) without picking anything: back to where the view
    // was before the pane opened, if Claude Code allows the scroll from here.
    if (e.origin.kind === 'person' && panePosition.anchor) await restoreView($)
    return closed
  })

  on('command.run', { command: 'bm-diag-keys' }, async ($, e) => {
    const arg = e.args.trim()
    diag.logKeys = arg === 'on' ? true : arg === 'off' ? false : !diag.logKeys
    log($, `[diag] keystroke logging ${diag.logKeys ? 'ON' : 'OFF'}`)
    $.ui.toast(`bookmarks: keystroke logging ${diag.logKeys ? 'on' : 'off'}`)
    return {}
  })
  on('turn.start', async ($, e, next) => {
    diag.busy = true
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    diag.busy = false
    return next(e)
  })
  // Every focus move in the band or a pane, and whether it was refused.
  on('ui.focus', async ($, e, next) => {
    const r = await next(e)
    const deny = r && typeof r === 'object' && 'deny' in r && r.deny ? ` DENY ${String(r.deny)}` : ''
    log($, `[diag] focus ${e.component} -> ${e.element ?? '(engine stop)'} by ${e.origin.kind}${deny}`)
    return r
  })

  // Every row stored in the main conversation passes here with its transcript uuid.
  on('session.append', async ($, e, next) => {
    await sameConversation($)
    const stored = await next(e)
    // A new message is drawn at the bottom and reported whole, wherever the person is
    // reading; an append is one of the causes the redraw rule waits for (22:57Z: each of
    // Claude's replies flipped the yellow from #324 to the newest prompt).
    if (!e.agentId) expectRedraw('a message appended')
    const isWanted = e.door === 'prompt' || e.door === 'response'
    // A message typed while Claude was working arrives as an attachment named
    // `queued_command`, its text wrapped in the engine's reminder prose (the transcript
    // keeps the raw text in `attachment.prompt`, which this event does not carry). It is
    // the person's prompt: unwrap it and keep it as one (djdarcy, 2026-10-11).
    const queued = !e.agentId && e.message.type === 'attachment' && e.message.name === 'queued_command'
    // Not the person's: the engine stamps who caused the row. A background task's notice,
    // a scheduled firing, another session's message, a coordinator or observer: none is a
    // prompt (djdarcy, 2026-10-12: the list shows "genuine user inputs, full stop"). A
    // notice queued into a running turn is stamped `engine`, as the person's own queued
    // message is; its text tells them apart (NOT_A_PROMPT, core/prompts/prompt-rows.ts).
    const automated = AUTOMATED_ORIGINS.has(e.origin.kind)
    if (!automated && (queued || (!e.agentId && isWanted && !e.message.isMeta))) {
      const raw = e.message.content.map(block => (block.type === 'text' ? block.text : '')).join(' ')
      const text = queued ? unwrapQueued(raw) : raw
      if (looksLikePrompt(text)) {
        // `text` (first 4000 chars) lets a selection mark check it landed in the right row.
        // A queued message arrives by the `attachment` door; it is a prompt (0.4.0 stored it
        // under the engine's door, so the list, which counts `prompt` rows, dropped every one).
        const row: Row = { uuid: e.uuid, door: (queued ? 'prompt' : e.door) as Row['door'], head: headOf(text), text: text.slice(0, 4000) }
        note(`append ${e.door} ${e.uuid} ${row.head.slice(0, 30)}`)
        await update($, rows, list => [...(list as Row[]), row].slice(-500))
        if (row.door === 'prompt') {
          await prompts_.keepPrompt(promptsPorts($), { uuid: row.uuid, head: row.head })
          await prompts_.keepPromptText(promptsPorts($), row.uuid, text)
        }
      }
    }
    // A footnote (#33): the person's slash command, `!` shell command or interruption,
    // kept with the prompt it follows, as the back-fill keeps it. A row the person did not
    // cause is no footnote either: a /loop firing runs a slash command (2026-10-15: 535 of
    // the 671 stored footnotes were firings).
    if (!automated && !e.agentId && !queued && e.door !== 'response') {
      const fn = footnoteOf({ type: 'user', isMeta: e.message.isMeta, message: { content: e.message.content } })
      if (fn) await prompts_.keepFootnote(promptsPorts($), { ...fn, uuid: e.uuid, after: (await keptPrompts($)).at(-1)?.uuid ?? null })
    }
    return stored
  })

  // The other transcript rows that report onScreen (see otherOnScreen): observe only, so
  // a screen full of tool rows still tells the pane the view moved.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => { noteOtherRow($, 'TU', e.requestId, e.props.onScreen); return next(e) })
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => { noteOtherRow($, 'TR', e.requestId, e.props.onScreen); return next(e) })
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => { noteOtherRow($, 'TG', e.requestId, e.props.onScreen); return next(e) })
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => { noteOtherRow($, 'CO', e.requestId, e.props.onScreen); return next(e) })
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => { noteOtherRow($, 'TD', e.requestId, e.props.onScreen); return next(e) })
  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => { noteOtherRow($, 'IN', e.requestId, e.props.onScreen); return next(e) })

  // Observe only: note the id, draw nothing different.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    rawScreen($, 'U', e.requestId, e.props.onScreen)
    noteOnScreen(e.requestId, e.props.onScreen)
    noteViewMoved($)
    if (!drawn.texts.has(e.requestId)) {
      const text = headOf(e.props.text ?? '')
      drawn.note(e.requestId, text)
      note(`draw UserMessage ${e.requestId} ${text.slice(0, 30)}`)
    }
    // The mark highlight: a prompt row is plain text, so the mark shows as a «a» tag
    // in front of the selected words. Display only -- the model never reads it.
    const text = e.props.text ?? ''
    const onRow = marksOnRow(e.requestId, (await read($, shown))?.letter)
    // A prompt row drawn in colour, as a reply's marked line is (2026-10-09, for anchor
    // presses: "highlighted yellow like a mark"). The lines before the marked one keep
    // the engine's prompt styling; the marked line and the rest are drawn here.
    const [first] = onRow
    const colored = first && colorSplit(text, first[0], first[1].snippet)
    if (colored) {
      const elements = $.ui.resolve(e)
      const { Text } = elements
      const engine = colored.before ? await next({ ...e, props: { ...e.props, text: colored.before } }) : null
      return markedColumn(elements, colored, engine, colored.after && <Text>{colored.after}</Text>, markStyles())
    }
    const marked = tagMarksPlain(text, onRow)
    return marked === text ? next(e) : next({ ...e, props: { ...e.props, text: marked } })
  })

  // The mark highlight: a reply's text is markdown, so the marked words are drawn bold with
  // a «a» tag. When the selection (rendered text) doesn't match the markdown source
  // literally, the tag goes on a line of its own at the top of the block instead, which
  // is where a jump lands. Only rows carrying a mark are touched.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    rawScreen($, 'A', e.requestId, e.props.onScreen)
    noteOnScreen(e.requestId, e.props.onScreen)
    noteViewMoved($)

    // Bookmark links (anchors DWP, 2026-10-09): a reply carrying bookmark-anchor links is
    // drawn as the mod's own Markdown, so a plain click on such a link reaches the mod
    // (onLinkPress) and tries the jump; the log says what the engine answered. A ctrl-click
    // stays the terminal's own open. Replies without anchors take the usual path below.
    const links = markdownLinks(e.props.text)
    const anchors = links.filter(l => l.kind === 'anchor')
    const marksHere = marksOnRow(e.requestId, (await read($, shown))?.letter)
    // The drawing is views/marked-message.tsx (anchoredReply, markedReply); this hook
    // gathers what it draws.
    if (anchors.length > 0) {
      if (!anchorRowsLogged.has(e.requestId)) {
        anchorRowsLogged.add(e.requestId)
        log($, `[bm] reply ${short(e.requestId)}: ${anchors.length} bookmark link(s), ${links.filter(l => l.kind === 'file').length} file link(s)`)
        bookmarks_.queueProseAnchors(bookmarksPorts($), anchors)
      }
      // A perma record's link is drawn without the bookmark glyph (#21).
      const reg = await bookmarks_.loadRegister(bookmarksPorts($))
      const isPerma = (href: string) => {
        const a = parseAnchor(href)
        const r = a && findRecord(reg, a.uuid)
        return r ? tierOf(r) === 'perma' : false
      }
      const [first] = marksHere
      const colored = first && colorSplit(e.props.text, first[0], first[1].snippet)
      // A mark whose words don't sit on one line: the bold «a» form (core/marks/highlight.ts).
      const text = tagMarksMarkdown(e.props.text, marksHere)
      return anchoredReply(
        $.ui.resolve(e),
        {
          keyBase: e.requestId,
          markText: t => markLinks(t, LINK_MARKERS, isPerma),
          pressable: anchors.map(a => a.href),
          colored: colored || undefined,
          boldText: text,
          legend: LINK_LEGEND ? { glyph: LINK_MARKERS === 'glyph', hasFile: links.some(l => l.kind === 'file') } : null,
        },
        href => bookmarks_.onAnchorPress(bookmarksPorts($), href),
        { ...markStyles(), legend: style('legend') },
      )
    }

    const marks = marksHere
    if (marks.length === 0) return next(e)

    // Draw the marked LINE ourselves, so it can carry a background and the selected
    // words a color (markdown has neither). The part before it still goes to the engine
    // (keeps the reply's bullet and formatting); the part after is drawn with the
    // Markdown element. Any case this split could mangle falls through to the bold
    // rewrite below.
    const [first] = marks
    const colored = first && colorSplit(e.props.text, first[0], first[1].snippet)
    if (colored) {
      const engine = colored.before ? await next({ ...e, props: { ...e.props, text: colored.before } }) : null
      return markedReply($.ui.resolve(e), colored, engine, markStyles())
    }

    return next({ ...e, props: { ...e.props, text: tagMarksMarkdown(e.props.text, marks) } })
  })

  // The diagnostic commands live in hooks/handlers/diagnostics-commands.ts over
  // diagnosticsPorts($), a top-level function (the validator follows $ only into those).
  on('command.run', { command: 'bm-ids' }, async $ => {
    await idsCommand(diagnosticsPorts($))
    return {}
  })

  on('command.run', { command: 'bm-pin' }, async ($, e) => {
    await togglePin($, e.args.replace(/^#/, ''))
    return {}
  })

  on('command.run', { command: 'bm-jump' }, async ($, e) => {
    await jumpCommand(diagnosticsPorts($), e.args)
    return {}
  })

  // The leader (djdarcy, 2026-10-06): `<leader> m`, `<leader> '` / `j`, `<leader> p`,
  // `<leader> Space`, each a `command:` keybinding to one of these. A command, unlike
  // a band press, may give the pane the keyboard; openFor's band fallback still covers
  // the case where Claude Code refuses it (text in the input box).
  on('command.run', { command: 'bm-mark' }, async $ => {
    await openFor($, 'mark', 'command:bm-mark')
    return {}
  })
  on('command.run', { command: 'bm-goto' }, async $ => {
    await openFor($, 'jump', 'command:bm-goto')
    return {}
  })
  on('command.run', { command: 'bm-prompts' }, async $ => {
    await openFor($, 'list', 'command:bm-prompts')
    return {}
  })
  on('command.run', { command: 'bm-bookmarks' }, async $ => {
    await band_.bookmarksCommand(bandPorts($))
    return {}
  })
  on('command.run', { command: 'bm-promote' }, async ($, e) => {
    await bookmarks_.promoteCommand(bookmarksPorts($), e.args)
    return {}
  })
  on('command.run', { command: 'bm-read' }, async $ => {
    await readingToggle($)
    return {}
  })

  // /bm-pane: handlers/band.ts paneCommand.
  on('command.run', { command: 'bm-pane' }, async $ => {
    await band_.paneCommand(bandPorts($))
    return {}
  })

  // /bm-delmarks: handlers/marks.ts delmarksCommand.
  on('command.run', { command: 'bm-delmarks' }, async ($, e) => {
    await marks_.delmarksCommand(marksPorts($), e.args)
    return {}
  })

  on('command.run', { command: 'bm-marks' }, async $ => {
    await marksCommand(diagnosticsPorts($))
    return {}
  })
  on('command.run', { command: 'bm-sel' }, async $ => {
    await selCommand(diagnosticsPorts($))
    return {}
  })
  on('command.run', { command: 'bm-timeline' }, async ($, e) => {
    timelineCommand(e.args, diagnosticsPorts($))
    return {}
  })

  // The `bookmark` tool: answer the model's call. The engine strips
  // nothing from `e` for a plugin's own tool, so the arguments sit beside the envelope.
  // Matched by pattern, not by the literal name: the engine generates the tool-name type
  // from the manifest on a session start, so a rename leaves the literal red until then.
  // The model's tool call: handlers/bookmarks.ts.
  on('tool.call', { tool: /^mcp__bookmarks__bookmark$/ }, async ($, e) => bookmarks_.bookmarkTool(bookmarksPorts($), e))

  // /bm-debug lives in hooks/handlers/debug-command.ts; this is its ports (hooks/engine/ports.ts):
  // each engine call it needs, spelled here, where the validator follows `$`.
  on('command.run', { command: 'bm-debug' }, async ($, e) => {
    await debugCommand(e.args ?? '', {
      toast: text => $.ui.toast(text),
      log: (line, always) => log($, line, always ? { always: true } : undefined),
      channelsOn: () => {
        logger.channels.read(echoPorts($))
        return logger.channels.on
      },
      setChannels: next => logger.channels.set(echoPorts($), next as Set<Channel>),
      setSessionEcho: choice => log_.setSessionEcho(echoPorts($), choice),
      setEchoPolicy: policy => log_.setEchoPolicy(echoPorts($), policy),
      echoState: () => log_.echoStateLine(echoPorts($)),
      logPath: () => logger.files.path,
    })
    return {}
  })

  on('command.run', { command: 'bm-config' }, async $ => {
    await configCommand(diagnosticsPorts($))
    return {}
  })
  on('command.run', { command: 'bm-env' }, async $ => {
    await envCommand(diagnosticsPorts($))
    return {}
  })
  // /bm-check: a linter over the data root (handlers/bookmarks.ts checkCommand); reads only.
  on('command.run', { command: 'bm-check' }, async $ => {
    await bookmarks_.checkCommand(bookmarksPorts($))
    return {}
  })

  // The band, above the prompt: its Buttons carry the borrowed engine actions, so the
  // chords bound to those actions in keybindings.json press them from the input box.
  // (A copy on the hint line under the prompt was tried on 2026-10-04 and removed: it
  // sat below the status line, and the band reads better above the prompt.)
  // The band is drawn by views/band.tsx; this hook gathers what it draws (the model) and
  // what its presses do (the actions, closures over `$`).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    sameConversationSoon($)
    const elements = $.ui.resolve(e)
    const theirs = await next(e)
    const last = await read($, shown)
    band.drawn(e.requestId)
    const mode = await read($, bandMode)
    // From the cache (MarkCache, replaced after every mark write and at a start): a render hook reads no file.
    const marks = mode === 'idle' ? {} : markCache.all
    // What happens after the key: the after-action rule, by what the key did.
    const done = (cause: Cause) => settle($, paneOf(mode), cause)
    const s = currentSettings()
    const now = { leader: 'The leader (Ctrl+] by default)', chords: s.chords === 'on', panes: s.panes === 'on' }
    // The help must fit the band's window. Taller, it scrolls, and the keyboard probe
    // (showHelp) -- the only way to learn that Esc took the keyboard back -- focuses
    // `close`, which scrolls it back to the top; the arrows in the band scroll its
    // window without moving the ring (log 2026-10-12 18:02-18:09: no focus move onto a
    // help line). So a band too short for one line per command gets the short form.
    const full = helpLines(now)
    const help = full.length + 1 <= e.props.maxRows ? full : helpShort(now)
    const bookmarks = mode === 'bookmarks'
    const count = mode === 'list' || bookmarks ? (bookmarks ? (await bookmarkList($)).length : (await prompts($)).length) : 0
    const listKeys = listKeysFor(bookmarks ? 'bookmarks' : 'list').map(l => ({ key: l.key, button: l.button, operation: l.route().operation }))
    const groupTitle = bookmarks ? (BOOKMARK_GROUPS[await read($, bandGroup)]?.title ?? '') : ''
    const bar = s.band === 'full'
      ? bandButtons({ chords: s.chords === 'on' }).map(b => ({ id: b.id, label: b.label, key: b.key, ...(b.hotkey ? { hotkey: b.hotkey } : {}), ...(b.chord ? { action: CHORD_ACTION[b.chord] } : {}) }))
      : []
    return bandView(
      elements,
      theirs,
      // `typed` is drawn only in the list modes and `cmdRev` (the field's key) only in idle:
      // each is read, and so redraws the band, only where it is drawn (a mode change
      // redraws through bandMode). Move audit F4.
      {
        mode, shown: last, help, marks, letters: LETTERS, readingLetter: READING,
        typed: mode === 'list' || bookmarks ? await read($, bandNum) : '',
        count, groupTitle, listKeys, bar,
        cmdRev: mode === 'idle' ? await read($, cmdRev) : 0,
      },
      {
        endBandMode: () => endBandMode($),
        readingToggle: async () => { await readingToggle($); await done('band-command') },
        jumpToMark: l => jumpToMarkThenSettle($, paneOf(mode), l, false),
        setMark: l => markThenSettle($, paneOf(mode), l),
        cancel: () => done('esc'),
        listKey: op => band_.bandListKey(bandPorts($), op),
        digit: d => band_.bandDigit(bandPorts($), d),
        dot: () => band_.bandDot(bandPorts($)),
        go: () => band_.bandNumberGo(bandPorts($)),
        runCommandLine: (typed, kind) => runCommandLine($, typed, kind),
        perform: (key, id, action) => perform($, route(key, { pane: 'none' }).operation, action ?? `button:${id}`),
      },
      { text: style, button: buttonStyle },
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    sameConversationSoon($)
    const elements = $.ui.resolve(e)
    const mode = (await read($, paneMode)) as PaneMode
    // What the surface actually gave the pane, logged at close: says whether the
    // narrow request held or the engine has a minimum width.
    // For every pane kind since 0.4.81: it was written only below the list and bookmarks
    // branches, so closing a list logged the last mark pane's size (test-scenarios
    // 2026-10-14__02-07-49, S13).
    paneGeometry = `${e.props.placement}, ${e.props.bodyColumns} body columns`
    // The panes are drawn by views/prompts-pane.tsx, views/bookmarks-pane.tsx and
    // views/marks-pane.tsx; what they read, and what touches the engine, is here.
    const styles = { text: style, button: buttonStyle }

    if (mode === 'list') {
      const all = await prompts($)
      const kept = await keptFootnotes($)
      const footnoteMode = currentSettings().footnotes
      // Pinned prompts: listed first, in the order pinned, and starred in the full list
      // (drawn by views/prompts-pane.tsx; the reads below stay here so a change redraws).
      await read($, pinsRev) // read so a pin toggle redraws the pane
      await read($, viewRev) // and so a scroll that moves the nearest prompt redraws it
      const pinIds = await loadPins($)
      const texts = await prompts_.promptTexts(promptsPorts($))
      const fromBand = (await read($, bandMode)) === 'list' ? await read($, bandNum) : undefined
      // The prompt nearest the view, drawn with its number in yellow (djdarcy, 2026-10-11:
      // "so the user knows roughly where they are" and can read what they were thinking
      // above and below). Redrawn on every render, so it follows the view while the pane
      // is open.
      const here = await promptHere($)
      viewTracker.drewHere(here)
      // Centre the list on the nearest prompt once the rows below exist (set by
      // openFor). A timer, since a render hook may not scroll; by then the draw is done.
      // (The rows are views/prompts-pane.tsx's; openFor is handlers/band.ts's and sets
      // the centre through its setPendingCentre port.)
      const target = promptsPane.takeCentre()
      if (target) {
        // The rows are not scrollable-to the instant after the first draw (DENY "no
        // element of its own is drawn under that key" at +7 ms, 2026-10-11) but are a
        // few hundred ms later, when the follow scrolls succeed. Try at 60, 180, 420 and
        // 900 ms after the draw and stop at the first that lands.
        const attempt = (n: number) => {
          $.clock.after(60 * 2 ** n - (n === 0 ? 0 : 60), () => {
            void $.ui.scroll({ in: PANE, to: { key: `p-${target}` }, block: 'center' }).then(r => {
              if (r.deny && n < 3) return attempt(n + 1)
              log($, `[bm] prompts pane centred on ${short(target)} (nearest to the view) -> ${r.deny ? `DENY after ${n + 1} tries: ${r.deny}` : `ok (try ${n + 1})`}`)
            })
          })
        }
        attempt(0)
      }
      return promptsPaneView(
        elements,
        { all, kept, footnoteMode, unfolded: promptsPane.unfolded, drawnFour: drawn.firstFours, pinIds, texts, paneFilter: promptsPane.filter, fromBand, here },
        {
          unfold: async n => { promptsPane.unfold(n); await update($, viewRev, v => v + 1) },
          refold: async n => { promptsPane.refold(n); await update($, viewRev, v => v + 1) },
          footnote: (uuid, label) => pressPromptRow($, uuid, label),
          pressPrompt: r => pressPromptRow($, r.uuid, `prompt #${r.n}`, r.head),
          go: typed => jumpToPromptNumber($, typed, 'prompts pane'),
          close: () => closeAll($, 'prompts pane'),
          setFilter: query => {
            if (!promptsPane.setFilter(query)) return false
            log($, `[bm] prompts filter: "${cut(query, 40)}"`, { text: true })
            void update($, viewRev, v => v + 1)
            return true
          },
        },
        styles,
      )
    }

    if (mode === 'bookmarks') {
      const all = await bookmarkList($)
      const fromBand = (await read($, bandMode)) === 'bookmarks' ? await read($, bandNum) : undefined
      const groupIndex = await read($, bandGroup)
      return bookmarksPaneView(
        elements,
        { all, groups: BOOKMARK_GROUPS, groupIndex, fromBand, drawnFour: drawn.firstFours, now: Date.now(), glyph: LINK_MARKERS === 'glyph', hint: listHint('bookmarks') },
        {
          arrive: r => pressBookmarkRow($, r),
          go: typed => jumpToBookmarkNumber($, typed, 'bookmarks pane'),
          close: () => closeAll($, 'bookmarks pane'),
        },
        styles,
      )
    }

    const marks = markCache.all // the cache, never a file, in a render hook
    return marksPaneView(
      elements,
      { mode, marks, letters: LETTERS, readingLetter: READING },
      {
        press: l => (mode === 'mark' ? markThenSettle($, mode, l) : jumpToMarkThenSettle($, mode, l, true)),
        goToReading: async reading => {
          await goToReading($, reading, 'jump pane reading')
          await settle($, mode, 'band-command')
        },
      },
      styles,
    )
  })
}
