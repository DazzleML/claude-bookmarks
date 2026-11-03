// The state of a membership edge (the registry design's 14:50 and 15:03 addenda; the umbrella
// consultation's final assessment, 2026-11-03__14-47-47): a link in a bundle, a bundle on a list
// item, a link on an item beside its bundle, a folder in a project, and a project related to another.
// Each kind of edge is its own axis -- the axes are a product, never compared with each other -- but
// every axis has this one shape, five ranks with the poles at +-2 (djdarcy, 14:5x: "the +-2
// positions absolutely confers information that's important as it tells us we're in a tentative
// position of separating. The 0th position says that there is no connection at all yet").
//
// A rank is a position; which way a tentative edge is moving is a separate field (`EdgeDir`),
// written when known and otherwise read from the history. Absent reads as grouped, so a file
// written before these states existed needs no change. Pure: imports only the continuum port.
import { Continuum } from './continuum.ts'

/** grouped +2, tentative toward grouped +1, neutral 0 (no connection yet), tentative toward ungrouped -1, ungrouped -2. */
export type EdgeRank = -2 | -1 | 0 | 1 | 2
/** Which way a tentative edge is moving: +1 toward grouped, -1 toward ungrouped. */
export type EdgeDir = -1 | 1

/** The rank names, cold to warm. */
export const EDGE_LEVELS = ['ungrouped', 'tentative-ungrouped', 'neutral', 'tentative-grouped', 'grouped'] as const
export type EdgeLevel = (typeof EDGE_LEVELS)[number]

/** The edge axis: the continuum port with its poles at -2 and +2, its zero the neutral rank. */
export const edgeContinuum = new Continuum({
  name: 'edge',
  subtype: 'full',
  ranks: Object.fromEntries(EDGE_LEVELS.map((l, i) => [l, i - 2])),
  invariant: 'neutral: no connection yet, not known whether grouped or ungrouped',
})

export const isEdgeRank = (v: unknown): v is EdgeRank => v === -2 || v === -1 || v === 0 || v === 1 || v === 2
export const isEdgeDir = (v: unknown): v is EdgeDir => v === 1 || v === -1

/** The rank an edge stands at: absent reads as grouped. */
export const rankOf = (state: EdgeRank | undefined): EdgeRank => state ?? 2

/** The rank's name on the axis. */
export const levelOf = (state: EdgeRank | undefined): EdgeLevel => EDGE_LEVELS[rankOf(state) + 2]!

/**
 * djdarcy's simple case, `{grouped, tentative, ungrouped}`: the two tentative ranks are one, and the
 * neutral rank has no place in it (no connection yet is neither), so it reads undefined.
 */
export function simpleOf(state: EdgeRank | undefined): 'grouped' | 'tentative' | 'ungrouped' | undefined {
  const r = rankOf(state)
  return r === 2 ? 'grouped' : r === -2 ? 'ungrouped' : r === 0 ? undefined : 'tentative'
}

/** Whether a reader that shows members treats the edge as one: grouped only (a tentative edge is shown marked, never counted). */
export const isMember = (state: EdgeRank | undefined): boolean => rankOf(state) === 2
