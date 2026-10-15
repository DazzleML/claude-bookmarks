import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  Continuum,
  ContinuumBoundaryError,
  ContinuumError,
  ContinuumSpace,
  Groupable,
  Rational,
  Unified,
  children,
  fold,
  isContinuumProtocol,
  isContinuumSpaceProtocol,
  promote,
  walk,
  type ContinuumProtocol,
  type ContinuumSpaceProtocol,
  type ContinuumSubtype,
} from '../../plugin/hooks/core/kit/continuum.ts'

// Ported from dazzle-lib tests/test_continuum.py (the first ten), then the surface those
// ten do not reach. Expected values for the extra cases were read off the Python module.

const visibility = (): Continuum =>
  new Continuum({
    name: 'visibility',
    ranks: { visible: 0, silenced: -1, hidden: -2, shadowed: -3 },
    invariant: 'canonical_dispatch',
    channels: {
      visible: [],
      silenced: ['hints'],
      hidden: ['hints', 'display'],
      shadowed: ['hints', 'display', 'resolution'],
    },
  })

const space = (): ContinuumSpace =>
  new ContinuumSpace({
    name: 'kit_presence',
    meaning: 'how present a tool is',
    axes: { visibility: visibility() },
    presence: { visibility: { visible: 0, silenced: -1, hidden: -2, shadowed: -3 } },
  })

const activation = (): Continuum => new Continuum({ name: 'activation', ranks: { enabled: 0, disabled: -1 }, subtype: 'monopole' })

// -- the ten Python tests --------------------------------------------------------------------

test('order, poles and neutral', () => {
  const c = visibility()
  assert.deepEqual(c.levels(), ['shadowed', 'hidden', 'silenced', 'visible'])
  assert.equal(c.neutral(), 'visible')
  assert.equal(c.rank('visible'), 0)
  assert.equal(c.coldPole(), 'shadowed')
  assert.equal(c.warmPole(), 'visible')
  assert.equal(c.compare('visible', 'shadowed'), 1)
  assert.ok(c.isWarmer('visible', 'hidden') && c.isColder('shadowed', 'hidden'))
})

test('step and the warm/cold lens duality', () => {
  const c = visibility()
  assert.equal(c.step('hidden', +1), 'silenced')
  assert.equal(c.step('hidden', -1), 'shadowed')
  assert.throws(() => c.step('shadowed', -1), ContinuumBoundaryError)
  assert.equal(c.warm.more('hidden'), 'silenced')
  assert.equal(c.cold.less('hidden'), 'silenced')
})

test('the THAC0 gate and channels', () => {
  const c = visibility()
  assert.equal(c.passes('hidden', 'silenced'), true)
  assert.equal(c.passes('silenced', 'hidden'), false)
  assert.deepEqual(c.channelsAt('hidden'), new Set(['hints', 'display']))
  assert.equal(c.levelForChannels(['display']), 'hidden')
})

test('duplicate ranks are refused', () => {
  assert.throws(() => new Continuum({ name: 'x', ranks: { a: 0, b: 0 } }), ContinuumError)
})

test('a continuum satisfies its protocol', () => {
  const p: ContinuumProtocol = visibility()
  assert.ok(isContinuumProtocol(p))
  assert.equal(isContinuumProtocol({ name: 'x' }), false)
})

test('space presence and spectrum', () => {
  const s = space()
  assert.equal(s.presenceOf('visibility', 'hidden'), -2)
  assert.ok(s.isNeutral('visibility', 'visible'))
  assert.deepEqual(s.spectrum(), [
    ['visibility', 'silenced'],
    ['visibility', 'hidden'],
    ['visibility', 'shadowed'],
  ])
})

test('space navigation', () => {
  const s = space()
  assert.deepEqual(s.colderThan('visibility', 'hidden'), ['visibility', 'shadowed'])
  assert.deepEqual(s.warmerThan('visibility', 'hidden'), ['visibility', 'silenced'])
})

test('space slice and cascade', () => {
  const s = space()
  assert.deepEqual(s.slice('visibility', 'hidden', { lo: -1, hi: 2 }), ['shadowed', 'hidden', 'silenced', 'visible'])
  assert.deepEqual(s.cascadeToNeutral('visibility', 'hidden'), ['hidden', 'silenced'])
  assert.deepEqual(s.cascadeToNeutral('visibility', 'visible'), [])
})

test('the space contract refuses misaligned presence', () => {
  assert.throws(
    () =>
      new ContinuumSpace({
        name: 'bad',
        axes: { v: visibility() },
        presence: { v: { visible: 0, silenced: -1, hidden: -1, shadowed: -3 } },
      }),
    ContinuumError,
  )
})

