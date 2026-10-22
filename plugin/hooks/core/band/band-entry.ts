// The band's number entry, the pure parts (the census's band cluster; the ninth move of the
// register.tsx split, Q261012-06, the shape-independent first step the 17-18-16 DWP names):
// what a typed entry means in the prompts list, when a number is complete, where j/k go,
// and which group comes next. Moved from register.tsx under /move-code, comments as they
// were. The state reads, the scrolls, the toasts and the timers stay there.
import { fieldRest, parseListNumber } from './keys.ts'
import { numberFootnotes, type FootnoteRef } from '../prompts/prompt-rows.ts'
import type { AnchorOwner } from '../bookmarks/anchor.ts'

// The bookmarks pane's groups, cycled by the band's h/l (nextGroup below). Moved from
// register.tsx under /move-code (U60, 2026-10-22).
export const BOOKMARK_GROUPS: { owner: AnchorOwner | 'all'; title: string }[] = [
  { owner: 'user', title: 'yours' },
  { owner: 'claude', title: "Claude's" },
  { owner: 'all', title: 'all' },
]

// When a typed prompt number jumps (a setting, #7): 'enter' waits for Enter, so the
// person can check the number first; 'complete' jumps on the digit that makes it complete.
// Default 'enter': `p 3XX` jumping before Enter was "potentially a problem" (djdarcy,
// 2026-10-07: "Some users will like just typing the number and going there. Others will
// want the chance to confirm.").
export const PROMPT_NUMBER_JUMPS_AT: 'enter' | 'complete' = 'enter'

// True once the digits typed can't become a larger prompt number: with 25 prompts,
// `3` is complete, `2` waits for a second digit or Enter. Only acted on when
// PROMPT_NUMBER_JUMPS_AT is 'complete'.
export function promptNumberComplete(typed: string, count: number, jumpsAt: 'enter' | 'complete' = PROMPT_NUMBER_JUMPS_AT): boolean {
  if (jumpsAt !== 'complete') return false
  const n = Number(typed)
  return /^\d+$/.test(typed) && n >= 1 && n <= count && n * 10 > count
}

// Browse the prompts one by one from the band, vim's j and k: the band holds the keyboard,
// so the pane can't take the arrows (djdarcy, 2026-10-07: "the nice thing about the panel
// is that you can scroll through the prompts 1 by 1"). The list is newest first: j moves
// the ▶ down (older), k up (newer); the first press lands on the newest. Enter jumps.
// `dir` is the key table's (core/band/keys.ts): 1 is next (j by default), -1 previous (k), so
// the key itself stays configurable; the number moves the other way, newest first.
export function stepNumber(typed: string, count: number, dir: -1 | 1): number {
  const cur = Number(typed)
  return !typed || !cur ? count : Math.min(count, Math.max(1, cur - dir))
}

/** The 1-based list position a typed number names, if it names one; an empty entry names the newest when `emptyIsNewest`. */
export function listPosition(typed: string, count: number, emptyIsNewest = false): number | undefined {
  const t = typed.trim()
  const n = t === '' && emptyIsNewest ? count : Number(t)
  return Number.isInteger(n) && n >= 1 && n <= count ? n : undefined
}

/** What an entry in the prompts list means. */
export type PromptEntry =
  | { kind: 'pin'; typed: string } // `*21` toggles the pin on #21, `*` on the newest; the pane stays open to pin more.
  | { kind: 'filter'; words: string } // `/words` with Enter: the filter (#28), as typing it does.
  | { kind: 'unfold'; n: number } // `3.` unfolds #3's footnotes, and again folds them (#33).
  | { kind: 'footnote'; n: number; k: number } // `3.1` jumps to its first (#33).
  | { kind: 'jump'; n: number }
  | { kind: 'invalid'; typed: string }
export function promptEntry(typed: string, count: number): PromptEntry {
  const t = typed.trim()
  // The prefixes are the pane field's own keys in the table (keys.ts LIST_KEYS, `field`).
  const pin = fieldRest(t, 'list', 'pin')
  if (pin !== undefined) return { kind: 'pin', typed: pin }
  const words = fieldRest(t, 'list', 'filter')
  if (words !== undefined) return { kind: 'filter', words }
  const parsed = parseListNumber(t)
  if (parsed?.unfold) return { kind: 'unfold', n: parsed.n }
  if (parsed?.k !== undefined) return { kind: 'footnote', n: parsed.n, k: parsed.k }
  const n = listPosition(t, count)
  return n === undefined ? { kind: 'invalid', typed: t } : { kind: 'jump', n }
}

/** The kept footnote numbered `n.k`, if there is one. */
export function footnoteAt(promptIds: readonly string[], kept: readonly FootnoteRef[], n: number, k: number): FootnoteRef | undefined {
  const nums = numberFootnotes(promptIds, kept)
  const i = nums.findIndex(x => x?.n === n && x.k === k)
  return i >= 0 ? kept[i] : undefined
}

// Cycle the bookmarks pane's group from the band: yours -> Claude's -> all -> yours.
export const nextGroup = (current: number, step: -1 | 1, groups: number): number => (current + step + groups) % groups
