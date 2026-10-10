// claude-bookmarks POC -- a throwaway probe, not the product.
//
// It answers five questions before anything real is built (the DWP's B1-B5):
//   B1  is a UserMessage row's requestId the transcript uuid session.append reports?
//   B2  can $.ui.scroll reveal a row that has not been drawn since the mod loaded?
//   B3  does a typed command count as "the person's own input" for scroll?
//   B4  does a chord bound to a borrowed engine action press a mod Button?
//   B5  does a press in a mod pane count as the person's input for scroll?
//
// Every probe reports with $.ui.log (a dim transcript row Claude never reads) or a
// toast. No command answers with `text`, because that text becomes a row Claude reads.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { PaneMode, Row } from '../types'
import { describePathOrder } from './engine/select'
import {
  anchorHref, anchorMarkdown, anchorPath, markLinks, markdownLinks, ownerOf, parseAnchor,
  type AnchorOwner, type AnchorRecord, type MarkerStyle,
} from './core/anchor'
import {
  addOrRelabel, emptyRegister, exportMarkdown, exportNotesOf, findRecord, listOf, parseRegister, prune, remove, serializeRegister, share,
  type Mint, type Register as BookmarkRegister, type Retention,
} from './core/register-file'

// How long a `temporary` bookmark is kept before it is pruned (to a tombstone). A
// setting with the archive-retention picker (#7, #10); a constant until then.
const TEMPORARY_RETENTION: Retention = '30d'
import { headOf, jsonEscaped, resolveRows, rowsFromGrep, uuidPattern, type Resolution, type TranscriptRow } from './core/transcript-lines'

const PANE = 'bm-poc'

// Claude Code builds the borrowed-action chords (below) were verified on. The
// start-up tripwire toasts on any other build, because a new build could give a
// borrowed action a handler of its own. Add a build here after re-verifying.
const VERIFIED_CLIENTS = ['2.1.288', '2.1.289', '2.1.290']

// Engine keybinding actions borrowed for the chord test (B4). Neither should have a
// handler mounted while the built-in diff mod is enabled; the version check in
// session.start is how we notice when a new build might have changed that.
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
const BOOKMARK_GROUPS: { owner: AnchorOwner | 'all'; title: string }[] = [
  { owner: 'user', title: 'yours' },
  { owner: 'claude', title: "Claude's" },
  { owner: 'all', title: 'all' },
]
const GROUP_CYCLE = { prev: 'h', next: 'l' } as const

// The highlight and the band text are temporary (djdarcy, 2026-10-03: "visible temporarily
// for maybe a minute or two or until the next action like another prompt is sent").
// Only the mark just set or jumped to is shown; it clears after HIGHLIGHT_MS or on the
// next prompt. Display only: nothing here touches what session.append stores.
const HIGHLIGHT_MS = 120_000
let clearTimer: Timer | undefined

async function showMark($: EngineInterface, letter: string, text: string) {
  await update($, shown, () => ({ letter, text }))
  clearTimer?.cancel()
  clearTimer = $.clock.after(HIGHLIGHT_MS, () => {
    void clearShown($)
  })
  note(`show mark ${letter} for ${HIGHLIGHT_MS / 1000}s`)
}

async function clearShown($: EngineInterface) {
  clearTimer?.cancel()
  clearTimer = undefined
  if (await read($, shown)) {
    await update($, shown, () => null)
    note('highlight cleared')
  }
}

// The session's marks, kept in memory so render hooks can read them without a store
// call per row. Loaded at session.start and refreshed on every mark write.
let markCache: Record<string, Mark> = {}

// The first line of a selection, which is what a row redraw searches for: a match
// across lines would have to rewrite markdown structure, which this POC won't do.
const snippetOf = (text: string) => (text.split('\n').find(l => l.trim()) ?? '').trim().slice(0, 120)

// Round 4 colors (dark terminal; a light background would need a lighter LINE_BG).
// LINE_BG: darker than the selection blue #264F78 so it reads as a soft band.
const LINE_BG = '#1B3754'
const WORDS_FG = 'yellow'
// A letter already in use, in the mark pane's list: a muted grey-red, "this one is taken".
const USED_FG = '#B07A7A'

// Split a reply's markdown around the line holding `snippet`, for drawing that line
// ourselves. Undefined (caller falls back to bold) when the split is risky: no match,
// the line is inside a fenced code block, or the remainder is too long for Markdown.
// A selection is copied from the RENDERED reply, so `**bold**`, `code` and [links](url)
// have lost their markup; compare against each source line with the same markup removed.
// (Matching the raw markdown missed any line with inline formatting, 2026-10-04.)
const plainMarkdown = (s: string) =>
  s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`/g, '')

function colorSplit(text: string, letter: string, snippet: string | undefined) {
  if (!snippet) return undefined
  const lines = text.split('\n')
  const idx = lines.findIndex(l => plainMarkdown(l).includes(snippet))
  if (idx < 0) return undefined
  const fences = lines.slice(0, idx).filter(l => l.trimStart().startsWith('```')).length
  if (fences % 2 === 1) return undefined
  const before = lines.slice(0, idx).join('\n').trimEnd()
  const after = lines.slice(idx + 1).join('\n').trim()
  if (after.length > 9000) return undefined
  // The blank line between paragraphs, which the trims above drop: kept so the marked
  // line keeps its spacing (2026-10-04: marking a line joined it to the paragraph
  // above). Each side's own markdown draws its inner spacing; only the seam is ours.
  const gapAbove = idx > 0 && !lines[idx - 1]?.trim() && before.length > 0
  const gapBelow = idx + 1 < lines.length && !lines[idx + 1]?.trim() && after.length > 0
  // The line is drawn as plain Text, from its markup-free form.
  const line = plainMarkdown(lines[idx] ?? '')
  const at = line.indexOf(snippet)
  return {
    before,
    pre: line.slice(0, at),
    snippet,
    post: line.slice(at + snippet.length),
    after,
    letter,
    gapAbove,
    gapBelow,
  }
}

// The shown mark, if it is on this row: by real uuid, or a drawn id sharing its first
// four groups. Only the one mark currently shown is ever highlighted.
function marksOnRow(requestId: string, showing: string | undefined): [string, Mark][] {
  if (!showing) return []
  return Object.entries(markCache).filter(
    ([letter, m]) =>
      letter === showing &&
      m.source === 'selection' &&
      (m.uuid === requestId || firstFour(m.uuid) === firstFour(requestId)),
  )
}

// Ids seen at UserMessage render time since this module loaded. A module variable on
// purpose: a render hook may not write $.state, and a reload SHOULD forget these,
// which is what makes the B2 test ("never drawn since load") possible.
const rendered = new Map<string, string>()

// Which messages are on screen now, as the render hooks last reported them (a
// message's `onScreen`; null or absent drops it). Lets the reading position tell
// "am I there already?" and note where the person was before a jump.
// Each report is stamped: Claude Code reports a message when drawn and, on a scroll,
// only the messages at the viewport's edges, so one that leaves the screen in a single
// jump (Ctrl+End) is never reported gone and goes stale here (2026-10-04: "nowhere to
// go" right after Ctrl+End). Only the latest burst of reports is trusted.
const onScreenNow = new Map<string, { first: number; last: number; of: number; at: number }>()
function noteOnScreen(requestId: string, onScreen: { first: number; last: number; of: number } | null | undefined) {
  // A command run from a key (`command:bm-read`) is drawn for a moment under a
  // temporary `placeholder…` id; as the newest report it became "where you were", and
  // the way back was refused once it vanished (log, 2026-10-06 04:03:29). Only real
  // message ids count.
  if (!/^[0-9a-f]{8}-/.test(requestId)) return
  if (!onScreen) return void onScreenNow.delete(requestId)
  // A redraw that repeats the same lines is not news: clearing the reading position's
  // highlight after a "back" jump redrew it, off screen, with its old lines, which made
  // it look freshly on screen, so the next press "stayed put" at the bottom (djdarcy,
  // 2026-10-07; log 08:15:48 -> 08:15:53). Only a change of lines refreshes the time.
  const before = onScreenNow.get(requestId)
  const same = before && before.first === onScreen.first && before.last === onScreen.last && before.of === onScreen.of
  onScreenNow.set(requestId, { ...onScreen, at: same ? before.at : Date.now() })
}
const FRESH_MS = 1500
function freshOnScreen(): string[] {
  const newest = Math.max(0, ...[...onScreenNow.values()].map(v => v.at))
  return [...onScreenNow.entries()].filter(([, v]) => v.at >= newest - FRESH_MS).map(([id]) => id)
}

// A timeline of what the mod saw and did, so a drawn-id mismatch can be lined up
// against the pane, store and toast activity just before it. Module-level: a reload
// starts it over, the same as `rendered`.
const timeline: { t: number; what: string }[] = []
function note(what: string) {
  timeline.push({ t: Date.now(), what })
  if (timeline.length > 400) timeline.shift()
}
// The [bm-poc] log lines, also written to <user dir>/bookmarks/debug/<session>.log:
// $.ui.log rows are only drawn, so a session that reads files (Claude, while
// developing this) cannot see them. Kept outside the plugin folder on purpose: a write
// inside it trips the folder watch and reloads the mod on every line. $.fs has no
// append, so the file is rewritten whole, last 400 lines, one write at a time.
const LOG_LINES = 400
const logLines: string[] = []
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
const ECHO_POLICY_KEY = 'debug:echo'
type EchoPolicy = { default: boolean; forced: boolean }
async function echoPolicy($: EngineInterface): Promise<EchoPolicy> {
  const v = (await $.store.get(ECHO_POLICY_KEY)) as Partial<EchoPolicy> | undefined
  return { default: v?.default === true, forced: v?.forced === true }
}
async function setEchoPolicy($: EngineInterface, policy: EchoPolicy) {
  await $.store.set(ECHO_POLICY_KEY, policy)
}
/** This conversation's own choice, from its environment; undefined when it made none. */
async function sessionEchoChoice($: EngineInterface): Promise<boolean | undefined> {
  const env = await $.env.get('CONVO_BOOKMARKS_DEBUG')
  if (env === undefined || env === '') return undefined
  return env !== '0' && env.toLowerCase() !== 'off' && env.toLowerCase() !== 'false'
}
/** Sets this conversation's choice; `undefined` drops it, so the default applies again. */
async function setSessionEcho($: EngineInterface, enabled: boolean | undefined) {
  // Not named `on`: the directory's reader treats that name as the hook registrar everywhere in the file.
  await $.env.set('CONVO_BOOKMARKS_DEBUG', enabled === undefined ? undefined : enabled ? '1' : '0')
}
async function uiEchoEnabled($: EngineInterface): Promise<boolean> {
  const policy = await echoPolicy($)
  if (policy.forced) return policy.default
  return (await sessionEchoChoice($)) ?? policy.default
}
/** The state in one line, for `/bm-debug status` and `/bm-env`. */
async function echoStateLine($: EngineInterface): Promise<string> {
  const policy = await echoPolicy($)
  const mine = await sessionEchoChoice($)
  const word = (b: boolean) => (b ? 'on' : 'off')
  if (policy.forced) {
    const asked = mine !== undefined && mine !== policy.default ? `; this conversation asked for ${word(mine)}, which applies once the force is lifted` : ''
    return `${word(policy.default)} everywhere, forced (/bm-debug default ${word(policy.default)} lifts it${asked})`
  }
  if (mine !== undefined) return `${word(mine)} here only (this conversation's choice; the default is ${word(policy.default)})`
  return `${word(policy.default)}, the default (every conversation without a choice of its own)`
}

function log($: EngineInterface, line: string, opts?: { always?: boolean }) {
  if (opts?.always) $.ui.log(line)
  else void uiEchoEnabled($).then(enabled => { if (enabled) $.ui.log(line) }).catch(() => {})
  logLines.push(`${new Date().toISOString()} ${line}`)
  if (logLines.length > LOG_LINES) logLines.splice(0, logLines.length - LOG_LINES)
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
    logPath = root ? `${root}/bookmarks/debug/${await $.session.id()}.log` : null
    // A reload starts the module over: keep what the file already holds.
    if (logPath && (await $.fs.exists(logPath))) {
      const earlier = (await $.fs.read(logPath)).split('\n').filter(l => l.trim())
      logLines.unshift(...earlier)
      if (logLines.length > LOG_LINES) logLines.splice(0, logLines.length - LOG_LINES)
    }
  }
  if (logPath) await $.fs.write(logPath, logLines.join('\n') + '\n')
}

const clock = (t: number) => new Date(t).toISOString().slice(11, 23)
const firstFour = (uuid: string) => uuid.split('-').slice(0, 4).join('-')

// `snippet`: the selection's first line exactly as selected, for highlighting.
type Mark = { uuid: string; head: string; markedAt: number; source?: 'selection' | 'latest' | 'screen'; snippet?: string }
type Marks = Record<string, Mark>

const short = (uuid: string) => uuid.slice(0, 8)
const head = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 60)

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
type PromptRef = { uuid: string; head: string }
const PROMPTS_KEPT = 5000
async function promptsKey($: EngineInterface): Promise<string> {
  return `prompts:${await $.session.id()}`
}
async function keptPrompts($: EngineInterface): Promise<PromptRef[]> {
  return ((await $.store.get(await promptsKey($))) as PromptRef[] | undefined) ?? []
}
async function keepPrompt($: EngineInterface, p: PromptRef) {
  const kept = await keptPrompts($)
  if (kept.some(k => k.uuid === p.uuid)) return
  await $.store.set(await promptsKey($), [...kept, p].slice(-PROMPTS_KEPT))
}

// --- Back-fill: the prompts sent before the mod was loaded ------------------------
// The transcript holds them but is too big for $.fs.read (4 MiB; 18 MB here). The
// platform's own tool filters it to the user rows (no install: Windows PowerShell 5.1
// on Windows, sh + grep elsewhere) and the mod parses the JSON lines. Settled by the
// POC in tests/one-offs/thinking/prompt-history/ (2026-10-04: 152/152 prompts,
// identical text; ~1 MB of output; 328 ms PowerShell, 81 ms sh + grep). Runs once per
// conversation; after that the live capture keeps the list current.
const USER_ROW = '"type":"user"'
const TOOL_RESULT_ROW = '"type":"tool_result"'

