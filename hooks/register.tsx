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

const PANE = 'bm-poc'

// Claude Code builds the borrowed-action chords (below) were verified on. The
// start-up tripwire toasts on any other build, because a new build could give a
// borrowed action a handler of its own. Add a build here after re-verifying.
const VERIFIED_CLIENTS = ['2.1.288', '2.1.289']

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

const rows = atom({ plugin: 'convo-bookmarks', key: 'rows' } as const, [])
const paneMode = atom({ plugin: 'convo-bookmarks', key: 'paneMode' } as const, 'list')
const shown = atom({ plugin: 'convo-bookmarks', key: 'shown' } as const, null)
const bandMode = atom({ plugin: 'convo-bookmarks', key: 'bandMode' } as const, 'idle')

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
  if (onScreen) onScreenNow.set(requestId, { ...onScreen, at: Date.now() })
  else onScreenNow.delete(requestId)
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

function log($: EngineInterface, line: string) {
  $.ui.log(line)
  logLines.push(`${new Date().toISOString()} ${line}`)
  if (logLines.length > LOG_LINES) logLines.splice(0, logLines.length - LOG_LINES)
  flushing = flushing.then(() => flushLog($)).catch(() => {})
}

async function flushLog($: EngineInterface) {
  if (logPath === undefined) {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    const root = (await $.env.get('CLAUDE_USER_DIR')) ?? (home ? `${home}/claude` : undefined)
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
type Mark = { uuid: string; head: string; markedAt: number; source?: 'selection' | 'latest'; snippet?: string }
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

// PowerShell's -EncodedCommand takes UTF-16LE in base64; written out here rather
// than assuming btoa exists in the mod's environment. Passing the script this way
// also keeps its double quotes intact: as a plain argv entry, quotes reaching a
// Windows program can be stripped (the POC's probe C').
function base64Utf16le(text: string): string {
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    bytes.push(c & 0xff, c >> 8)
  }
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]]
    out += abc[a >> 2]! + abc[((a & 3) << 4) | ((b ?? 0) >> 4)]!
    out += b === undefined ? '=' : abc[((b & 15) << 2) | ((c ?? 0) >> 6)]!
    out += c === undefined ? '=' : abc[c & 63]!
  }
  return out
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
  const powershell = () => {
    const literal = path.replace(/'/g, "''")
    const script =
      '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); ' +
      `Select-String -LiteralPath '${literal}' -SimpleMatch -Pattern '${USER_ROW}' -Encoding UTF8 | ` +
      `Where-Object { -not $_.Line.Contains('${TOOL_RESULT_ROW}') } | ForEach-Object { $_.Line }`
    return ['powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand', base64Utf16le(script)]
  }
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

// B2/B3/B5 share this: scroll, then report exactly what the engine answered.
async function jumpTo($: EngineInterface, uuid: string, via: string, label: string, words?: string) {
  const result = await $.ui.scroll({ to: { requestId: uuid }, block: 'start' })
  const verdict = result.deny ? `DENY: ${result.deny}` : 'ok'
  // A message Claude Code has not drawn cannot be scrolled to ("nothing drawn under
  // that requestId": prompts from before this conversation's compaction, 2026-10-05).
  // The view stays put, which looked like "it took me somewhere else"; say so, and
  // offer the planned fallback (issue #4): search the transcript view.
  if (result.deny) {
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

async function setMark($: EngineInterface, letter: string) {
  // Selection POC: a mouse selection inside one transcript row wins over "latest prompt".
  const sel = selectionAtChord ?? (await $.ui.selection())
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
    await showMark($, letter, snippetOf(sel.text))
    log($, `[bm-poc] SEL: mark ${letter} -> ${uuid} (drawn as ${sel.requestId}; ${check}) | "${head(sel.text)}"`)
    $.ui.toast(`mark ${letter} [selection] -> ${head(sel.text).slice(0, 40)}`)
    return
  }

  const latest = (await prompts($)).at(-1)
  if (!latest) {
    note('toast: no prompt captured')
    $.ui.toast('No prompt captured since the mod loaded')
    return
  }
  // Read again right before the write: the store is shared and not atomic.
  const fresh = await loadMarks($)
  const mark: Mark = { uuid: latest.uuid, head: latest.head, markedAt: await $.clock.now(), source: 'latest' }
  note(`store.set mark ${letter} -> ${latest.uuid}`)
  await $.store.set(await marksKey($), { ...fresh, [letter]: mark })
  note(`toast: mark ${letter}`)
  $.ui.toast(`mark ${letter} [latest prompt] -> ${latest.head.slice(0, 40)}`)
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
type ReadingState = { at: boolean; back: string | null }
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
  return known[0] ?? visible[0]
}

// Go to the reading position, noting where we were so the next Ctrl+X Space swaps back.
// Shared by the chord and the jump pane's `␣ reading` entry.
async function goToReading($: EngineInterface, reading: Mark, via: string) {
  const here = await topOnScreen($)
  // Already at the reading position (the jump pane's entry used while there, log
  // 2026-10-05 00:06:17): keep the earlier spot to return to, or "back" would go to
  // the reading position itself.
  const atItAlready = !!here && (here === reading.uuid || firstFour(here) === firstFour(reading.uuid))
  const previous = await readingState($)
  await setReadingState($, { at: true, back: atItAlready ? previous.back : (here ?? null) })
  await jumpTo($, reading.uuid, via, `from ${here ? short(here) : '(unknown)'}`)
  await showMark($, READING, reading.snippet ?? reading.head)
}

async function readingToggle($: EngineInterface) {
  const sel = await $.ui.selection()
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
    await showMark($, READING, picked)
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
    await jumpTo($, state.back, 'reading position (back)', `to ${short(state.back)}`)
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
    log($, `[bm-poc] reading position: already on screen, stayed put`)
    return
  }
  // Otherwise: note where we are, then go there.
  await goToReading($, reading, 'reading position')
}

async function jumpToMark($: EngineInterface, letter: string) {
  const mark = (await loadMarks($))[letter]
  if (mark) {
    await jumpTo($, mark.uuid, 'B4+B5 chord jump', `mark ${letter}`)
    await showMark($, letter, mark.snippet ?? mark.head)
  } else {
    $.ui.toast(`mark ${letter} is not set`)
  }
}

async function openFor($: EngineInterface, mode: PaneMode, action: string) {
  log($, `[bm-poc] B4: chord for ${action} pressed the band Button`)
  if (mode === 'mark') {
    selectionAtChord = await $.ui.selection()
    note(`selection at chord: ${selectionAtChord?.requestId ?? 'none'}`)
  }
  await update($, paneMode, () => mode)
  const title = mode === 'mark' ? 'mark: press a-z' : mode === 'jump' ? 'jump: press a-z' : 'prompts: press 1-9'
  note(`pane open (${mode}, focus)`)
  // Narrow on purpose (djdarcy, 2026-10-04: "collapse the panel so it has almost no
  // width"): it only has to take one letter. Both sizes are requests; a size the
  // person dragged the pane to wins. `focus` is refused while the composer holds
  // text, so over typed text the letter goes to the prompt instead (issue #4).
  await $.ui.open({ id: PANE, title, focus: true, closeOnEscape: true, columns: 16, rows: 4 })
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
    // Digits need the field focused; in jump mode Enter goes to the reading position,
    // as in the pane. A missing element (no reading position) is simply denied.
    if (mode === 'list') await focusBand($, 'band-prompt-number')
    if (mode === 'jump') await focusBand($, 'band-jump-reading')
  }
}

