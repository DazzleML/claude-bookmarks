// Which transcript rows are the person's prompts, and their text.
//
// Claude Code's transcript keeps more under `"type":"user"` than typed prompts: tool
// results, the `!` shell's input and output, local-command echoes, "[Request
// interrupted by user]" rows, and the summary a compaction injects. And a message typed
// while Claude was working is not a user row at all: it is queued and stored as an
// `attachment` of type `queued_command` with the text in `attachment.prompt`
// (djdarcy found one missing from the prompts list, 2026-10-11; 88 of them in one
// transcript). This module decides, so that the transcript back-fill and the live
// capture agree.

// Text the engine wraps around rows that are not the person's words. A prompt that
// happens to begin with one of these is lost; none has been seen.
// `<teammate-message …>`: a row another agent sent into the conversation (claude-devtools
// excludes these from prompts, src/main/types/messages.ts:366-378; none seen here yet).
// `<task-notification>`: the engine's notice that a background task finished, filed as a
// user row (44 in the author's transcript, 2026-10-11; one reached the list as #318).
// `[SYSTEM NOTIFICATION`, `Another Claude session sent a message`, `Stop hook feedback`:
// a background task's notice, another session's message, a /goal check -- each queued
// into a running turn the way the person's own mid-turn message is, and listed as a
// prompt by the live capture (djdarcy, 2026-10-12: "The whole point of the "prompts"
// panel is it is showing genuine user inputs, full stop").
const NOT_A_PROMPT = /^\s*(<bash-(input|stdout|stderr)>|<command-name>|<command-message>|<local-command-(stdout|stderr)>|<teammate-message[\s>]|<task-notification>|\[Request interrupted by user|This session is being continued from a previous conversation|\[SYSTEM NOTIFICATION|Another Claude session sent a message|Stop hook feedback)/

export function looksLikePrompt(text: string): boolean {
  return text.trim() !== '' && !NOT_A_PROMPT.test(text)
}

// The person's words out of a queued message as the engine renders it for the model:
// a `<system-reminder>` whose first line says a message arrived while Claude was
// working, then the text, then a closing paragraph on how such messages surface. The
// framing is the engine's and may change; when it is not recognised the whole text is
// kept rather than nothing.
export function unwrapQueued(rendered: string): string {
  let s = rendered.replace(/<\/?system-reminder[^>]*>/g, '')
  s = s.replace(/^\s*The user sent a new message while you were working:\s*/, '')
  s = s.replace(/\n\s*This is how Claude Code surfaces messages[\s\S]*$/, '')
  return s.trim() || rendered.trim()
}

// A row a schedule sent: a /loop firing is a plain user row carrying the command it runs,
// stamped `turnOrigin: "scheduled"` and the task's id (one conversation kept 337 of them
// as footnotes, 2026-10-15). It is the schedule's, never the person's.
const scheduled = (o: any): boolean => o?.turnOrigin === 'scheduled' || o?.scheduledTaskId !== undefined

// A transcript row's prompt text, or undefined when the row is not a prompt.
export function promptTextOf(o: any): string | undefined {
  if (o?.type === 'attachment') {
    const a = o.attachment
    if (a?.type === 'queued_command' && a.humanTurn && typeof a.prompt === 'string' && !o.isSidechain) {
      return looksLikePrompt(a.prompt) ? a.prompt : undefined
    }
    return undefined
  }
  // A compaction summary is a user row flagged `isCompactSummary` (4 in this session's
  // transcript, 2026-10-11); the flag is checked before the opening sentence, which is
  // the engine's wording and may change.
  if (o?.type !== 'user' || o.isMeta || o.isSidechain || o.isCompactSummary || scheduled(o)) return undefined
  const content = o.message?.content
  let text: string | undefined
  if (typeof content === 'string') text = content
  else if (Array.isArray(content)) {
    if (content.some((b: any) => b?.type === 'tool_result')) return undefined
    const texts = content.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? ''))
    text = texts.length > 0 ? texts.join(' ') : undefined
  }
  return text !== undefined && looksLikePrompt(text) ? text : undefined
}