test('a space satisfies its protocol', () => {
  const p: ContinuumSpaceProtocol = space()
  assert.ok(isContinuumSpaceProtocol(p))
  assert.equal(isContinuumSpaceProtocol(visibility()), false)
})

// -- Rational --------------------------------------------------------------------------------

test('a rational is reduced, with the sign on the numerator', () => {
  const r = new Rational(6, -4)
  assert.equal(r.numerator, -3n)
  assert.equal(r.denominator, 2n)
  assert.equal(String(r), '-3/2')
  assert.equal(String(new Rational(4, 2)), '2')
  assert.throws(() => new Rational(1, 0), RangeError)
})

test('a double converts exactly, as Fraction(float) does', () => {
  assert.ok(Rational.of(1.5).equals(new Rational(3, 2)))
  assert.ok(Rational.of(-0.125).equals(new Rational(-1, 8)))
  assert.equal(String(Rational.of(0.1)), '3602879701896397/36028797018963968')
  assert.throws(() => Rational.of(Number.NaN), RangeError)
})

test('text parses as Python Fraction(str) does', () => {
  const cases: [string, string | undefined][] = [
    ['1.5', '3/2'],
    [' 3/2 ', '3/2'],
    ['1e2', '100'],
    ['-0.5', '-1/2'],
    ['1_000', '1000'],
    ['1 / 2', '1/2'],
    ['.5', '1/2'],
    ['+3', '3'],
    ['abc', undefined],
    ['1/0', undefined],
    ['', undefined],
  ]
  for (const [text, want] of cases) assert.equal(Rational.parse(text)?.toString(), want, text)
})

// -- Continuum beyond the Python ten ---------------------------------------------------------

test('densifyBetween inserts the exact mediant, named or anonymous', () => {
  const c = visibility()
  const d = c.densifyBetween('hidden', 'silenced', 'muted', { channels: ['hints'] })
  assert.ok(new Rational(-3, 2).equals(d.rank('muted') as Rational))
  assert.deepEqual(d.levels(), ['shadowed', 'hidden', 'muted', 'silenced', 'visible'])
  assert.deepEqual(d.channelsAt('muted'), new Set(['hints']))
  assert.equal(c.ranks.has('muted'), false)

  const d2 = d.densifyBetween('muted', 'silenced')
  assert.equal(String(d2.rank('-4/3')), '-4/3')
  assert.deepEqual(d.flatten(), c.flatten())
  assert.deepEqual(c.flatten(), new Groupable({ minus: 'shadowed', plus: 'visible', meaning: 'canonical_dispatch' }))
})

test('a whole-number mediant is stored as a plain number', () => {
  const w = new Continuum({ name: 'w', ranks: { a: 0, b: 2 } }).densifyBetween('a', 'b')
  assert.equal(w.rank('1'), 1)
})

test('densifyBetween refuses an existing name and equal ranks', () => {
  const c = visibility()
  assert.throws(() => c.densifyBetween('hidden', 'silenced', 'visible'), ContinuumError)
  assert.throws(() => c.densifyBetween('hidden', 'hidden'), ContinuumError)
})

test('levelAt addresses by rank; nearest ties go warmer', () => {
  const c = visibility()
  assert.equal(c.levelAt(-2), 'hidden')
  assert.equal(c.levelAt(new Rational(-4, 2)), 'hidden')
  assert.throws(() => c.levelAt(-9), /no rung at rank -9; occupied: \['-1', '-2', '-3', '0'\]/)
  const two = new Continuum({ name: 't', ranks: { lo: -1, hi: 1 } })
  assert.equal(two.levelAt(0, { nearest: true }), 'hi')
  assert.equal(two.levelAt(new Rational(-9, 10), { nearest: true }), 'lo')
})

test('rankName spells a rank', () => {
  assert.equal(Continuum.rankName(1.5), '3/2')
  assert.equal(Continuum.rankName(new Rational(-3, 2)), '-3/2')
  assert.equal(Continuum.rankName(2), '2')
})

test('levelForChannels inverts a channel set; a scalar continuum refuses', () => {
  const c = visibility()
  assert.equal(c.levelForChannels(new Set(['resolution'])), 'shadowed')
  assert.equal(c.levelForChannels(['hints']), 'silenced')
  assert.equal(c.levelForChannels([]), 'visible')
  assert.equal(c.levelForChannels(['nope']), 'visible')
  assert.throws(() => activation().levelForChannels(['x']), ContinuumError)
})

