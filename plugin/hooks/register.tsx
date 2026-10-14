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
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { PaneMode, Row } from '../types'
import { describePathOrder } from './engine/select'
import {
  anchorHref, anchorMarkdown, anchorPath, markLinks, markdownLinks, ownerOf, parseAnchor, tierOf,
  type AnchorOwner, type AnchorRecord, type MarkerStyle,
} from './core/anchor'
import {
  addOrRelabel, claim, emptyRegister, exportMarkdown, exportNotesOf, findRecord, listOf, parseRegister, prune, remove, serializeRegister, share,
  type Mint, type Register as BookmarkRegister, type Retention,
} from './core/register-file'
import { headOf, jsonEscaped, resolveRows, rowsFromGrep, uuidPattern, type Resolution, type TranscriptRow } from './core/transcript-lines'
import { excerpt, formatDebugEnv, parseDebugEnv, quotesText, screenMirror, type Channel } from './core/debug'
import { bandButtons, helpLines, helpShort, listHint, listKeysFor, route, type Chord, type Operation, type Pane } from './core/keys'
import type { Cause } from './core/after-action'
import { debugTextMode, installedFromCache, resolve as resolveSettings, type Settings } from './core/settings'
import { resolvePalette, type Palette, type Role, type Style } from './core/palette'
import { shard, withinBudget, type PromptText } from './core/text-store'
import { filterPrompts, matchLegend } from './core/filter'
import { pruneStore, type Seen } from './core/store-prune'
import { footnoteOf, looksLikePrompt, promptTextOf, unwrapQueued, type FootnoteRef } from './core/prompt-rows'
import { short } from './core/message-id'
import { Ring, clock, describeEcho, echoEnabled, echoPolicyOf, logFile, screenFile, stamped, type EchoPolicy } from './core/log-ring'
import { configListedLine, dccLine, diagLine, idsReport, jumpTarget, keyLabel, notAppliedLine, selectionKind, settingsRows } from './core/diagnostics'
import { colorSplit, tagMarksMarkdown, tagMarksPlain, type ColorSplit } from './core/highlight'
import { ScreenModel } from './core/screen-model'
import { MarkCache, deleteMarks, marksShowing, type Mark, type Marks } from './core/marks'
import { footnoteAt, listPosition, nextGroup, promptEntry, promptNumberComplete } from './core/band-entry'
import { debugCommand } from './handlers/debug-command'
import { anchoredReply, markedColumn, markedReply, type MarkStyles } from './views/marked-message'
import { bandView } from './views/band'
import { configCommand, envCommand, idsCommand, marksCommand, selCommand, timelineCommand } from './handlers/diagnostics-commands'
import type { BandPorts, CommandLinePorts, DiagnosticsPorts, MarksPorts, NavigationPorts, ViewPorts } from './engine/ports'
import { closeAll as bandCloseAll, closePane as bandClosePane, endBandMode as bandEnd, paneFocused as bandPaneFocused, settle as bandSettle, BAND_MODE_MS, BAND_WATCH_MS, paneOf } from './handlers/band'
import * as band_ from './handlers/band'
import * as commandLine from './handlers/command-line'
import * as marks_ from './handlers/marks'
import { MarkState } from './core/mark-state'
import { Navigation } from './handlers/navigation'
import { ViewTracker } from './handlers/view-tracker'
import { PanePosition } from './core/pane-position'
import { BandState } from './core/band-state'
import { age, bookmarkWho, drawnFourOf, foldedLabel, footnoteDisplay, footnotesByPrompt, groupHeader, numberLabel as numberLabelAt, numberNewestFirst, numberWidth, pinnedRowsOf, pointerFor, unreached } from './core/list-model'
import { BOOKMARK_TOOL, answer as toolAnswer, brief as briefRow, describe as describeRecord, listActedOn, listName, parseToolInput, tierFor } from './core/bookmark-tool'
import { PROMPTS_KEPT, appendOnce, backfillLine, backfilledKey, footnotesKey as footnotesKeyOf, mergeBackfill, parseBackfill, promptList, promptTextBase as promptTextBaseOf, promptsKey as promptsKeyOf, transcriptGuess, type PromptRef } from './core/prompt-store'

// How long a `temporary` bookmark is kept before it is pruned (to a tombstone). A
// setting with the archive-retention picker (#7, #10); a constant until then.
const TEMPORARY_RETENTION: Retention = '30d'

// The plugin's settings as they stand: the person's /config values (the `userConfig` in
// plugin.json), which Claude Code hands to `register` with every default filled in and
// a change to which arrives as `config.set` (kept current there), over the defaults in
// core/settings.ts.
let machineOptions: Record<string, unknown> = {}
function currentSettings(): Settings {
  return resolveSettings(machineOptions).values
}

// The plugin's one pane id (prompts, bookmarks, mark and jump panes all open under it).
const PANE = 'bm-pane'

// Claude Code builds the borrowed-action chords (below) were verified on. The
// start-up tripwire toasts on any other build, because a new build could give a
// borrowed action a handler of its own. Add a build here after re-verifying.
const VERIFIED_CLIENTS = ['2.1.288', '2.1.289', '2.1.290']

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


// What is on screen, and when the plugin itself last caused a redraw: core/screen-model.ts.
const screen = new ScreenModel()
function expectRedraw(why: string) {
  screen.expectRedraw(why, Date.now())
}

// The marks cluster (the highlight, setting a mark, the reading position, jumping to a
// mark) is handlers/marks.ts; its own state is core/mark-state.ts MarkState.
const markState = new MarkState()
async function showMark($: EngineInterface, letter: string, text: string) {
  await marks_.showMark(marksPorts($), letter, text)
}
async function clearShown($: EngineInterface) {
  await marks_.clearShown(marksPorts($))
}

// The session's marks, kept in memory so render hooks can read them without a store
// call per row. Loaded at session.start and refreshed on every mark write.
// (core/marks.ts MarkCache: `replace` and `showTransient` are its only writers.)
const markCache = new MarkCache()
function marksPorts($: EngineInterface): MarksPorts {
  return {
    state: markState,
    markCache,
    shown: () => read($, shown),
    setShown: v => update($, shown, () => v),
    after: (ms, fn) => $.clock.after(ms, fn),
    expectRedraw,
    note,
    log: (line, text) => log($, line, text ? { text: true } : undefined),
    toast: (text, timeoutMs) => $.ui.toast(text, timeoutMs ? { timeoutMs } : undefined),
    cut,
    selection: () => $.ui.selection(),
    allRows: () => allRows($),
    drawnText: uuid => rendered.get(uuid),
    topOnScreen: () => topOnScreen($),
    viewAnchor: () => viewAnchor($),
    freshOnScreen,
    screenEntries: () => screen.entries(),
    paneAnchor: () => panePosition.anchor,
    noteRestore: top => panePosition.noteRestore(top),
    restoreView: () => restoreView($),
    jumpTo: (uuid, via, label, words, probe, block) => jumpTo($, uuid, via, label, words, probe, block),
    now: () => $.clock.now(),
    loadMarks: () => loadMarks($),
    saveMarks: async m => $.store.set(await marksKey($), m),
    sessionId: () => $.session.id(),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    readingLetter: READING,
  }
}

// Every colour, background, dim and bold the plugin draws comes from the palette by role
// (#27, core/palette.ts): theme keys first, so a role reads on dark and light themes; the
// mark band's light or dark value from the theme's name (/config's `theme` row, kept
// current by a config.set hook); the person's overrides from the `palette` setting.
let themeName: string | undefined
let paletteCache: { key: string; palette: Palette } | undefined
function palette(): Palette {
  const overrides = currentSettings().palette
  const key = `${themeName ?? ''}|${overrides}`
  if (paletteCache?.key !== key) {
    let parsed: Record<string, unknown> = {}
    try {
      const v: unknown = overrides.trim() ? JSON.parse(overrides) : {}
      if (v && typeof v === 'object') parsed = v as Record<string, unknown>
    } catch {
      // Not JSON: the defaults stand, as for any override that does not fit.
    }
    paletteCache = { key, palette: resolvePalette({ theme: themeName, overrides: parsed }).palette }
  }
  return paletteCache.palette
}
const style = (role: Role): Style => palette()[role]
// A Button's label can't be coloured at rest (docs/engine-quirks.md): only its dimness.
const buttonStyle = (role: Role): { dimColor?: boolean } => (style(role).dimColor ? { dimColor: true } : {})

// Where the marked line sits in a message, and the bold «a» form: core/highlight.ts. How
// it is drawn: views/marked-message.tsx, with these two palette roles.
const markStyles = (): MarkStyles => ({ band: style('markBand'), mark: style('mark') })

// The shown mark, if it is on this row (core/marks.ts marksShowing), from the cache.
function marksOnRow(requestId: string, showing: string | undefined): [string, Mark][] {
  return marksShowing(markCache.all, requestId, showing)
}

// Ids seen at UserMessage render time since this module loaded. A module variable on
// purpose: a render hook may not write $.state, and a reload should forget these, so
// "never drawn since load" (a jump target Claude Code may refuse) means what it says.
const rendered = new Map<string, string>()

// A message's on-screen report (core/screen-model.ts noteMessage: which ids count, what is news).
function noteOnScreen(requestId: string, onScreen: { first: number; last: number; of: number } | null | undefined) {
  screen.noteMessage(requestId, onScreen, Date.now())
}
// The `screen` debug channel (#35): every raw onScreen report, unfiltered, nulls and
// repeats included, to <debug>/<session>.screen.log, so the yellow row's moves can be
// lined up against what Claude Code actually sent (it found the 0.4.1 tool-row bug;
// tests/one-offs/thinking/screen-reports/analyse_screen_log.py reads it). Off unless
// `/bm-debug enable screen`.
const screenLines = new Ring<string>(6000)
let screenFlushPending = false
let screenLoaded = false
function rawScreen($: EngineInterface, component: string, requestId: string, onScreen: { first: number; last: number; of: number } | null | undefined) {
  readChannels($)
  if (!channelsOn.has('screen')) return
  const range = onScreen ? `${onScreen.first}-${onScreen.last}/${onScreen.of}` : onScreen === null ? 'null' : 'absent'
  screenLines.push(`${clock(Date.now())} ${component} ${requestId} ${range}`)
  if (screenFlushPending) return
  screenFlushPending = true
  $.clock.after(500, () => {
    screenFlushPending = false
    flushing = flushing.then(() => flushScreen($)).catch(() => {})
  })
}
async function flushScreen($: EngineInterface) {
  if (logPath === undefined) await flushLog($)
  if (!logPath) return
  const path = screenFile(logPath)
  if (!screenLoaded) {
    screenLoaded = true
    if (await $.fs.exists(path)) screenLines.prepend([...(await $.fs.read(path)).split('\n').filter(l => l.trim()), '--- reload ---'])
  }
  await $.fs.write(path, screenLines.items.join('\n') + '\n')
}

