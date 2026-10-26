// Pins: a place pinned in a list, recorded with the list it was pinned in (the 0.7
// groundwork design, 2026-10-25, unit 6, axis 4's S2). djdarcy: "I think we should always flag
// where the star was added from so users can specify in the config if they want it present
// globally or relative to where it was done." The gate (G-a): a setting, `pinScope`, whose
// default is "only where made" (`here`), with `everywhere` choosable.
//
// One name for one concept (djdarcy, 2026-10-26: "We shouldn't need a new name each time we
// make an adjacent improvement to a feature"): 0.7.1 called these stars and wrote them under
// `stars`; format v5 calls them pins everywhere, and the migrations carry the older shapes
// (v3's `pins` map, v4's `stars` list) forward. The design:
// 2026-10-26__02-04-21__dev-workflow-process__pins-by-name-format-v5-and-migrate-on-load.md.
//
// A pin is never deleted: turning it off stamps `off`, so when two copies of a register meet
// (union) the later touch wins and a pin turned off on one side does not come back from the
// other.
//
// Pure: no I/O.

import type { AnchorOwner } from './anchor.ts'

/** The list a pin was made in: `prompts` for the prompts list (and every v3 pin), or a view's name. */
export type PinFrom = string

export type Pin = {
  uuid: string
  /** Absent for the main transcript (a place's `file`). */
  file?: string
  /** The block within a record, when the place is one of several (a place's `part`). */
  part?: number
  owner: AnchorOwner
  from: PinFrom
  /** When the pin was last turned on. */
  at: number
  /** When it was turned off; absent while it is on. */
  off?: number
}

/** Where a pin is: the parts of a place's address a register needs (the session is the file's own). */
export type PinPlace = { uuid: string; file?: string; part?: number }

export type PinScope = 'here' | 'everywhere'

/** The place a pin or a place sits at, as one string: file, uuid and part (the reader's `placeKey`). */
export const pinPlaceKey = (p: PinPlace): string => `${p.file ?? ''}|${p.uuid}|${p.part ?? 0}`

const pinKey = (s: Pick<Pin, 'owner' | 'from'> & PinPlace): string => `${s.owner}|${s.from}|${pinPlaceKey(s)}`

export const isOn = (s: Pin): boolean => s.off === undefined

const lastTouch = (s: Pin): number => Math.max(s.at, s.off ?? -Infinity)

/**
 * Whether a place shows a pin in a list: for `here`, a pin on it made in this list; for
 * `everywhere`, a pin on it made in any list. Only the owner's pins count.
 */
export function isPinned(pins: readonly Pin[] | undefined, owner: AnchorOwner, place: PinPlace, from: PinFrom, scope: PinScope): boolean {
  const at = pinPlaceKey(place)
  return (pins ?? []).some(s => isOn(s) && s.owner === owner && pinPlaceKey(s) === at && (scope === 'everywhere' || s.from === from))
}

/** The places the owner's pins mark in a list, as `pinPlaceKey`s, for drawing a list in one pass. */
export function pinnedPlaces(pins: readonly Pin[] | undefined, owner: AnchorOwner, from: PinFrom, scope: PinScope): Set<string> {
  const out = new Set<string>()
  for (const s of pins ?? []) if (isOn(s) && s.owner === owner && (scope === 'everywhere' || s.from === from)) out.add(pinPlaceKey(s))
  return out
}

/**
 * Turns a pin on or off for a place in a list. On: this list's pin is made, or turned on
 * again. Off: with `here`, this list's pin is turned off; with `everywhere`, every pin the
 * owner has on the place is (it showed as pinned because of any of them). Unchanged when
 * nothing would change.
 */
export function setPin(pins: readonly Pin[] | undefined, owner: AnchorOwner, place: PinPlace, from: PinFrom, on: boolean, scope: PinScope, now: number): { pins: Pin[]; changed: boolean } {
  const list = [...(pins ?? [])]
  const at = pinPlaceKey(place)
  let changed = false
  if (on) {
    const key = pinKey({ owner, from, ...place })
    const i = list.findIndex(s => pinKey(s) === key)
    if (i >= 0 && isOn(list[i]!)) return { pins: list, changed: false }
    const pin: Pin = { uuid: place.uuid, ...(place.file !== undefined ? { file: place.file } : {}), ...(place.part !== undefined ? { part: place.part } : {}), owner, from, at: now }
    // Pinned again: it moves to the end, so the list stays in the order things were pinned.
    if (i >= 0) list.splice(i, 1)
    list.push(pin)
    return { pins: list, changed: true }
  }
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!
    if (!isOn(s) || s.owner !== owner || pinPlaceKey(s) !== at) continue
    if (scope === 'here' && s.from !== from) continue
    list[i] = { ...s, off: now }
    changed = true
  }
  return { pins: list, changed }
}

/** Two copies' pins meeting: one pin per (owner, list, place), the later-touched winning; `a`'s order first. */
export function unionPins(a: readonly Pin[] | undefined, b: readonly Pin[] | undefined): { pins: Pin[]; changed: boolean } {
  const out = [...(a ?? [])]
  const at = new Map(out.map((s, i) => [pinKey(s), i]))
  let changed = false
  for (const s of b ?? []) {
    const i = at.get(pinKey(s))
    if (i === undefined) { at.set(pinKey(s), out.length); out.push(s); changed = true; continue }
    if (lastTouch(s) > lastTouch(out[i]!)) { out[i] = s; changed = true }
  }
  return { pins: out, changed }
}

/** Whether a value read from a file is a pin this build can use; anything else is dropped on read. */
export function isPin(v: unknown): v is Pin {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return typeof s.uuid === 'string' && typeof s.owner === 'string' && typeof s.from === 'string' && typeof s.at === 'number'
    && (s.file === undefined || typeof s.file === 'string') && (s.part === undefined || typeof s.part === 'number')
    && (s.off === undefined || typeof s.off === 'number')
}
