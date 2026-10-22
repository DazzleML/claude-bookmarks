// The marks' pure parts (the census's marks cluster; the seventh move of the register.tsx
// split, Q261012-06), moved from register.tsx under /move-code, comments as they were. The
// store reads and writes, the highlight timer and the pane stay there.
import { sameMessage } from '../kit/message-id.ts'

// `snippet`: the selection's first line exactly as selected, for highlighting.
export type Mark = { uuid: string; head: string; markedAt: number; source?: 'selection' | 'latest' | 'screen'; snippet?: string }
export type Marks = Record<string, Mark>

// The reading position is kept as a mark under this key, so the highlight and the
// band show it like any other; the panes list only a-z, so it never appears there.
// (Moved from register.tsx under /move-code, U60, 2026-10-22, as READING and LETTERS.)
export const READING_LETTER = '`'

export const MARK_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

/** One mark letter a-z; with `withReading`, the reading position's backtick counts too (the one spelling of the set the key table, the panes and the delete command share). */
export const isMarkLetter = (ch: string, withReading = false): boolean => (withReading ? /^[a-z`]$/.test(ch) : /^[a-z]$/.test(ch))

// The shown mark, if it is on this row: by real uuid, or a drawn id sharing its first
// four groups. Only the one mark currently shown is ever highlighted.
export function marksShowing(marks: Readonly<Marks>, requestId: string, showing: string | undefined): [string, Mark][] {
  if (!showing) return []
  return Object.entries(marks).filter(
    ([letter, m]) =>
      letter === showing &&
      m.source === 'selection' &&
      sameMessage(m.uuid, requestId),
  )
}

// A short, distinctive piece of a message to search for in the Ctrl+O transcript view:
// the text after any generic opening (`RE:{`, a `<pasted_content …>` tag, braces), cut
// at a word boundary to about 32 characters.
export function searchPhrase(text: string | undefined): string | undefined {
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

/**
 * The session's marks, kept in memory so render hooks can read them without a store call
 * per row (the one-owner principle, notes/meta/2026-10-12__22-48-40): two named writers,
 * `replace` for the stored record (after a write, a delete or a session start) and
 * `showTransient` for a highlight that is never stored (an anchor's words); every reader
 * gets a read-only view.
 */
export class MarkCache {
  private marks: Marks = {}

  /** The record as stored (after a mark write, a delete, or loading at session start). */
  replace(marks: Marks): void {
    this.marks = marks
  }

  /** A highlight under a key no letter can take, for display only; gone at the next `replace`. */
  showTransient(key: string, mark: Mark): void {
    this.marks = { ...this.marks, [key]: mark }
  }

  get all(): Readonly<Marks> {
    return this.marks
  }

  /** The head of the first mark on this message, if any (for a refused jump's search phrase). */
  headOf(uuid: string): string | undefined {
    return Object.values(this.marks).find(m => m.uuid === uuid)?.head
  }
}

// vim's :delmarks a b / :delmarks! (U27, djdarcy 2026-10-07: "How can we delete the
// 'm' mark?"). The reading position is not a letter and is left alone.
export type DeleteMarks = { letters: string[]; gone: string[]; missing: string[]; kept: Marks }
/** What `/bm-delmarks <arg>` deletes: `all` or `!` every set letter, else the letters named; `gone` were set, `missing` were not, `kept` is the record after. */
export function deleteMarks(marks: Readonly<Marks>, arg: string, letters: readonly string[]): DeleteMarks {
  const a = arg.trim().toLowerCase()
  const named = a === 'all' || a === '!' ? letters.filter(l => marks[l]) : a.split(/[\s,]+/).filter(l => isMarkLetter(l))
  const gone = named.filter(l => marks[l])
  const missing = named.filter(l => !marks[l])
  const kept = Object.fromEntries(Object.entries(marks).filter(([l]) => !gone.includes(l)))
  return { letters: named, gone, missing, kept }
}