// A non-message row's report dates the latest burst (core/screen-model.ts noteOther).
function noteOtherOnScreen(requestId: string, onScreen: { first: number; last: number; of: number } | null | undefined) {
  screen.noteOther(requestId, onScreen, Date.now())
}
// One render report from a non-message row: the screen channel's log, the news time,
// and the pane's view check.
function noteOtherRow($: EngineInterface, tag: string, requestId: string, onScreen: { first: number; last: number; of: number } | null | undefined) {
  rawScreen($, tag, requestId, onScreen)
  noteOtherOnScreen(requestId, onScreen)
  noteViewMoved($)
}

function freshOnScreen(): string[] {
  return screen.fresh()
}

// A timeline of what the mod saw and did, so a drawn-id mismatch can be lined up
// against the pane, store and toast activity just before it. Module-level: a reload
// starts it over, the same as `rendered`.
const timeline = new Ring<{ t: number; what: string }>(400)
function note(what: string) {
  timeline.push({ t: Date.now(), what })
}
// The [bm] log lines, also written to <user dir>/bookmarks/debug/<session>.log:
// $.ui.log rows are only drawn, so a session that reads files (Claude, while
// developing this) cannot see them. Kept outside the plugin folder on purpose: a write
// inside it trips the folder watch and reloads the mod on every line. $.fs has no
// append, so the file is rewritten whole, last 400 lines, one write at a time.
const logLines = new Ring<string>(400)
let logPath: string | null | undefined // undefined: not looked up yet; null: no usable place
let flushing: Promise<void> = Promise.resolve()

// Whether log lines are also echoed into the transcript as dim rows. Off by default: the
// file log is always written; the echo is for the person debugging one conversation, and
// a single global switch was spamming every session the plugin loads in (djdarcy,
// 2026-10-09). Two things are kept, one volatile and one persisted (the 14-17-44 DWP):
// - this conversation's choice lives in its own process environment, CONVO_BOOKMARKS_DEBUG.
//   `/bm-debug on|off` sets it with $.env.set, so it survives a hot reload, reaches the
//   processes this session starts, and dies with the session: a resumed session forgets.
//   `CONVO_BOOKMARKS_DEBUG=1 claude` is the same signal given from the shell.
// - the machine-wide policy, one store key: the default every conversation without a
//   choice follows, and whether a conversation may choose at all (`forced`), so "on
//   everywhere" and "off everywhere" can be guaranteed from any one session (djdarcy's
//   six states: forced on, forced off, and a session's on/off/unset over an overridable
//   default). Nothing is cached: a force typed in one session must reach the others on
//   their very next log line.
const ECHO_POLICY_ENTRY = 'debug:echo'
async function echoPolicy($: EngineInterface): Promise<EchoPolicy> {
  // A default typed with `/bm-debug default` wins; without one, the `debugDefault` setting.
  return echoPolicyOf(await $.store.get(ECHO_POLICY_ENTRY), currentSettings().debugDefault === 'on')
}
async function setEchoPolicy($: EngineInterface, policy: EchoPolicy) {
  await $.store.set(ECHO_POLICY_ENTRY, policy)
}
/** This conversation's own choice, from its environment; undefined when it made none. */
async function sessionEchoChoice($: EngineInterface): Promise<boolean | undefined> {
  return parseDebugEnv(await $.env.get('CONVO_BOOKMARKS_DEBUG')).echo
}
/** Sets this conversation's choice; `undefined` drops it, so the default applies again. The debug channels sharing the variable are kept. */
async function setSessionEcho($: EngineInterface, enabled: boolean | undefined) {
  // Not named `on`: the directory's reader treats that name as the hook registrar everywhere in the file.
  const { channels } = parseDebugEnv(await $.env.get('CONVO_BOOKMARKS_DEBUG'))
  await $.env.set('CONVO_BOOKMARKS_DEBUG', formatDebugEnv(enabled, channels))
}
async function uiEchoEnabled($: EngineInterface): Promise<boolean> {
  return echoEnabled(await echoPolicy($), await sessionEchoChoice($))
}
/** The state in one line, for `/bm-debug status` and `/bm-env`. */
async function echoStateLine($: EngineInterface): Promise<string> {
  return describeEcho(await echoPolicy($), await sessionEchoChoice($))
}

// Debug channels (#35, core/debug.ts): this conversation's choice, read from its
// environment once and kept here so a check is synchronous (a render hook and note()
// cannot await). Until it is read, every channel is off, the safe side.
const channelsOn = new Set<Channel>()
let channelsRead = false
function readChannels($: EngineInterface) {
  if (channelsRead) return
  channelsRead = true
  void $.env.get('CONVO_BOOKMARKS_DEBUG').then(v => {
    for (const c of parseDebugEnv(v).channels) channelsOn.add(c)
  }).catch(() => {})
}
// The channels share CONVO_BOOKMARKS_DEBUG with the echo's choice, which is kept.
async function setChannels($: EngineInterface, on: Set<Channel>) {
  channelsOn.clear()
  for (const c of on) channelsOn.add(c)
  const { echo } = parseDebugEnv(await $.env.get('CONVO_BOOKMARKS_DEBUG'))
  await $.env.set('CONVO_BOOKMARKS_DEBUG', formatDebugEnv(echo, on))
}

// `text`: the line quotes the conversation (a selection, a message's head, a label,
// highlighted words, a tool's input). It is kept when the `text` channel is on, or the
// `debugText` setting allows it: `auto` is always in a build loaded from a folder (a
// developer's) and off in an installed one; `with-debug` follows this conversation's
// debugging (djdarcy, 2026-10-12: the person decides, and nothing is lost while we debug).
function log($: EngineInterface, line: string, opts?: { always?: boolean; text?: boolean }) {
  readChannels($)
  if (opts?.text) {
    const mode = debugTextMode(currentSettings().debugText, !installedFromCache($.plugin.root))
    void uiEchoEnabled($).then(debugging => {
      if (!quotesText(mode, channelsOn.has('text'), debugging)) return
      if (opts.always || debugging) $.ui.log(line)
      keepLine($, line)
    }).catch(() => {})
    return
  }
  if (opts?.always) $.ui.log(line)
  else void uiEchoEnabled($).then(enabled => { if (enabled) $.ui.log(line) }).catch(() => {})
  keepLine($, line)
}

// A quoted excerpt in a log line: short, or whole when `debugTextLength` is `full`.
const cut = (text: string, n: number) => excerpt(text, n, currentSettings().debugTextLength)

function keepLine($: EngineInterface, line: string) {
  logLines.push(stamped(line, Date.now()))
  const mirrored = channelsOn.has('screen') ? screenMirror(line) : undefined
  if (mirrored) screenLines.push(`${clock(Date.now())} >>> ${mirrored}`)
  flushing = flushing.then(() => flushLog($)).catch(() => {})
}

// The data root: where this plugin keeps what is the person's (bookmarks, exports, the
// debug log). `CLAUDE_USER_DIR`, else `<home>/claude`; never under `~/.claude`, which is
// Claude Code's to clean (#6). Forward slashes, no trailing slash.
async function dataRoot($: EngineInterface): Promise<string | undefined> {
  const fromEnv = await $.env.get('CLAUDE_USER_DIR')
  if (fromEnv) return fromEnv.replace(/\\/g, '/').replace(/\/+$/, '')
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return home ? `${home.replace(/\\/g, '/')}/claude` : undefined
}

async function flushLog($: EngineInterface) {
  if (logPath === undefined) {
    const root = await dataRoot($)
    logPath = root ? logFile(root, await $.session.id()) : null
    // A reload starts the module over: keep what the file already holds.
    if (logPath && (await $.fs.exists(logPath))) logLines.prepend((await $.fs.read(logPath)).split('\n').filter(l => l.trim()))
  }
  if (logPath) await $.fs.write(logPath, logLines.items.join('\n') + '\n')
}

// Mark and Marks: core/marks.ts.

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

// The session's prompts in the order they were sent, #1 first. `rows` ($.state) starts
// empty when the session restarts, so every prompt is also kept in $.store under the
// session id (djdarcy, 2026-10-04: number prompts from the first message). Prompts sent
// before the mod was loaded are not known: reading them needs the transcript (#6).
// The keys, the merge and the list's filter: core/prompt-store.ts.
async function promptsKey($: EngineInterface): Promise<string> {
  return promptsKeyOf(await $.session.id())
}
async function keptPrompts($: EngineInterface): Promise<PromptRef[]> {
  return ((await $.store.get(await promptsKey($))) as PromptRef[] | undefined) ?? []
}
// Footnotes (#33): the person's slash commands, `!` shell commands and interruptions,
// each kept with the prompt it follows (core/prompt-rows.ts footnoteOf); numbered N.k at
// draw time from the prompts' order.
async function footnotesKey($: EngineInterface): Promise<string> {
  return footnotesKeyOf(await $.session.id())
}
async function keptFootnotes($: EngineInterface): Promise<FootnoteRef[]> {
  return ((await $.store.get(await footnotesKey($))) as FootnoteRef[] | undefined) ?? []
}