// Footnotes (#33): the person's own actions that are not prompts, numbered `N.k` under
// the prompt before them. djdarcy, 2026-10-12: the prompts pane gives "USER invoked
// markers (compactions aren't users, tasks aren't users, interruptions are users ...)".
// So a slash command, a `!` shell command and an interruption are footnotes; their
// output (`<local-command-stdout>`, `<bash-stdout>`) folds into the footnote before it;
// meta rows, compaction summaries and task notifications are not footnotes.
export type FootnoteKind = 'command' | 'shell' | 'interrupted'
export type Footnote = { kind: FootnoteKind; label: string }

// The longest footnote label kept. A command's label is its name and arguments, and a
// /goal can carry its whole brief as arguments (3,155 characters seen, 2026-10-15); the
// pane draws a label whole, so a long one wrapped over many rows and filled the store.
export const FOOTNOTE_LABEL_MAX = 120

const tagged = (text: string, tag: string) => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text)?.[1]?.trim()

// A transcript row's footnote, or undefined when the row is not one.
export function footnoteOf(o: any): Footnote | undefined {
  const fn = footnoteWhole(o)
  return fn && fn.label.length > FOOTNOTE_LABEL_MAX ? { ...fn, label: `${fn.label.slice(0, FOOTNOTE_LABEL_MAX - 1)}…` } : fn
}

function footnoteWhole(o: any): Footnote | undefined {
  if (o?.type !== 'user' || o.isMeta || o.isSidechain || o.isCompactSummary || scheduled(o)) return undefined
  const content = o.message?.content
  let text: string | undefined
  if (typeof content === 'string') text = content
  else if (Array.isArray(content)) {
    if (content.some((b: any) => b?.type === 'tool_result')) return undefined
    text = content.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? '')).join(' ')
  }
  if (!text) return undefined
  const t = text.trimStart()
  if (t.startsWith('<command-name>') || t.startsWith('<command-message>')) {
    const name = tagged(t, 'command-name') ?? tagged(t, 'command-message') ?? ''
    const args = tagged(t, 'command-args') ?? ''
    return { kind: 'command', label: `${name}${args ? ` ${args}` : ''}`.trim() }
  }
  if (t.startsWith('<bash-input>')) return { kind: 'shell', label: `!${tagged(t, 'bash-input') ?? ''}` }
  if (t.startsWith('[Request interrupted by user')) return { kind: 'interrupted', label: t.replace(/^\[|\]$/g, '').trim() }
  return undefined
}

// A footnote as kept: `after` is the uuid of the prompt before it (null before the first).
export type FootnoteRef = Footnote & { uuid: string; after: string | null }

// The `N.k` of kept footnotes, given the prompts in order (#1 first). A footnote whose
// prompt is no longer in the list (aged out of the kept window) has no number.
export function numberFootnotes(promptUuids: readonly string[], footnotes: readonly FootnoteRef[]): (Numbered | undefined)[] {
  const index = new Map(promptUuids.map((u, i) => [u, i + 1]))
  const seen = new Map<number, number>()
  return footnotes.map(f => {
    const n = f.after === null ? 0 : index.get(f.after)
    if (n === undefined) return undefined
    const k = (seen.get(n) ?? 0) + 1
    seen.set(n, k)
    return { n, k }
  })
}

export type Numbered = { n: number; k: number }

// The `N.k` of each row in a stream of prompts and footnotes, in transcript order: N is
// the number of the prompt before it (0 before the first), k counts the footnotes under
// that prompt from 1; a prompt is `N.0`. Footnotes never shift a prompt's number.
export function numberRows(kinds: readonly ('prompt' | 'footnote')[]): Numbered[] {
  let n = 0
  let k = 0
  return kinds.map(kind => {
    if (kind === 'prompt') {
      n += 1
      k = 0
      return { n, k: 0 }
    }
    k += 1
    return { n, k }
  })
}
