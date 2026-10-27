// A fragment quoted from a message, matched the way a reader means it. Claude quotes a reply's
// words as they read, not as the reply's Markdown spells them: `**<leader> l** opens` is quoted as
// "<leader> l opens", and the quote failed with "no message holds it" (djdarcy's ck3 session,
// 2026-10-27). Every resolver that finds a place by a fragment (core/bookmarks/transcript-lines.ts
// resolveRows for the loader's and the grep's rows; core/places + core/search for the places) tries
// the exact text first, and only when nothing holds it exactly, this plain form of both sides.
//
// Pure.

/**
 * The text as a reader sees it: Markdown's emphasis and code marks dropped (`**`, `__`, `~~`, `*`,
 * backticks) and every run of whitespace one space. A single `_` stays: it is part of names
 * (`snake_case`) far more often than it is italics.
 */
export const plainText = (text: string): string =>
  text.replace(/\*\*|__|~~|[*`]/g, '').replace(/\s+/g, ' ').trim()

/** Whether `text` holds `fragment` once both are plain; an empty plain fragment holds nothing. */
export function holdsPlain(text: string, fragment: string): boolean {
  const f = plainText(fragment)
  return f !== '' && plainText(text).includes(f)
}