// The prompts' text for the filter (#28): held in memory while the plugin runs, kept as
// much as the `promptTextBudget` setting allows (0 = unlimited; core/text-store.ts) in
// files under the data root, <dataRoot>/bookmarks/prompttext/<sid>.json (the piece
// count) and <sid>.<i>.json (pieces under the 4 MiB that $.fs.read takes). Not in the
// plugin store: its 4 MiB is for the whole store, every conversation's marks and pins
// included, and a store over it refuses every write (typings, `store.set`; measured
// 2026-10-12: 620 KB live, 216 KB of it this text from one day's dev build).
// djdarcy, 2026-10-12: free memory where appropriate, keep a cache where there is room;
// search (#20) reuses it.
const TEXT_PIECE_BYTES = 3_500_000
// The cache carries its conversation: after /clear or /resume the plugin stays loaded,
// and a save from the old conversation's cache would overwrite the new one's pieces.
let promptTextCache: { sid: string; texts: Map<string, string> } | undefined
let promptTextSave: Timer | undefined
async function promptTextBase($: EngineInterface, sid: string): Promise<string | undefined> {
  const root = await dataRoot($)
  return root ? promptTextBaseOf(root, sid) : undefined
}
async function readJson($: EngineInterface, path: string): Promise<unknown> {
  try {
    return (await $.fs.exists(path)) ? JSON.parse(await $.fs.read(path)) : undefined
  } catch {
    return undefined // a piece cut short by a write that did not finish: that text is lost, the rest stands
  }
}
async function promptTexts($: EngineInterface): Promise<Map<string, string>> {
  const sid = await $.session.id()
  if (promptTextCache?.sid === sid) return promptTextCache.texts
  await dropStoredPromptText($)
  const cache = new Map<string, string>()
  const base = await promptTextBase($, sid)
  const count = base ? Number(((await readJson($, `${base}.json`)) as { pieces?: number } | undefined)?.pieces ?? 0) : 0
  for (let i = 0; i < count; i++) {
    const piece = await readJson($, `${base}.${i}.json`)
    if (Array.isArray(piece)) for (const t of piece as PromptText[]) cache.set(t.uuid, t.text)
  }
  promptTextCache = { sid, texts: cache }
  return cache
}
async function savePromptTexts($: EngineInterface) {
  const sid = await $.session.id()
  const cache = await promptTexts($)
  const order = (await keptPrompts($)).map(p => p.uuid).reverse() // newest first
  const kept = withinBudget(order.filter(u => cache.has(u)).map(u => ({ uuid: u, text: cache.get(u)! })), currentSettings().promptTextBudget)
  // Drop what fell outside the budget from memory too.
  promptTextCache = { sid, texts: new Map(kept.map(t => [t.uuid, t.text])) }
  const base = await promptTextBase($, sid)
  if (!base) return // no data root: the text lives in memory until the plugin unloads
  const before = Number(((await readJson($, `${base}.json`)) as { pieces?: number } | undefined)?.pieces ?? 0)
  const pieces = shard(kept, TEXT_PIECE_BYTES)
  for (let i = 0; i < pieces.length; i++) await $.fs.write(`${base}.${i}.json`, JSON.stringify(pieces[i]))
  await $.fs.write(`${base}.json`, JSON.stringify({ pieces: pieces.length }))
  // $.fs has no delete: a piece no longer counted is emptied, so a smaller budget frees the disk too.
  for (let i = pieces.length; i < before; i++) await $.fs.write(`${base}.${i}.json`, '[]')
}
// 0.4.23 development builds kept this text in the plugin store as `prompttext:` keys;
// they are removed once per load. One machine ran that build (the maintainer's, never
// released; counted 2026-10-12); take this out at 0.5.0.
let storedPromptTextDropped = false
async function dropStoredPromptText($: EngineInterface) {
  if (storedPromptTextDropped) return
  storedPromptTextDropped = true
  for (const key of await $.store.keys()) if (key.startsWith('prompttext:')) await $.store.delete(key)
}
// A prompt's text joins the cache; the files are written a moment later, once per burst.
async function keepPromptText($: EngineInterface, uuid: string, text: string) {
  ;(await promptTexts($)).set(uuid, text)
  promptTextSave?.cancel()
  promptTextSave = $.clock.after(2000, () => void savePromptTexts($))
}
async function keepFootnote($: EngineInterface, f: FootnoteRef) {
  const next = appendOnce(await keptFootnotes($), f)
  if (next) await $.store.set(await footnotesKey($), next)
}
async function keepPrompt($: EngineInterface, p: PromptRef) {
  const next = appendOnce(await keptPrompts($), p)
  if (next) await $.store.set(await promptsKey($), next)
}

// --- Back-fill: the prompts sent before the mod was loaded ------------------------
// The transcript holds them but is too big for $.fs.read (4 MiB; 18 MB here). The
// platform's own tool filters it to the user rows (no install: Windows PowerShell 5.1
// on Windows, sh + grep elsewhere) and the mod parses the JSON lines. Settled by the
// measurement in tests/one-offs/thinking/prompt-history/ (2026-10-04: 152/152 prompts,
// identical text; ~1 MB of output; 328 ms PowerShell, 81 ms sh + grep). Runs once per
// conversation; after that the live capture keeps the list current.
// Which rows are prompts, and the words of a queued one: core/prompt-rows.ts (tested),
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
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home ? `${home}/.claude` : undefined)
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
// are returned as candidates). The anchors DWP's resolver (2026-10-09).
type ResolveOutcome =
  | { kind: 'one'; row: TranscriptRow; via: string; ms: number }
  | { kind: 'many'; rows: TranscriptRow[]; earliest: TranscriptRow; via: string; ms: number }
  | { kind: 'none'; via?: string; ms?: number; reason: string }

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

// The back-fill's version; the done flag is `backfilled<N>:<sessionId>`.
const BACKFILL_VERSION = 6
// A conversation not opened for this long gives up what its transcript rebuilds (#15).
const PRUNE_AFTER_MS = 30 * 86_400_000

// Keep the plugin store small: it is one file for every conversation, refused past 4 MiB
// in all (core/store-prune.ts). Once per conversation opened, before its back-fill.
async function pruneStoreNow($: EngineInterface) {
  const { drop, seen } = pruneStore(
    await $.store.keys(),
    ((await $.store.get('seen')) as Seen | undefined) ?? {},
    await $.clock.now(),
    PRUNE_AFTER_MS,
    await $.session.id(),
    BACKFILL_VERSION,
  )
  for (const key of drop) await $.store.delete(key)
  await $.store.set('seen', seen)
  if (drop.length) log($, `[bm] store: pruned ${drop.length} keys (${[...new Set(drop.map(k => k.split(':')[0]))].join(', ')})`)
}

async function backfillPrompts($: EngineInterface) {
  // The key's number marks what the back-fill knows: `2` learnt queued prompts
  // (attachment rows); `3` drops rows the live capture kept before it had the prompt
  // filter ("[Request interrupted…]", command echoes), which the merge had appended
  // after the file's prompts, so from there the list's numbering ran eight too high and
  // the yellow row sat on the wrong prompt (djdarcy, 2026-10-11: "the screen is
  // currently at prompt #307 but the list is showing #297"). A conversation marked done
  // under an older key is read once more.
  // `4`: queued messages the live capture had dropped, and `<task-notification>` rows it
  // had kept (2026-10-11, djdarcy: two of his mid-turn messages missing above #316).
  // `5`: footnotes -- the person's slash commands, `!` shell commands and interruptions,
  // kept with the prompt each follows (#33).
  // `6`: the prompts' whole text for the filter (#28), which a conversation read under
  // `5` never collected.
  const doneKey = backfilledKey(BACKFILL_VERSION, await $.session.id())
  if (await $.store.get(doneKey)) return
  const path = await transcriptPath($)
  if (!path) {
    log($, '[bm] backfill: transcript not found; prompts list starts when the mod loaded')
    return
  }
  const rows = await userRows($, path)
  if (!rows) {
    log($, '[bm] backfill: neither PowerShell nor sh + grep ran; prompts list starts when the mod loaded')
    return
  }
  const { found, texts, footnotes } = parseBackfill(rows.stdout)
  const cache = await promptTexts($)
  for (const [uuid, text] of texts) cache.set(uuid, text)
  await $.store.set(await footnotesKey($), footnotes.slice(-PROMPTS_KEPT))
  const merged = mergeBackfill(found, await keptPrompts($))
  await $.store.set(await promptsKey($), merged)
  await savePromptTexts($)
  // A cut-off read is left unmarked, so a later session start tries again.
  if (!rows.isStdoutTruncated) await $.store.set(doneKey, true)
  log($, backfillLine(found.length, rows.via, rows.ms, rows.stdout.length, !!rows.isStdoutTruncated, merged.length))
}

// Who-caused-the-row stamps (session.append's `origin.kind`) that are never the person.
const AUTOMATED_ORIGINS = new Set(['task-notification', 'scheduled-trigger', 'peer-send-message', 'coordinator', 'observer', 'observer-activity', 'auto-continuation', 'projects-relay', 'channel'])

// The stored prompts that are prompts, then the rows captured live this session that the
// store lacks (core/prompt-store.ts promptList). Rows kept before the list knew them for
// notices drop out, so the numbers match the transcript's; a `<task-notification>` row
// the rebuild dropped once came back as the newest prompt and sent the yellow row to the
// bottom (djdarcy, 2026-10-11: scrolling up from #325 moved it to #342).
async function prompts($: EngineInterface): Promise<PromptRef[]> {
  return promptList(await keptPrompts($), await allRows($))
}

async function marksKey($: EngineInterface): Promise<string> {
  return `marks:${await $.session.id()}`
}

async function loadMarks($: EngineInterface): Promise<Marks> {
  return ((await $.store.get(await marksKey($))) as Marks | undefined) ?? {}
}

// --- Bookmark anchors (anchors DWP 2026-10-09) -----------------------------------------
// The URL format, its parser and the link finder live in hooks/core/anchor.ts (pure, with
// tests under `node --test`). This file holds what needs the engine: the press, the jump,
// the highlight, the tool and the register's I/O.

// The transient mark an anchor press shows: the words the anchor names, highlighted on
// the target row like a letter's selection, under a key no letter can take. Display
// only; never written to the store (djdarcy, 2026-10-09: "highlighted yellow like how we
// handle a mark when we do <leader>'<mark-key>").
const ANCHOR_MARK = '@'

// --- The register: <dataRoot>/bookmarks/sessions/<sessionId>.json, and one export per
// bookmark beside it. The file is the source of truth (#6); this cache is a copy of what
// was last read or written. `.bak` is written before the file, since `$.fs.write` is not
// atomic; a main file that fails to parse falls back to it.
let registerCache: BookmarkRegister | undefined

