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
const NOT_A_PROMPT = /^\s*(<bash-(input|stdout|stderr)>|<command-name>|<command-message>|<local-command-(stdout|stderr)>|<teammate-message[\s>]|<task-notification>|\[Request interrupted by user|This session is being continued from a previous conversation)/

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
  if (o?.type !== 'user' || o.isMeta || o.isSidechain || o.isCompactSummary) return undefined
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
