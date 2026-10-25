// What a refused jump says (moved verbatim from handlers/navigation.ts under U59, so the
// wording can follow the capability path that runs for history.reach).
//
// Where to search: transcript mode's `/` only sees what the view holds, which after
// a compaction excludes earlier messages (2026-10-05: not found). `[` in transcript
// mode writes the FULL conversation to the terminal's scrollback, where the
// terminal's own find does reach them (user-verified, 2026-10-05).
export const REFUSED_JUMP_HOW = `press Ctrl+O, then [ (full conversation), then your terminal's Find (Ctrl+Shift+F or Cmd+F)`

/**
 * The toast for a scroll Claude Code refused with "nothing drawn". On stock that means the
 * message is from before a compaction, so the text says so and offers the search route. On
 * the patched path (`DCC_PATCH_H`, where pre-compaction rows are real rows) it cannot mean
 * that, so the text names the patch and offers the same route without the guess.
 */
export function refusedJumpText(path: string, phrase: string | undefined, copied: boolean): string {
  const how = REFUSED_JUMP_HOW
  if (path === 'patched') {
    return copied
      ? `Can't jump there: Claude Code has nothing drawn for that message, even with the history patch. Copied "${phrase}": ${how} and paste.`
      : `Can't jump there: Claude Code has nothing drawn for that message, even with the history patch. ${how} and search for ` +
          `${phrase ? `"${phrase}"` : 'a few words of it'}.`
  }
  return copied
    ? `Can't jump there: that message isn't on screen (older than a compaction?). Copied "${phrase}": ${how} and paste.`
    : `Can't jump there: that message isn't on screen (older than a compaction?). ${how} and search for ` +
        `${phrase ? `"${phrase}"` : 'a few words of it'}.`
}