async function registerPath($: EngineInterface): Promise<string | undefined> {
  const root = await dataRoot($)
  return root ? `${root}/bookmarks/sessions/${await $.session.id()}.json` : undefined
}

async function loadRegister($: EngineInterface): Promise<BookmarkRegister> {
  if (registerCache) return registerCache
  const path = await registerPath($)
  let reg: BookmarkRegister | undefined
  if (path) {
    for (const p of [path, `${path}.bak`]) {
      if (!(await $.fs.exists(p))) continue
      reg = parseRegister(await $.fs.read(p))
      if (reg) {
        if (p !== path) log($, `[bm] register: ${path} unreadable; loaded its .bak (rev ${reg.rev})`)
        break
      }
      log($, `[bm] register: ${p} is not a register file`)
    }
  }
  if (!reg) {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home ? `${home.replace(/\\/g, '/')}/.claude` : undefined)
    reg = emptyRegister(await $.session.id(), `${$.plugin.name} ${await pluginVersion($)}`, await $.clock.now(), {
      ...(configDir ? { configDir } : {}),
      cwd: (await $.session.cwd()).replace(/\\/g, '/'),
    })
  }
  registerCache = reg
  return reg
}

async function saveRegister($: EngineInterface, reg: BookmarkRegister) {
  expectRedraw('a bookmark saved')
  const path = await registerPath($)
  if (!path) return
  if (await $.fs.exists(path)) await $.fs.write(`${path}.bak`, await $.fs.read(path))
  await $.fs.write(path, serializeRegister({ ...reg, writer: `${$.plugin.name} ${await pluginVersion($)}` }))
  registerCache = reg
}

// Mint a bookmark: add or relabel the record, save the register, write the export, and
// hand back the anchor URL and the markdown link a reply writes.
async function mintBookmark($: EngineInterface, mint: Mint, messageText: string) {
  const reg = await loadRegister($)
  const now = await $.clock.now()
  const { register, record, added } = addOrRelabel(reg, mint, now)
  await saveRegister($, register)
  const exportPath = await writeExport($, register, record, messageText, now)
  const root = await dataRoot($)
  const href = root ? anchorHref(record, root) : undefined
  const markdown = root ? anchorMarkdown(record, root) : undefined
  log($, `[bm] bookmark ${added ? 'added' : 'relabelled'}: ${short(record.uuid)} "${record.label}" (${ownerOf(record)}'s list; ${record.by}/${record.source}) rev ${register.rev}`, { text: true })
  return { record, added, href, markdown, exportPath, rev: register.rev }
}

// One export per message, shared by both lists. A rewrite keeps whatever was written under
// the notes marker (a person's or Claude's notes, links, context: pillar 3, #11).
async function writeExport($: EngineInterface, register: BookmarkRegister, record: Mint | { uuid: string; sessionId: string }, messageText: string, now: number) {
  const root = await dataRoot($)
  if (!root) return undefined
  const sessionId = 'sessionId' in record ? record.sessionId : register.sessionId
  const exportPath = anchorPath(root, sessionId, record.uuid)
  const existing = (await $.fs.exists(exportPath)) ? await $.fs.read(exportPath) : undefined
  // A relabel or share has no message text in hand: read it from the transcript again,
  // and if that fails leave the file as it is rather than write an empty message.
  if (!messageText) {
    const found = await resolveTarget($, { uuid: record.uuid })
    if (found.kind === 'one') messageText = found.row.text
    else if (existing) return exportPath
  }
  const owners = (['user', 'claude'] as AnchorOwner[]).filter(o => findRecord(register, record.uuid, o))
  // The record to describe: the person's copy first, since the file is theirs to read.
  const main = findRecord(register, record.uuid, 'user') ?? findRecord(register, record.uuid)
  if (!main) return exportPath
  const minted = `${new Date(now).toISOString()} by ${main.by} (${main.source})`
  await $.fs.write(exportPath, exportMarkdown(main, messageText, { minted, owners, notes: exportNotesOf(existing) }))
  return exportPath
}

// How link kinds are told apart in a reply (djdarcy, 2026-10-09: "how can we denote that
// a link has secondary metadata ... so I don't have to ctrl-click every link"). Settings
// in a later version (#7); constants until then.
const LINK_MARKERS: MarkerStyle = 'glyph'
const LINK_LEGEND = true

// Replies whose links were already logged and queued (a reply is drawn many times).
const anchorRowsLogged = new Set<string>()

// A bookmark link written by hand (or by an older session) is a bookmark too: once drawn,
// any anchor the register does not know is resolved by uuid and recorded with
// `by: 'prose'`. Off the render path (a clock tick), one attempt per uuid per load.
const proseQueued = new Set<string>()
function queueProseAnchors($: EngineInterface, anchors: ReturnType<typeof markdownLinks>) {
  for (const l of anchors) {
    const a = l.anchor
    if (!a || proseQueued.has(a.uuid8)) continue
    proseQueued.add(a.uuid8)
    $.clock.after(0, () => {
      void (async () => {
        const reg = await loadRegister($)
        if (findRecord(reg, a.uuid8)) return
        if (a.sessionId && a.sessionId !== (await $.session.id())) return // another conversation's bookmark
        const found = await resolveTarget($, { uuid: a.uuid })
        if (found.kind !== 'one') {
          log($, `[bm] prose bookmark ${a.uuid8} not recorded: ${found.kind === 'none' ? found.reason : 'ambiguous uuid'}`)
          return
        }
        const row = found.row
        await mintBookmark(
          $,
          {
            uuid: row.uuid,
            label: l.label.replace(/^(⚓|▤|\[bm\]|\[file\])\s*/, '') || `bookmark ${a.uuid8}`,
            ...(a.words && row.text.includes(a.words) ? { words: a.words } : {}),
            line: row.line,
            bytes: [row.byteStart, row.byteEnd],
            head: headOf(row.text),
            owner: 'claude',
            by: 'prose',
            source: 'prose',
            transcript: (await transcriptPath($))?.replace(/\\/g, '/'),
            role: row.role,
            ...(row.timestamp ? { timestamp: row.timestamp } : {}),
          },
          row.text,
        )
      })().catch(err => log($, `[bm] prose bookmark ${a.uuid8} failed: ${String(err)}`))
    })
  }
}

// The press on an anchor link: resolve a uuid prefix against the rows this mod knows,
// then the same jump as a mark (with its refused-jump fallbacks).
async function onAnchorPress($: EngineInterface, href: string) {
  const a = parseAnchor(href)
  log($, `[bm] anchor link pressed: ${cut(href, 120)} -> ${a ? `uuid ${a.uuid}` : 'NOT an anchor'}`, { text: true })
  if (!a) return
  let uuid = a.uuid
  if (uuid.length < 36) {
    const row = (await allRows($)).find(r => r.uuid.startsWith(uuid))
    if (row) uuid = row.uuid
    else log($, `[bm] anchor link: no known row starts with ${uuid}; trying it as written`)
  }
  // The jump records itself in the jumplist (jumpTo), so <leader> o comes back here. The
  // reading position is left alone: it is the person's (djdarcy, 2026-10-09).
  // The words to highlight (and, on a refused jump, the phrase the fallback copies): the
  // link's `q`, else the register's record.
  const words = a.words ?? (await loadRegister($)).perma.find(r => r.uuid === uuid)?.words
  const deny = await jumpTo($, uuid, 'anchor press', `anchor ${short(uuid)}${a.line ? ` (line ${a.line})` : ''}`, words)
  if (deny || !words) return
  await highlightWords($, uuid, words)
  log($, `[bm] anchor words highlighted on ${short(uuid)}: "${cut(words, 60)}"`, { text: true })
}

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
    drawnHead: uuid => rendered.get(uuid),
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

// Where the view was before a pane opened, and where it goes back to: core/pane-position.ts
// (the three fields and their writers, each a named method).
const panePosition = new PanePosition()
async function restoreView($: EngineInterface) {
  await navigation.restoreView(navPorts($))
}