test('subtype validation checks the sign structure', () => {
  assert.throws(() => new Continuum({ name: 'f', ranks: { zero: 0, up: 1 }, subtype: 'full' }), /subtype='full'/)
  assert.throws(() => new Continuum({ name: 'm', ranks: { dn: -1, zero: 0, up: 1 }, subtype: 'monopole' }), /subtype='monopole'/)
  assert.doesNotThrow(() => new Continuum({ name: 'l', ranks: { a: 1, b: 2 }, subtype: 'list' }))
  assert.throws(() => new Continuum({ name: 'u', ranks: { a: 0 }, subtype: 'bogus' as string as ContinuumSubtype }), /unknown subtype/)
  assert.equal(Continuum.fromGroupable(new Groupable({ minus: 'dry', plus: 'wet', meaning: 'water' })).subtype, 'full')
})

test('duplicate ranks are refused across number and Rational, naming the pair', () => {
  assert.throws(() => new Continuum({ name: 'x', ranks: { a: 1, b: new Rational(2, 2) } }), /'a' and 'b' both at 1/)
  assert.throws(() => new Continuum({ name: 'x', ranks: {} }), /has no levels/)
})

test('a numeric name must spell its own rank', () => {
  assert.throws(() => new Continuum({ name: 'n', ranks: { '1': 2 } }), /numeric name '1' contradicts its rank 2/)
  assert.doesNotThrow(() => new Continuum({ name: 'n', ranks: { '0.5': new Rational(1, 2), '-3/2': new Rational(-3, 2) } }))
})

test('step at either pole raises ContinuumBoundaryError, a ContinuumError', () => {
  const c = visibility()
  assert.throws(() => c.step('visible', +1), (e: unknown) => e instanceof ContinuumBoundaryError && e instanceof ContinuumError)
  assert.throws(() => c.warm.more('visible'), ContinuumBoundaryError)
  assert.throws(() => c.cold.more('shadowed'), ContinuumBoundaryError)
  assert.equal(c.step('hidden', 0), 'hidden')
  assert.throws(() => c.step('nope', 1), /'nope' is not a level of continuum 'visibility'/)
})

test('lens poles are the framing poles', () => {
  const c = visibility()
  assert.equal(c.warm.pole(), 'visible')
  assert.equal(c.cold.pole(), 'shadowed')
  assert.equal(c.cold.more('hidden'), c.warm.less('hidden'))
})

test('shiftFrom makes room on the pivot side and echoes the moves', () => {
  // A Map keeps the Python dict's order; an object literal would hoist the integer-like '2'.
  const c = new Continuum({ name: 'm', ranks: new Map([['zero', 0], ['one', 1], ['2', 2], ['neg', -1]]) })
  const [up, remap] = c.shiftFrom(1, 2)
  assert.deepEqual([...up.ranks], [['zero', 0], ['one', 3], ['4', 4], ['neg', -1]])
  assert.deepEqual([...remap].map(([k, [a, b]]) => [k, String(a), String(b)]), [['one', '1', '3'], ['4', '2', '4']])
  const [down] = c.shiftFrom(-1, -3)
  assert.equal(down.rank('neg'), -4)
  assert.equal(down.rank('2'), 2)
})

test('shiftFrom refuses the seat, a zero shift, and crossing the invariant', () => {
  const c = new Continuum({ name: 'm', ranks: { zero: 0, one: 1 } })
  assert.throws(() => c.shiftFrom(0, 1), /invariant seat/)
  assert.throws(() => c.shiftFrom(1, 0), /must be nonzero/)
  assert.throws(() => c.shiftFrom(1, -1), /across the invariant/)
})

test('shiftFrom keeps the upstream overwrite when an anonymous rung re-keys onto a name', () => {
  // Faithful to the Python: '2' moves to rank 1, re-keys to '1', and replaces the rung there.
  const ranks = new Map([['zero', 0], ['1', 1], ['2', 2]])
  const [shifted] = new Continuum({ name: 'm', ranks }).shiftFrom(2, -1)
  assert.deepEqual([...shifted.ranks], [['zero', 0], ['1', 1]])
})

test('renameLevel christens a rung; channels follow', () => {
  const d = visibility().densifyBetween('hidden', 'silenced', undefined, { channels: ['hints'] })
  const named = d.renameLevel('-3/2', 'muted')
  assert.equal(String(named.rank('muted')), '-3/2')
  assert.deepEqual(named.channelsAt('muted'), new Set(['hints']))
  assert.throws(() => named.renameLevel('nope', 'x'), ContinuumError)
  assert.throws(() => named.renameLevel('muted', 'hidden'), /cannot christen/)
})

