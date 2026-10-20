// The tiers as a continuum (unit 6 of the record-format goal; the 2026-10-16 assessments,
// decision C11's lens and the "tier by name" rule). A record's tier is stored by NAME; its
// rank lives here and only here, so a rung can be added or moved without touching a file.
//
// The gate: `Continuum.passes(level, threshold)` is the log model's "at or colder", which is
// the wrong way round for a pane that shows the warmer rungs (a pane gated at `bookmark`
// passed every tier under it: the first consultation, 2026-10-16). A tier gate ADMITS a
// record whose tier is at or warmer than the threshold -- the converse, which is `passes`
// with its arguments swapped.
import { Continuum } from '../kit/continuum.ts'
import type { AnchorTier } from './anchor.ts'

/** Cold to warm: a transient place Claude minted for one reply, a letter's place, a permalink, a named bookmark. */
export const TIERS: readonly AnchorTier[] = ['transient', 'mark', 'perma', 'bookmark']

/** The axis: a plain ordinal (`list`), ranked cold to warm from 0. */
export const tierContinuum = new Continuum({
  name: 'tier',
  subtype: 'list',
  ranks: Object.fromEntries(TIERS.map((t, i) => [t, i])),
})

/** Whether a record of `tier` is shown by a surface gated at `threshold`: at or warmer. */
export function admits(tier: AnchorTier, threshold: AnchorTier): boolean {
  return tierContinuum.passes(threshold, tier)
}

/** The warmer of two tiers (a promotion never cools a record: `addOrRelabel` keeps the warmer). */
export function warmer(a: AnchorTier, b: AnchorTier): AnchorTier {
  return admits(a, b) ? a : b
}
