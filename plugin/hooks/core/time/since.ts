// How long ago, as a ladder of units: the largest unit that fits, then `depth` units below it.
// Fixed multiples (a month is 30 days, a quarter 91, a year 365): an age at a glance is not a
// calendar. Every rung floors, never rounds, and a zero rung is shown ("1d 0h" says "just turned
// a day"). Quarters are a rung only when switched on.

export type SinceUnit = 'y' | 'q' | 'mo' | 'wk' | 'd' | 'h' | 'm' | 's'

export interface SinceOptions {
  /** Units shown below the largest: 0 shows one unit, 1 (the default) two, 2 three. */
  depth?: number
  /** Count quarters between months and years. */
  quarters?: boolean
  /** The smallest unit ever shown: a span under it reads as zero of it. */
  floor?: SinceUnit
}

const S = 1000
const LADDER: ReadonlyArray<readonly [SinceUnit, number]> = [
  ['y', 365 * 86_400 * S],
  ['q', 91 * 86_400 * S],
  ['mo', 30 * 86_400 * S],
  ['wk', 7 * 86_400 * S],
  ['d', 86_400 * S],
  ['h', 3_600 * S],
  ['m', 60 * S],
  ['s', S],
]

/** The span from `t` to `now` as text: `2h 30m`, `1wk 2d`, `1y 0q`. A span at or under zero is `0s` (or zero of the floor). */
export function since(now: number, t: number, { depth = 1, quarters = false, floor = 's' }: SinceOptions = {}): string {
  const end = LADDER.findIndex(([u]) => u === floor)
  const rungs = LADDER.slice(0, end + 1).filter(([u]) => quarters || u !== 'q')
  let left = now - t
  const top = rungs.findIndex(([, size]) => left >= size)
  if (top < 0) return `0${floor}`
  const parts: string[] = []
  for (const [u, size] of rungs.slice(top, top + 1 + Math.max(0, depth))) {
    const n = Math.floor(left / size)
    parts.push(`${n}${u}`)
    left -= n * size
  }
  return parts.join(' ')
}