test('nucleus, poles and fromGroupable bridge the ladder', () => {
  const c = visibility()
  assert.deepEqual(c.nucleus(), new Unified({ label: 'canonical_dispatch', meaning: 'canonical_dispatch' }))
  const g = new Groupable({ minus: 'dry', plus: 'wet', meaning: 'water' })
  const fromG = Continuum.fromGroupable(g)
  assert.equal(fromG.name, 'water')
  assert.deepEqual(fromG.levels(), ['dry', 'wet'])
  assert.deepEqual(fromG.poles(), g)
  assert.equal(Continuum.fromGroupable(new Groupable({ minus: 'a', plus: 'b' })).name, 'a|b')
})

test('a continuum is frozen', () => {
  const c = visibility()
  assert.throws(() => {
    ;(c as unknown as { name: string }).name = 'other'
  }, TypeError)
})

// -- ContinuumSpace beyond the Python ten ----------------------------------------------------

const twoAxes = (): ContinuumSpace<string> =>
  new ContinuumSpace<string>({
    name: 'p',
    axes: { visibility: visibility(), activation: activation() },
    presence: {
      visibility: { visible: 0, silenced: -1, hidden: -2, shadowed: -4 },
      activation: { enabled: 0, disabled: -3 },
    },
    payloads: { activation: { disabled: 'verb:disable' } },
  })

test('navigation crosses axes on the merged scale', () => {
  const s = twoAxes()
  assert.deepEqual(s.spectrum(), [
    ['visibility', 'silenced'],
    ['visibility', 'hidden'],
    ['activation', 'disabled'],
    ['visibility', 'shadowed'],
  ])
  assert.deepEqual(s.colderThan('visibility', 'hidden'), ['activation', 'disabled'])
  assert.deepEqual(s.warmerThan('activation', 'disabled'), ['visibility', 'hidden'])
  assert.equal(s.colderThan('visibility', 'shadowed'), undefined)
  assert.deepEqual(s.warmerThan('activation', 'disabled'), ['visibility', 'hidden'])
  assert.deepEqual(s.warmerThan('visibility', 'silenced'), ['visibility', 'visible'])
})

test('payloadFor returns the opaque payload, or undefined', () => {
  const s = twoAxes()
  assert.equal(s.payloadFor('activation', 'disabled'), 'verb:disable')
  assert.equal(s.payloadFor('visibility', 'hidden'), undefined)
  assert.throws(() => s.payloadFor('activation', 'nope'), ContinuumError)
})

test('the aligned contract refuses each kind of violation', () => {
  const v = visibility()
  const mk = (presence: Record<string, Record<string, number>>, axes: Record<string, Continuum> = { v }) =>
    () => new ContinuumSpace({ name: 'bad', axes, presence })
  assert.throws(mk({ w: { visible: 0, silenced: -1, hidden: -2, shadowed: -3 } }), /must name the same axes/)
  assert.throws(mk({ v: { visible: 0, silenced: -1, hidden: -2 } }), /must cover exactly/)
  assert.throws(mk({ v: { visible: 1, silenced: -1, hidden: -2, shadowed: -3 } }), /presence 0 must align/)
  assert.throws(mk({ v: { visible: 0, silenced: -3, hidden: -2, shadowed: -1 } }), /strictly increasing/)
  assert.throws(mk({ v: { visible: 0, silenced: -1, hidden: -2, shadowed: -3 }, a: { enabled: 0, disabled: -2 } }, { v, a: activation() }), /presence -2 reused/)
  assert.throws(() => new ContinuumSpace({ name: 'empty', axes: {} }), /has no axes/)
  assert.throws(
    () => new ContinuumSpace({ name: 'nested', axes: { s: space() }, presence: { s: {} } }),
    /requires Continuum axes; axis 's' is a ContinuumSpace/,
  )
})

test('compose builds a product; normalForm folds it to dotted leaves', () => {
  const inner = ContinuumSpace.compose('inner', { v: visibility(), a: activation() })
  const outer = ContinuumSpace.compose('outer', { inner, t: new Continuum({ name: 't', ranks: { lo: -1, hi: 1 } }) })
  assert.equal(outer.isAligned, false)
  const nf = outer.normalForm()
  assert.equal(nf.name, 'outer.nf')
  assert.deepEqual([...nf.axes.keys()], ['inner.v', 'inner.a', 't'])
  assert.equal(nf.normalForm(), nf)
  assert.equal(space().normalForm().isAligned, true)
  assert.throws(() => outer.spectrum(), /PRODUCT \(non-aligned\) space; spectrum requires/)
  assert.throws(() => ContinuumSpace.compose('none', {}), /at least one dimension/)
  assert.deepEqual(outer.slice('t', 'lo', { hi: 1 }), ['lo', 'hi'])
  assert.throws(() => outer.slice('inner', 'x'), /is a sub-space, not a Continuum/)
})

