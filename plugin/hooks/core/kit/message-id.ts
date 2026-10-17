// Matching a message across the ids Claude Code gives it.
//
// The transcript stores a message under a uuid; the render hooks report the same
// message under an id that shares the uuid's first four groups and differs in the
// fifth (measured 2026-10-11: drawn ids end in 000000000000). So "the same message"
// means the same first four groups. One meaning, used wherever two ids are compared
// (the record-format second review, 2026-10-16, point 4); `matchesPrefix` is the other
// relation, for what a person typed, and only for that.

/** The first four groups of a uuid-shaped id; the part a drawn id keeps. */
export const firstFour = (id: string): string => id.split('-').slice(0, 4).join('-')

/** Whether two ids name the same message (a stored uuid, a drawn id, or one of each). */
export const sameMessage = (a: string, b: string): boolean => firstFour(a).toLowerCase() === firstFour(b).toLowerCase()

/** A drawn id: the engine's stand-in for a message's uuid, its fifth group all zeros. */
export const isDrawnId = (id: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-0{12}$/i.test(id)

/**
 * Whether what a person typed names this id: the whole id, or a prefix of at least 8
 * characters (either way round, so a stored 8-character prefix matches a full id too).
 * For typed input only; identity between records is `sameMessage` and the record's own id.
 */
export function matchesPrefix(id: string, typed: string): boolean {
  const x = id.toLowerCase()
  const y = typed.toLowerCase()
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short.length >= 8 && long.startsWith(short)
}

/** A uuid as the log says it: its first eight characters. */
export const short = (uuid: string): string => uuid.slice(0, 8)

/** A position map keyed by first four groups, so a drawn id finds its stored message's place. */
export function byFirstFour(order: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  for (const [u, o] of order) out.set(firstFour(u), o)
  return out
}

/** The item for a message: an exact id match first, else the first with the same first four groups. */
export function findByMessage<T extends { uuid: string }>(list: readonly T[], id: string): T | undefined {
  return list.find(r => r.uuid === id) ?? list.find(r => sameMessage(r.uuid, id))
}