async function pollSelection($: EngineInterface) {
  await marks_.pollSelection(marksPorts($))
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
    heldChannel: () => channelsOn.has('held'),
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
// The prompt the list should centre on at the pane's next draw (set when it opens).
let pendingCentre: string | undefined
// The prompts whose footnotes the person unfolded (`.` or a press on the ellipsis row),
// by number; folded is the default (the `footnotes` setting).
const unfoldedFootnotes = new Set<number>()
// The prompts filter (#28): the words typed after `/` in the prompts pane's number field
// (djdarcy, 2026-10-12: "Pane field only"); empty when no filter is active.
let paneFilter = ''
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

// The pane opening (handOff, bandOnly, openFor) is handlers/band.ts.
async function handOff($: EngineInterface, mode: PaneMode, focusKey?: string) {
  await band_.handOff(bandPorts($), mode, focusKey)
}

// The band's own state -- its wait and watch timers, the focus ring, its requestId, the
// Esc reminder -- is core/band-state.ts BandState, written only through its named methods.
const band = new BandState()
async function runCommandLine($: EngineInterface, typed: string, via: 'input' | 'submit') {
  await commandLine.runCommandLine(commandLinePorts($), typed, via)
}
async function perform($: EngineInterface, operation: Operation, via: 'field' | string) {
  await commandLine.perform(commandLinePorts($), operation, via)
}

async function showHelp($: EngineInterface) {
  await band_.showHelp(bandPorts($))
}

async function closeAll($: EngineInterface, via: string) {
  await bandCloseAll(bandPorts($), via)
}

async function bandListKey($: EngineInterface, operation: Operation) {
  await band_.bandListKey(bandPorts($), operation)
}

async function bandOnly($: EngineInterface, mode: PaneMode) {
  await band_.bandOnly(bandPorts($), mode)
}

// The band's keys are handlers/band.ts; these keep the old signatures for their callers.
async function bandDot($: EngineInterface) {
  await band_.bandDot(bandPorts($))
}
async function bandDigit($: EngineInterface, digit: string) {
  await band_.bandDigit(bandPorts($), digit)
}
async function bandStep($: EngineInterface, dir: -1 | 1) {
  await band_.bandStep(bandPorts($), dir)
}
async function bandPin($: EngineInterface) {
  await band_.bandPin(bandPorts($))
}
async function bandClaim($: EngineInterface) {
  await band_.bandClaim(bandPorts($))
}
function keepBandWaiting($: EngineInterface) {
  band_.keepBandWaiting(bandPorts($))
}
async function bandNumberGo($: EngineInterface) {
  await band_.bandNumberGo(bandPorts($))
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


async function focusBand($: EngineInterface, key: string): Promise<string | undefined> {
  return band_.focusBand(bandPorts($), key)
}

// Jumps to prompt #n, from the prompts pane's field or the band's.
// --- Pinned prompts ------------------------------------------------------------------
// Favourite prompts to come back to (djdarcy, 2026-10-05), per conversation, kept in
// the order they were pinned. Drawn as `245★)` and listed again at the top of the
// prompts pane. Toggled by `*21` (or `*` for the newest) in the `#` field, or /bm-pin.
async function pinsKey($: EngineInterface): Promise<string> {
  return `pins:${await $.session.id()}`
}
async function loadPins($: EngineInterface): Promise<string[]> {
  return ((await $.store.get(await pinsKey($))) as string[] | undefined) ?? []
}

// Toggles the pin on prompt #n (the newest when `typed` names none). Returns false when
// there is no such prompt.
async function togglePin($: EngineInterface, typed: string): Promise<boolean> {
  const all = await prompts($)
  const n = listPosition(typed, all.length, true)
  const target = n === undefined ? undefined : all[n - 1]
  if (!target) {
    $.ui.toast(`no prompt #${typed.trim()} (1-${all.length})`)
    return false
  }
  const pins = await loadPins($)
  const pinned = pins.includes(target.uuid)
  await $.store.set(await pinsKey($), pinned ? pins.filter(u => u !== target.uuid) : [...pins, target.uuid])
  await update($, pinsRev, v => v + 1)
  $.ui.toast(`${pinned ? 'unpinned' : 'pinned'} #${n}: ${target.head.slice(0, 40)}`)
  log($, `[bm] ${pinned ? 'unpinned' : 'pinned'} prompt #${n} ${short(target.uuid)}`)
  return true
}

// What the entry means (pin, filter, unfold, footnote, jump): core/band-entry.ts promptEntry.
async function jumpToPromptNumber($: EngineInterface, typed: string, via: string) {
  const all = await prompts($)
  const entry = promptEntry(typed, all.length)
  if (entry.kind === 'pin') {
    await togglePin($, entry.typed)
    return
  }
  if (entry.kind === 'filter') {
    paneFilter = entry.words
    await update($, viewRev, v => v + 1)
    return
  }
  if (entry.kind === 'unfold') {
    // Hidden footnotes: `N.k` still jumps (djdarcy, 2026-10-12: "Rows hidden, keys work"),
    // but `N.` has nothing to show, so it says why.
    if (currentSettings().footnotes === 'hidden') return void $.ui.toast('Footnotes are hidden: "Footnotes in the prompts list" in /config shows them')
    if (unfoldedFootnotes.has(entry.n)) unfoldedFootnotes.delete(entry.n)
    else unfoldedFootnotes.add(entry.n)
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

// --- Bookmarks in the pane and the band ---------------------------------------------------
// Numbered in the order minted (#1 the first), so a number read off the pane stays good.
async function bookmarkList($: EngineInterface) {
  return [...(await loadRegister($)).perma].sort((a, b) => a.createdAt - b.createdAt)
}

// Highlight `words` on a message, as a letter's jump does, through a transient entry in
// the mark cache (reloaded from the store on the next mark write).
async function highlightWords($: EngineInterface, uuid: string, words: string) {
  markCache.showTransient(ANCHOR_MARK, { uuid, head: words, markedAt: await $.clock.now(), source: 'selection', snippet: words })
  await showMark($, ANCHOR_MARK, words)
}

// Jump to a bookmark and highlight its words. Returns the scroll's refusal, if any.
async function arriveAtBookmark($: EngineInterface, record: { uuid: string; words?: string; label: string }, via: string): Promise<string | undefined> {
  const deny = await jumpTo($, record.uuid, via, `bookmark ${short(record.uuid)}`, record.words)
  if (!deny && record.words) await highlightWords($, record.uuid, record.words)
  return deny
}

// Cycle the bookmarks pane's group from the band: yours -> Claude's -> all -> yours.
async function bandGroupStep($: EngineInterface, step: -1 | 1) {
  await update($, bandGroup, g => nextGroup(g, step, BOOKMARK_GROUPS.length))
  keepBandWaiting($)
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

// Promote one of the person's marks (a letter, or ` for the reading position) into a
// bookmark: same message, the mark's words, `by: 'user'`. The letter is left as it is.
// The markdown link goes to the clipboard, ready to paste into a note.
async function promoteLetter($: EngineInterface, letter: string) {
  const mark = (await loadMarks($))[letter]
  if (!mark) return void $.ui.toast(`mark ${letter} is not set`)
  const found = await resolveTarget($, { uuid: mark.uuid })
  if (found.kind !== 'one') {
    $.ui.toast(`Can't promote ${letter}: ${found.kind === 'none' ? found.reason : 'the message is ambiguous in the transcript'}`)
    return
  }
  const row = found.row
  const words = mark.snippet && row.text.includes(mark.snippet) ? mark.snippet : undefined
  const minted = await mintBookmark(
    $,
    {
      uuid: row.uuid,
      label: (words ?? mark.head).slice(0, 80),
      ...(words ? { words } : {}),
      line: row.line,
      bytes: [row.byteStart, row.byteEnd],
      head: headOf(row.text),
      owner: 'user',
      by: 'user',
      source: 'promote',
      transcript: (await transcriptPath($))?.replace(/\\/g, '/'),
      role: row.role,
      ...(row.timestamp ? { timestamp: row.timestamp } : {}),
    },
    row.text,
  )
  const copied = minted.markdown ? (await $.ui.copy({ text: minted.markdown })).isCopied : false
  $.ui.toast(`${minted.added ? 'bookmarked' : 'already a bookmark, relabelled'}: ${minted.record.label.slice(0, 40)}${copied ? ' (link copied)' : ''}`, { timeoutMs: 6000 })
}


async function watchBand($: EngineInterface, mode: PaneMode) {
  await band_.watchBand(bandPorts($), mode)
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
    toast: (text, timeoutMs) => $.ui.toast(text, timeoutMs ? { timeoutMs } : undefined),
    togglePin: typed => togglePin($, typed),
    groupStep: dir => bandGroupStep($, dir),
    loadRegister: () => loadRegister($),
    saveRegister: reg => saveRegister($, reg),
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
    scroll: (uuid, block) => $.ui.scroll({ to: { requestId: uuid }, block }),
    setPendingCentre: uuid => {
      pendingCentre = uuid
    },
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
async function endBandMode($: EngineInterface) {
  await bandEnd(bandPorts($))
}
async function paneFocused($: EngineInterface): Promise<boolean> {
  return bandPaneFocused(bandPorts($))
}
async function closePane($: EngineInterface) {
  await bandClosePane(bandPorts($))
}

// The engine, as the diagnostic commands may hold it (hooks/engine/ports.ts): one closure
// per primitive, each spelled `$.noun.event(...)` here, where the validator follows `$`.
function diagnosticsPorts($: EngineInterface): DiagnosticsPorts {
  return {
    log: (line, always, text) => log($, line, always || text ? { ...(always ? { always: true } : {}), ...(text ? { text: true } : {}) } : undefined),
    prompts: () => prompts($),
    rows: () => allRows($),
    marks: () => loadMarks($),
    rendered: () => rendered,
    timeline: () => timeline.items,
    note,
    selection: () => $.ui.selection(),
    cut,
    settings: () => resolveSettings(machineOptions),
    folderBuild: !installedFromCache($.plugin.root),
    pluginName: $.plugin.name,
    configKeys: async () => (await $.config.list().catch(() => [])).map(row => row.key),
    claudeVersion: async () => (await $.session.version()).version,
    pluginVersion: () => pluginVersion($),
    sessionId: () => $.session.id(),
    dccPatcher: () => $.env.get('DCC_PATCHER'),
    dccPatchH: () => $.env.get('DCC_PATCH_H'),
    dccPatches: () => $.env.get('DCC_PATCHES'),
    echoState: () => echoStateLine($),
  }
}

export const register: Register = (on, options) => {
  machineOptions = { ...options }

  // A change in /config to one of this plugin's fields: keep the values current and
  // redraw what reads them (settingsRev), whether or not Claude Code also reloads us.
  on('config.set', { key: /^bookmarks\./ }, async ($, e, next) => {
    const result = await next(e)
    if (!result.deny) {
      machineOptions = { ...machineOptions, [e.key.slice('bookmarks.'.length)]: result.value }
      // A smaller text budget frees memory and store now, not at the next prompt.
      if (e.key === 'bookmarks.promptTextBudget') await savePromptTexts($)
      await update($, settingsRev, v => v + 1)
    }
    return result
  })
  // The theme decides the mark band's light or dark value (#27).
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (!result.deny) {
      themeName = String(result.value)
      await update($, settingsRev, v => v + 1)
    }
    return result
  })

  on('session.start', async ($, e, next) => {
    // A session start is a conversation boundary (a new conversation, /clear, /resume)
    // in a process whose module state outlives it; what belonged to the conversation
    // that ended goes back to its defaults (test-plan 2026-10-12__15-25-30, row M).
    unfoldedFootnotes.clear()
    paneFilter = ''
    band.newConversation()
    void $.config.list().then(rows => {
      const theme = rows.find(r => r.key === 'theme')?.value
      if (typeof theme === 'string') themeName = theme
    }).catch(() => {})
    const commands: [string, string][] = [
      ['bm-ids', 'Diagnostics: compare captured prompt ids with the ids drawn on screen'],
      ['bm-jump', 'Diagnostics: scroll to a prompt (first | last | N | r<N> | uuid)'],
      ['bm-pane', 'Diagnostics: open the prompts pane without the band; type a number and Enter to jump'],
      ['bm-marks', 'List the marks set in this conversation'],
      ['bm-delmarks', 'Delete marks: /bm-delmarks a b (letters), or /bm-delmarks all'],
      ['bm-env', 'Show the version, the session id and what has been captured'],
      ['bm-config', 'Show every setting, its value and where it came from'],
      ['bm-timeline', 'Diagnostics: show the last N plugin events (draws, appends, pane, store, toast, scroll)'],
      ['bm-sel', 'Diagnostics: show what Claude Code reports for your mouse selection'],
      ['bm-pin', 'Pin or unpin prompt #N in the prompts pane (no number: the newest)'],
      // Typed commands for the same actions as the band leader (they also work as
      // `command:<name>` keybindings, 2.1.290). A pane they open takes the keyboard from
      // an empty input box; over a draft they point to the band leader instead.
      ['bm-mark', 'Set a mark: opens the mark pane, then press a letter'],
      ['bm-goto', 'Jump to a mark: opens the jump pane, then press a letter'],
      ['bm-prompts', 'Jump to a prompt: opens the prompts pane, then type its number'],
      ['bm-read', 'Reading position: go there, or back to where you were'],
      ['bm-bookmarks', 'List the bookmarks of this conversation; type a number and Enter to jump'],
      ['bm-promote', 'Promote a mark into a bookmark: /bm-promote a'],
      ['bm-diag-keys', 'Diagnostics: log each keystroke in the input box (on | off | toggle)'],
      ['bm-debug', 'Echo the plugin\'s log lines into this conversation as dim rows (on | off | status), or turn debug channels on (channels | enable | disable); off by default'],
    ]
    for (const [name, description] of commands) {
      await $.command.register({ name, description, immediate: true })
    }

    // The model's tool: what it takes and how it answers is core/bookmark-tool.ts.
    try {
      const t = await $.tool.register(BOOKMARK_TOOL)
      log($, `[bm] tool registered: ${t.tool}`)
    } catch (err) {
      log($, `[bm] tool.register failed: ${String(err)}`, { always: true })
    }
    try {
      const reg = await loadRegister($)
      log($, `[bm] register: ${reg.perma.length} bookmark(s), rev ${reg.rev}, ${await registerPath($)}`)
      // Temporary bookmarks age out (a setting later, #7); each leaves a tombstone.
      const { register: pruned, pruned: gone } = prune(reg, TEMPORARY_RETENTION, await $.clock.now())
      if (gone.length > 0) {
        await saveRegister($, pruned)
        log($, `[bm] register: pruned ${gone.length} temporary bookmark(s) older than ${TEMPORARY_RETENTION}`)
      }
    } catch (err) {
      log($, `[bm] register failed to load: ${String(err)}`, { always: true })
    }

    markCache.replace(await loadMarks($))
    // Stamp selections as they change, so a stale one is ignored (freshSelection).
    markState.stopPoll()
    await pollSelection($)
    markState.startPoll(() => $.clock.every(1000, () => void pollSelection($)))
    // Not awaited: session start should not wait on a third of a second of PowerShell.
    void pruneStoreNow($)
      .catch(err => log($, `[bm] store prune failed: ${String(err)}`))
      .then(() => backfillPrompts($))
      .catch(err => log($, `[bm] backfill failed: ${String(err)}`))

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

  // The next prompt ends the temporary highlight.
  on('prompt.submit', async ($, e, next) => {
    await clearShown($)
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
      await bandStep($, e.element === 'band-num-k' ? -1 : 1)
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
    if (e.origin.kind === 'person' && paneFilter) {
      log($, '[bm] Esc cleared the prompts filter; the pane stays')
      paneFilter = ''
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
    // message is; its text tells them apart (NOT_A_PROMPT, core/prompt-rows.ts).
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
          await keepPrompt($, { uuid: row.uuid, head: row.head })
          await keepPromptText($, row.uuid, text)
        }
      }
    }
    // A footnote (#33): the person's slash command, `!` shell command or interruption,
    // kept with the prompt it follows, as the back-fill keeps it.
    if (!e.agentId && !queued && e.door !== 'response') {
      const fn = footnoteOf({ type: 'user', isMeta: e.message.isMeta, message: { content: e.message.content } })
      if (fn) await keepFootnote($, { ...fn, uuid: e.uuid, after: (await keptPrompts($)).at(-1)?.uuid ?? null })
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
    if (!rendered.has(e.requestId)) {
      const text = headOf(e.props.text ?? '')
      rendered.set(e.requestId, text)
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
        queueProseAnchors($, anchors)
      }
      // A perma record's link is drawn without the bookmark glyph (#21).
      const reg = await loadRegister($)
      const isPerma = (href: string) => {
        const a = parseAnchor(href)
        const r = a && findRecord(reg, a.uuid)
        return r ? tierOf(r) === 'perma' : false
      }
      const [first] = marksHere
      const colored = first && colorSplit(e.props.text, first[0], first[1].snippet)
      // A mark whose words don't sit on one line: the bold «a» form.
      let text = e.props.text
      for (const [letter, m] of marksHere) {
        const s = m.snippet
        if (s && !/[*`_]/.test(s) && text.includes(s)) text = text.replace(s, `**«${letter}» ${s}**`)
        else text = `> **«${letter}» ${s ?? m.head}**\n\n${text}`
      }
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
        href => onAnchorPress($, href),
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
    const arg = e.args.trim()
    const target = jumpTarget(arg, await allRows($))
    if (target.kind === 'row') await jumpTo($, target.uuid, '/bm-jump', target.label)
    else if (target.kind === 'raw') await jumpTo($, target.uuid, '/bm-jump (raw uuid)', 'raw')
    else log($, `[bm] nothing captured for "${arg}" (${target.prompts} prompts captured since load)`)
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
    await update($, bandNum, () => '')
    await update($, bandGroup, () => 0)
    await openFor($, 'bookmarks', 'command:bm-bookmarks')
    return {}
  })
  on('command.run', { command: 'bm-promote' }, async ($, e) => {
    const letter = (e.args ?? '').trim()
    if (!/^[a-z`]$/.test(letter)) {
      $.ui.toast('/bm-promote <letter>: promote that mark into a bookmark')
      return {}
    }
    await promoteLetter($, letter)
    return {}
  })
  on('command.run', { command: 'bm-read' }, async $ => {
    await readingToggle($)
    return {}
  })

  on('command.run', { command: 'bm-pane' }, async $ => {
    await update($, paneMode, () => 'list')
    await $.ui.open({ id: PANE, title: 'prompts: type #', focus: true, closeOnEscape: true })
    // The slash-command route to a focused pane (typed, or a `command:bm-pane`
    // keybinding, 2.1.290): record whether the pane actually got the keyboard.
    log($, `[bm] /bm-pane opened; pane has the keyboard: ${(await paneFocused($)) ? 'yes' : 'NO'}`)
    return {}
  })

  // /bm-delmarks: what it deletes is core/marks.ts deleteMarks (vim's :delmarks).
  on('command.run', { command: 'bm-delmarks' }, async ($, e) => {
    const { letters, gone, missing, kept } = deleteMarks(await loadMarks($), e.args, LETTERS)
    if (letters.length === 0) {
      $.ui.toast('Usage: /bm-delmarks a b   (or /bm-delmarks all)')
      return {}
    }
    await $.store.set(await marksKey($), kept)
    markCache.replace(kept)
    const showing = await read($, shown)
    if (showing && gone.includes(showing.letter)) await clearShown($)
    log($, `[bm] deleted marks ${gone.join(' ') || '(none)'}${missing.length ? `; not set: ${missing.join(' ')}` : ''}`)
    $.ui.toast(gone.length ? `deleted mark${gone.length > 1 ? 's' : ''} ${gone.join(' ')}` : `not set: ${missing.join(' ')}`)
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
  on('tool.call', { tool: /^mcp__bookmarks__bookmark$/ }, async ($, e) => {
    const { tool, tool_use_id, agentId, requestMeta, ...input } = e as unknown as Record<string, unknown>
    void agentId
    void requestMeta
    log($, `[bm] ${String(tool)} called (${String(tool_use_id).slice(0, 12)}) with ${cut(JSON.stringify(input), 160)}`, { text: true })
    const answer = toolAnswer
    const { query, uuid, label, action, tierAsked, owner, why, words: wordsAsked, temporary } = parseToolInput(input)
    if (action !== 'list' && !query && !uuid) return answer({ error: 'give `query` (a short verbatim fragment of the message) or `uuid`' })
    const root = await dataRoot($)
    const describe = (r: AnchorRecord) => describeRecord(r, root)
    const brief = briefRow

    if (action === 'list') {
      const reg = await loadRegister($)
      return answer({ yours: listOf(reg, 'user').map(describe), claudes: listOf(reg, 'claude').map(describe), tombstones: reg.tombstones.length })
    }

    if (action === 'relabel' || action === 'remove' || action === 'share' || action === 'claim') {
      // These act on a record that exists: by uuid (full or 8+ prefix) on `owner`'s list
      // (Claude's, for a claim).
      const from: AnchorOwner = listActedOn(action, owner)
      const reg = await loadRegister($)
      let target = uuid ? findRecord(reg, uuid, from) : undefined
      if (!target && query) {
        const found = await resolveTarget($, { fragment: query })
        if (found.kind === 'one') target = findRecord(reg, found.row.uuid, from)
        else if (found.kind === 'many') target = found.rows.map(r => findRecord(reg, r.uuid, from)).find(Boolean)
      }
      if (!target) return answer({ error: `no bookmark for that on ${listName(from)} list`, hint: 'action: "list" shows both lists with their uuids' })
      const now = await $.clock.now()
      if (action === 'claim') {
        const r = claim(reg, target.uuid, now)
        if ('error' in r) return answer(r)
        await saveRegister($, r.register)
        log($, `[bm] bookmark claimed by the person: ${short(target.uuid)} "${r.record.label}"`, { text: true })
        return answer({ ok: true, claimed: describe(r.record), note: "now on the person's list; same message, id and link" })
      }
      if (action === 'remove') {
        const r = remove(reg, target.uuid, owner, `claude${owner === 'user' ? ' (on the person\'s behalf)' : ''}`, now)
        if ('error' in r) return answer(r)
        await saveRegister($, r.register)
        log($, `[bm] bookmark removed from ${owner}'s list: ${short(target.uuid)} "${target.label}" (tombstoned)`, { text: true })
        return answer({ ok: true, removed: describe(r.removed), note: 'archived as a tombstone in the register, not deleted' })
      }
      if (action === 'share') {
        const to: AnchorOwner = owner === 'claude' ? 'user' : 'claude'
        const r = share(reg, target.uuid, owner, to, now)
        if ('error' in r) return answer(r)
        await saveRegister($, r.register)
        await writeExport($, r.register, { uuid: target.uuid, sessionId: r.register.sessionId }, '', now)
        log($, `[bm] bookmark shared ${owner} -> ${to}: ${short(target.uuid)} "${r.record.label}"`, { text: true })
        return answer({ ok: true, added: r.added, shared: describe(r.record), note: `now on ${listName(to)} list too; the original stays` })
      }
      // relabel
      if (!label && why === undefined && typeof input.words !== 'string') return answer({ error: 'relabel needs `label`, `why` or `words`' })
      const minted = await mintBookmark(
        $,
        {
          uuid: target.uuid,
          owner,
          label: label ?? target.label,
          ...(why !== undefined ? { why } : {}),
          ...(wordsAsked ? { words: wordsAsked } : {}),
          ...(temporary ? { temporary: true } : {}),
          ...(tierAsked ? { tier: tierAsked } : {}),
          head: target.head,
          by: 'claude',
          source: target.source,
        },
        '',
      )
      return answer({ ok: true, relabelled: describe(minted.record) })
    }

    if (!label) return answer({ error: 'give `label`: what the bookmark is for, a few words' })
    const found = await resolveTarget($, uuid ? { uuid } : { fragment: query })
    log($, `[bm] bookmark: ${found.kind}${'via' in found && found.via ? ` via ${found.via} in ${found.ms} ms` : ''}${found.kind === 'none' ? `: ${found.reason}` : ''}`)
    if (found.kind === 'none') return answer({ error: found.reason, hint: 'use a verbatim fragment that appears in the message itself, or its uuid' })
    if (found.kind === 'many') {
      return answer({
        ambiguous: true,
        note: 'several messages contain that fragment; the earliest is where it was first said. Call again with `uuid` to choose, or a longer fragment.',
        earliest: brief(found.earliest),
        candidates: found.rows.slice(0, 12).map(brief),
      })
    }
    const row = found.row
    const words = wordsAsked ?? (query || undefined)
    const minted = await mintBookmark(
      $,
      {
        uuid: row.uuid,
        owner,
        label,
        ...(why ? { why } : {}),
        ...(words && row.text.includes(words) ? { words } : {}),
        ...(temporary ? { temporary: true } : {}),
        tier: tierFor(tierAsked, owner),
        line: row.line,
        bytes: [row.byteStart, row.byteEnd],
        head: headOf(row.text),
        by: 'claude',
        source: 'tool',
        transcript: (await transcriptPath($))?.replace(/\\/g, '/'),
        role: row.role,
        ...(row.timestamp ? { timestamp: row.timestamp } : {}),
      },
      row.text,
    )
    return answer({
      ok: true,
      added: minted.added,
      owner,
      anchor: minted.href,
      markdown: minted.markdown,
      ...brief(row),
      words: minted.record.words,
      export: minted.exportPath,
      note: `on ${listName(owner)} list. Write \`markdown\` in your reply as the citation; a plain click jumps there, a ctrl-click opens the export`,
    })
  })

  // /bm-debug lives in hooks/handlers/debug-command.ts; this is its ports (hooks/engine/ports.ts):
  // each engine call it needs, spelled here, where the validator follows `$`.
  on('command.run', { command: 'bm-debug' }, async ($, e) => {
    await debugCommand(e.args ?? '', {
      toast: text => $.ui.toast(text),
      log: (line, always) => log($, line, always ? { always: true } : undefined),
      channelsOn: () => {
        readChannels($)
        return channelsOn
      },
      setChannels: next => setChannels($, next as Set<Channel>),
      setSessionEcho: choice => setSessionEcho($, choice),
      setEchoPolicy: policy => setEchoPolicy($, policy),
      echoState: () => echoStateLine($),
      logPath: () => logPath,
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

  // The band, above the prompt: its Buttons carry the borrowed engine actions, so the
  // chords bound to those actions in keybindings.json press them from the input box.
  // (A copy on the hint line under the prompt was tried on 2026-10-04 and removed: it
  // sat below the status line, and the band reads better above the prompt.)
  // The band is drawn by views/band.tsx; this hook gathers what it draws (the model) and
  // what its presses do (the actions, closures over `$`).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const elements = $.ui.resolve(e)
    const theirs = await next(e)
    const last = await read($, shown)
    band.drawn(e.requestId)
    const mode = await read($, bandMode)
    const marks = mode === 'idle' ? {} : await loadMarks($)
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
      { mode, shown: last, help, marks, letters: LETTERS, readingLetter: READING, typed: await read($, bandNum), count, groupTitle, listKeys, bar, cmdRev: await read($, cmdRev) },
      {
        endBandMode: () => endBandMode($),
        readingToggle: async () => { await readingToggle($); await done('band-command') },
        jumpToMark: async l => { await jumpToMark($, l); await done('jump') },
        setMark: async l => { await setMark($, l); await done('mark-set'); await restoreView($) },
        cancel: () => done('esc'),
        listKey: op => bandListKey($, op),
        digit: d => bandDigit($, d),
        dot: () => bandDot($),
        go: () => bandNumberGo($),
        runCommandLine: (typed, kind) => runCommandLine($, typed, kind),
        perform: (key, id, action) => perform($, route(key, { pane: 'none' }).operation, action ?? `button:${id}`),
      },
      { text: style, button: buttonStyle },
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // Every surface draws an Input except the mobile app (no fields yet).
    const Input = 'Input' in elements ? elements.Input : undefined
    const mode = (await read($, paneMode)) as PaneMode

    if (mode === 'list') {
      // Every prompt the mod knows, numbered in the order sent (#1 the first), listed
      // newest first (djdarcy, 2026-10-04). The number is typed into a focused Input
      // (djdarcy: "Ctrl-X p 21 <enter>"): it jumps on Enter, or at once when the digits
      // typed can't become a larger prompt number (with 25 prompts, `3` jumps, `2`
      // waits for 2x or Enter). A hotkey is one character, so it can't do this.
      const all = await prompts($)
      const numbered = numberNewestFirst(all)
      // The list's model (numbering, footnotes under their prompt, the pinned group, the
      // pointer, the dim rule): core/list-model.ts. The rows are drawn here.
      const kept = await keptFootnotes($)
      const byPrompt = footnotesByPrompt(all.map(p => p.uuid), kept)
      const footnoteMode = currentSettings().footnotes
      const footnoteRows = (n: number) => {
        const list = byPrompt.get(n)
        const display = footnoteDisplay(footnoteMode, !!list, unfoldedFootnotes.has(n))
        if (!list || display === 'none') return []
        if (display === 'folded') {
          return [
            <Button key={`fn-fold-${n}`} label={foldedLabel(list.length)} plain {...buttonStyle('footnote')}
              onPress={async () => { unfoldedFootnotes.add(n); await update($, viewRev, v => v + 1) }} />,
          ]
        }
        const rows = list.map(({ f, k }) => (
          <Button key={`fn-${f.uuid}`} label={`   ${n}.${k} ${f.label}`} plain {...buttonStyle('footnote')}
            onPress={async () => {
              await jumpTo($, f.uuid, 'prompts pane', `footnote ${n}.${k}`)
              await settle($, 'list', 'row-press')
            }} />
        ))
        // Folded by default and opened by hand: a row to fold them again (djdarcy,
        // 2026-10-12: "a way to "recollapse" our "footnotes" ... after we open them").
        if (display === 'open') return rows
        return [
          ...rows,
          <Button key={`fn-refold-${n}`} label="      ▴ fold" plain {...buttonStyle('footnote')}
            onPress={async () => { unfoldedFootnotes.delete(n); await update($, viewRev, v => v + 1) }} />,
        ]
      }
      const width = numberWidth(all.length)
      const numberLabel = (n: number) => numberLabelAt(n, width)
      const go = (typed: string) => jumpToPromptNumber($, typed, 'prompts pane')
      // Pinned prompts: listed first, in the order pinned, and starred in the full list.
      await read($, pinsRev) // read so a pin toggle redraws the pane
      await read($, viewRev) // and so a scroll that moves the nearest prompt redraws it
      const drawnFour = drawnFourOf(rendered.keys())
      const pinIds = await loadPins($)
      const byUuid = new Map(numbered.map(r => [r.uuid, r]))
      // The filter (#28): only the prompts matching `/words` in the field; numbers kept.
      const texts = await promptTexts($)
      const filtered = filterPrompts(numbered, paneFilter, r => texts.get(r.uuid) ?? r.head)
      const listed = new Set(filtered.shown.map(r => r.uuid))
      const matchLine = matchLegend(filtered.shown.length, filtered.of, paneFilter)
      const pinnedRows = pinnedRowsOf(pinIds, byUuid, listed)
      const pinSet = new Set(pinIds)
      type NumberedPrompt = (typeof numbered)[number]
      const fromBand = (await read($, bandMode)) === 'list' ? await read($, bandNum) : undefined
      const targetN = fromBand ? Number(fromBand) : undefined
      const pointer = pointerFor(fromBand, targetN)
      // The prompt nearest the view, drawn with its number in yellow (djdarcy, 2026-10-11:
      // "so the user knows roughly where they are" and can read what they were thinking
      // above and below). Redrawn on every render, so it follows the view while the pane
      // is open.
      const here = await promptHere($)
      viewTracker.drewHere(here)
      // Centre the list on the nearest prompt once the rows below exist (set by
      // openFor). A timer, since a render hook may not scroll; by then the draw is done.
      if (pendingCentre) {
        const target = pendingCentre
        pendingCentre = undefined
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
      const promptRow = (r: NumberedPrompt, group: string) => {
        const isHere = r.uuid === here
        const dim = unreached(drawnFour, r.uuid) && !isHere
        const press = async () => {
          await jumpTo($, r.uuid, 'prompts pane', `prompt #${r.n}`, r.head)
          await settle($, 'list', 'row-press')
        }
        if (!pinSet.has(r.uuid) && !isHere) {
          return <Button key={`${group}-${r.uuid}`} label={`${pointer(r.n)}${numberLabel(r.n)}${r.head}`} plain {...(dim && r.n !== targetN ? buttonStyle('unreached') : {})} onPress={press} />
        }
        // `245★) `: a gold star inside the number, so it reads as the row's marker, not
        // part of the prompt (djdarcy, 2026-10-05, over a background band and a star
        // before the number). A Button's label takes no colour at rest (2.1.289), so the
        // number and star are Text beside the Button; flexShrink 0 keeps them from being
        // squeezed to nothing next to a long label that wraps (seen in the look test).
        // The nearest-to-view row uses the same shape with its number in yellow.
        return (
          <Box key={`${group}-row-${r.uuid}`} flexDirection="row">
            <Box flexShrink={0}>
              <Text {...(dim ? style('unreached') : {})} {...(isHere ? style('here') : {})}>{`${pointer(r.n)}${String(r.n).padStart(width)}`}</Text>
              {pinSet.has(r.uuid) && <Text {...style('pinned')}>★</Text>}
              <Text {...(dim ? style('unreached') : {})} {...(isHere ? style('here') : {})}>{') '}</Text>
            </Box>
            <Button key={`${group}-${r.uuid}`} label={r.head} plain {...(dim ? buttonStyle('unreached') : {})} onPress={press} />
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          {numbered.length === 0 && <Text {...style('legend')}>No prompts yet.</Text>}
          {numbered.length > 0 && Input && (
            <Input
              key="prompt-number"
              label="#"
              placeholder={`1-${all.length}, or /words to filter`}
              submitLabel="jump"
              {...(fromBand !== undefined ? { value: fromBand } : {})}
              autoFocus
              onInput={(typed: string) => {
                // `q` closes the pane, as in the band (Q261012-09).
                if (typed === 'q') return void closeAll($, 'prompts pane')
                // `/words` filters the list (#28); clearing the slash clears the filter.
                const query = typed.startsWith('/') ? typed.slice(1) : ''
                if (query !== paneFilter) {
                  log($, `[bm] prompts filter: "${cut(query, 40)}"`, { text: true })
                  paneFilter = query
                  void update($, viewRev, v => v + 1)
                  return
                }
                if (promptNumberComplete(typed, all.length)) void go(typed)
              }}
              onSubmit={(typed: string) => void go(typed)}
            />
          )}
          {/* One by one through this list (djdarcy, 2026-10-04): the pane keeps the arrows
              for scrolling, but Tab walks the focus ring down the Buttons below from the
              newest, Shift+Tab back up, Enter jumps. A Select was tried: on the terminal
              its arrows open a pop-up list of its own instead (screenshot, 2026-10-04). */}
          {numbered.length > 0 && <Text {...style('legend')}>or Tab / Shift+Tab, Enter; *N pins</Text>}
          {here && (
            <Text {...style('legend')}>
              <Text {...style('here')}>#N</Text> = nearest to your view
            </Text>
          )}
          {matchLine && <Text {...style('legend')}>{`/${paneFilter}: ${matchLine}`}</Text>}
          {pinnedRows.length > 0 && <Text {...style('legend')}>★ pinned</Text>}
          {pinnedRows.map(r => promptRow(r, 'pin'))}
          {pinnedRows.length > 0 && <Text {...style('legend')}>all prompts</Text>}
          {numbered.filter(r => listed.has(r.uuid)).flatMap(r => [promptRow(r, 'p'), ...footnoteRows(r.n)])}
          {footnoteRows(0)}
        </Box>
      )
    }

    if (mode === 'bookmarks') {
      // Every bookmark of this conversation, numbered in the order minted (#1 the first,
      // so a number stays good), listed newest first like the prompts. Digits typed in
      // the band show in the `#` field and as a ▶; Enter jumps and highlights the words.
      const all = await bookmarkList($)
      const numbered = numberNewestFirst(all)
      const width = numberWidth(all.length)
      const fromBand = (await read($, bandMode)) === 'bookmarks' ? await read($, bandNum) : undefined
      const targetN = fromBand ? Number(fromBand) : undefined
      const pointer = pointerFor(fromBand, targetN)
      const go = (typed: string) => jumpToBookmarkNumber($, typed, 'bookmarks pane')
      const now = Date.now()
      // One group at a time, one numbering across all of them. The band's h/l cycle the
      // group; the header shows where you are.
      const groupIndex = await read($, bandGroup)
      const group = BOOKMARK_GROUPS[groupIndex] ?? BOOKMARK_GROUPS[0]!
      const inGroup = (g: (typeof BOOKMARK_GROUPS)[number]) => (g.owner === 'all' ? numbered : numbered.filter(r => ownerOf(r) === g.owner))
      const shownRows = inGroup(group)
      const header = groupHeader(BOOKMARK_GROUPS, group, g => inGroup(g).length)
      const who = (r: (typeof numbered)[number]) => bookmarkWho(r, now)
      // Dim as the prompts pane dims: by the uuid's first four groups, since a drawn id
      // differs in its last (refactor-advisor 2026-10-12 row 17: by exact id, every
      // bookmark row was dim).
      const drawnFour = drawnFourOf(rendered.keys())
      const row = (r: (typeof numbered)[number]) => {
        const dim = unreached(drawnFour, r.uuid) && r.n !== targetN
        return (
          <Box key={`b-row-${r.uuid}-${ownerOf(r)}`} flexDirection="column">
            <Box flexDirection="row">
              <Box flexShrink={0}>
                <Text {...(dim ? style('unreached') : {})}>{`${pointer(r.n)}${String(r.n).padStart(width)}) `}</Text>
                {LINK_MARKERS === 'glyph' && <Text {...style('pinned')}>⚓ </Text>}
              </Box>
              <Button
                key={`b-${r.uuid}-${ownerOf(r)}`}
                label={r.label}
                plain
                {...(dim ? buttonStyle('unreached') : {})}
                onPress={async () => {
                  await arriveAtBookmark($, r, 'bookmarks pane')
                  await settle($, 'bookmarks', 'row-press')
                }}
              />
            </Box>
            <Text {...style('legend')} wrap="truncate-end">
              {`${' '.repeat(width + 4)}${who(r)}${r.why ? ` · ${r.why}` : ''}`}
            </Text>
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          {numbered.length === 0 && <Text {...style('legend')}>No bookmarks yet. Claude mints them with its bookmark tool; P + a letter promotes one of your marks.</Text>}
          {numbered.length > 0 && Input && (
            <Input
              key="bookmark-number"
              label="#"
              placeholder={`1-${all.length}`}
              submitLabel="jump"
              {...(fromBand !== undefined ? { value: fromBand } : {})}
              autoFocus
              onInput={(typed: string) => {
                if (typed === 'q') return void closeAll($, 'bookmarks pane')
                if (promptNumberComplete(typed, all.length)) void go(typed)
              }}
              onSubmit={(typed: string) => void go(typed)}
            />
          )}
          {numbered.length > 0 && <Text>{header}</Text>}
          {numbered.length > 0 && shownRows.length === 0 && <Text {...style('legend')}>{`No bookmarks in "${group.title}" yet.`}</Text>}
          {shownRows.map(row)}
          {numbered.length > 0 && <Text {...style('legend')}>{listHint('bookmarks')}</Text>}
        </Box>
      )
    }

    // What the surface actually gave the pane, logged at close: says whether the
    // narrow request held or the engine has a minimum width.
    paneGeometry = `${e.props.placement}, ${e.props.bodyColumns} body columns`

    // mark / jump: the vim leg. One letter completes it.
    const marks = await loadMarks($)
    const used = LETTERS.filter(l => marks[l])
    const press = async (l: string) => {
      if (mode === 'mark') await setMark($, l)
      else await jumpToMark($, l)
      await settle($, mode, mode === 'mark' ? 'mark-set' : 'jump')
      await restoreView($)
    }

    // Jump needs only the letters in use: one per line, `a: <text>`, so the pane can
    // stay narrow (djdarcy, 2026-10-04, "collapsed any smaller").
    if (mode === 'jump') {
      // The reading position (Ctrl+X Space) heads the list (djdarcy, 2026-10-04). A hotkey
      // must be a letter or digit, so it can't be pressed by ` or Space; instead the
      // pane's focus starts on it, and Ctrl+X ' then Enter goes there.
      const reading = marks[READING]
      return (
        <Box flexDirection="column">
          {used.length === 0 && !reading && <Text {...style('legend')}>No marks yet. Esc</Text>}
          {reading && (
            <Button
              key="jump-reading"
              label={`␣ reading: ${reading.head.slice(0, 32)}`}
              plain
              autoFocus
              onPress={async () => {
                await goToReading($, reading, 'jump pane reading')
                await settle($, mode, 'band-command')
              }}
            />
          )}
          {used.map(l => (
            <Button key={`jump-${l}`} hotkey={l} label={(marks[l]?.head ?? '').slice(0, 40)} plain onPress={() => press(l)} />
          ))}
        </Box>
      )
    }

    // Mark: any letter. Letters in use are drawn at full strength and listed below with
    // their text, letter in bold (a Button has no bold), like vim's :marks; free
    // letters are dim.
    return (
      <Box flexDirection="column">
        <Text {...style('legend')}>Mark as: (Esc)</Text>
        <Box flexDirection="row" columnGap={1} flexWrap="wrap">
          {LETTERS.map(l => (
            // A Button takes no color (djdarcy asked for "slightly grayreddish"), and a
            // non-plain `primary` one draws as a wider `[ a ]` that breaks the grid
            // (screenshot, 2026-10-04). So a letter in use shows a dot, `a: ●`, at
            // full strength; a free one shows itself, dim. Same width either way.
            <Button key={`mark-${l}`} hotkey={l} label={marks[l] ? '●' : l} plain {...(marks[l] ? {} : buttonStyle('unused'))} onPress={() => press(l)} />
          ))}
        </Box>
        {used.length === 0 && <Text {...style('legend')}>No marks in this session yet.</Text>}
        {used.map(l => (
          <Text wrap="truncate-end">
            <Text {...style('emphasis')} {...style('used')}>{l}</Text> ▸ {marks[l]?.head}
          </Text>
        ))}
      </Box>
    )
  })
}
