// Matching a message across the ids Claude Code gives it.
//
// The transcript stores a message under a uuid; the render hooks report the same
// message under an id that shares the uuid's first four groups and differs in the
// fifth (measured 2026-10-11: drawn ids end in 000000000000). So "the same message"
// means the same first four groups. Not the same relation as register-file's
// sameUuid, which accepts an 8+ character prefix typed by a person.

/** The first four groups of a uuid-shaped id; the part a drawn id keeps. */
export const firstFour = (id: string): string => id.split('-').slice(0, 4).join('-')

/** Whether two ids name the same message (a stored uuid, a drawn id, or one of each). */
export const sameMessage = (a: string, b: string): boolean => firstFour(a) === firstFour(b)

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
