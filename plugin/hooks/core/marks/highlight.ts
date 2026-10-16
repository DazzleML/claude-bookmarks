// The mark highlight's pure parts (refactor-advisor 2026-10-12__15-06-26 row 5; the fourth
// move of the register.tsx split, Q261012-06): where a marked line sits in a message's
// text, and the bold «a» form used when the line cannot be drawn on its own. Moved
// verbatim from register.tsx (/move-code); the JSX that draws the line stays there.

// The first line of a selection, which is what a row redraw searches for: a match
// across lines would have to rewrite markdown structure, which the plugin doesn't do.
export const snippetOf = (text: string) => (text.split('\n').find(l => l.trim()) ?? '').trim().slice(0, 120)

// Split a reply's markdown around the line holding `snippet`, for drawing that line
// ourselves. Undefined (caller falls back to bold) when the split is risky: no match,
// the line is inside a fenced code block or is a table row, or the remainder is too long
// for Markdown.
// A selection is copied from the RENDERED reply, so `**bold**`, `code` and [links](url)
// have lost their markup; compare against each source line with the same markup removed.
// (Matching the raw markdown missed any line with inline formatting, 2026-10-04.)
export const plainMarkdown = (s: string) =>
  s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`/g, '')

export type ColorSplit = {
  before: string
  pre: string
  snippet: string
  post: string
  after: string
  letter: string
  gapAbove: boolean
  gapBelow: boolean
}

export function colorSplit(text: string, letter: string, snippet: string | undefined): ColorSplit | undefined {
  if (!snippet) return undefined
  const lines = text.split('\n')
  const idx = lines.findIndex(l => plainMarkdown(l).includes(snippet))
  if (idx < 0) return undefined
  const fences = lines.slice(0, idx).filter(l => l.trimStart().startsWith('```')).length
  if (fences % 2 === 1) return undefined
  // A table row: splitting it out leaves the rows below without their header, so they
  // draw as raw `| ... |` text (djdarcy, 2026-10-15). Declined like a fenced line.
  if ((lines[idx] ?? '').trimStart().startsWith('|')) return undefined
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

/** A mark as the highlight needs it: the selected words (first line) and the message's head for when they are missing. */
export type MarkWords = { snippet?: string; head: string }

/** A prompt row is plain text, so the mark shows as a «a» tag in front of the selected words. Display only -- the model never reads it. Unchanged text means no mark matched. */
export function tagMarksPlain(text: string, marks: readonly (readonly [string, MarkWords])[]): string {
  let marked = text
  for (const [letter, m] of marks) {
    if (m.snippet && marked.includes(m.snippet)) marked = marked.replace(m.snippet, `«${letter}» ${m.snippet}`)
  }
  return marked
}

/** A reply's text is markdown, so the marked words are drawn bold with a «a» tag. When the selection (rendered text) doesn't match the markdown source literally, or carries markup characters, the tag goes on a quoted line of its own at the top of the block instead, which is where a jump lands. */
export function tagMarksMarkdown(text: string, marks: readonly (readonly [string, MarkWords])[]): string {
  const unmatched: string[] = []
  for (const [letter, m] of marks) {
    const s = m.snippet
    if (s && !/[*`_]/.test(s) && text.includes(s)) text = text.replace(s, `**«${letter}» ${s}**`)
    else unmatched.push(`«${letter}» ${s ?? m.head}`)
  }
  if (unmatched.length > 0) text = `> **${unmatched.join('  ')}**\n\n${text}`
  return text
}
