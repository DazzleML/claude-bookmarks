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
// A selection is copied from the RENDERED reply, so `**bold**`, `code`, [links](url) and
// *italics* have lost their markup; compare against each source line with the same markup
// removed. (Matching the raw markdown missed any line with inline formatting, 2026-10-04;
// a line with `*italics*` was still missed and its mark fell to the quoted line at the
// top of the reply, 2026-10-20.) Emphasis markers count only where Markdown would read
// them: an opening `*` or `_` followed by a non-space, a closing one preceded by one, and
// `_` only at a word's edge, so `2 * 3` and `a_001` are left as they are.
export const plainMarkdown = (s: string) =>
  s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, '$1')
    .replace(/(^|[^\w])_(\S(?:[^_\n]*\S)?)_(?![\w])/g, '$1$2')

export type ColorSplit = {
  before: string
  pre: string
  snippet: string
  post: string
  after: string
  letter: string
  gapAbove: boolean
  gapBelow: boolean
  /** The marked line as written (markdown), for a line that must be drawn as Markdown to keep its links. */
  raw: string
}

/** An explicit markdown link on a line, `[label](href)`. */
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g

/**
 * The marked line as markdown, for a line that carries a link (slice B, 2026-10-21; the draft
 * "a link on a highlighted line loses its colour and its click"): such a line is drawn as a
 * Markdown element so the link keeps its colour and its click. The words get the bold «a» form
 * when the raw line holds them literally, they carry no markup characters of their own, and the
 * tag cannot break a link (the words lie wholly outside every link, or wholly inside one label);
 * otherwise the band alone marks the line. A line with no link returns undefined: it is drawn
 * as Text, as before.
 */
export function markedLineMarkdown(c: ColorSplit): string | undefined {
  const links = [...c.raw.matchAll(LINK)]
  if (links.length === 0) return undefined
  const at = c.raw.indexOf(c.snippet)
  if (at < 0 || /[*`_]/.test(c.snippet)) return c.raw
  const end = at + c.snippet.length
  for (const m of links) {
    const start = m.index ?? 0
    const stop = start + m[0].length
    const labelStart = start + 1
    const labelEnd = labelStart + (m[1] ?? '').length
    const outside = end <= start || at >= stop
    const inLabel = at >= labelStart && end <= labelEnd
    if (!outside && !inLabel) return c.raw
  }
  return `${c.raw.slice(0, at)}**«${c.letter}» ${c.snippet}**${c.raw.slice(end)}`
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
    raw: lines[idx] ?? '',
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
