// Finding `bm:` references in a reply's text and expanding them into links (the bm: short-reference
// design, 2026-10-27__14-00-02, unit 4). Claude Code's Markdown draws only https/http/file links, so
// a reply that holds `[label](bm:...)` or a bare `bm:...` is redrawn with each reference turned into
// the `file:` anchor it names; the transcript keeps the short text. Code spans and fences are left
// as written. Pure: the caller resolves each reference (handlers/bookmarks.ts expandReplyRefs).
import { parseRef } from './ref.ts'

export type RefToken = {
  /** Where the token sits in the text: the whole `[label](href)` for a link, the reference alone for a bare one. */
  start: number
  end: number
  /** The reference as written. */
  raw: string
  /** A link's label; undefined for a bare reference. */
  label?: string
}

/** The text with fenced blocks and inline code blanked to spaces, so positions still line up. */
function maskCode(text: string): string {
  let inFence = false
  return text
    .split('\n')
    .map(line => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence
        return ' '.repeat(line.length)
      }
      if (inFence) return ' '.repeat(line.length)
      return line.replace(/`[^`\n]*`/g, m => ' '.repeat(m.length))
    })
    .join('\n')
}

const LINK = /\[([^\]\n]*)\]\((bm:[^)\s]+)\)/gi
// A bare reference: the scheme, an 8+ hex session prefix, then its rest up to a space, a quote,
// a bracket or a backtick. Sentence punctuation at its end is not part of it (the boundary table).
const BARE = /(?<![\w/])bm:[0-9a-f][0-9a-f-]{7,35}(?:[./~?][^\s"'`<>()[\]]*)?/gi

/** The references in a text, in order, outside code; each one parses as a reference. */
export function refTokens(text: string): RefToken[] {
  const masked = maskCode(text)
  const out: RefToken[] = []
  for (const m of masked.matchAll(LINK)) {
    if (parseRef(m[2]!)) out.push({ start: m.index!, end: m.index! + m[0].length, raw: m[2]!, label: m[1]! })
  }
  const inLink = (i: number) => out.some(t => i >= t.start && i < t.end)
  for (const m of masked.matchAll(BARE)) {
    if (inLink(m.index!)) continue
    const raw = m[0].replace(/[.,;:!?]+$/, '')
    if (parseRef(raw)) out.push({ start: m.index!, end: m.index! + raw.length, raw })
  }
  return out.sort((a, b) => a.start - b.start)
}

/**
 * The text with every reference the resolver answers turned into a link to what it returns: a
 * link keeps its label, a bare reference becomes `[the reference](href)`. A reference it does not
 * answer is left as written. Text with no reference comes back unchanged (the same string).
 */
export async function expandRefs(text: string, hrefOf: (raw: string) => Promise<string | undefined>): Promise<string> {
  const tokens = refTokens(text)
  if (tokens.length === 0) return text
  let out = text
  for (const t of tokens.reverse()) {
    const href = await hrefOf(t.raw)
    if (!href) continue
    out = `${out.slice(0, t.start)}[${t.label ?? t.raw}](${href})${out.slice(t.end)}`
  }
  return out
}
