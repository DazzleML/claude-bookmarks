// The lists' pure model (refactor-advisor 2026-10-12__15-06-26 row 1, its `core/prompts/list-model.ts`;
// the eighth move of the register.tsx split, Q261012-06): numbering, the footnotes under
// their prompt and whether they show, the pinned group, the ▶ pointer, the dim rule, and
// the bookmarks pane's words. Moved from register.tsx's Pane render hook under /move-code,
// comments as they were; the JSX stays there.
import { firstFour } from '../kit/message-id.ts'
import { numberFootnotes, type FootnoteRef } from './prompt-rows.ts'
import { ownerOf, type AnchorRecord } from '../bookmarks/anchor.ts'

/** Numbered in the order sent (#1 the first), listed newest first (djdarcy, 2026-10-04). */
export function numberNewestFirst<T>(all: readonly T[]): (T & { n: number })[] {
  return all.map((r, i) => ({ ...r, n: i + 1 })).reverse()
}

/** `21) text`, numbers right-aligned so the text lines up (djdarcy, 2026-10-04, over `#21`; also offered `(21) ` and `21| `). One place to change it. */
export const numberWidth = (count: number): number => String(count).length
export const numberLabel = (n: number, width: number): string => `${String(n).padStart(width)}) `

// Footnotes (#33) under their prompt, N.k, in the footnote role: folded behind an
// ellipsis row (`.` or a press unfolds), shown, or hidden, by the `footnotes`
// setting; 0.k (before the first prompt) at the very bottom.
export function footnotesByPrompt(promptIds: readonly string[], kept: readonly FootnoteRef[]): Map<number, { f: FootnoteRef; k: number }[]> {
  const nums = numberFootnotes(promptIds, kept)
  const byPrompt = new Map<number, { f: FootnoteRef; k: number }[]>()
  kept.forEach((f, i) => {
    const at = nums[i]
    if (at) byPrompt.set(at.n, [...(byPrompt.get(at.n) ?? []), { f, k: at.k }])
  })
  return byPrompt
}

export type FootnoteMode = 'folded' | 'shown' | 'hidden'
/** How a prompt's footnotes draw: none; the ellipsis row; open; or open with a `▴ fold` row (folded by default and opened by hand -- djdarcy, 2026-10-12: "a way to "recollapse" our "footnotes" ... after we open them"). */
export function footnoteDisplay(mode: FootnoteMode, hasFootnotes: boolean, unfolded: boolean): 'none' | 'folded' | 'open' | 'open-refold' {
  if (!hasFootnotes || mode === 'hidden') return 'none'
  if (mode === 'folded' && !unfolded) return 'folded'
  return mode === 'folded' ? 'open-refold' : 'open'
}
export const foldedLabel = (count: number): string => `      … ${count} footnote${count > 1 ? 's' : ''}`

/** Pinned prompts: listed first, in the order pinned, among those the filter shows. */
export function pinnedRowsOf<T extends { uuid: string }>(pinIds: readonly string[], byUuid: ReadonlyMap<string, T>, listed: ReadonlySet<string>): T[] {
  return pinIds.map(u => byUuid.get(u)).filter((r): r is T => !!r && listed.has(r.uuid))
}

// Digits typed in the band (it holds the keyboard; the pane can't take it) show
// here too: in the `#` field, and as a ▶ on the prompt they name (djdarcy,
// 2026-10-07: "it would be nice if the number was entered into the panel").
export const pointerFor = (fromBand: string | undefined, targetN: number | undefined) => (n: number): string => (fromBand === undefined ? '' : n === targetN ? '▶' : ' ')

// Dim: not drawn since the mod loaded, so possibly not reachable by a jump
// (before a compaction). A hint only: one not yet scrolled to is dim too.
// Drawn ids share a uuid's first four groups (see promptHere); compare dimming by those.
export const drawnFourOf = (drawnIds: Iterable<string>): Set<string> => new Set([...drawnIds].map(firstFour))
export const unreached = (drawnFour: ReadonlySet<string>, uuid: string): boolean => !drawnFour.has(firstFour(uuid))

/** A bookmark's age in the list: minutes, then hours, then days. */
export function age(now: number, t: number): string {
  const m = Math.round((now - t) / 60_000)
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}

/** The bookmarks pane's second line: how old, who said it, whose it is, temporary. */
export function bookmarkWho(r: Pick<AnchorRecord, 'owner' | 'by' | 'role' | 'sharedFrom' | 'source' | 'temporary' | 'createdAt'>, now: number): string {
  const said = r.role ? (r.role === 'user' ? 'you said it' : 'Claude said it') : ''
  const minted = ownerOf(r) === 'claude' ? "Claude's" : r.sharedFrom ? 'shared by Claude' : r.source === 'promote' ? 'promoted' : 'yours'
  return [age(now, r.createdAt), said, minted, r.temporary ? 'temporary' : ''].filter(Boolean).join(' · ')
}

// The group tabs with their counts, the active one in brackets (styled like the
// prompts pane's pinned group: a coloured marker beside a plain Button, since a
// Button's label takes no colour at rest).
export function groupHeader<G extends { title: string }>(groups: readonly G[], active: G, count: (g: G) => number): string {
  return groups.map(g => (g === active ? `[${g.title} ${count(g)}]` : `${g.title} ${count(g)}`)).join('  ')
}