// How long the band waits for the next key before going back to its buttons.
const BAND_MODE_MS = 15_000
let bandTimer: Timer | undefined

// The band's own requestId, as its render hook last saw it: $.ui.focus names the site
// by it, to put the band's ring on the prompts field or the reading entry.
let bandId: string | undefined

async function focusBand($: EngineInterface, key: string) {
  if (!bandId) return
  const r = await $.ui.focus({ requestId: bandId, key })
  log($, `[bm-poc] band focus ${key}: ${'deny' in r && r.deny ? `DENY ${r.deny}` : 'ok'}`)
}

// Jumps to prompt #n, from the prompts pane's field or the band's.
async function jumpToPromptNumber($: EngineInterface, typed: string, via: string) {
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

// True once the digits typed can't become a larger prompt number: with 25 prompts,
// `3` is complete, `2` waits for a second digit or Enter.
function promptNumberComplete(typed: string, count: number): boolean {
  const n = Number(typed)
  return /^\d+$/.test(typed) && n >= 1 && n <= count && n * 10 > count
}

async function endBandMode($: EngineInterface) {
  bandTimer?.cancel()
  bandTimer = undefined
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
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const commands: [string, string][] = [
      ['bm-ids', 'Probe B1: compare appended prompt uuids with rendered ids'],
      ['bm-jump', 'Probe B2/B3: scroll to a prompt (first | last | N | r<N> | uuid)'],
      ['bm-pane', 'Probe B5: open a pane of prompts; press 1-9 to jump'],
      ['bm-marks', 'List the marks set with the chord test'],
      ['bm-env', 'Show version, session id and what the probe has captured'],
      ['bm-timeline', 'Show the last N mod events (draws, appends, pane, store, toast, scroll)'],
      ['bm-sel', 'Selection POC: show what $.ui.selection() returns for your mouse selection'],
    ]
    for (const [name, description] of commands) {
      await $.command.register({ name, description, immediate: true })
    }

    markCache = await loadMarks($)
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
    let marked = text
    for (const [letter, m] of marksOnRow(e.requestId, (await read($, shown))?.letter)) {
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
    const marks = marksOnRow(e.requestId, (await read($, shown))?.letter)
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

  on('command.run', { command: 'bm-pane' }, async $ => {
    await update($, paneMode, () => 'list')
    await $.ui.open({ id: PANE, title: 'bm-poc', focus: true, closeOnEscape: true })
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

  on('command.run', { command: 'bm-env' }, async $ => {
    const v = await $.session.version()
    const list = await allRows($)
    const promptCount = list.filter(r => r.door === 'prompt').length
    log($, 
      `[bm-poc] ${$.plugin.name} ${await pluginVersion($)} on Claude Code ${v.version} ` +
        `(chords verified on ${VERIFIED_CLIENTS.join(', ')}); session ${await $.session.id()}; ` +
        `captured ${promptCount} prompts, ${list.length - promptCount} replies; ${rendered.size} drawn ids`,
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
                onPress={async () => { await goToReading($, reading, 'band reading'); await done() }} />]
            : []),
          ...LETTERS.filter(l => marks[l]).map(l => (
            <Button key={`band-jump-${l}`} hotkey={l} label={(marks[l]?.head ?? '').slice(0, 12)} plain
              onPress={async () => { await jumpToMark($, l); await done() }} />
          )),
        ]
      } else if (mode === 'mark') {
        keys = [
          <Text key="band-mark-title" dimColor>mark as:</Text>,
          ...LETTERS.map(l => (
            <Button key={`band-mark-${l}`} hotkey={l} label={marks[l] ? '●' : '·'} plain dimColor={!marks[l]}
              onPress={async () => { await setMark($, l); await done() }} />
          )),
        ]
      } else {
        const count = (await prompts($)).length
        keys = Input ? (
          <Input key="band-prompt-number" label="prompt #" placeholder={`1-${count}`} submitLabel="jump"
            onInput={(typed: string) => { if (promptNumberComplete(typed, count)) void jumpToPromptNumber($, typed, 'band prompts') }}
            onSubmit={(typed: string) => void jumpToPromptNumber($, typed, 'band prompts')} />
        ) : <Text dimColor>prompts: no field on this surface</Text>
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
          <Text dimColor>bm:</Text>
          {/* Leader probe (2026-10-05): Claude Code's own `abovePrompt:focus` (default
              Ctrl+X Tab, rebindable) puts the keyboard on the band, and a band Button's
              hotkey then presses it, so the band is a leader that borrows no action. */}
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
      return (
        <Box flexDirection="column">
          {numbered.length === 0 && <Text dimColor>No prompts yet.</Text>}
          {numbered.length > 0 && Input && (
            <Input
              key="prompt-number"
              label="#"
              placeholder={`1-${all.length}`}
              submitLabel="jump"
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
          {numbered.length > 0 && <Text dimColor>or Tab / Shift+Tab, Enter</Text>}
          {numbered.map(r => (
            <Button
              key={`p-${r.uuid}`}
              label={`${numberLabel(r.n)}${r.head}`}
              plain
              // Dim: not drawn since the mod loaded, so possibly not reachable by a
              // jump (before a compaction). A hint only: one not yet scrolled to is
              // dim too until it is drawn.
              dimColor={!rendered.has(r.uuid)}
              onPress={async () => {
                await jumpTo($, r.uuid, 'prompts pane', `prompt #${r.n}`, r.head)
                await closePane($)
              }}
            />
          ))}
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