test('describe reads like the Python', () => {
  assert.equal(
    space().describe(),
    [
      "ContinuumSpace 'kit_presence' (aligned): how present a tool is",
      "  axis 'visibility': shadowed[-3], hidden[-2], silenced[-1], visible[+0]",
      '  spectrum (warm->cold): visibility:silenced > visibility:hidden > visibility:shadowed',
    ].join('\n'),
  )
  const outer = ContinuumSpace.compose('outer', {
    inner: ContinuumSpace.compose('inner', { v: visibility(), a: activation() }),
    t: new Continuum({ name: 't', ranks: { lo: -1, hi: 1 } }),
  })
  assert.equal(
    outer.describe(),
    [
      "ContinuumSpace 'outer' (product): (no stated meaning)",
      "  dim 'inner': sub-space 'inner' (product)",
      "  dim 't': continuum (lo -> hi)",
      '  leaves (normal form): inner.v, inner.a, t',
    ].join('\n'),
  )
})

test('slice clamps to the axis, keeping the upstream wrap', () => {
  const s = space()
  assert.deepEqual(s.slice('visibility', 'silenced', { lo: -5, hi: 5 }), ['shadowed', 'hidden', 'silenced', 'visible'])
  assert.deepEqual(s.slice('visibility', 'hidden'), ['hidden'])
  // Python's ordered[0:-2]: a window ending before the axis start wraps from the end.
  assert.deepEqual(s.slice('visibility', 'shadowed', { lo: 0, hi: -3 }), ['shadowed', 'hidden'])
})

test('the quadrant view finds the hidden primitive and the tau steps', () => {
  const q = twoAxes().quadrants('visibility', 'activation')
  assert.deepEqual(['Q1', 'Q2', 'Q3', 'Q4'].map(x => q.hiddenAt(x)), ['-', 'activation', '+', 'visibility'])
  assert.deepEqual(q.tauSteps(), ['activation', 'visibility', 'activation', 'visibility'])
  assert.deepEqual(q.quadrants(), [[1, 1], [-1, 1], [-1, -1], [1, -1]])
  assert.deepEqual([q.agreementDiagonal(), q.disagreementDiagonal()], [['Q2', 'Q4'], ['Q1', 'Q3']])
  assert.throws(() => q.hiddenAt('Q5'), /unknown quadrant/)
  assert.throws(() => twoAxes().quadrants('visibility', 'visibility'), /two DISTINCT axes/)
  assert.throws(() => twoAxes().quadrants('visibility', 'nope'), /'nope' is not an axis/)
})

// -- the ladder traversal ----------------------------------------------------------------------

test('walk descends axes and fibers alike; fold reduces bottom-up', () => {
  const inner = ContinuumSpace.compose('inner', { v: visibility(), a: activation() })
  const outer = ContinuumSpace.compose('outer', { inner, t: new Continuum({ name: 't', ranks: { lo: -1, hi: 1 } }) })
  assert.deepEqual([...walk(outer)].map(([k]) => k), [[], ['inner'], ['inner', 'v'], ['inner', 'a'], ['t']])

  const fibered = new Continuum({ name: 'f', ranks: { a: 0 }, fibers: { a: new Unified({ label: 'x' }) } })
  assert.deepEqual([...children(fibered).keys()], ['a'])
  assert.equal(children(new Unified({ label: 'x' })).size, 0)
  const leafCount = fold(
    outer,
    () => 1,
    (_n, kids) => kids.reduce((s, k) => s + k, 0),
  )
  assert.equal(leafCount, 3)
})

test('promote steps one rung up the ladder', () => {
  const g = promote(new Unified({ label: 'wet' }))
  assert.deepEqual(g, new Groupable({ minus: 'not-wet', plus: 'wet', meaning: 'wet' }))
  const c = promote(new Groupable({ minus: 'dry', plus: 'wet', meaning: 'water' }))
  assert.deepEqual([...c.ranks], [['dry', -1], ['wet', 1]])
  const s = promote(c)
  assert.deepEqual([...s.axes.keys()], ['water'])
  assert.equal(promote(s), s)
})

// -- the charter -------------------------------------------------------------------------------

test('the module is pure: it imports nothing', () => {
  const src = readFileSync(new URL('../../plugin/hooks/core/kit/continuum.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /^\s*import\b/m)
  assert.doesNotMatch(src, /\brequire\(|\bimport\(/)
})
