// The prompts filter (#28): which prompts match what the person typed after `/`.
//
// Pure, so the search (#20) can grow from it: words in any order, case-insensitive, each
// word a substring of the prompt's text. A prompt keeps its number; the filter only
// decides which rows are drawn. The text searched is as much of each prompt as the
// text budget keeps (the setting decides; the full text where the machine allows it).

// The words of a query: split on whitespace, lower-cased, empties dropped.
export function queryWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

// Whether a text matches every word of a query (an empty query matches everything).
export function matches(text: string, words: readonly string[]): boolean {
  if (words.length === 0) return true
  const t = text.toLowerCase()
  return words.every(w => t.includes(w))
}

// The rows that match, in their original order, with how many there were.
export function filterPrompts<T>(rows: readonly T[], query: string, textOf: (row: T) => string): { shown: T[]; of: number } {
  const words = queryWords(query)
  return { shown: rows.filter(r => matches(textOf(r), words)), of: rows.length }
}

// The legend's count: `N of M match`, or nothing when no query is active.
export function matchLegend(shown: number, of: number, query: string): string | undefined {
  return queryWords(query).length === 0 ? undefined : `${shown} of ${of} match`
}
