// Stars: a place starred in a list, recorded with the list it was starred in (the 0.7
// groundwork design, 2026-10-25, unit 6, axis 4's S2). djdarcy: "I think we should always flag
// where the star was added from so users can specify in the config if they want it present
// globally or relative to where it was done." The gate (G-a): a setting, `starScope`, whose
// default is "only where made" (`here`), with `everywhere` choosable.
//
// A star is never deleted: turning it off stamps `off`, so when two copies of a register meet
// (union) the later touch wins and a star turned off on one side does not come back from the
// other. The pins of format v3 (`pins[owner] = uuid[]`) become stars from the prompts list in
// the v3-to-v4 migration (migrations.ts).
//
// Pure: no I/O.

import type { AnchorOwner } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/bookmarks/anchor.ts'

/** The list a star was made in: `prompts` for the prompts list (and every v3 pin), or a view's name. */
export type StarFrom = string

export type Star = {
  uuid: string
  /** Absent for the main transcript (a place's `file`). */
  file?: string
  /** The block within a record, when the place is one of several (a place's `part`). */
  part?: number
  owner: AnchorOwner
  from: StarFrom
  /** When the star was last turned on. */
  at: number
  /** When it was turned off; absent while it is on. */
  off?: number
}

/** Where a star is: the parts of a place's address a register needs (the session is the file's own). */
export type StarPlace = { uuid: string; file?: string; part?: number }

export type StarScope = 'here' | 'everywhere'

/** The place a star or a place sits at, as one string: file, uuid and part (the reader's `placeKey`). */
export const starPlaceKey = (p: StarPlace): string => `${p.file ?? ''}|${p.uuid}|${p.part ?? 0}`

const starKey = (s: Pick<Star, 'owner' | 'from'> & StarPlace): string => `${s.owner}|${s.from}|${starPlaceKey(s)}`

export const isOn = (s: Star): boolean => s.off === undefined

const lastTouch = (s: Star): number => Math.max(s.at, s.off ?? -Infinity)

/**
 * Whether a place shows a star in a list: for `here`, a star on it made in this list; for
 * `everywhere`, a star on it made in any list. Only the owner's stars count.
 */
export function isStarred(stars: readonly Star[] | undefined, owner: AnchorOwner, place: StarPlace, from: StarFrom, scope: StarScope): boolean {
  const at = starPlaceKey(place)
  return (stars ?? []).some(s => isOn(s) && s.owner === owner && starPlaceKey(s) === at && (scope === 'everywhere' || s.from === from))
}

/** The places the owner's stars mark in a list, as `starPlaceKey`s, for drawing a list in one pass. */
export function starredPlaces(stars: readonly Star[] | undefined, owner: AnchorOwner, from: StarFrom, scope: StarScope): Set<string> {
  const out = new Set<string>()
  for (const s of stars ?? []) if (isOn(s) && s.owner === owner && (scope === 'everywhere' || s.from === from)) out.add(starPlaceKey(s))
  return out
}

/**
 * Turns a star on or off for a place in a list. On: this list's star is made, or turned on
 * again. Off: with `here`, this list's star is turned off; with `everywhere`, every star the
 * owner has on the place is (it showed as starred because of any of them). Unchanged when
 * nothing would change.
 */
export function setStar(stars: readonly Star[] | undefined, owner: AnchorOwner, place: StarPlace, from: StarFrom, on: boolean, scope: StarScope, now: number): { stars: Star[]; changed: boolean } {
  const list = [...(stars ?? [])]
  const at = starPlaceKey(place)
  let changed = false
  if (on) {
    const key = starKey({ owner, from, ...place })
    const i = list.findIndex(s => starKey(s) === key)
    if (i >= 0 && isOn(list[i]!)) return { stars: list, changed: false }
    const star: Star = { uuid: place.uuid, ...(place.file !== undefined ? { file: place.file } : {}), ...(place.part !== undefined ? { part: place.part } : {}), owner, from, at: now }
    // Starred again: it moves to the end, so the list stays in the order things were starred.
    if (i >= 0) list.splice(i, 1)
    list.push(star)
    return { stars: list, changed: true }
  }
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!
    if (!isOn(s) || s.owner !== owner || starPlaceKey(s) !== at) continue
    if (scope === 'here' && s.from !== from) continue
    list[i] = { ...s, off: now }
    changed = true
  }
  return { stars: list, changed }
}

/** Two copies' stars meeting: one star per (owner, list, place), the later-touched winning; `a`'s order first. */
export function unionStars(a: readonly Star[] | undefined, b: readonly Star[] | undefined): { stars: Star[]; changed: boolean } {
  const out = [...(a ?? [])]
  const at = new Map(out.map((s, i) => [starKey(s), i]))
  let changed = false
  for (const s of b ?? []) {
    const i = at.get(starKey(s))
    if (i === undefined) { at.set(starKey(s), out.length); out.push(s); changed = true; continue }
    if (lastTouch(s) > lastTouch(out[i]!)) { out[i] = s; changed = true }
  }
  return { stars: out, changed }
}

/** Whether a value read from a file is a star this build can use; anything else is dropped on read. */
export function isStar(v: unknown): v is Star {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return typeof s.uuid === 'string' && typeof s.owner === 'string' && typeof s.from === 'string' && typeof s.at === 'number'
    && (s.file === undefined || typeof s.file === 'string') && (s.part === undefined || typeof s.part === 'number')
    && (s.off === undefined || typeof s.off === 'number')
}