// A typed user prompt's text, or undefined for tool results, meta and sidechain rows.
// The same rule as the POC's reference parse.
function promptTextOf(o: any): string | undefined {
  if (o?.type !== 'user' || o.isMeta || o.isSidechain) return undefined
  const content = o.message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  if (content.some((b: any) => b?.type === 'tool_result')) return undefined
  const texts = content.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? ''))
  return texts.length > 0 ? texts.join(' ') : undefined
}

// The PowerShell fallbacks are scripts shipped with the plugin (hooks/scripts/*.ps1),
// run with -File and named parameters. Until v0.3.0 they were inline scripts passed as
// base64 UTF-16LE text, to keep their double quotes intact; a measurement on 2026-10-09
// showed -File parameters keep `"type":"user"` verbatim from a non-shell spawn, and
// base64-encoded PowerShell is what a security scan flags.
function psScript($: EngineInterface, name: string): string[] {
  return ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${$.plugin.root}/hooks/scripts/${name}.ps1`]
}

// The session's transcript: <config dir>/projects/<project>/<session id>.jsonl. The
// project folder is the cwd with every non-alphanumeric character turned into `-`;
// if that guess misses, every project folder is looked in.
async function transcriptPath($: EngineInterface): Promise<string | undefined> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home ? `${home}/.claude` : undefined)
  if (!config) return undefined
  const file = `${await $.session.id()}.jsonl`
  const guess = `${config}/projects/${(await $.session.cwd()).replace(/[^A-Za-z0-9]/g, '-')}/${file}`
  if (await $.fs.exists(guess)) return guess
  for (const entry of await $.fs.list(`${config}/projects`)) {
    const candidate = `${config}/projects/${entry.name}/${file}`
    if (entry.kind === 'dir' && (await $.fs.exists(candidate))) return candidate
  }
  return undefined
}

// The user rows of the transcript, one JSON line each, from the platform's own tool.
async function userRows($: EngineInterface, path: string) {
  const windows = /^[A-Za-z]:[\\/]/.test(path)
  const powershell = () => [...psScript($, 'user-rows'), '-Path', path, '-UserRow', USER_ROW, '-ToolResultRow', TOOL_RESULT_ROW]
  const sh = () => ['sh', '-c', `grep -F '${USER_ROW}' "$1" | grep -vF '${TOOL_RESULT_ROW}'`, 'sh', path]
  for (const [via, argv] of windows ? [['powershell', powershell()], ['sh', sh()]] as const : [['sh', sh()]] as const) {
    try {
      const started = Date.now()
      const r = await $.process.run(argv, { timeoutMs: 60_000 })
      if (r.exitCode === 0 || r.stdout) return { via, ms: Date.now() - started, ...r }
    } catch {
      // That tool is not there: try the next one.
    }
  }
  return undefined
}

// `grep -bn` over the transcript: every line containing `pattern`, as `line:byteoffset:
// text`. sh + grep first on every platform (29 ms on a 10 MB file here; Git Bash has
// grep on Windows); PowerShell second, computing the byte offsets itself since
// Select-String has none. The output cap (4 MiB) cuts the newest matches first; a cut
// line fails to parse and is skipped.
async function grepTranscript($: EngineInterface, path: string, pattern: string) {
  const sh = () => ['sh', '-c', 'grep -bnF -- "$1" "$2"', 'sh', pattern, path]
  const powershell = () => [...psScript($, 'grep-offsets'), '-Path', path, '-Pattern', pattern]
  for (const [via, argv] of [['sh', sh()], ['powershell', powershell()]] as const) {
    try {
      const started = Date.now()
      const r = await $.process.run(argv, { timeoutMs: 60_000 })
      // grep exits 1 for "no match" with empty output: that is an answer, not a failure.
      if (r.exitCode === 0 || r.exitCode === 1 || r.stdout) return { via, ms: Date.now() - started, ...r }
    } catch {
      // That tool is not there: try the next one.
    }
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

async function backfillPrompts($: EngineInterface) {
  const doneKey = `backfilled:${await $.session.id()}`
  if (await $.store.get(doneKey)) return
  const path = await transcriptPath($)
  if (!path) {
    log($, '[bm-poc] backfill: transcript not found; prompts list starts when the mod loaded')
    return
  }
  const rows = await userRows($, path)
  if (!rows) {
    log($, '[bm-poc] backfill: neither PowerShell nor sh + grep ran; prompts list starts when the mod loaded')
    return
  }
  const found: PromptRef[] = []
  for (const line of rows.stdout.split('\n')) {
    if (!line.trim()) continue
    let o: any
    try {
      o = JSON.parse(line)
    } catch {
      continue // a line cut off at the 4 MiB output limit
    }
    const text = promptTextOf(o)
    if (text !== undefined && typeof o.uuid === 'string') found.push({ uuid: o.uuid, head: head(text) })
  }
  // Transcript order first, then anything the live capture holds that the file did not.
  const have = new Set(found.map(p => p.uuid))
  const merged = [...found, ...(await keptPrompts($)).filter(p => !have.has(p.uuid))]
  await $.store.set(await promptsKey($), merged.slice(-PROMPTS_KEPT))
  // A cut-off read is left unmarked, so a later session start tries again.
  if (!rows.isStdoutTruncated) await $.store.set(doneKey, true)
  log(
    $,
    `[bm-poc] backfill: ${found.length} prompts from the transcript via ${rows.via} in ${rows.ms} ms ` +
      `(${rows.stdout.length} chars${rows.isStdoutTruncated ? ', CUT OFF at 4 MiB: newest may be missing' : ''}); ` +
      `list now ${Math.min(merged.length, PROMPTS_KEPT)}`,
  )
}

async function prompts($: EngineInterface): Promise<PromptRef[]> {
  const kept = await keptPrompts($)
  const seen = new Set(kept.map(k => k.uuid))
  const fresh = (await allRows($)).filter(r => r.door === 'prompt' && !seen.has(r.uuid))
  return [...kept, ...fresh.map(r => ({ uuid: r.uuid, head: r.head }))]
}

async function marksKey($: EngineInterface): Promise<string> {
  return `marks:${await $.session.id()}`
}

async function loadMarks($: EngineInterface): Promise<Marks> {
  return ((await $.store.get(await marksKey($))) as Marks | undefined) ?? {}
}

// A short, distinctive piece of a message to search for in the Ctrl+O transcript view:
// the text after any generic opening (`RE:{`, a `<pasted_content …>` tag, braces), cut
// at a word boundary to about 32 characters.
function searchPhrase(text: string | undefined): string | undefined {
  if (!text) return undefined
  const cleaned = text
    .replace(/<\/?pasted_content[^>]*>/g, ' ')
    .replace(/^\s*(RE:\s*)?\{?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return undefined
  if (cleaned.length <= 32) return cleaned
  const cut = cleaned.slice(0, 32)
  const space = cut.lastIndexOf(' ')
  return space > 16 ? cut.slice(0, space) : cut
}

// --- Bookmark anchors (anchors DWP 2026-10-09) -----------------------------------------
// The URL format, its parser and the link finder live in hooks/core/anchor.ts (pure, with
// tests under `node --test`). This file holds what needs the engine: the press, the jump,
// the highlight, the tool and the register's I/O.

// The transient mark an anchor press shows: the words the anchor names, highlighted on
// the target row like a letter's selection, under a key no letter can take. Display
// only; never written to the store (djdarcy, 2026-10-09: "highlighted yellow like how we
// handle a mark when we do <leader>'<mark-key>").
const ANCHOR_KEY = '@'

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
  log($, `[bm] bookmark ${added ? 'added' : 'relabelled'}: ${short(record.uuid)} "${record.label}" (${ownerOf(record)}'s list; ${record.by}/${record.source}) rev ${register.rev}`)
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
        if (reg.perma.some(r => r.uuid.toLowerCase().startsWith(a.uuid8))) return
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
  log($, `[bm-poc] M1: anchor link pressed: ${href.slice(0, 120)} -> ${a ? `uuid ${a.uuid}` : 'NOT an anchor'}`)
  if (!a) return
  let uuid = a.uuid
  if (uuid.length < 36) {
    const row = (await allRows($)).find(r => r.uuid.startsWith(uuid))
    if (row) uuid = row.uuid
    else log($, `[bm-poc] M1: no known row starts with ${uuid}; trying it as written`)
  }
  // The jump records itself in the jumplist (jumpTo), so <leader> o comes back here. The
  // reading position is left alone: it is the person's (djdarcy, 2026-10-09).
  // The words to highlight (and, on a refused jump, the phrase the fallback copies): the
  // link's `q`, else the register's record.
  const words = a.words ?? (await loadRegister($)).perma.find(r => r.uuid === uuid)?.words
  const deny = await jumpTo($, uuid, 'anchor press', `anchor ${short(uuid)}${a.line ? ` (line ${a.line})` : ''}`, words)
  if (deny || !words) return
  await highlightWords($, uuid, words)
  log($, `[bm] anchor words highlighted on ${short(uuid)}: "${words.slice(0, 60)}"`)
}

// --- Jumplist: back and forward over every jump (vim's Ctrl+O / Ctrl+I) ------------------
// djdarcy, 2026-10-09: a back button "like <leader><space><space>", but separate from the
// reading position, which is a place the person set on purpose. Browser-style history of
// view positions: `entries[index]` is where the view is now; a new jump drops anything
// after `index`, records where we left from, and appends where we landed. Kept per
// session in the store, capped at 100.
type JumpEntry = { uuid: string; block: 'start' | 'end' }
type Jumplist = { entries: JumpEntry[]; index: number }
const JUMPLIST_MAX = 100
let jumplistCache: Jumplist | undefined
let jumplistMoving = false

async function jumplistKey($: EngineInterface): Promise<string> {
  return `jumplist:${await $.session.id()}`
}
async function loadJumplist($: EngineInterface): Promise<Jumplist> {
  if (!jumplistCache) jumplistCache = ((await $.store.get(await jumplistKey($))) as Jumplist | undefined) ?? { entries: [], index: -1 }
  return jumplistCache
}
async function saveJumplist($: EngineInterface, jl: Jumplist) {
  jumplistCache = jl
  await $.store.set(await jumplistKey($), jl)
}
const sameEntry = (a: JumpEntry | undefined, b: JumpEntry) => !!a && (a.uuid === b.uuid || firstFour(a.uuid) === firstFour(b.uuid))

async function recordJump($: EngineInterface, from: JumpEntry | undefined, to: JumpEntry) {
  if (jumplistMoving) return // a back or forward move is a walk, not a new jump
  const jl = await loadJumplist($)
  let entries = jl.entries.slice(0, jl.index + 1)
  if (from && !sameEntry(entries.at(-1), from)) entries.push(from)
  if (!sameEntry(entries.at(-1), to)) entries.push(to)
  entries = entries.slice(-JUMPLIST_MAX)
  await saveJumplist($, { entries, index: entries.length - 1 })
}

async function jumplistMove($: EngineInterface, step: -1 | 1) {
  const jl = await loadJumplist($)
  const next = jl.index + step
  if (next < 0 || next >= jl.entries.length) {
    $.ui.toast(step < 0 ? 'Nothing to go back to' : 'Nothing to go forward to')
    return
  }
  const target = jl.entries[next]!
  jumplistMoving = true
  try {
    const deny = await jumpTo($, target.uuid, step < 0 ? 'jumplist back' : 'jumplist forward', `${step < 0 ? 'back' : 'forward'} to ${short(target.uuid)}`, undefined, false, target.block)
    if (!deny) {
      await saveJumplist($, { ...jl, index: next })
      const where = rendered.get(target.uuid) ?? Object.values(markCache).find(m => m.uuid === target.uuid)?.head
      $.ui.toast(`${step < 0 ? 'back' : 'forward'}${where ? `: ${where.slice(0, 40)}` : ''} (${next + 1}/${jl.entries.length})`)
    }
  } finally {
    jumplistMoving = false
  }
}

// B2/B3/B5 share this: scroll, then report exactly what the engine answered. Returns the
// refusal, if any. `probe`: a try whose "not person-initiated" refusal the caller
// handles (the band command line's one-time check), so no toast for that one.
async function jumpTo($: EngineInterface, uuid: string, via: string, label: string, words?: string, probe = false, block: 'start' | 'end' = 'start'): Promise<string | undefined> {
  // Where the person is leaving from, for the jumplist: the view before the pane opened
  // when a pane is up (the pane shifts the view), else the view now.
  const from = paneView ?? (await viewAnchor($))
  const result = await $.ui.scroll({ to: { requestId: uuid }, block })
  // The jump is where the person wants to be: no going back to before the pane.
  if (!result.deny) {
    paneAnchor = undefined
    await recordJump($, from, { uuid, block })
  }
  const verdict = result.deny ? `DENY: ${result.deny}` : 'ok'
  if (probe && result.deny && /person-initiated/i.test(result.deny)) {
    log($, `[bm-poc] ${via} scroll -> ${verdict} | target ${label} ${short(uuid)} (probe)`)
    return result.deny
  }
  // A message Claude Code has not drawn cannot be scrolled to ("nothing drawn under
  // that requestId": prompts from before this conversation's compaction, 2026-10-05).
  // The view stays put, which looked like "it took me somewhere else"; say so, and
  // offer the planned fallback (issue #4): search the transcript view.
  // Any other refusal ("not person-initiated", ...) is not about the message: say what
  // Claude Code said, not "older than a compaction" (log, 2026-10-07 06:26:12).
  if (result.deny && !/nothing drawn/i.test(result.deny)) {
    $.ui.toast(`Can't jump there: Claude Code refused the scroll (${result.deny}).`)
    log($, `[bm-poc] jump refused for another reason: ${result.deny}`)
  } else if (result.deny) {
    const text = words ?? rendered.get(uuid) ?? Object.values(markCache).find(m => m.uuid === uuid)?.head
    // The mod cannot open Ctrl+O or fill a search (nothing in $.ui drives the
    // transcript view), but it can put a search phrase on the clipboard (djdarcy,
    // 2026-10-05: "give the user the text ... so it autopopulates"). The phrase skips
    // the generic openings many prompts share ("RE:{", a pasted-content tag).
    const phrase = searchPhrase(text)
    const copied = phrase ? (await $.ui.copy({ text: phrase })).isCopied : false
    // Where to search: transcript mode's `/` only sees what the view holds, which after
    // a compaction excludes earlier messages (2026-10-05: not found). `[` in transcript
    // mode writes the FULL conversation to the terminal's scrollback, where the
    // terminal's own find does reach them (user-verified, 2026-10-05).
    const how = `press Ctrl+O, then [ (full conversation), then your terminal's Find (Ctrl+Shift+F or Cmd+F)`
    $.ui.toast(
      copied
        ? `Can't jump there: that message isn't on screen (older than a compaction?). Copied "${phrase}": ${how} and paste.`
        : `Can't jump there: that message isn't on screen (older than a compaction?). ${how} and search for ` +
            `${phrase ? `"${phrase}"` : 'a few words of it'}.`,
      { timeoutMs: 12000 },
    )
    log($, `[bm-poc] jump refused; search phrase ${copied ? 'copied' : 'shown'}: "${phrase ?? ''}"`)
  }
  note(`scroll ${uuid} via ${via} -> ${verdict}`)
  log($,
    `[bm-poc] ${via} scroll -> ${verdict} | target ${label} ${short(uuid)} | ` +
      `drawn since load: ${rendered.has(uuid) ? 'yes' : 'NO'}`,
  )
  return result.deny
}

// The selection as it stood when the mark chord fired, read BEFORE the pane opens:
// round 1 read it after, and the mark landed one row too high (the inline pane shifts
// the transcript; hypothesis: the engine maps the selection to a row by screen position).
let selectionAtChord: Awaited<ReturnType<EngineInterface['ui']['selection']>> | undefined

// A drawn row id may be the zero-tailed form of the real uuid. Find the saved row it
// stands for, and say whether the selected text is really in that row.
async function resolveSelectionRow($: EngineInterface, id: string, text: string) {
  const list = await allRows($)
  const saved = list.find(r => r.uuid === id) ?? list.find(r => firstFour(r.uuid) === firstFour(id))
  const needle = text.trim().slice(0, 40)
  const check = !saved ? 'no saved row'
    : saved.text === undefined ? 'row saved before text capture'
    : saved.text.includes(needle) ? 'text verified' : 'TEXT NOT IN ROW'
  return { uuid: saved?.uuid ?? id, check }
}

// Highlight a mark just set from a selection, then put the view back. Redrawing the
// message under a visible selection drops the view to the bottom, even with following
// the bottom turned off (djdarcy, 2026-10-06; a stale selection, no longer shown, did
// not; seen only when the pane held the keyboard). So note the message at the top of
// the screen first, and scroll back to it once the pane has closed: message-level, like
// the reading position's return. The scroll must run within the keypress's own handler:
// one from a timer is refused ("not person-initiated", log 2026-10-06 04:22:20).
let restoreTo: string | undefined
// The message at the top of the screen just before a pane opened (openFor): where the
// view goes back to once the pane has done its job. A jump clears it (jumpTo).
let paneAnchor: string | undefined
// The same moment as a scroll can restore it: at the bottom, the last message's end.
let paneView: { uuid: string; block: 'start' | 'end' } | undefined
async function highlightInPlace($: EngineInterface, letter: string, text: string) {
  restoreTo = paneAnchor ?? (await topOnScreen($))
  await showMark($, letter, text)
}
// The shift is Claude Code's, on every route: the old Ctrl+X m chord moved the view by
// about a screen as well (djdarcy, 2026-10-07, with this scroll-back switched off).
async function restoreView($: EngineInterface) {
  // A pane opened and closed: the view was shifted for certain, so go back to where it
  // was before the pane, whether or not that message is still on screen somewhere.
  const fromPane = !!paneAnchor
  const block = (fromPane && paneView?.block) || 'start'
  const here = (fromPane ? paneView?.uuid ?? paneAnchor : undefined) ?? restoreTo
  restoreTo = undefined
  paneAnchor = undefined
  paneView = undefined
  if (!here) return
  // Otherwise only when the view actually moved: scrolling back regardless lined up the
  // top message's first line and moved a view that had not dropped (djdarcy, 2026-10-07).
  if (!fromPane && freshOnScreen().some(id => id === here || firstFour(id) === firstFour(here))) {
    log($, `[bm-poc] view kept after highlight (${short(here)} still on screen)`)
    return
  }
  const r = await $.ui.scroll({ to: { requestId: here }, block })
  log($, `[bm-poc] view restored after highlight -> ${r.deny ? `DENY: ${r.deny}` : 'ok'} | ${short(here)}`)
}

// --- Fresh and stale selections ---------------------------------------------------------
// $.ui.selection() answers what the person LAST selected, even once its highlight is gone
// (the types' docs), so a mark with nothing selected used a quote selected minutes
// earlier (2026-10-07 07:13:10, 07:20:21). djdarcy: "if a user selects text we should be
// attempting to date-time it and if it's older than 1.25 minutes then we should mark the
// current top-left portion of the screen". No event says when a selection changes, so it
// is polled once a second and stamped when it does. Becomes a setting (#7).
const SELECTION_FRESH_SECONDS = 75
type Selection = Awaited<ReturnType<EngineInterface['ui']['selection']>>
let selectionSeen: { key: string; at: number } | undefined
let selectionPoll: Timer | undefined
const selectionKey = (s: Selection) => (s?.requestId && s.text.trim() ? `${s.requestId}|${s.text}` : '')

async function pollSelection($: EngineInterface) {
  const key = selectionKey(await $.ui.selection())
  // The first look has no history: whatever is selected then counts as old.
  if (!selectionSeen) selectionSeen = { key, at: 0 }
  else if (key !== selectionSeen.key) selectionSeen = { key, at: Date.now() }
}

// The selection if it was made within SELECTION_FRESH_SECONDS, else undefined.
async function freshSelection($: EngineInterface, sel: Selection): Promise<Selection> {
  const key = selectionKey(sel)
  if (!key) return undefined
  // Changed since the last poll: made within the last second.
  if (selectionSeen && key !== selectionSeen.key) selectionSeen = { key, at: Date.now() }
  const at = selectionSeen?.key === key ? selectionSeen.at : 0
  const age = at ? Math.round((Date.now() - at) / 1000) : undefined
  const fresh = age !== undefined && age <= SELECTION_FRESH_SECONDS
  log($, `[bm-poc] selection "${sel!.text.trim().slice(0, 24)}" is ${age === undefined ? 'of unknown age' : `${age}s old`}: ${fresh ? 'used' : 'ignored (stale)'}`)
  return fresh ? sel : undefined
}

// The message at the top of the screen, as a mark: the fallback when no fresh selection
// says where (djdarcy: "the current 'screen' they are looking at from the top left").
// Message-level, like the reading position; its first line is the one highlighted.
async function screenTopMark($: EngineInterface, before?: string): Promise<Mark | undefined> {
  const id = before ?? (await topOnScreen($))
  if (!id) return undefined
  const list = await allRows($)
  const row = list.find(r => r.uuid === id) ?? list.find(r => firstFour(r.uuid) === firstFour(id))
  const text = row?.text ?? rendered.get(id) ?? row?.head ?? ''
  const first = snippetOf(plainMarkdown(text))
  return {
    uuid: row?.uuid ?? id,
    head: head(text) || '(message at the top of the screen)',
    markedAt: await $.clock.now(),
    source: 'screen',
    ...(first ? { snippet: first } : {}),
  }
}

async function setMark($: EngineInterface, letter: string) {
  // A fresh mouse selection says where; otherwise the top of the screen.
  const sel = await freshSelection($, selectionAtChord ?? (await $.ui.selection()))
  selectionAtChord = undefined
  note(`selection at mark: ${sel ? `row ${sel.requestId ?? '(none)'} text ${JSON.stringify(sel.text.slice(0, 80))}` : 'none'}`)
  if (sel?.requestId) {
    const { uuid, check } = await resolveSelectionRow($, sel.requestId, sel.text)
    const fresh = await loadMarks($)
    const mark: Mark = {
      uuid,
      head: head(sel.text),
      markedAt: await $.clock.now(),
      source: 'selection',
      snippet: snippetOf(sel.text),
    }
    note(`store.set mark ${letter} -> ${uuid} (selection, drawn ${sel.requestId}, ${check})`)
    await $.store.set(await marksKey($), { ...fresh, [letter]: mark })
    markCache = { ...fresh, [letter]: mark }
    // Writing `shown` redraws the rows and the band that read it.
    await highlightInPlace($, letter, snippetOf(sel.text))
    log($, `[bm-poc] SEL: mark ${letter} -> ${uuid} (drawn as ${sel.requestId}; ${check}) | "${head(sel.text)}"`)
    $.ui.toast(`mark ${letter} [selection] -> ${head(sel.text).slice(0, 40)}`)
    return
  }

  // No fresh selection: the message at the top of the screen, as it was BEFORE the pane
  // opened and shifted it (paneAnchor). (The "latest prompt" fallback is gone: prompts
  // have the prompts pane and pins. djdarcy, 2026-10-07.)
  const mark = await screenTopMark($, paneAnchor)
  if (!mark) {
    $.ui.toast('Nothing on screen to mark yet: scroll a little, or select some text')
    return
  }
  // Read again right before the write: the store is shared and not atomic.
  const fresh = await loadMarks($)
  note(`store.set mark ${letter} -> ${mark.uuid} (top of screen)`)
  await $.store.set(await marksKey($), { ...fresh, [letter]: mark })
  markCache = { ...fresh, [letter]: mark }
  if (mark.snippet) await highlightInPlace($, letter, mark.snippet)
  log($, `[bm-poc] mark ${letter} -> ${short(mark.uuid)} (top of screen) | "${mark.head}"`)
  $.ui.toast(`mark ${letter} [top of screen] -> ${mark.head.slice(0, 40)}`)
}

// --- Reading position: Ctrl+X Space ------------------------------------------------
// One key, no letter (djdarcy, 2026-10-04): with text selected it sets the reading
// position there; with nothing selected (or the same selection still up) it jumps to
// it, and pressed again while it is on screen it swaps back to where the person was,
// like vim's ``. "On screen" comes from what the render hooks report, not from the
// last press, so scrolling by hand in between does not confuse it.
// The toggle's state, kept explicitly rather than read off the screen (whose reports go
// stale after a jump, see onScreenNow): `at` true right after going to the reading
// position, so the next press goes `back`; false otherwise, so the next press goes there.
// `backBlock`: which edge of the window `back` was anchored to (viewAnchor).
type ReadingState = { at: boolean; back: string | null; backBlock?: 'start' | 'end' }
async function readingStateKey($: EngineInterface): Promise<string> {
  return `readingState:${await $.session.id()}`
}
async function readingState($: EngineInterface): Promise<ReadingState> {
  return ((await $.store.get(await readingStateKey($))) as ReadingState | undefined) ?? { at: false, back: null }
}
async function setReadingState($: EngineInterface, state: ReadingState) {
  await $.store.set(await readingStateKey($), state)
}

// The message at the top of the view: of those on screen, the earliest in the
// conversation. Order is known for every prompt (back-filled) and for the replies
// captured since load (each placed after the prompt before it).
async function topOnScreen($: EngineInterface): Promise<string | undefined> {
  const order = new Map<string, number>()
  const promptList = await prompts($)
  promptList.forEach((p, i) => order.set(p.uuid, i * 1000))
  let base = 0
  let k = 0
  for (const r of await allRows($)) {
    if (r.door === 'prompt') {
      base = order.get(r.uuid) ?? base
      k = 0
    } else order.set(r.uuid, base + ++k)
  }
  // Only the latest burst of reports: what is on screen now, not what was before a jump.
  const visible = freshOnScreen()
  const known = visible.filter(id => order.has(id)).sort((a, b) => order.get(a)! - order.get(b)!)
  // Not yet captured (a reply still arriving) sorts last: it is the newest.
  lastScreenOrder = [...known, ...visible.filter(id => !order.has(id))]
  return known[0] ?? visible[0]
}
// The messages on screen, top to bottom, as topOnScreen last ordered them.
let lastScreenOrder: string[] = []

// Where "back" goes when you left from the bottom of the conversation (a setting, #7):
//   'where-it-was': the same text you were reading, even if new replies arrived since
//                   (djdarcy's choice: "I'd rather have it always go to the exact same
//                   location where the screen was so I'm reading exactly what I was
//                   reading before");
//   'newest':       the bottom as it is now, Ctrl+End, new replies included.
const READING_BACK_FROM_BOTTOM: 'where-it-was' | 'newest' = 'where-it-was'

// Where the view is, as a scroll can put it back: the bottom message's end when its last
// line shows (at the bottom of the conversation, that is exactly Ctrl+End), else the top
// message's start. "Back" from the reading position went to the top message's start
// even from the very bottom, a little above where the person was (djdarcy, 2026-10-07).
async function viewAnchor($: EngineInterface): Promise<{ uuid: string; block: 'start' | 'end' } | undefined> {
  const top = await topOnScreen($)
  if (!top) return undefined
  const bottom = lastScreenOrder.at(-1)
  const b = bottom ? onScreenNow.get(bottom) : undefined
  if (bottom && b && b.last >= b.of - 1) return { uuid: bottom, block: 'end' }
  return { uuid: top, block: 'start' }
}

// Go to the reading position, noting where we were so the next Ctrl+X Space swaps back.
// Shared by the chord and the jump pane's `␣ reading` entry.
async function goToReading($: EngineInterface, reading: Mark, via: string) {
  const here = await topOnScreen($)
  const anchor = await viewAnchor($)
  // Already at the reading position (the jump pane's entry used while there, log
  // 2026-10-05 00:06:17): keep the earlier spot to return to, or "back" would go to
  // the reading position itself.
  const atItAlready = !!here && (here === reading.uuid || firstFour(here) === firstFour(reading.uuid))
  const previous = await readingState($)
  await setReadingState(
    $,
    atItAlready
      ? { at: true, back: previous.back, ...(previous.backBlock ? { backBlock: previous.backBlock } : {}) }
      : { at: true, back: anchor?.uuid ?? null, ...(anchor ? { backBlock: anchor.block } : {}) },
  )
  if (anchor) log($, `[bm-poc] reading position: back will be ${short(anchor.uuid)} at the window's ${anchor.block}`)
  await jumpTo($, reading.uuid, via, `from ${here ? short(here) : '(unknown)'}`)
  await showMark($, READING, reading.snippet ?? reading.head)
}

async function readingToggle($: EngineInterface) {
  // Only a fresh selection moves the reading position (a stale one did, 2026-10-07 07:20:21).
  const sel = await freshSelection($, await $.ui.selection())
  const marks = await loadMarks($)
  const reading = marks[READING]
  const picked = sel?.requestId && sel.text.trim() ? snippetOf(sel.text) : undefined

  // A selection in a different message: set the reading position there. One inside the
  // message that already holds it counts as "go there", not "move": terminal
  // selections appear and linger easily (a click, a drag), and twice a press meant as a
  // jump re-set it instead, to a stray mid-word selection in the same message (log,
  // 2026-10-04 23:53:58 and 23:55:09).
  const sameMessage =
    !!reading && !!sel?.requestId && (sel.requestId === reading.uuid || firstFour(sel.requestId) === firstFour(reading.uuid))
  if (sel?.requestId && picked && !sameMessage) {
    const { uuid, check } = await resolveSelectionRow($, sel.requestId, sel.text)
    const mark: Mark = { uuid, head: head(sel.text), markedAt: await $.clock.now(), source: 'selection', snippet: picked }
    await $.store.set(await marksKey($), { ...marks, [READING]: mark })
    markCache = { ...marks, [READING]: mark }
    // Next press goes there (from wherever the person has scrolled to by then).
    await setReadingState($, { at: false, back: null })
    await highlightInPlace($, READING, picked)
    await restoreView($)
    log($, `[bm-poc] reading position set -> ${short(uuid)} (${check}) | "${head(sel.text)}"`)
    $.ui.toast(`reading position set: ${head(sel.text).slice(0, 40)}`)
    return
  }

  if (!reading) {
    $.ui.toast('Select some text, then Ctrl+X Space, to set a reading position')
    return
  }

  const state = await readingState($)
  // Go back only while the reading position is actually on screen, judged by the
  // latest burst of on-screen reports. The there/back state alone was wrong once the
  // person scrolled elsewhere by hand: the next press "went back" to the old spot
  // instead of to the mark (djdarcy, 2026-10-04). Old reports alone were wrong after
  // Ctrl+End (the message left behind still looked visible); the freshness filter
  // handles that.
  const onScreenNowFresh = freshOnScreen().some(
    id => id === reading.uuid || firstFour(id) === firstFour(reading.uuid),
  )
  if (state.at && state.back && onScreenNowFresh) {
    await setReadingState($, { at: false, back: null })
    // Left from the bottom, and the setting says "the bottom as it is now": the newest
    // captured message's end instead of the one that was last then.
    const newest = state.backBlock === 'end' && READING_BACK_FROM_BOTTOM === 'newest' ? (await allRows($)).at(-1)?.uuid : undefined
    const target = newest ?? state.back
    await jumpTo($, target, 'reading position (back)', `to ${short(target)} (${state.backBlock ?? 'start'}${newest ? ', newest' : ''})`, undefined, false, state.backBlock ?? 'start')
    await clearShown($)
    return
  }
  // Already looking at it, with nowhere real to go back to: stay put. Jumping here
  // recorded the message just above the mark as "where you were", so the next press
  // swapped between two spots a few lines apart; and pressing at the mark re-jumped
  // to it over and over (log, 2026-10-05 00:39-00:42 UTC).
  if (onScreenNowFresh) {
    await showMark($, READING, reading.snippet ?? reading.head)
    $.ui.toast("You're at the reading position. Scroll away and press again to come back here.")
    const seen = [...onScreenNow.entries()].find(([id]) => id === reading.uuid || firstFour(id) === firstFour(reading.uuid))?.[1]
    log($, `[bm-poc] reading position: already on screen, stayed put` +
      (seen ? ` (reported lines ${seen.first}-${seen.last} of ${seen.of}, ${Date.now() - seen.at} ms ago)` : ''))
    return
  }
  // Otherwise: note where we are, then go there.
  await goToReading($, reading, 'reading position')
}

// Returns the scroll's refusal, if any ('unset' when there is no such mark).
async function jumpToMark($: EngineInterface, letter: string, probe = false): Promise<string | undefined> {
  const mark = (await loadMarks($))[letter]
  if (!mark) {
    $.ui.toast(`mark ${letter} is not set`)
    return 'unset'
  }
  const deny = await jumpTo($, mark.uuid, 'B4+B5 chord jump', `mark ${letter}`, undefined, probe)
  if (!deny) await showMark($, letter, mark.snippet ?? mark.head)
  return deny
}

// --- The band's command line -----------------------------------------------------------
// Design 2026-10-07__02-58-22 (and its POC addendum). The band leader (abovePrompt:focus,
// Ctrl+] for djdarcy) puts the keyboard on the band, whose first element is a field
// that takes every printable key, ' and Space included, over a draft and mid-turn.
// The field's typing and Enter DO scroll the conversation, as long as the handler is
// still running when the scroll is asked (the engine credits the work to the keystroke
// only until the handler returns; a fire-and-forget `void` lost it, 2026-10-09). So the
// keys below act directly; the once-per-version probe that used to decide this is gone.

const CMD_HINT = "bm: ' or j + letter (jump)  m + letter (mark)  Space or r (reading)  p + number (prompt)  b (bookmarks)  P + letter (promote)  o / i (back / forward)"

// The two list-shaped pane modes share the band's number entry (digits, j/k, Enter).
const listLike = (m: PaneMode | 'idle') => m === 'list' || m === 'bookmarks'
let cmdBusy = false

// Draw the field anew, empty.
async function clearCommandLine($: EngineInterface) {
  await update($, cmdRev, v => v + 1)
}

// The band's key mode for `mode`, with the ring on `focusKey` when given (Enter presses
// it). openFor opens the pane as the list; from the band its focus is refused, so the
// band takes the key (see openFor).
async function handOff($: EngineInterface, mode: PaneMode, focusKey?: string) {
  await openFor($, mode, 'band command line')
  if (focusKey) await focusBand($, focusKey)
}

async function runCommandLine($: EngineInterface, typed: string, via: 'input' | 'submit') {
  if (cmdBusy || typed === '') return
  cmdBusy = true
  try {
    const first = typed[0]!
    log($, `[bm-poc] band command line ${via}: "${typed}"`)

    if (first === "'" || first === 'j') {
      if (typed.length === 1) {
        // The jump pane as the readable list of marks, the band's letter buttons taking
        // the letter, Enter the reading position: v0.1.7's shape. v0.2.0 waited for the
        // letter in silence and opened nothing (djdarcy, 2026-10-09: "the panel isn't
        // opening"). A letter typed fast enough to arrive with the quote still jumps
        // directly below.
        await clearCommandLine($)
        await handOff($, 'jump')
        return
      }
      const letter = typed[1]!
      await clearCommandLine($)
      if (!/^[a-z]$/.test(letter)) return void $.ui.toast(CMD_HINT)
      await jumpToMark($, letter)
      return
    }

    if (first === ' ' || first === 'r') {
      await clearCommandLine($)
      await readingToggle($)
      return
    }

    if (first === 'm') {
      // A mark scrolls back after its highlight (restoreView), so it is pressed too.
      await clearCommandLine($)
      await handOff($, 'mark', 'band-mark-cancel')
      return
    }

    if (first === 'p') {
      await clearCommandLine($)
      await update($, bandNum, () => '')
      await handOff($, 'list')
      return
    }

    // Bookmarks: `b` lists them (number + Enter jumps); `P` + a letter promotes that mark
    // into a bookmark (the letter stays).
    if (first === 'b') {
      await clearCommandLine($)
      await update($, bandNum, () => '')
      await update($, bandGroup, () => 0) // start on the person's own bookmarks
      await handOff($, 'bookmarks')
      return
    }
    if (first === 'P') {
      if (typed.length === 1) return // wait for the letter
      const letter = typed[1]!
      await clearCommandLine($)
      if (!/^[a-z`]$/.test(letter)) return void $.ui.toast('P then a mark letter (a-z) promotes that mark into a bookmark')
      await promoteLetter($, letter)
      return
    }

    // The jumplist: `o` back, `i` forward (vim). `<leader> ←` / `→` are wanted too; whether
    // an arrow reaches this field at all is the open probe (the log above shows what typed).
    if (first === 'o' || first === 'i') {
      await clearCommandLine($)
      await jumplistMove($, first === 'o' ? -1 : 1)
      return
    }
    await clearCommandLine($)
    $.ui.toast(CMD_HINT)
  } finally {
    cmdBusy = false
  }
}

// A digit of a prompt number, pressed as a band Button: jumps on the digit that makes
// the number complete (with 25 prompts, `3` at once, `2` waits), or on `go`.
// The list the band's number entry works on: the prompts, or the bookmarks.
async function listCount($: EngineInterface): Promise<number> {
  return (await read($, paneMode)) === 'bookmarks' ? (await bookmarkList($)).length : (await prompts($)).length
}
async function jumpToListNumber($: EngineInterface, typed: string, via: string) {
  if ((await read($, paneMode)) === 'bookmarks') await jumpToBookmarkNumber($, typed, via)
  else await jumpToPromptNumber($, typed, via)
}

async function bandDigit($: EngineInterface, digit: string) {
  const typed = (await read($, bandNum)) + digit
  const count = await listCount($)
  if (promptNumberComplete(typed, count)) {
    await update($, bandNum, () => '')
    await jumpToListNumber($, typed, 'band list')
    return
  }
  await update($, bandNum, () => typed)
  await showInPane($, Number(typed))
  keepBandWaiting($)
}

// Bring item #n into view in the pane's list, so it can be checked before Enter (its ▶
// is drawn by the pane). Prompts are keyed `p-<uuid>`, bookmarks `b-<uuid>`.
async function showInPane($: EngineInterface, n: number) {
  const bookmarks = (await read($, paneMode)) === 'bookmarks'
  const target = bookmarks ? (await bookmarkList($))[n - 1] : (await prompts($))[n - 1]
  if (!target) return
  const r = await $.ui.scroll({ in: PANE, to: { key: `${bookmarks ? 'b' : 'p'}-${target.uuid}` }, block: 'center' })
  if (r.deny) log($, `[bm-poc] pane scroll to #${n} -> DENY: ${r.deny}`)
}

// Browse the prompts one by one from the band, vim's j and k: the band holds the keyboard,
// so the pane can't take the arrows (djdarcy, 2026-10-07: "the nice thing about the panel
// is that you can scroll through the prompts 1 by 1"). The list is newest first: j moves
// the ▶ down (older), k up (newer); the first press lands on the newest. Enter jumps.
async function bandStep($: EngineInterface, key: 'j' | 'k') {
  const count = await listCount($)
  if (count === 0) return
  const typed = await read($, bandNum)
  const cur = Number(typed)
  const n = !typed || !cur ? count : Math.min(count, Math.max(1, cur + (key === 'j' ? -1 : 1)))
  await update($, bandNum, () => String(n))
  await showInPane($, n)
  keepBandWaiting($)
}

// Pin or unpin the prompt under the ▶, from the band's prompt mode: where the list is in
// view, so the person sees which prompt it is (djdarcy, 2026-10-07: a pin by number
// alone, with no list in sight, is not useful). `s` for star: `*` can't be a hotkey.
// The band stays in prompt mode, to pin several.
async function bandPin($: EngineInterface) {
  const typed = await read($, bandNum)
  if (!typed) {
    $.ui.toast('Pick a prompt first: j/k or the arrows (or its number), then s to pin it')
    return
  }
  await togglePin($, typed)
  keepBandWaiting($)
}

// Browsing takes as long as it takes: each key restarts the band's wait (BAND_MODE_MS).
function keepBandWaiting($: EngineInterface) {
  bandTimer?.cancel()
  bandTimer = $.clock.after(BAND_MODE_MS, () => void endBandMode($))
}
async function bandNumberGo($: EngineInterface) {
  const typed = await read($, bandNum)
  await update($, bandNum, () => '')
  if (!typed) return void (await closePane($))
  await jumpToListNumber($, typed, 'band list')
}

// DIAGNOSTIC (2026-10-07): who holds the keyboard around a key, to explain a pane that is
// kept or refused. Lengths only, never the draft's text. Keystrokes are logged only
// while /bm-diag-keys is on.
const diag = { lastEditAt: 0, busy: false, logKeys: false }
async function diagState($: EngineInterface, when: string) {
  const draft = (await $.prompt.read()).text
  const panes = (await $.ui.panes()).map(p => `${p.id}${p.isFocused ? '*' : ''}`).join(',') || 'none'
  const since = diag.lastEditAt ? `${Date.now() - diag.lastEditAt} ms` : 'never'
  log($, `[diag] ${when}: draft ${draft.length} chars, last edit ${since} ago, claude ${diag.busy ? 'BUSY' : 'idle'}, panes ${panes}`)
}

async function openFor($: EngineInterface, mode: PaneMode, action: string) {
  log($, `[bm-poc] B4: ${action.startsWith('command:') ? `leader ran ${action}` : `chord for ${action} pressed the band Button`}`)
  await diagState($, `${mode} (before open)`)
  await update($, paneMode, () => mode)
  const title = mode === 'mark' ? 'mark: press a-z' : mode === 'jump' ? 'jump: press a-z' : mode === 'bookmarks' ? 'bookmarks: type #' : 'prompts: press 1-9'
  note(`pane open (${mode}, focus)`)
  // Narrow on purpose (djdarcy, 2026-10-04: "collapse the panel so it has almost no
  // width"): it only has to take one letter. Both sizes are requests; a size the
  // person dragged the pane to wins. `focus` is refused while the composer holds
  // text, so over typed text the letter goes to the prompt instead (issue #4).
  // The docked pane narrows the conversation, which rewraps and shifts the view
  // (djdarcy, 2026-10-07: "the pane itself is what shifts the viewport"). So note the
  // message at the top of the screen first, a hidden mark, and return to it "as though
  // the user was auto-firing a ctrl]' to the hidden mark we just created" (djdarcy):
  // at once where Claude Code allows the scroll (a press: a chord, a click), else at the
  // next press (the letter), or when the person closes the pane.
  paneAnchor = await topOnScreen($)
  paneView = await viewAnchor($)
  const opened = (await $.ui.open({ id: PANE, title, focus: true, closeOnEscape: true, columns: 16, rows: 4 })) as
    { isPlaced?: boolean; reason?: string } | undefined
  // Probe (2026-10-09): below the engine's width floor the pane waits undrawn and the
  // person sees nothing. Say why, instead of looking broken (djdarcy's shrunk RDP terminal).
  if (opened && opened.isPlaced === false) {
    log($, `[bm-poc] pane not placed: ${opened.reason ?? '(no reason given)'}`)
    $.ui.toast(`Claude Code didn't draw the pane: ${opened.reason ?? 'no reason given'}. A wider terminal (or a smaller font, Ctrl+-) fixes it.`, { timeoutMs: 8000 })
  }
  if (paneView) {
    const r = await $.ui.scroll({ to: { requestId: paneView.uuid }, block: paneView.block })
    log($, `[bm-poc] view back to ${short(paneView.uuid)} (${paneView.block}) after the pane opened -> ${r.deny ? `DENY: ${r.deny} (again at the next press)` : 'ok'}`)
  }
  // The selection is read AFTER the pane opens: an awaited call before $.ui.open looks
  // to cost the pane the keyboard (the mark pane, which read it first, was refused in 8
  // of 12 runs; the jump pane, which didn't, almost never; log 2026-10-06/07). The
  // reason for reading it first was an inline pane shifting the transcript (round 1);
  // the pane is docked now, and the mark resolves by the selection's message id.
  if (mode === 'mark') {
    selectionAtChord = await $.ui.selection()
    note(`selection at chord: ${selectionAtChord?.requestId ?? 'none'}`)
  }
  const focused = await paneFocused($)
  const draft = (await $.prompt.read()).text
  const selNow = await $.ui.selection()
  log(
    $,
    `[bm-poc] ${mode} pane has the keyboard: ${focused ? 'yes' : 'NO'} (input box holds ${draft.length} chars; ` +
      `selection ${selNow?.text.trim() ? `"${selNow.text.trim().slice(0, 24)}"` : 'none'})`,
  )
  // From a typed command (/bm-mark, /bm-goto, /bm-prompts) the band never holds the
  // keyboard, so the band key mode below can't take the key (log, 2026-10-07 04:56:51).
  // Claude Code refuses the pane over a draft, and often just after a mouse selection
  // (2026-10-06/07); working around that from the input box failed (a scroll from
  // prompt.edit is "not person-initiated"). So say where the keys work instead: the
  // band leader holds the keyboard by the person's own focus move, draft or not.
  if (!focused && action.startsWith('command:')) {
    await closePane($)
    $.ui.toast(
      draft.trim()
        ? 'The keyboard is in the input box (it holds a draft). Use the band leader, Ctrl+] by default, which works over a draft.'
        : "Claude Code didn't give the pane the keyboard. Use the band leader, Ctrl+] by default.",
      { timeoutMs: 8000 },
    )
    return
  }
  // Pressed from the band (its hotkey after `abovePrompt:focus`, Ctrl+X Tab or a
  // rebound key), the focus request is refused: "an element of the band ... the person
  // holds" has the keys, so the pane opened without them and the next letter went
  // nowhere (djdarcy, 2026-10-05: "the cursor is staying in the normal input box"). A
  // re-request 120 ms later was refused too (log 12:24:16, 12:24:28): the band still
  // holds them. So the band itself takes the next key; the pane stays open as the list.
  if (!(await paneFocused($))) {
    await update($, bandMode, () => mode)
    log($, `[bm-poc] pane opened without the keyboard; the band takes the ${mode} key`)
    bandTimer?.cancel()
    bandTimer = $.clock.after(BAND_MODE_MS, () => void endBandMode($))
    // Enter's default: `go` for a prompt number, the reading position for a jump (a
    // missing element, no reading position, is simply denied), and never a letter for a
    // mark: Enter on `a` overwrote mark a (djdarcy, 2026-10-07).
    const deny = await focusBand($, listLike(mode) ? 'band-num-go' : mode === 'jump' ? 'band-jump-reading' : 'band-mark-cancel')
    // The band never had the keyboard: the button was clicked (over a draft, a click
    // presses it without moving the keys). The watcher below would then close the pane
    // at once (djdarcy, 2026-10-07: "the panel popped up for a second but then
    // disappeared"; log 08:32:22). So it stays open as a list to click, closed by its ×.
    if (deny && /does not hold the keyboard/i.test(deny)) {
      bandTimer?.cancel()
      bandTimer = undefined
      await update($, bandMode, () => 'idle')
      log($, `[bm-poc] ${mode} pane opened by a click: it stays open as a list (close it with its ×)`)
      return
    }
    // Esc hands the keyboard back to the prompt, and no event says so (djdarcy,
    // 2026-10-05: "it goes back to the normal text input bar but the panel stays
    // open"). $.ui.focus on the band is refused once the band no longer holds the
    // keys, so ask every BAND_WATCH_MS, onto the element the ring is already on
    // (no visible move), and close the pane as soon as it is refused.
    bandWatch?.cancel()
    bandWatch = $.clock.every(BAND_WATCH_MS, () => void watchBand($, mode))
  }
}

// How long the band waits for the next key before going back to its buttons.
const BAND_MODE_MS = 15_000
let bandTimer: Timer | undefined

// The band's own requestId, as its render hook last saw it: $.ui.focus names the site
// by it, to put the band's ring on the prompts field or the reading entry.
let bandId: string | undefined

// Returns the refusal, if any.
async function focusBand($: EngineInterface, key: string): Promise<string | undefined> {
  if (!bandId) return undefined
  const r = await $.ui.focus({ requestId: bandId, key })
  const deny = 'deny' in r && r.deny ? String(r.deny) : undefined
  log($, `[bm-poc] band focus ${key}: ${deny ? `DENY ${deny}` : 'ok'}`)
  return deny
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
  const n = typed.trim() === '' ? all.length : Number(typed.trim())
  const target = Number.isInteger(n) ? all[n - 1] : undefined
  if (!target) {
    $.ui.toast(`no prompt #${typed.trim()} (1-${all.length})`)
    return false
  }
  const pins = await loadPins($)
  const pinned = pins.includes(target.uuid)
  await $.store.set(await pinsKey($), pinned ? pins.filter(u => u !== target.uuid) : [...pins, target.uuid])
  await update($, pinsRev, v => v + 1)
  $.ui.toast(`${pinned ? 'unpinned' : 'pinned'} #${n}: ${target.head.slice(0, 40)}`)
  log($, `[bm-poc] ${pinned ? 'unpinned' : 'pinned'} prompt #${n} ${short(target.uuid)}`)
  return true
}

async function jumpToPromptNumber($: EngineInterface, typed: string, via: string) {
  // `*21` toggles the pin on #21, `*` on the newest; the pane stays open to pin more.
  if (typed.trim().startsWith('*')) {
    await togglePin($, typed.trim().slice(1))
    return
  }
  const all = await prompts($)
  const n = Number(typed.trim())
  const target = Number.isInteger(n) ? all[n - 1] : undefined
  if (!target) {
    $.ui.toast(`no prompt #${typed.trim()} (1-${all.length})`)
    return
  }
  await jumpTo($, target.uuid, via, `prompt #${n}`, target.head)
  await closePane($)
}

// When a typed prompt number jumps (a setting, #7): 'enter' waits for Enter, so the
// person can check the number first; 'complete' jumps on the digit that makes it complete.
// Default 'enter': `p 3XX` jumping before Enter was "potentially a problem" (djdarcy,
// 2026-10-07: "Some users will like just typing the number and going there. Others will
// want the chance to confirm.").
const PROMPT_NUMBER_JUMPS_AT: 'enter' | 'complete' = 'enter'

// True once the digits typed can't become a larger prompt number: with 25 prompts,
// `3` is complete, `2` waits for a second digit or Enter. Only acted on when
// PROMPT_NUMBER_JUMPS_AT is 'complete'.
// --- Bookmarks in the pane and the band ---------------------------------------------------
// Numbered in the order minted (#1 the first), so a number read off the pane stays good.
async function bookmarkList($: EngineInterface) {
  return [...(await loadRegister($)).perma].sort((a, b) => a.createdAt - b.createdAt)
}

// Highlight `words` on a message, as a letter's jump does, through a transient entry in
// the mark cache (reloaded from the store on the next mark write).
async function highlightWords($: EngineInterface, uuid: string, words: string) {
  markCache = { ...markCache, [ANCHOR_KEY]: { uuid, head: words, markedAt: await $.clock.now(), source: 'selection', snippet: words } }
  await showMark($, ANCHOR_KEY, words)
}

// Jump to a bookmark and highlight its words. Returns the scroll's refusal, if any.
async function arriveAtBookmark($: EngineInterface, record: { uuid: string; words?: string; label: string }, via: string): Promise<string | undefined> {
  const deny = await jumpTo($, record.uuid, via, `bookmark "${record.label.slice(0, 30)}"`, record.words)
  if (!deny && record.words) await highlightWords($, record.uuid, record.words)
  return deny
}

// Cycle the bookmarks pane's group from the band: yours -> Claude's -> all -> yours.
async function bandGroupStep($: EngineInterface, step: -1 | 1) {
  await update($, bandGroup, g => (g + step + BOOKMARK_GROUPS.length) % BOOKMARK_GROUPS.length)
  keepBandWaiting($)
}

async function jumpToBookmarkNumber($: EngineInterface, typed: string, via: string) {
  const all = await bookmarkList($)
  const n = Number(typed.trim())
  const target = Number.isInteger(n) ? all[n - 1] : undefined
  if (!target) {
    $.ui.toast(`no bookmark #${typed.trim()} (1-${all.length})`)
    return
  }
  await arriveAtBookmark($, target, via)
  await closePane($)
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

function promptNumberComplete(typed: string, count: number): boolean {
  if (PROMPT_NUMBER_JUMPS_AT !== 'complete') return false
  const n = Number(typed)
  return /^\d+$/.test(typed) && n >= 1 && n <= count && n * 10 > count
}

const BAND_WATCH_MS = 400
let bandWatch: Timer | undefined
// The band element the focus ring is on, as the ui.focus hook last saw it.
let bandRing: string | undefined

// An element of the band's key mode that is drawn now, to aim the focus probe at:
// the ring's own element when it belongs to this mode, else a fixed one per mode.
async function bandProbeKey($: EngineInterface, mode: PaneMode): Promise<string | undefined> {
  const prefix = listLike(mode) ? 'band-num-' : `band-${mode}-`
  if (bandRing?.startsWith(prefix)) return bandRing
  if (listLike(mode)) return 'band-num-go'
  if (mode === 'mark') return 'band-mark-cancel'
  const marks = await loadMarks($)
  if (marks[READING]) return 'band-jump-reading'
  const first = LETTERS.find(l => marks[l])
  return first ? `band-jump-${first}` : undefined
}

async function watchBand($: EngineInterface, mode: PaneMode) {
  if (!bandId || (await read($, bandMode)) === 'idle') return
  const key = await bandProbeKey($, mode)
  if (!key) return // nothing focusable on the band: the timeout or the next edit ends it
  const r = await $.ui.focus({ requestId: bandId, key })
  if ('deny' in r && r.deny) {
    // Into the pane (a click in it): the band steps back and the pane keeps the keyboard,
    // its own keys and field included. Closing it there shut the pane the moment its
    // field was clicked (djdarcy, 2026-10-07).
    if (await paneFocused($)) {
      log($, `[bm-poc] the keyboard moved into the pane: the band steps back, the pane stays`)
      await endBandMode($)
      return
    }
    log($, `[bm-poc] band lost the keyboard (${r.deny}): closing the pane`)
    await closePane($)
  }
}

async function endBandMode($: EngineInterface) {
  bandTimer?.cancel()
  bandTimer = undefined
  bandWatch?.cancel()
  bandWatch = undefined
  bandRing = undefined
  if ((await read($, bandNum)) !== '') await update($, bandNum, () => '')
  if ((await read($, bandMode)) !== 'idle') await update($, bandMode, () => 'idle')
}

async function paneFocused($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(p => p.id === PANE && p.isFocused)
}

// Set by the pane's render hook (which may not write state): the placement and width
// the surface actually gave it, logged when it closes.
let paneGeometry: string | undefined

async function closePane($: EngineInterface) {
  note('pane close')
  if (paneGeometry) log($, `[bm-poc] pane was ${paneGeometry}`)
  await endBandMode($)
  await $.ui.close({ id: PANE })
  // The conversation widens again as the pane goes, and shifts. Unless a jump moved the
  // view on purpose (it clears the anchor), go back to where it was before the pane
  // opened: the inverse of the return when it opened (djdarcy, 2026-10-07). From a
  // timer (the band's Esc check) Claude Code refuses the scroll; the log says so.
  if (paneAnchor) await restoreView($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const commands: [string, string][] = [
      ['bm-ids', 'Probe B1: compare appended prompt uuids with rendered ids'],
      ['bm-jump', 'Probe B2/B3: scroll to a prompt (first | last | N | r<N> | uuid)'],
      ['bm-pane', 'Probe B5: open a pane of prompts; press 1-9 to jump'],
      ['bm-marks', 'List the marks set with the chord test'],
      ['bm-delmarks', 'Delete marks: /bm-delmarks a b (letters), or /bm-delmarks all'],
      ['bm-env', 'Show version, session id and what the probe has captured'],
      ['bm-timeline', 'Show the last N mod events (draws, appends, pane, store, toast, scroll)'],
      ['bm-sel', 'Selection POC: show what $.ui.selection() returns for your mouse selection'],
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
      ['bm-debug', 'Echo the plugin\'s log lines into this conversation as dim rows (on | off | status); off by default'],
    ]
    for (const [name, description] of commands) {
      await $.command.register({ name, description, immediate: true })
    }

    // The model's tool (anchors DWP, 2026-10-09): mint a durable bookmark for a place in
    // this conversation and get back the markdown link to cite it with. Kept in front
    // (isDeferred: false) so citing is one call; the description stays short since it is
    // sent every turn.
    try {
      const t = await $.tool.register({
        name: 'bookmark',
        description:
          'Bookmark a message: give a verbatim fragment (or uuid) and a label, get a markdown link to cite; a click jumps ' +
          'there. owner: your list or the person\'s. Actions: add, relabel, remove, share, list.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'A short verbatim fragment of the message to bookmark (the earliest message containing it)' },
            uuid: { type: 'string', description: 'The message uuid instead of a fragment (full, or its first 8+ characters)' },
            label: { type: 'string', description: 'What the bookmark is for: the link text, a few words' },
            why: { type: 'string', description: 'One or two sentences on why this place matters' },
            words: { type: 'string', description: 'The exact words to highlight on arrival; defaults to query' },
            temporary: { type: 'boolean', description: 'Prune after the retention period instead of keeping forever' },
            owner: { type: 'string', enum: ['claude', 'user'], description: "Whose list: your own (default) or the person's, when they asked you to bookmark it for them" },
            action: { type: 'string', enum: ['add', 'relabel', 'remove', 'share', 'list'], description: 'add (default); relabel/remove act on `owner`\'s list; share copies from `owner`\'s list to the other; list shows both' },
          },
        },
        isDeferred: false,
      })
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

    markCache = await loadMarks($)
    // Stamp selections as they change, so a stale one is ignored (freshSelection).
    selectionPoll?.cancel()
    selectionSeen = undefined
    await pollSelection($)
    selectionPoll = $.clock.every(1000, () => void pollSelection($))
    // Not awaited: session start should not wait on a third of a second of PowerShell.
    void backfillPrompts($).catch(err => log($, `[bm-poc] backfill failed: ${String(err)}`))

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
    if (diag.logKeys) {
      const k = e.key
        ? `${e.key.ctrl ? 'ctrl+' : ''}${e.key.meta ? 'meta+' : ''}${e.key.shift ? 'shift+' : ''}${e.key.key.length === 1 ? 'char' : e.key.key}`
        : 'paste/burst'
      log($, `[diag] edit ${k}: draft ${e.text.length} -> +${e.inputText.length}, ${diag.lastEditAt ? now - diag.lastEditAt : '-'} ms since last`)
    }
    diag.lastEditAt = now
    if ((await read($, bandMode)) !== 'idle') {
      log($, '[bm-poc] prompt edited while the band waited for a key: cancelled')
      await closePane($)
    }
    return next(e)
  })

  // Where the band's focus ring is, so the keyboard probe (watchBand) aims at the
  // element already holding it and never moves the ring.
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
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
    if (e.origin.kind === 'person' && bandRing === 'band-num-go' && (await read($, bandMode)) === 'list' &&
        (e.element === 'band-num-k' || e.element === 'band-num-j')) {
      log($, `[bm-poc] band arrow -> ${e.element === 'band-num-k' ? 'k (up)' : 'j (down)'}`)
      await bandStep($, e.element === 'band-num-k' ? 'k' : 'j')
      return next({ ...e, element: 'band-num-go' })
    }
    if (e.origin.kind === 'person' && e.element?.startsWith('chord-') && (await read($, bandMode)) === 'idle') {
      const field = `band-cmd-${await read($, cmdRev)}`
      log($, `[bm-poc] band focus kept on the command field (not ${e.element})`)
      bandRing = field
      return next({ ...e, element: field })
    }
    if (e.element) bandRing = e.element
    return next(e)
  })

  // The person closed the pane (its close mark, or Ctrl+X x): end the band's key mode too.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    await endBandMode($)
    const closed = await next(e)
    // The person closed it (Esc, its ×) without picking anything: back to where the view
    // was before the pane opened, if Claude Code allows the scroll from here.
    if (e.origin.kind === 'person' && paneAnchor) await restoreView($)
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
    const isWanted = e.door === 'prompt' || e.door === 'response'
    if (!e.agentId && isWanted && !e.message.isMeta) {
      const text = e.message.content.map(block => (block.type === 'text' ? block.text : '')).join(' ')
      if (text.trim()) {
        // `text` (first 4000 chars) lets a selection mark check it landed in the right row.
        const row: Row = { uuid: e.uuid, door: e.door as Row['door'], head: head(text), text: text.slice(0, 4000) }
        note(`append ${e.door} ${e.uuid} ${row.head.slice(0, 30)}`)
        await update($, rows, list => [...(list as Row[]), row].slice(-500))
        if (row.door === 'prompt') await keepPrompt($, { uuid: row.uuid, head: row.head })
      }
    }
    return stored
  })

  // Observe only: note the id, draw nothing different.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    noteOnScreen(e.requestId, e.props.onScreen)
    if (!rendered.has(e.requestId)) {
      const text = head(e.props.text ?? '')
      rendered.set(e.requestId, text)
      note(`draw UserMessage ${e.requestId} ${text.slice(0, 30)}`)
    }
    // Highlight POC: a prompt row is plain text, so the mark shows as a «a» tag
    // in front of the selected words. Display only -- the model never reads it.
    const text = e.props.text ?? ''
    const onRow = marksOnRow(e.requestId, (await read($, shown))?.letter)
    // A prompt row drawn in colour, as a reply's marked line is (2026-10-09, for anchor
    // presses: "highlighted yellow like a mark"). The lines before the marked one keep
    // the engine's prompt styling; the marked line and the rest are drawn here.
    const [first] = onRow
    const colored = first && colorSplit(text, first[0], first[1].snippet)
    if (colored) {
      const { Box, Text } = $.ui.resolve(e)
      const { before, pre, snippet, post, after, letter, gapAbove, gapBelow } = colored
      const line = (
        <Text backgroundColor={LINE_BG}>
          {pre}
          <Text color={WORDS_FG} bold>
            «{letter}» {snippet}
          </Text>
          {post}
        </Text>
      )
      const engine = before ? await next({ ...e, props: { ...e.props, text: before } }) : null
      return (
        <Box flexDirection="column">
          {engine}
          {gapAbove && <Text> </Text>}
          {line}
          {gapBelow && <Text> </Text>}
          {after && <Text>{after}</Text>}
        </Box>
      )
    }
    let marked = text
    for (const [letter, m] of onRow) {
      if (m.snippet && marked.includes(m.snippet)) marked = marked.replace(m.snippet, `«${letter}» ${m.snippet}`)
    }
    return marked === text ? next(e) : next({ ...e, props: { ...e.props, text: marked } })
  })

  // Highlight POC: a reply's text is markdown, so the marked words are drawn bold with
  // a «a» tag. When the selection (rendered text) doesn't match the markdown source
  // literally, the tag goes on a line of its own at the top of the block instead, which
  // is where a jump lands. Only rows carrying a mark are touched.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    noteOnScreen(e.requestId, e.props.onScreen)

    // Probe M1/M2 (anchors DWP, 2026-10-09): a reply carrying bookmark-anchor links is
    // drawn as the mod's own Markdown, so a plain click on such a link reaches the mod
    // (onLinkPress) and tries the jump; the log says what the engine answered. A ctrl-click
    // stays the terminal's own open. Replies without anchors take the usual path below.
    const links = markdownLinks(e.props.text)
    const anchors = links.filter(l => l.kind === 'anchor')
    const marksHere = marksOnRow(e.requestId, (await read($, shown))?.letter)
    if (anchors.length > 0) {
      const { Box, Markdown, Text } = $.ui.resolve(e)
      if (!anchorRowsLogged.has(e.requestId)) {
        anchorRowsLogged.add(e.requestId)
        log($, `[bm] reply ${short(e.requestId)}: ${anchors.length} bookmark link(s), ${links.filter(l => l.kind === 'file').length} file link(s)`)
        queueProseAnchors($, anchors)
      }
      // Kind markers go on the drawn labels only (the transcript is untouched); the hrefs
      // stay as written so `pressableLinks` matches them. A one-line legend teaches the
      // two clicks (a setting later, #7). A mark on this reply keeps its highlight: the
      // bold «a» form, since this branch draws markdown and can't colour a line.
      const pressable = anchors.map(a => a.href)
      const md = (t: string, k: string) => (
        <Markdown key={k} text={markLinks(t, LINK_MARKERS)} pressableLinks={pressable} onLinkPress={link => onAnchorPress($, link.href)} />
      )
      const legend = LINK_LEGEND ? (
        <Text dimColor>
          {LINK_MARKERS === 'glyph' ? '⚓' : '[bm]'} click: jump there · ctrl-click: open the bookmark's file
          {links.some(l => l.kind === 'file') ? `  ${LINK_MARKERS === 'glyph' ? '▤' : '[file]'} ctrl-click: open the file` : ''}
        </Text>
      ) : null
      // A mark on this reply gets the same coloured line as any other message: the text
      // before and after the marked line are drawn as markdown (links clickable), the
      // line itself as coloured Text. If the marked line carries a link, that link is
      // plain text for as long as the highlight shows.
      const [first] = marksHere
      const colored = first && colorSplit(e.props.text, first[0], first[1].snippet)
      if (colored) {
        const { before, pre, snippet, post, after, letter, gapAbove, gapBelow } = colored
        return (
          <Box flexDirection="column">
            {before && md(before, `anchors-${e.requestId}-a`)}
            {gapAbove && <Text> </Text>}
            <Text backgroundColor={LINE_BG}>
              {pre}
              <Text color={WORDS_FG} bold>
                «{letter}» {snippet}
              </Text>
              {post}
            </Text>
            {gapBelow && <Text> </Text>}
            {after && md(after, `anchors-${e.requestId}-b`)}
            {legend}
          </Box>
        )
      }
      // A mark whose words don't sit on one line: the bold «a» form.
      let text = e.props.text
      for (const [letter, m] of marksHere) {
        const s = m.snippet
        if (s && !/[*`_]/.test(s) && text.includes(s)) text = text.replace(s, `**«${letter}» ${s}**`)
        else text = `> **«${letter}» ${s ?? m.head}**\n\n${text}`
      }
      return (
        <Box flexDirection="column">
          {md(text, `anchors-${e.requestId}`)}
          {legend}
        </Box>
      )
    }

    const marks = marksHere
    if (marks.length === 0) return next(e)

    // Round 4: draw the marked LINE ourselves, so it can carry a background and the
    // selected words a color (markdown has neither). The part before it still goes to
    // the engine (keeps the reply's bullet and formatting); the part after is drawn
    // with the Markdown element. Any case this split could mangle falls through to
    // the round-3 bold rewrite below.
    const [first] = marks
    const colored = first && colorSplit(e.props.text, first[0], first[1].snippet)
    if (colored) {
      const { Box, Text, Markdown } = $.ui.resolve(e)
      const { before, pre, snippet, post, after, letter, gapAbove, gapBelow } = colored
      const line = (
        <Text backgroundColor={LINE_BG}>
          {pre}
          <Text color={WORDS_FG} bold>
            «{letter}» {snippet}
          </Text>
          {post}
        </Text>
      )
      if (before) {
        const engine = await next({ ...e, props: { ...e.props, text: before } })
        return (
          <Box flexDirection="column">
            {engine}
            {gapAbove && <Text> </Text>}
            {line}
            {gapBelow && <Text> </Text>}
            {after && <Markdown text={after} />}
          </Box>
        )
      }
      // The marked line is the message's first. Handing the rest to the engine put the
      // blank row it draws at the top of a message BELOW our line, so the line ran into
      // the message above (2026-10-04). So: that blank row first, then the line, then
      // the rest drawn here, as the branch above draws its part after the line. The
      // message's bullet is not drawn while its first line is highlighted.
      return (
        <Box flexDirection="column">
          <Text> </Text>
          {line}
          {gapBelow && <Text> </Text>}
          {after && <Markdown text={after} />}
        </Box>
      )
    }

    let text = e.props.text
    const unmatched: string[] = []
    for (const [letter, m] of marks) {
      const s = m.snippet
      if (s && !/[*`_]/.test(s) && text.includes(s)) text = text.replace(s, `**«${letter}» ${s}**`)
      else unmatched.push(`«${letter}» ${s ?? m.head}`)
    }
    if (unmatched.length > 0) text = `> **${unmatched.join('  ')}**\n\n${text}`
    return next({ ...e, props: { ...e.props, text } })
  })

  on('command.run', { command: 'bm-ids' }, async $ => {
    const list = await prompts($)
    const appended = new Set(list.map(r => r.uuid))
    const matched = list.filter(r => rendered.has(r.uuid)).length
    const strays = [...rendered.keys()].filter(id => !appended.has(id))
    log($, 
      `[bm-poc] B1: ${matched} of ${list.length} appended prompt uuids were seen as ` +
        `UserMessage requestIds; ${rendered.size} UserMessage ids drawn since load; ` +
        `${strays.length} drawn ids not among appended prompts`,
    )
    // How each appended prompt was drawn: under its real uuid, under an id sharing
    // the uuid's first four groups (zero-tailed), under some id with the same text,
    // or not seen at all.
    const drawnAs = (r: PromptRef) => {
      if (rendered.has(r.uuid)) return 'exact'
      const ids = [...rendered.keys()]
      if (ids.some(id => id !== r.uuid && firstFour(id) === firstFour(r.uuid))) return 'pfx  '
      if (ids.some(id => rendered.get(id) === r.head)) return 'text '
      return '-----'
    }
    const shown = list.slice(-12)
    shown.forEach((r, i) => {
      const n = list.length - shown.length + i + 1
      log($, `[bm-poc]   #${n} ${short(r.uuid)} ${drawnAs(r)} ${r.head}`)
    })
    strays.slice(0, 20).forEach(id => log($, `[bm-poc]   drawn, not appended: ${id} ${rendered.get(id)}`))
    return {}
  })

  on('command.run', { command: 'bm-pin' }, async ($, e) => {
    await togglePin($, e.args.replace(/^#/, ''))
    return {}
  })

  on('command.run', { command: 'bm-jump' }, async ($, e) => {
    const arg = e.args.trim()
    const list = await allRows($)
    const onlyPrompts = list.filter(r => r.door === 'prompt')
    let target: Row | undefined
    let label = arg
    if (arg === '' || arg === 'last') {
      target = onlyPrompts.at(-1)
      label = 'last prompt'
    } else if (arg === 'first') {
      target = onlyPrompts[0]
      label = 'first prompt'
    } else if (/^\d+$/.test(arg)) {
      target = onlyPrompts[Number(arg) - 1]
      label = `prompt #${arg}`
    } else if (/^r\d+$/.test(arg)) {
      target = list.filter(r => r.door === 'response')[Number(arg.slice(1)) - 1]
      label = `reply #${arg.slice(1)}`
    } else {
      target = list.find(r => r.uuid.startsWith(arg))
    }

    if (target) {
      await jumpTo($, target.uuid, 'B3 command', label)
    } else if (/^[0-9a-f-]{36}$/.test(arg)) {
      // Not a captured row: try the raw id anyway, which tests B2 for ids known only
      // from the transcript file (paste a uuid from jq).
      await jumpTo($, arg, 'B3/B2 command (raw uuid)', 'raw')
    } else {
      log($, `[bm-poc] nothing captured for "${arg}" (${onlyPrompts.length} prompts captured since load)`)
    }
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
    await $.ui.open({ id: PANE, title: 'bm-poc', focus: true, closeOnEscape: true })
    // The slash-command route to a focused pane (typed, or a `command:bm-pane`
    // keybinding, 2.1.290): record whether the pane actually got the keyboard.
    log($, `[bm-poc] /bm-pane opened; pane has the keyboard: ${(await paneFocused($)) ? 'yes' : 'NO'}`)
    return {}
  })

  // vim's :delmarks a b / :delmarks! (U27, djdarcy 2026-10-07: "How can we delete the
  // 'm' mark?"). The reading position is not a letter and is left alone.
  on('command.run', { command: 'bm-delmarks' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const marks = await loadMarks($)
    const letters = arg === 'all' || arg === '!' ? LETTERS.filter(l => marks[l]) : arg.split(/[\s,]+/).filter(l => /^[a-z]$/.test(l))
    if (letters.length === 0) {
      $.ui.toast('Usage: /bm-delmarks a b   (or /bm-delmarks all)')
      return {}
    }
    const gone = letters.filter(l => marks[l])
    const missing = letters.filter(l => !marks[l])
    const kept = Object.fromEntries(Object.entries(marks).filter(([l]) => !gone.includes(l)))
    await $.store.set(await marksKey($), kept)
    markCache = kept
    const showing = await read($, shown)
    if (showing && gone.includes(showing.letter)) await clearShown($)
    log($, `[bm-poc] deleted marks ${gone.join(' ') || '(none)'}${missing.length ? `; not set: ${missing.join(' ')}` : ''}`)
    $.ui.toast(gone.length ? `deleted mark${gone.length > 1 ? 's' : ''} ${gone.join(' ')}` : `not set: ${missing.join(' ')}`)
    return {}
  })

  on('command.run', { command: 'bm-marks' }, async $ => {
    const marks = await loadMarks($)
    const entries = Object.entries(marks).sort(([a], [b]) => a.localeCompare(b))
    if (entries.length === 0) log($, '[bm-poc] no marks in this session')
    for (const [l, m] of entries) log($, `[bm-poc]   ${l}  ${short(m.uuid)}  ${m.head}`)
    return {}
  })

  // Selection POC arm D: exactly what $.ui.selection() answers, and whether its row
  // id is one the mod already knows (a saved uuid, or an id seen at draw time).
  on('command.run', { command: 'bm-sel' }, async $ => {
    const sel = await $.ui.selection()
    if (!sel) {
      log($, '[bm-poc] SEL: no selection (nothing selected, fullscreen off, or cleared by a prompt)')
      return {}
    }
    const id = sel.requestId
    const saved = id ? (await allRows($)).find(r => r.uuid === id) : undefined
    const known = !id ? 'no row (spans rows / outside transcript)'
      : saved ? `saved ${saved.door} row`
      : rendered.has(id) ? 'drawn id only (not a saved uuid)'
      : 'unknown id (maybe a tool_use_id or a reply)'
    log($, `[bm-poc] SEL: row ${id ?? '(none)'} -> ${known}; ${sel.text.length} chars`)
    log($, `[bm-poc] SEL text: ${JSON.stringify(sel.text.slice(0, 300))}`)
    note(`bm-sel row ${id ?? '(none)'} ${known}`)
    return {}
  })

  on('command.run', { command: 'bm-timeline' }, async ($, e) => {
    const n = Number(e.args.trim()) || 40
    const recent = timeline.slice(-n)
    log($, `[bm-poc] timeline: last ${recent.length} of ${timeline.length} events since load`)
    for (const { t, what } of recent) log($, `[bm-poc]   ${clock(t)} ${what}`)
    return {}
  })

  // Probe M3, second half: answer the model's call to the stub tool. The engine strips
  // nothing from `e` for a plugin's own tool, so the arguments sit beside the envelope.
  // Matched by pattern, not by the literal name: the engine generates the tool-name type
  // from the manifest on a session start, so a rename leaves the literal red until then.
  on('tool.call', { tool: /^mcp__bookmarks__bookmark$/ }, async ($, e) => {
    const { tool, tool_use_id, agentId, requestMeta, ...input } = e as unknown as Record<string, unknown>
    void agentId
    void requestMeta
    log($, `[bm] ${String(tool)} called (${String(tool_use_id).slice(0, 12)}) with ${JSON.stringify(input).slice(0, 160)}`)
    // The result the model reads is a string (or MCP content blocks), not an object:
    // an object is refused as "does not match its output shape" (2.1.295, 2026-10-09).
    const answer = (o: unknown) => ({ result: JSON.stringify(o, null, 2) })
    const query = typeof input.query === 'string' ? input.query.trim() : ''
    const uuid = typeof input.uuid === 'string' ? input.uuid.trim() : ''
    const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim() : undefined
    const action = input.action === 'relabel' || input.action === 'remove' || input.action === 'share' || input.action === 'list' ? input.action : 'add'
    if (action !== 'list' && !query && !uuid) return answer({ error: 'give `query` (a short verbatim fragment of the message) or `uuid`' })
    // Whose list: Claude's own by default; the person's when they asked for the bookmark.
    const owner: AnchorOwner = input.owner === 'user' ? 'user' : 'claude'
    const root = await dataRoot($)
    const describe = (r: AnchorRecord) => ({
      uuid: r.uuid, owner: ownerOf(r), label: r.label, why: r.why, words: r.words, line: r.line, sharedFrom: r.sharedFrom,
      ...(root ? { anchor: anchorHref(r, root), markdown: anchorMarkdown(r, root) } : {}),
    })

    if (action === 'list') {
      const reg = await loadRegister($)
      return answer({ yours: listOf(reg, 'user').map(describe), claudes: listOf(reg, 'claude').map(describe), tombstones: reg.tombstones.length })
    }

    if (action === 'relabel' || action === 'remove' || action === 'share') {
      // These act on a record that exists: by uuid (full or 8+ prefix) on `owner`'s list.
      const reg = await loadRegister($)
      let target = uuid ? findRecord(reg, uuid, owner) : undefined
      if (!target && query) {
        const found = await resolveTarget($, { fragment: query })
        if (found.kind === 'one') target = findRecord(reg, found.row.uuid, owner)
        else if (found.kind === 'many') target = found.rows.map(r => findRecord(reg, r.uuid, owner)).find(Boolean)
      }
      if (!target) return answer({ error: `no bookmark for that on ${owner === 'user' ? "the person's" : "Claude's"} list`, hint: 'action: "list" shows both lists with their uuids' })
      const now = await $.clock.now()
      if (action === 'remove') {
        const r = remove(reg, target.uuid, owner, `claude${owner === 'user' ? ' (on the person\'s behalf)' : ''}`, now)
        if ('error' in r) return answer(r)
        await saveRegister($, r.register)
        log($, `[bm] bookmark removed from ${owner}'s list: ${short(target.uuid)} "${target.label}" (tombstoned)`)
        return answer({ ok: true, removed: describe(r.removed), note: 'archived as a tombstone in the register, not deleted' })
      }
      if (action === 'share') {
        const to: AnchorOwner = owner === 'claude' ? 'user' : 'claude'
        const r = share(reg, target.uuid, owner, to, now)
        if ('error' in r) return answer(r)
        await saveRegister($, r.register)
        await writeExport($, r.register, { uuid: target.uuid, sessionId: r.register.sessionId }, '', now)
        log($, `[bm] bookmark shared ${owner} -> ${to}: ${short(target.uuid)} "${r.record.label}"`)
        return answer({ ok: true, added: r.added, shared: describe(r.record), note: `now on ${to === 'user' ? "the person's" : "Claude's"} list too; the original stays` })
      }
      // relabel
      if (!label && typeof input.why !== 'string' && typeof input.words !== 'string') return answer({ error: 'relabel needs `label`, `why` or `words`' })
      const minted = await mintBookmark(
        $,
        {
          uuid: target.uuid,
          owner,
          label: label ?? target.label,
          ...(typeof input.why === 'string' ? { why: input.why.trim() } : {}),
          ...(typeof input.words === 'string' && input.words.trim() ? { words: input.words.trim() } : {}),
          ...(input.temporary === true ? { temporary: true } : {}),
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
    const brief = (r: TranscriptRow) => ({ uuid: r.uuid, role: r.role, line: r.line, bytes: [r.byteStart, r.byteEnd], head: headOf(r.text), timestamp: r.timestamp })
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
    const words = typeof input.words === 'string' && input.words.trim() ? input.words.trim() : query || undefined
    const minted = await mintBookmark(
      $,
      {
        uuid: row.uuid,
        owner,
        label,
        ...(typeof input.why === 'string' && input.why.trim() ? { why: input.why.trim() } : {}),
        ...(words && row.text.includes(words) ? { words } : {}),
        ...(input.temporary === true ? { temporary: true } : {}),
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
      note: `on ${owner === 'user' ? "the person's" : "Claude's"} list. Write \`markdown\` in your reply as the citation; a plain click jumps there, a ctrl-click opens the export`,
    })
  })

  on('command.run', { command: 'bm-debug' }, async ($, e) => {
    const [a, b] = (e.args ?? '').trim().toLowerCase().split(/\s+/)
    const usage = '/bm-debug on|off|reset (this conversation) | default on|off (every conversation without a choice) | force on|off (every conversation, no choice) | status'
    if (a === 'on' || a === 'off' || a === 'reset') {
      await setSessionEcho($, a === 'reset' ? undefined : a === 'on')
      const line = await echoStateLine($)
      $.ui.toast(`bookmarks: log echo ${line}`)
      log($, `[bm] log echo ${line} (the file log is always written)`, { always: true })
      return {}
    }
    if ((a === 'default' || a === 'force') && (b === 'on' || b === 'off')) {
      await setEchoPolicy($, { default: b === 'on', forced: a === 'force' })
      const line = await echoStateLine($)
      $.ui.toast(`bookmarks: log echo ${line}`)
      log($, `[bm] log echo ${line}`, { always: true })
      return {}
    }
    log($, `[bm] log echo ${await echoStateLine($)}; file log: ${logPath ?? '(not yet written)'}; ${usage}`, { always: true })
    return {}
  })

  on('command.run', { command: 'bm-env' }, async $ => {
    const v = await $.session.version()
    const list = await allRows($)
    const promptCount = list.filter(r => r.door === 'prompt').length
    // dcc-patcher's build signal (its H patch README, "For plugin authors"): DCC_PATCH_H is
    // set by the history patch itself; DCC_PATCHES and DCC_PATCHER by its launcher.
    // Stock started by that launcher has none of them.
    const dccH = await $.env.get('DCC_PATCH_H')
    const dccPatches = await $.env.get('DCC_PATCHES')
    const dccVersion = await $.env.get('DCC_PATCHER')
    // A command's answer is always drawn, whatever the echo setting.
    log($,
      `[bm-poc] ${$.plugin.name} ${await pluginVersion($)} on Claude Code ${v.version} ` +
        `(chords verified on ${VERIFIED_CLIENTS.join(', ')}); session ${await $.session.id()}; ` +
        `captured ${promptCount} prompts, ${list.length - promptCount} replies; ${rendered.size} drawn ids; ` +
        describePathOrder(),
      { always: true },
    )
    log($,
      `[bm-poc] dcc-patcher: ${dccVersion ? `v${dccVersion}` : 'none seen'}; ` +
        `DCC_PATCH_H=${dccH ?? '(unset)'}; DCC_PATCHES=${dccPatches ?? '(unset)'}; ` +
        `log echo ${await echoStateLine($)}`,
      { always: true },
    )
    return {}
  })

  // Experiment (djdarcy, 2026-10-04): the bar on the hint line under the prompt instead
  // of the band above it, to free the band's row. Its two Buttons are what the chords
  // press; whether a chord reaches a Button on the hint line is what this tests.
  // Tried 2026-10-04 and reverted: the line sat under djdarcy's status line, below
  // the prompt; it reads better above it. Whether a chord reaches a Button on the
  // hint line was not tested (no chord fired while it was there).
  const BAR_SITE = 'band' as 'band' | 'hint'

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (BAR_SITE !== 'hint') return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    const last = await read($, shown)
    return (
      <Box flexDirection="row" columnGap={1}>
        {theirs}
        <Text dimColor>·</Text>
        <Button key="chord-mark" label="mark" plain dimColor action={MARK_ACTION} onPress={() => openFor($, 'mark', MARK_ACTION)} />
        <Button key="chord-jump" label="jump" plain dimColor action={JUMP_ACTION} onPress={() => openFor($, 'jump', JUMP_ACTION)} />
        <Button key="chord-prompts" label="prompts" plain dimColor action={PROMPTS_ACTION} onPress={() => openFor($, 'list', PROMPTS_ACTION)} />
        <Button key="chord-read" label="read" plain dimColor action={READING_ACTION} onPress={() => readingToggle($)} />
        {last && (
          <Text wrap="truncate-end">
            <Text bold>{last.letter}</Text> ▸ {last.text}
          </Text>
        )}
      </Box>
    )
  })

  // B4: the band carries two Buttons named after borrowed engine actions. Bound to
  // chords in keybindings.json, the chords should press them from the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (BAR_SITE !== 'band') return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const Input = 'Input' in elements ? elements.Input : undefined
    const theirs = await next(e)
    const last = await read($, shown)
    bandId = e.requestId
    const mode = await read($, bandMode)

    // The band takes the next key itself when the pane opened from it couldn't take
    // the keyboard (see openFor). The pane stays open beside it as the readable list.
    if (mode !== 'idle') {
      const marks = await loadMarks($)
      const done = () => closePane($)
      let keys: any
      if (mode === 'jump') {
        const reading = marks[READING]
        keys = [
          <Text key="band-jump-title" dimColor>jump:</Text>,
          ...(reading
            ? [<Button key="band-jump-reading" label="reading (Enter)" plain
                // There, or back to where you were: the leader's Space (readingToggle).
                onPress={async () => { await readingToggle($); await done() }} />]
            : []),
          ...LETTERS.filter(l => marks[l]).map(l => (
            <Button key={`band-jump-${l}`} hotkey={l} label={(marks[l]?.head ?? '').slice(0, 12)} plain
              onPress={async () => { await jumpToMark($, l); await done() }} />
          )),
        ]
      } else if (mode === 'mark') {
        keys = [
          <Text key="band-mark-title" dimColor>mark as:</Text>,
          // The default focus, so a stray Enter cancels rather than overwriting a mark.
          <Button key="band-mark-cancel" label="cancel (Enter)" plain dimColor onPress={done} />,
          ...LETTERS.map(l => (
            <Button key={`band-mark-${l}`} hotkey={l} label={marks[l] ? '●' : '·'} plain dimColor={!marks[l]}
              onPress={async () => { await setMark($, l); await done(); await restoreView($) }} />
          )),
        ]
      } else {
        // A prompt number, one digit Button per key: a field's typing or Enter can't
        // scroll ("not person-initiated", 2026-10-05 17:20 and 2026-10-07 07:10), a
        // Button press can.
        const bookmarks = mode === 'bookmarks'
        const count = bookmarks ? (await bookmarkList($)).length : (await prompts($)).length
        const typed = await read($, bandNum)
        keys = [
          <Text key="band-num-title" dimColor>{bookmarks ? 'bookmark #' : 'prompt #'}</Text>,
          <Text key="band-num-typed" bold>{typed || '_'}</Text>,
          <Text key="band-num-range" dimColor>{`(1-${count})`}</Text>,
          ...'0123456789'.split('').map(d => (
            <Button key={`band-num-${d}`} hotkey={d} label={d} plain dimColor onPress={() => bandDigit($, d)} />
          )),
          // `go` sits between k and j, so an arrow always has a neighbour to move to:
          // the ui.focus hook turns that move into k (previous) or j (next).
          <Button key="band-num-k" hotkey="k" label="k↑" plain dimColor onPress={() => bandStep($, 'k')} />,
          <Button key="band-num-go" label="go (Enter)" plain onPress={() => bandNumberGo($)} />,
          <Button key="band-num-j" hotkey="j" label="j↓" plain dimColor onPress={() => bandStep($, 'j')} />,
          ...(bookmarks
            ? [
                <Button key="band-num-h" hotkey={GROUP_CYCLE.prev} label={`${GROUP_CYCLE.prev}◂`} plain dimColor onPress={() => bandGroupStep($, -1)} />,
                <Text key="band-num-group" dimColor>{BOOKMARK_GROUPS[await read($, bandGroup)]?.title ?? ''}</Text>,
                <Button key="band-num-l" hotkey={GROUP_CYCLE.next} label={`▸${GROUP_CYCLE.next}`} plain dimColor onPress={() => bandGroupStep($, 1)} />,
              ]
            : [<Button key="band-num-pin" hotkey="s" label="s★ pin" plain dimColor onPress={() => bandPin($)} />]),
        ]
      }
      return (
        <Box flexDirection="column">
          {theirs}
          <Box flexDirection="row" columnGap={1} flexWrap="wrap">
            <Text dimColor>bm</Text>
            {keys}
            <Text dimColor>(Esc)</Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {theirs}
        <Box flexDirection="row" columnGap={1}>
          {/* The band leader (abovePrompt:focus: Ctrl+X Tab by default, Ctrl+] for
              djdarcy) puts the keyboard here; the field takes every key (runCommandLine).
              The Buttons stay for clicks, Tab, and the borrowed-action chords. */}
          {Input ? (
            <Input key={`band-cmd-${await read($, cmdRev)}`} label="bm:" placeholder="' j m p ␣" submitLabel="run" autoFocus
              onInput={(typed: string) => runCommandLine($, typed, 'input')}
              onSubmit={(typed: string) => runCommandLine($, typed, 'submit')} />
          ) : (
            <Text dimColor>bm:</Text>
          )}
          <Button key="chord-mark" label="mark" hotkey="m" plain dimColor action={MARK_ACTION} onPress={() => openFor($, 'mark', MARK_ACTION)} />
          <Button key="chord-jump" label="jump" hotkey="j" plain dimColor action={JUMP_ACTION} onPress={() => openFor($, 'jump', JUMP_ACTION)} />
          <Button key="chord-prompts" label="prompts" hotkey="p" plain dimColor action={PROMPTS_ACTION} onPress={() => openFor($, 'list', PROMPTS_ACTION)} />
          <Button key="chord-read" label="read" hotkey="r" plain dimColor action={READING_ACTION} onPress={() => readingToggle($)} />
          {last && (
            <Text wrap="truncate-end">
              | <Text bold>{last.letter}</Text> ▸ {last.text}
            </Text>
          )}
        </Box>
      </Box>
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
      const numbered = all.map((r, i) => ({ ...r, n: i + 1 })).reverse()
      // `21) text`, numbers right-aligned so the text lines up (djdarcy, 2026-10-04,
      // over `#21`; also offered `(21) ` and `21| `). One place to change it.
      const width = String(all.length).length
      const numberLabel = (n: number) => `${String(n).padStart(width)}) `
      const go = (typed: string) => jumpToPromptNumber($, typed, 'prompts pane')
      // Pinned prompts: listed first, in the order pinned, and starred in the full list.
      await read($, pinsRev) // read so a pin toggle redraws the pane
      const pinIds = await loadPins($)
      const byUuid = new Map(numbered.map(r => [r.uuid, r]))
      const pinnedRows = pinIds.map(u => byUuid.get(u)).filter((r): r is (typeof numbered)[number] => !!r)
      const pinSet = new Set(pinIds)
      type NumberedPrompt = (typeof numbered)[number]
      // Digits typed in the band (it holds the keyboard; the pane can't take it) show
      // here too: in the `#` field, and as a ▶ on the prompt they name (djdarcy,
      // 2026-10-07: "it would be nice if the number was entered into the panel").
      const fromBand = (await read($, bandMode)) === 'list' ? await read($, bandNum) : undefined
      const targetN = fromBand ? Number(fromBand) : undefined
      const pointer = (n: number) => (fromBand === undefined ? '' : n === targetN ? '▶' : ' ')
      const promptRow = (r: NumberedPrompt, group: string) => {
        // Dim: not drawn since the mod loaded, so possibly not reachable by a jump
        // (before a compaction). A hint only: one not yet scrolled to is dim too.
        const dim = !rendered.has(r.uuid)
        const press = async () => {
          await jumpTo($, r.uuid, 'prompts pane', `prompt #${r.n}`, r.head)
          await closePane($)
        }
        if (!pinSet.has(r.uuid)) {
          return <Button key={`${group}-${r.uuid}`} label={`${pointer(r.n)}${numberLabel(r.n)}${r.head}`} plain dimColor={dim && r.n !== targetN} onPress={press} />
        }
        // `245★) `: a gold star inside the number, so it reads as the row's marker, not
        // part of the prompt (djdarcy, 2026-10-05, over a background band and a star
        // before the number). A Button's label takes no colour at rest (2.1.289), so the
        // number and star are Text beside the Button; flexShrink 0 keeps them from being
        // squeezed to nothing next to a long label that wraps (seen in the look test).
        return (
          <Box key={`${group}-row-${r.uuid}`} flexDirection="row">
            <Box flexShrink={0}>
              <Text dimColor={dim}>{`${pointer(r.n)}${String(r.n).padStart(width)}`}</Text>
              <Text color={WORDS_FG}>★</Text>
              <Text dimColor={dim}>{') '}</Text>
            </Box>
            <Button key={`${group}-${r.uuid}`} label={r.head} plain dimColor={dim} onPress={press} />
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          {numbered.length === 0 && <Text dimColor>No prompts yet.</Text>}
          {numbered.length > 0 && Input && (
            <Input
              key="prompt-number"
              label="#"
              placeholder={`1-${all.length}`}
              submitLabel="jump"
              {...(fromBand !== undefined ? { value: fromBand } : {})}
              autoFocus
              onInput={(typed: string) => {
                if (promptNumberComplete(typed, all.length)) void go(typed)
              }}
              onSubmit={(typed: string) => void go(typed)}
            />
          )}
          {/* One by one through this list (djdarcy, 2026-10-04): the pane keeps the arrows
              for scrolling, but Tab walks the focus ring down the Buttons below from the
              newest, Shift+Tab back up, Enter jumps. A Select was tried: on the terminal
              its arrows open a pop-up list of its own instead (screenshot, 2026-10-04). */}
          {numbered.length > 0 && <Text dimColor>or Tab / Shift+Tab, Enter; *N pins</Text>}
          {pinnedRows.length > 0 && <Text dimColor>★ pinned</Text>}
          {pinnedRows.map(r => promptRow(r, 'pin'))}
          {pinnedRows.length > 0 && <Text dimColor>all prompts</Text>}
          {numbered.map(r => promptRow(r, 'p'))}
        </Box>
      )
    }

    if (mode === 'bookmarks') {
      // Every bookmark of this conversation, numbered in the order minted (#1 the first,
      // so a number stays good), listed newest first like the prompts. Digits typed in
      // the band show in the `#` field and as a ▶; Enter jumps and highlights the words.
      const all = await bookmarkList($)
      const numbered = all.map((r, i) => ({ ...r, n: i + 1 })).reverse()
      const width = String(all.length).length
      const fromBand = (await read($, bandMode)) === 'bookmarks' ? await read($, bandNum) : undefined
      const targetN = fromBand ? Number(fromBand) : undefined
      const pointer = (n: number) => (fromBand === undefined ? '' : n === targetN ? '▶' : ' ')
      const go = (typed: string) => jumpToBookmarkNumber($, typed, 'bookmarks pane')
      const now = Date.now()
      const age = (t: number) => {
        const m = Math.round((now - t) / 60_000)
        return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
      }
      // One group at a time, one numbering across all of them. The band's h/l cycle the
      // group; the header shows where you are.
      const groupIndex = await read($, bandGroup)
      const group = BOOKMARK_GROUPS[groupIndex] ?? BOOKMARK_GROUPS[0]!
      const inGroup = (g: (typeof BOOKMARK_GROUPS)[number]) => (g.owner === 'all' ? numbered : numbered.filter(r => ownerOf(r) === g.owner))
      const shownRows = inGroup(group)
      // The group tabs with their counts, the active one in brackets (styled like the
      // prompts pane's pinned group: a coloured marker beside a plain Button, since a
      // Button's label takes no colour at rest).
      const header = BOOKMARK_GROUPS.map(g => (g === group ? `[${g.title} ${inGroup(g).length}]` : `${g.title} ${inGroup(g).length}`)).join('  ')
      const who = (r: (typeof numbered)[number]) => {
        const said = r.role ? (r.role === 'user' ? 'you said it' : 'Claude said it') : ''
        const minted = ownerOf(r) === 'claude' ? "Claude's" : r.sharedFrom ? 'shared by Claude' : r.source === 'promote' ? 'promoted' : 'yours'
        return [age(r.createdAt), said, minted, r.temporary ? 'temporary' : ''].filter(Boolean).join(' · ')
      }
      const row = (r: (typeof numbered)[number]) => {
        const dim = !rendered.has(r.uuid) && r.n !== targetN
        return (
          <Box key={`b-row-${r.uuid}-${ownerOf(r)}`} flexDirection="column">
            <Box flexDirection="row">
              <Box flexShrink={0}>
                <Text dimColor={dim}>{`${pointer(r.n)}${String(r.n).padStart(width)}) `}</Text>
                {LINK_MARKERS === 'glyph' && <Text color={WORDS_FG}>⚓ </Text>}
              </Box>
              <Button
                key={`b-${r.uuid}-${ownerOf(r)}`}
                label={r.label}
                plain
                dimColor={dim}
                onPress={async () => {
                  await arriveAtBookmark($, r, 'bookmarks pane')
                  await closePane($)
                }}
              />
            </Box>
            <Text dimColor wrap="truncate-end">
              {`${' '.repeat(width + 4)}${who(r)}${r.why ? ` · ${r.why}` : ''}`}
            </Text>
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          {numbered.length === 0 && <Text dimColor>No bookmarks yet. Claude mints them with its bookmark tool; P + a letter promotes one of your marks.</Text>}
          {numbered.length > 0 && Input && (
            <Input
              key="bookmark-number"
              label="#"
              placeholder={`1-${all.length}`}
              submitLabel="jump"
              {...(fromBand !== undefined ? { value: fromBand } : {})}
              autoFocus
              onInput={(typed: string) => {
                if (promptNumberComplete(typed, all.length)) void go(typed)
              }}
              onSubmit={(typed: string) => void go(typed)}
            />
          )}
          {numbered.length > 0 && <Text>{header}</Text>}
          {numbered.length > 0 && shownRows.length === 0 && <Text dimColor>{`No bookmarks in "${group.title}" yet.`}</Text>}
          {shownRows.map(row)}
          {numbered.length > 0 && <Text dimColor>{`${GROUP_CYCLE.prev}/${GROUP_CYCLE.next} group · j/k move · Enter jump · Esc close`}</Text>}
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
      await closePane($)
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
          {used.length === 0 && !reading && <Text dimColor>No marks yet. Esc</Text>}
          {reading && (
            <Button
              key="jump-reading"
              label={`␣ reading: ${reading.head.slice(0, 32)}`}
              plain
              autoFocus
              onPress={async () => {
                await goToReading($, reading, 'jump pane reading')
                await closePane($)
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
        <Text dimColor>Mark as: (Esc)</Text>
        <Box flexDirection="row" columnGap={1} flexWrap="wrap">
          {LETTERS.map(l => (
            // A Button takes no color (djdarcy asked for "slightly grayreddish"), and a
            // non-plain `primary` one draws as a wider `[ a ]` that breaks the grid
            // (screenshot, 2026-10-04). So a letter in use shows a dot, `a: ●`, at
            // full strength; a free one shows itself, dim. Same width either way.
            <Button key={`mark-${l}`} hotkey={l} label={marks[l] ? '●' : l} plain dimColor={!marks[l]} onPress={() => press(l)} />
          ))}
        </Box>
        {used.length === 0 && <Text dimColor>No marks in this session yet.</Text>}
        {used.map(l => (
          <Text wrap="truncate-end">
            <Text bold color={USED_FG}>{l}</Text> ▸ {marks[l]?.head}
          </Text>
        ))}
      </Box>
    )
  })
}
