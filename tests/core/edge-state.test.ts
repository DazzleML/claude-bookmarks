// The membership edge's state (the registry design's 14:50 ruling: five ranks, poles at +-2; djdarcy:
// "The 0th position says that there is no connection at all yet"). The consultant's probe P4 built
// the space with poles at +-1 and found "attaching" warmer than "grouped"; with the poles at +-2 the
// port places every rank where the ruling puts it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EDGE_LEVELS, edgeContinuum, isEdgeDir, isEdgeRank, isMember, levelOf, rankOf, simpleOf } from '../../plugin/hooks/core/kit/edge-state.ts'

test('the edge axis has its poles at -2 and +2 and its zero at neutral, and nothing is warmer than grouped', () => {
  assert.equal(edgeContinuum.warmPole(), 'grouped')
  assert.equal(edgeContinuum.coldPole(), 'ungrouped')
  assert.equal(edgeContinuum.neutral(), 'neutral')
  assert.deepEqual(EDGE_LEVELS.map(l => Number(edgeContinuum.rank(l))), [-2, -1, 0, 1, 2])
  assert.equal(edgeContinuum.isWarmer('grouped', 'tentative-grouped'), true)
  assert.equal(edgeContinuum.isWarmer('tentative-ungrouped', 'ungrouped'), true)
  assert.throws(() => edgeContinuum.step('grouped', 1))
  assert.equal(edgeContinuum.step('neutral', 1), 'tentative-grouped')
})

test('an absent state reads as grouped, so a file written before the states needs no change', () => {
  assert.equal(rankOf(undefined), 2)
  assert.equal(levelOf(undefined), 'grouped')
  assert.equal(isMember(undefined), true)
})

test("djdarcy's simple case: the tentative ranks are one, the neutral rank has no place in it", () => {
  assert.equal(simpleOf(2), 'grouped')
  assert.equal(simpleOf(1), 'tentative')
  assert.equal(simpleOf(-1), 'tentative')
  assert.equal(simpleOf(-2), 'ungrouped')
  assert.equal(simpleOf(0), undefined)
})

test('only a grouped edge counts as a member; a tentative or neutral one is shown, never counted', () => {
  assert.deepEqual(([-2, -1, 0, 1, 2] as const).map(isMember), [false, false, false, false, true])
})

test('a rank is an integer in -2..2 and a direction is 1 or -1', () => {
  for (const ok of [-2, -1, 0, 1, 2]) assert.equal(isEdgeRank(ok), true, String(ok))
  for (const bad of [3, -3, 0.5, '2', undefined]) assert.equal(isEdgeRank(bad), false, String(bad))
  assert.equal(isEdgeDir(1), true)
  assert.equal(isEdgeDir(-1), true)
  assert.equal(isEdgeDir(0), false)
})
