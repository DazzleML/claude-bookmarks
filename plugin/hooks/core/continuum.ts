// The signed ordered-axis primitive. A Continuum is an axis whose states are totally ordered
// by a SIGNED rank around an invariant-bearing zero: cold pole (-N) ... 0 ... warm pole (+M).
// 0 is not "nothing": it is the canonical no-lean state where the conserved invariant is held;
// leaning toward either pole is a reversible projection away from it, and a pole is the
// criticality edge where the invariant breaks. It is the THAC0 logger model (NOTHING=-4 ...
// DEFAULT=0 ... DEBUG=+3, gate `level <= threshold`) generalized, so one primitive serves the
// visibility ladder, activation, the load/pointer spectrum and log verbosity.
//
// Ported faithfully from dazzle_lib/continuum.py, with the two value types it uses from
// dazzle_lib/groupable.py. PURE BY CHARTER: this module imports nothing (no engine, no node
// built-ins, no other plugin file), so it can be lifted into a shared library unchanged.
// Effectful changes (config, git, filesystem) live in the contexts that CONSUME a Continuum.
//
// Python -> TypeScript, once for the whole file:
// - names are camelCase; keyword arguments become one options object;
// - frozen dataclasses become classes with readonly fields and frozen instances; their maps are
//   copied into ReadonlyMap (insertion order kept, as a Python dict keeps it);
// - frozenset becomes ReadonlySet<string>; None becomes undefined; tuples become readonly arrays;
// - Protocols become interfaces plus an is...Protocol type guard (runtime_checkable isinstance);
// - Fraction becomes Rational below (exact, bigint); integer ranks stay plain numbers.

// ---------------------------------------------------------------------------------------------
// Rational -- the exact fraction the fractional ranks need (Python's fractions.Fraction).
// ---------------------------------------------------------------------------------------------

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) [x, y] = [y, x % y]
  return x
}

const toBigInt = (x: bigint | number): bigint => {
  if (typeof x === 'bigint') return x
  if (!Number.isInteger(x)) throw new RangeError(`Rational parts must be integers, got ${x}`)
  return BigInt(x)
}

// Python 3.12's Fraction string grammar, restricted to ASCII digits.
const RATIONAL_FORMAT =
  /^\s*([-+]?)(?=\d|\.\d)(\d*|\d+(?:_\d+)*)(?:(?:\s*\/\s*(\d+(?:_\d+)*))?|(?:\.(\d*|\d+(?:_\d+)*))?(?:[eE]([-+]?\d+(?:_\d+)*))?)\s*$/

const digits = (s: string): bigint => BigInt(s.replaceAll('_', '') || '0')

/** An exact rational, always reduced, denominator positive. Immutable. */
export class Rational {
  readonly numerator: bigint
  readonly denominator: bigint

  constructor(numerator: bigint | number, denominator: bigint | number = 1n) {
    let n = toBigInt(numerator)
    let d = toBigInt(denominator)
    if (d === 0n) throw new RangeError(`Rational(${n}, 0): zero denominator`)
    if (d < 0n) [n, d] = [-n, -d]
    const g = gcd(n, d)
    this.numerator = n / g
    this.denominator = d / g
    Object.freeze(this)
  }

  /** Exact conversion, as Fraction(x): a finite double is m / 2^k, and doubling it is exact. */
  static of(x: number | bigint | Rational): Rational {
    if (x instanceof Rational) return x
    if (typeof x === 'bigint') return new Rational(x)
    if (!Number.isFinite(x)) throw new RangeError(`cannot convert ${x} to a Rational`)
    let m = x
    let k = 1n
    while (!Number.isInteger(m)) {
      m *= 2
      k *= 2n
    }
    return new Rational(BigInt(m), k)
  }

  /** Fraction(text): "3", "-3/2", " 1.5 ", "1e2", "1_000"; undefined where Python raises. */
  static parse(text: string): Rational | undefined {
    const m = RATIONAL_FORMAT.exec(text)
    if (!m) return undefined
    const [, sign, num, denom, decimal, exp] = m
    let n = digits(num ?? '')
    let d = 1n
    if (denom) {
      d = digits(denom)
      if (d === 0n) return undefined
    } else {
      if (decimal) {
        const frac = decimal.replaceAll('_', '')
        const scale = 10n ** BigInt(frac.length)
        n = n * scale + digits(frac)
        d *= scale
      }
      if (exp) {
        const e = BigInt(exp.replaceAll('_', ''))
        if (e >= 0n) n *= 10n ** e
        else d *= 10n ** -e
      }
    }
    return new Rational(sign === '-' ? -n : n, d)
  }

  add(o: Rational): Rational {
    return new Rational(this.numerator * o.denominator + o.numerator * this.denominator, this.denominator * o.denominator)
  }
  sub(o: Rational): Rational {
    return this.add(o.neg())
  }
  neg(): Rational {
    return new Rational(-this.numerator, this.denominator)
  }
  abs(): Rational {
    return this.numerator < 0n ? this.neg() : this
  }
  cmp(o: Rational): -1 | 0 | 1 {
    const l = this.numerator * o.denominator
    const r = o.numerator * this.denominator
    return l < r ? -1 : l > r ? 1 : 0
  }
  equals(o: Rational): boolean {
    return this.numerator === o.numerator && this.denominator === o.denominator
  }
  sign(): -1 | 0 | 1 {
    return this.numerator < 0n ? -1 : this.numerator > 0n ? 1 : 0
  }
  isInteger(): boolean {
    return this.denominator === 1n
  }
  /** Lossy; for display and arithmetic outside the axis only. */
  toNumber(): number {
    return Number(this.numerator) / Number(this.denominator)
  }
  /** Python's str(Fraction): "2", "-3/2". */
  toString(): string {
    return this.denominator === 1n ? `${this.numerator}` : `${this.numerator}/${this.denominator}`
  }
}

/** A stored rank: a plain number (Python int) or an exact Rational (Python Fraction). */
export type Rank = number | Rational

const exact = (r: Rank): Rational => Rational.of(r)

// Two numbers compare exactly as doubles, so the THAC0 hot path stays a single comparison.
const cmpRank = (a: Rank, b: Rank): -1 | 0 | 1 =>
  typeof a === 'number' && typeof b === 'number' ? (a < b ? -1 : a > b ? 1 : 0) : exact(a).cmp(exact(b))

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

// GAP-5 upstream: a whole-number result stores as a plain integer (a Fraction is a JSON landmine);
// a whole number past 2^53 stays a Rational here, where Python's unbounded int would not.
const settle = (r: Rational): Rank =>
  r.denominator === 1n && r.numerator <= MAX_SAFE && r.numerator >= -MAX_SAFE ? Number(r.numerator) : r

// ---------------------------------------------------------------------------------------------
// The two value types continuum.py uses (from groupable.py): only what this module needs.
// ---------------------------------------------------------------------------------------------

/** The {minus, plus} dual sharing one meaning: the bounds (the two poles) of an axis. */
export class Groupable {
  readonly minus: string
  readonly plus: string
  readonly meaning: string

  constructor(init: { minus: string; plus: string; meaning?: string }) {
    this.minus = init.minus
    this.plus = init.plus
    this.meaning = init.meaning ?? ''
    Object.freeze(this)
  }

  /** From one unified label: the inverse is DERIVED (`not-<label>`), never stored. */
  static unified(label: string, opts: { meaning?: string } = {}): Groupable {
    return new Groupable({ minus: `not-${label}`, plus: label, meaning: opts.meaning || label })
  }
}

/** A single label before the cut, implicitly a Groupable. */
export class Unified {
  readonly label: string
  readonly meaning: string

  constructor(init: { label: string; meaning?: string }) {
    this.label = init.label
    this.meaning = init.meaning ?? ''
    Object.freeze(this)
  }

  /** The implicit cut into {not-label, label}. */
  groupable(): Groupable {
    return Groupable.unified(this.label, { meaning: this.meaning })
  }
}

/** The recursive ladder: a rung's latent value (its fiber) is any ladder element. */
export type RungValue = Unified | Groupable | Continuum | ContinuumSpace

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/** Base for continuum misuse (unknown level, and so on). */
export class ContinuumError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/**
 * A step would move past a pole, the criticality edge. The continuum refuses; the consuming
 * context decides whether a pole-crossing operation (remove, graduate) is permitted.
 */
export class ContinuumBoundaryError extends ContinuumError {}

// ---------------------------------------------------------------------------------------------
// Small helpers: map inputs, and Python-shaped reprs for the error messages.
// ---------------------------------------------------------------------------------------------

/**
 * A map argument: a Map or a plain object, as Python accepts any Mapping. A plain object lists
 * integer-like keys ('1', '2') first, so pass a Map when insertion order must match.
 */
export type MapLike<V> = ReadonlyMap<string, V> | Readonly<Record<string, V>>
/** A channel set argument; a bare string is refused by type (Python would split it into letters). */
export type ChannelSet = ReadonlySet<string> | readonly string[]

const isMap = <V>(m: MapLike<V>): m is ReadonlyMap<string, V> => m instanceof Map
const toMap = <V>(m: MapLike<V>): Map<string, V> => new Map(isMap(m) ? m : Object.entries(m))

const sameKeys = (a: Iterable<string>, b: Iterable<string>): boolean => {
  const x = new Set(a)
  const y = new Set(b)
  return x.size === y.size && [...x].every(k => y.has(k))
}

const repr = (s: string): string =>
  s.includes("'") && !s.includes('"') ? `"${s}"` : `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
const reprList = (xs: readonly string[]): string => `[${xs.map(repr).join(', ')}]`
const reprTuple = (xs: readonly string[]): string =>
  xs.length === 1 ? `(${xs.map(repr).join('')},)` : `(${xs.map(repr).join(', ')})`
const signed = (p: number): string => (p >= 0 ? `+${p}` : `${p}`)
const sortedKeys = (m: ReadonlyMap<string, unknown>): string[] => [...m.keys()].sort()

// ---------------------------------------------------------------------------------------------
// Continuum
// ---------------------------------------------------------------------------------------------

/** The structural contract a continuum satisfies; nothing is forced to subclass. */
export interface ContinuumProtocol {
  name: string
  rank(level: string): Rank
  neutral(): string
  coldPole(): string
  warmPole(): string
  step(level: string, direction: number): string
  passes(level: string, threshold: string): boolean
}

/**
 * The declared subtype: 'full' (both reaches; the invariant seat at 0), 'monopole' (one reach;
 * 0 is the rest state), 'list' (no invariant; a plain ordinal), '' (undeclared, no rules).
 * Validation is sign-structure only; which name is a pole is the consumer's semantics.
 */
export type ContinuumSubtype = '' | 'full' | 'monopole' | 'list'

export type ContinuumInit = {
  name: string
  ranks: MapLike<Rank>
  invariant?: string
  subtype?: ContinuumSubtype
  channels?: MapLike<ChannelSet>
  /** INWARD: a latent RungValue hung over a rung's position (the axes relation, pointed inward). */
  fibers?: MapLike<RungValue>
}

/**
 * A signed, ordered axis with an invariant-bearing zero. The level set and the ordering ARE the
 * rank map (no separate ordered list to drift). `channels` maps a level to the channel set it
 * expresses (empty for a scalar continuum); `invariant` names what is conserved at rank 0.
 */
export class Continuum implements ContinuumProtocol {
  readonly name: string
  readonly ranks: ReadonlyMap<string, Rank>
  readonly invariant: string
  readonly subtype: ContinuumSubtype
  readonly channels: ReadonlyMap<string, ReadonlySet<string>>
  readonly fibers: ReadonlyMap<string, RungValue>

  constructor(init: ContinuumInit) {
    const ranks = toMap(init.ranks)
    this.name = init.name
    if (ranks.size === 0) throw new ContinuumError(`continuum ${repr(this.name)} has no levels`)
    this.ranks = ranks
    this.invariant = init.invariant ?? ''
    this.subtype = init.subtype ?? ''
    this.channels = new Map([...toMap(init.channels ?? {})].map(([k, v]): [string, ReadonlySet<string>] => [k, new Set(v)]))
    this.fibers = toMap(init.fibers ?? {})

    // The order must be a strict total order: 1 and Rational(2, 2) are the same rank.
    const seen = new Map<string, string>()
    for (const [lvl, r] of ranks) {
      const key = exact(r).toString()
      const prior = seen.get(key)
      if (prior !== undefined) {
        throw new ContinuumError(
          `continuum ${repr(this.name)} has duplicate ranks -- the order must be a strict total order ` +
            `(${repr(prior)} and ${repr(lvl)} both at ${r})`,
        )
      }
      seen.set(key, lvl)
    }
    // GAP-3 upstream: a pure-numeric name is a rank SPELLING (the anonymous-rung convention), so
    // it must equal its rank, or the name lies under rank addressing.
    for (const [lvl, r] of ranks) {
      const spelled = Rational.parse(lvl)
      if (spelled && !spelled.equals(exact(r))) {
        throw new ContinuumError(
          `continuum ${repr(this.name)}: numeric name ${repr(lvl)} contradicts its rank ${r} -- ` +
            `pure-numeric names are rank spellings and must match (christen it with a real name instead)`,
        )
      }
    }
    if (this.subtype) {
      const values = [...ranks.values()]
      const hasNeg = values.some(r => cmpRank(r, 0) < 0)
      const hasPos = values.some(r => cmpRank(r, 0) > 0)
      if (this.subtype === 'full') {
        if (!(hasNeg && hasPos)) {
          throw new ContinuumError(
            `continuum ${repr(this.name)} declares subtype='full' but lacks reaches on BOTH sides of the invariant seat (0)`,
          )
        }
      } else if (this.subtype === 'monopole') {
        if (hasNeg && hasPos) {
          throw new ContinuumError(
            `continuum ${repr(this.name)} declares subtype='monopole' but has rungs on BOTH sides of 0 (one reach only)`,
          )
        }
      } else if (this.subtype !== 'list') {
        // Unreachable through the type; kept for callers that cast or come from plain JS.
        throw new ContinuumError(`continuum ${repr(this.name)}: unknown subtype ${repr(this.subtype)} (full|monopole|list|'')`)
      }
    }
    Object.freeze(this)
  }

  /** The Unified this whole axis is about: the invariant, falling back to the name. */
  nucleus(): Unified {
    return new Unified({ label: this.invariant || this.name, meaning: this.invariant })
  }

  /**
   * The NAME at a signed rank: ranks as addresses. Exact by default (a vacant rank raises);
   * `nearest` returns the closest rung, ties going WARMER, for hint surfaces.
   */
  levelAt(rank: number | Rational, opts: { nearest?: boolean } = {}): string {
    const want = Rational.of(rank)
    for (const [lvl, r] of this.ranks) if (exact(r).equals(want)) return lvl
    if (opts.nearest) {
      let best: string | undefined
      let bestDist: Rational | undefined
      let bestRank: Rational | undefined
      for (const [lvl, r] of this.ranks) {
        const er = exact(r)
        const dist = er.sub(want).abs()
        // min over (distance, -rank): the nearer wins; at equal distance the higher rank wins.
        if (bestDist === undefined || bestRank === undefined || dist.cmp(bestDist) < 0 || (dist.equals(bestDist) && er.cmp(bestRank) > 0)) {
          best = lvl
          bestDist = dist
          bestRank = er
        }
      }
      if (best !== undefined) return best
    }
    const occupied = [...this.ranks.values()].map(r => exact(r).toString()).sort()
    throw new ContinuumError(`continuum ${repr(this.name)} has no rung at rank ${rank}; occupied: ${reprList(occupied)}`)
  }

  /** The canonical spelling of a rank: the name an anonymous rung wears until christened. */
  static rankName(rank: number | Rational): string {
    return Rational.of(rank).toString()
  }

  // -- order --------------------------------------------------------------------------------

  /** All levels ordered cold -> warm (ascending signed rank). */
  levels(): readonly string[] {
    return [...this.ranks.entries()].sort(([, a], [, b]) => cmpRank(a, b)).map(([lvl]) => lvl)
  }

  rank(level: string): Rank {
    const r = this.ranks.get(level)
    if (r === undefined) {
      throw new ContinuumError(`${repr(level)} is not a level of continuum ${repr(this.name)}; levels: ${reprTuple(this.levels())}`)
    }
    return r
  }

  /** The rank-0 level, the invariant-bearing center; every well-formed continuum names its 0. */
  neutral(): string {
    for (const [lvl, r] of this.ranks) if (cmpRank(r, 0) === 0) return lvl
    throw new ContinuumError(`continuum ${repr(this.name)} declares no neutral (rank-0) level`)
  }

  /** The minimum-rank level (the cold criticality edge). */
  coldPole(): string {
    return this.#extreme(-1)
  }

  /** The maximum-rank level (the warm criticality edge). */
  warmPole(): string {
    return this.#extreme(1)
  }

  #extreme(want: -1 | 1): string {
    let best: [string, Rank] | undefined
    for (const e of this.ranks) if (best === undefined || cmpRank(e[1], best[1]) === want) best = e
    // The constructor refuses an empty rank map, so best is always set.
    if (best === undefined) throw new ContinuumError(`continuum ${repr(this.name)} has no levels`)
    return best[0]
  }

  /** -1 if a is colder than b, +1 if warmer, 0 if equal. */
  compare(a: string, b: string): -1 | 0 | 1 {
    return cmpRank(this.rank(a), this.rank(b))
  }

  isWarmer(a: string, b: string): boolean {
    return cmpRank(this.rank(a), this.rank(b)) > 0
  }

  isColder(a: string, b: string): boolean {
    return cmpRank(this.rank(a), this.rank(b)) < 0
  }

  // -- stepping: the low-level signed primitive the warm/cold lenses build more/less on --------

  /** One rung toward warm (direction > 0) or cold (< 0); raises ContinuumBoundaryError at a pole. */
  step(level: string, direction: number): string {
    if (direction === 0) return level
    this.rank(level)
    const ordered = this.levels()
    const nxt = ordered.indexOf(level) + (direction > 0 ? 1 : -1)
    const to = ordered[nxt]
    if (to === undefined) {
      const pole = direction > 0 ? 'warm' : 'cold'
      throw new ContinuumBoundaryError(`cannot step ${pole}-ward past the ${pole} pole (${repr(level)}) of continuum ${repr(this.name)}`)
    }
    return to
  }

  // -- directional framings: "more" alone is ambiguous ("more of WHAT?"), so a lens anchors it.
  //    warm (additive) and cold (subtractive) are two complete constructions of one axis, like
  //    RGB and CMYK: warm.more == cold.less. User-facing names stay the domain verbs.

  /** The WARM framing: `.more` steps toward the warm (+) pole, `.less` toward cold. */
  get warm(): ContinuumLens {
    return new ContinuumLens(this, 1, 'warm')
  }

  /** The COLD framing, the dual: `.more` steps toward the cold (-) pole. */
  get cold(): ContinuumLens {
    return new ContinuumLens(this, -1, 'cold')
  }

  // -- the THAC0 threshold predicate ---------------------------------------------------------

  /** The emit gate: a thing at `level` passes a `threshold` cursor when it is at-or-colder. */
  passes(level: string, threshold: string): boolean {
    return cmpRank(this.rank(level), this.rank(threshold)) <= 0
  }

  // -- channel backing -----------------------------------------------------------------------

  /** The channel set a level expresses (suppressed surfaces for visibility; empty when scalar). */
  channelsAt(level: string): ReadonlySet<string> {
    this.rank(level)
    return this.channels.get(level) ?? new Set()
  }

  /**
   * Invert a channel set to its level: the coldest level whose UNIQUELY-introduced channel is
   * present (the highest channel present wins). Derived from the monotone presets, so adding a
   * rung needs no code change; a non-preset edit like {display} gives the level introducing it.
   */
  levelForChannels(present: ChannelSet): string {
    if (this.channels.size === 0) {
      throw new ContinuumError(`continuum ${repr(this.name)} is scalar (no channel backing); levelForChannels does not apply`)
    }
    const have = new Set(present)
    const ordered = this.levels()
    for (const [i, level] of ordered.entries()) {
      const next = ordered[i + 1]
      const warmer = next === undefined ? new Set<string>() : (this.channels.get(next) ?? new Set<string>())
      const mine = this.channels.get(level) ?? new Set<string>()
      for (const ch of mine) if (!warmer.has(ch) && have.has(ch)) return level
    }
    // Nothing introduced is present: the neutral / warmest level.
    return this.warmPole()
  }

  // -- ladder bridges ------------------------------------------------------------------------

  /** The axis's bounds as a Groupable: the cold pole is minus, the warm pole plus. */
  poles(): Groupable {
    return new Groupable({ minus: this.coldPole(), plus: this.warmPole(), meaning: this.invariant || this.name })
  }

  /** Reduction Continuum -> Groupable, named: drop the middles. densify then flatten == flatten. */
  flatten(): Groupable {
    return this.poles()
  }

  /**
   * Insert a rung at the MEDIANT strictly between two rungs: exact, no float drift. Existing
   * rungs are untouched. Unnamed, the new rung self-names as its rank spelling.
   */
  densifyBetween(lower: string, upper: string, newLevel?: string, opts: { channels?: ChannelSet } = {}): Continuum {
    const ra = exact(this.rank(lower))
    const rb = exact(this.rank(upper))
    if (ra.equals(rb)) {
      throw new ContinuumError(`cannot densify between ${repr(lower)} and ${repr(upper)} in ${repr(this.name)}: equal rank ${ra}`)
    }
    if (newLevel !== undefined && this.ranks.has(newLevel)) {
      throw new ContinuumError(`level ${repr(newLevel)} already exists in continuum ${repr(this.name)}`)
    }
    const mediant = new Rational(ra.numerator + rb.numerator, ra.denominator + rb.denominator)
    let name = newLevel
    if (name === undefined) {
      name = Continuum.rankName(mediant)
      if (this.ranks.has(name)) {
        throw new ContinuumError(
          `anonymous rung name ${repr(name)} already exists in continuum ${repr(this.name)} -- christen it or name this one`,
        )
      }
    }
    const ranks = new Map(this.ranks)
    ranks.set(name, settle(mediant))
    const channels = new Map(this.channels)
    if (opts.channels !== undefined) channels.set(name, new Set(opts.channels))
    return new Continuum({ name: this.name, ranks, invariant: this.invariant, subtype: this.subtype, channels, fibers: this.fibers })
  }

  /**
   * Make integer room: every rung on the pivot's side at or beyond `rank` moves by `by`. Names
   * carry identity through; anonymous rungs re-key to their new spelling. Returns the shifted
   * continuum and the echo table, final name -> [oldRank, newRank]. Forbidden: moving the rank-0
   * seat, or any rung changing side -- relocating the invariant is re-basing, never shifting.
   * Faithful to upstream: an anonymous rung that re-keys onto an unaffected rung's name replaces it.
   */
  shiftFrom(rank: number | Rational, by: number): [Continuum, Map<string, [Rational, Rational]>] {
    if (by === 0) throw new ContinuumError("shiftFrom: 'by' must be nonzero")
    const pivot = Rational.of(rank)
    const delta = Rational.of(by)
    if (pivot.sign() === 0) {
      throw new ContinuumError(`shiftFrom: the pivot may not be the invariant seat (0) of continuum ${repr(this.name)}`)
    }
    // GAP-4 upstream: the pivot's sign selects the side, so cold-side room-making never sweeps 0.
    const affected = (fr: Rational): boolean => (pivot.sign() > 0 ? fr.cmp(pivot) >= 0 : fr.cmp(pivot) <= 0)
    const ranks = new Map<string, Rank>()
    const remap = new Map<string, [Rational, Rational]>()
    const renames = new Map<string, string>()
    for (const [lvl, r] of this.ranks) {
      const fr = exact(r)
      if (!affected(fr)) {
        ranks.set(lvl, r)
        continue
      }
      if (fr.sign() === 0) {
        throw new ContinuumError(
          `shiftFrom would move the invariant seat (rank 0, ${repr(lvl)}) of continuum ${repr(this.name)} -- forbidden; re-base at construction instead`,
        )
      }
      const nr = fr.add(delta)
      if (fr.sign() > 0 !== nr.sign() > 0 || nr.sign() === 0) {
        throw new ContinuumError(`shiftFrom would move ${repr(lvl)} across the invariant (${fr} -> ${nr}) in continuum ${repr(this.name)} -- forbidden`)
      }
      let final = lvl
      if (lvl === Continuum.rankName(fr)) {
        final = Continuum.rankName(nr) // anonymous: re-key (the MOVE)
        renames.set(lvl, final)
      }
      ranks.set(final, settle(nr))
      remap.set(final, [fr, nr])
    }
    const rekey = <V>(m: ReadonlyMap<string, V>): Map<string, V> => new Map([...m].map(([k, v]): [string, V] => [renames.get(k) ?? k, v]))
    const shifted = new Continuum({
      name: this.name,
      ranks,
      invariant: this.invariant,
      subtype: this.subtype,
      channels: rekey(this.channels),
      fibers: rekey(this.fibers),
    })
    return [shifted, remap]
  }

  /** Christening: give a rung (typically an anonymous one) its real name; rank, channels and fibers move with it. */
  renameLevel(old: string, next: string): Continuum {
    if (!this.ranks.has(old)) throw new ContinuumError(`${repr(old)} is not a level of continuum ${repr(this.name)}`)
    if (this.ranks.has(next)) {
      throw new ContinuumError(`cannot christen ${repr(old)} as ${repr(next)}: the name already exists in continuum ${repr(this.name)}`)
    }
    const rekey = <V>(m: ReadonlyMap<string, V>): Map<string, V> => new Map([...m].map(([k, v]): [string, V] => [k === old ? next : k, v]))
    return new Continuum({
      name: this.name,
      ranks: rekey(this.ranks),
      invariant: this.invariant,
      subtype: this.subtype,
      channels: rekey(this.channels),
      fibers: rekey(this.fibers),
    })
  }

  /**
   * A Groupable's implicit continuum: the 2-rung axis {minus: -1, plus: +1} whose poles are its
   * bounds. Lives here, not on Groupable, to keep the layering acyclic.
   */
  static fromGroupable(groupable: Groupable, opts: { name?: string } = {}): Continuum {
    return new Continuum({
      name: opts.name || groupable.meaning || `${groupable.minus}|${groupable.plus}`,
      ranks: new Map<string, Rank>([
        [groupable.minus, -1],
        [groupable.plus, 1],
      ]),
      invariant: groupable.meaning,
      subtype: 'full', // provably: one rung each side of the seat
    })
  }
}

/**
 * One directional framing of a Continuum. Obtained via `continuum.warm` / `continuum.cold`;
 * exported for typing (Python's `_ContinuumLens` is module-private), not for construction.
 */
export class ContinuumLens {
  readonly continuum: Continuum
  /** +1 = warm framing, -1 = cold framing. */
  readonly sign: 1 | -1
  readonly name: 'warm' | 'cold'

  constructor(continuum: Continuum, sign: 1 | -1, name: 'warm' | 'cold') {
    this.continuum = continuum
    this.sign = sign
    this.name = name
    Object.freeze(this)
  }

  /** One rung MORE toward this framing's pole (raises at the pole). */
  more(level: string): string {
    return this.continuum.step(level, this.sign)
  }

  /** One rung LESS: away from this framing's pole, toward its complement. */
  less(level: string): string {
    return this.continuum.step(level, -this.sign)
  }

  /** This framing's pole: the warm pole for warm, the cold pole for cold. */
  pole(): string {
    return this.sign > 0 ? this.continuum.warmPole() : this.continuum.coldPole()
  }
}

// ---------------------------------------------------------------------------------------------
// ContinuumSpace -- N parallel Continuums composed on a shared PRESENCE scale.
// ---------------------------------------------------------------------------------------------
// Each (axis, level) projects onto one signed presence scale -- how much of the axis's quality
// is expressed (water for wet/dry, listing for visible/hidden, dispatch for enabled/disabled) --
// so orthogonal mechanisms become comparable and a strict merged order (the spectrum) emerges.
// Membership is structural: an axis joins by declaring its presence coordinates, verified at
// construction. Pure: the effectful group/ungroup execution lives in the consuming contexts.

/** The structural contract a continuum space satisfies; nothing is forced to subclass. */
export interface ContinuumSpaceProtocol {
  name: string
  meaning: string
  axes: ReadonlyMap<string, Continuum | ContinuumSpace>
  presenceOf(axis: string, level: string): number
  payloadFor(axis: string, level: string): unknown
  spectrum(): readonly (readonly [string, string])[]
  colderThan(axis: string, level: string): readonly [string, string] | undefined
  warmerThan(axis: string, level: string): readonly [string, string] | undefined
}

export type ContinuumSpaceInit<P = unknown> = {
  name: string
  /** A dimension is a Continuum (a leaf axis) or a ContinuumSpace (a sub-space): the closed recursion. */
  axes: MapLike<Continuum | ContinuumSpace>
  /** Given: an ALIGNED space with a merged spectrum. Absent: a PRODUCT space, no cross-axis navigation. */
  presence?: MapLike<MapLike<number>>
  meaning?: string
  invariant?: string
  /** An opaque typed object per (axis, level); the space holds and exposes it, never calls it. */
  payloads?: MapLike<MapLike<P>>
}

/**
 * A composition of N parallel axes on a shared presence scale. `presence` maps each axis's level
 * to a signed coordinate: 0 is the axis's neutral (the space-level zero every default collapses
 * onto), < 0 less present (cold), > 0 more present (warm). Contract, verified at construction:
 * axes and presence name the same axes; each presence map covers exactly its continuum's levels;
 * presence is strictly increasing cold -> warm with the neutral, and only it, at 0; every
 * non-zero coordinate is unique across the space. `P` types the payloads (Python: Any).
 */
export class ContinuumSpace<P = unknown> implements ContinuumSpaceProtocol {
  readonly name: string
  readonly axes: ReadonlyMap<string, Continuum | ContinuumSpace>
  readonly presence: ReadonlyMap<string, ReadonlyMap<string, number>> | undefined
  readonly meaning: string
  readonly invariant: string
  readonly payloads: ReadonlyMap<string, ReadonlyMap<string, P>>

  constructor(init: ContinuumSpaceInit<P>) {
    this.name = init.name
    const axes = toMap(init.axes)
    if (axes.size === 0) throw new ContinuumError(`continuum space ${repr(this.name)} has no axes`)
    this.axes = axes
    this.meaning = init.meaning ?? ''
    this.invariant = init.invariant ?? ''
    this.payloads = new Map([...toMap(init.payloads ?? {})].map(([a, m]): [string, ReadonlyMap<string, P>] => [a, toMap(m)]))
    if (init.presence === undefined) {
      // PRODUCT space: independent dimensions, no merged spectrum to validate.
      this.presence = undefined
      Object.freeze(this)
      return
    }
    // ALIGNED space: leaf-only, since a sub-space has its own internal spectrum.
    const presence = new Map([...toMap(init.presence)].map(([a, m]): [string, ReadonlyMap<string, number>] => [a, toMap(m)]))
    this.presence = presence
    const leaves = new Map<string, Continuum>()
    for (const [aname, ax] of axes) {
      if (!(ax instanceof Continuum)) {
        throw new ContinuumError(
          `space ${repr(this.name)}: an ALIGNED space (presence given) requires Continuum axes; axis ${repr(aname)} is a ` +
            `${ax.constructor.name}. Use ContinuumSpace.compose(...) to build a product space.`,
        )
      }
      leaves.set(aname, ax)
    }
    if (!sameKeys(axes.keys(), presence.keys())) {
      throw new ContinuumError(
        `continuum space ${repr(this.name)}: axes ${reprList(sortedKeys(axes))} and presence keys ${reprList(sortedKeys(presence))} must name the same axes`,
      )
    }
    const seenCoords = new Map<number, [string, string]>()
    for (const [aname, cont] of leaves) {
      const pmap = presence.get(aname) ?? new Map<string, number>()
      if (!sameKeys(pmap.keys(), cont.ranks.keys())) {
        throw new ContinuumError(
          `space ${repr(this.name)} axis ${repr(aname)}: presence levels ${reprList(sortedKeys(pmap))} must cover exactly the continuum's levels ${reprList(sortedKeys(cont.ranks))}`,
        )
      }
      for (const [lvl, p] of pmap) {
        if ((cmpRank(cont.rank(lvl), 0) === 0) !== (p === 0)) {
          throw new ContinuumError(
            `space ${repr(this.name)} axis ${repr(aname)} level ${repr(lvl)}: presence 0 must align with the neutral (rank-0) level (<0 = suppressed, >0 = amplified)`,
          )
        }
      }
      const ordered = cont.levels()
      const ps = ordered.map(lvl => pmap.get(lvl) ?? Number.NaN)
      if (ps.some((p, i) => i + 1 < ps.length && !(p < (ps[i + 1] ?? Number.NaN)))) {
        const got = ordered.map((lvl, i) => `(${repr(lvl)}, ${ps[i]})`).join(', ')
        throw new ContinuumError(`space ${repr(this.name)} axis ${repr(aname)}: presence must be strictly increasing cold->warm (presence-aligned); got [${got}]`)
      }
      // Non-zero coordinates are globally unique; the neutrals share 0, the space-level zero.
      for (const [lvl, p] of pmap) {
        if (p === 0) continue
        const other = seenCoords.get(p)
        if (other !== undefined) {
          throw new ContinuumError(
            `space ${repr(this.name)}: presence ${p} reused by (${other[0]},${other[1]}) and (${aname},${lvl}) -- non-zero coordinates must be unique across the space`,
          )
        }
        seenCoords.set(p, [aname, lvl])
      }
    }
    Object.freeze(this)
  }

  /** The space's nucleus: the same question every ladder element answers. */
  nucleus(): Unified {
    return new Unified({ label: this.name, meaning: this.meaning })
  }

  // -- composition: compose is closed (a product of products is a product) and normalForm
  //    folds nesting back to a flat leaf product, so no further level type is ever needed.

  /** True when the space carries a merged presence spectrum (cross-axis navigation defined). */
  get isAligned(): boolean {
    return this.presence !== undefined
  }

  /**
   * Compose N dimensions into one PRODUCT space: the closure. Cross-dimension comparison is
   * undefined by design; build an aligned sub-space for a comparable spectrum.
   */
  static compose(name: string, members: MapLike<Continuum | ContinuumSpace>, opts: { meaning?: string; invariant?: string } = {}): ContinuumSpace {
    if (toMap(members).size === 0) throw new ContinuumError(`compose(${repr(name)}): at least one dimension required`)
    return new ContinuumSpace({ name, axes: members, meaning: opts.meaning ?? '', invariant: opts.invariant ?? '' })
  }

  /** Every leaf Continuum by qualified (dotted) name: a sub-space prefixes its leaves (`lower.add`). */
  leaves(): ReadonlyMap<string, Continuum> {
    const out = new Map<string, Continuum>()
    const walkAxes = (prefix: string, sp: ContinuumSpace): void => {
      for (const [k, ax] of sp.axes) {
        const qn = `${prefix}${k}`
        if (ax instanceof ContinuumSpace) walkAxes(`${qn}.`, ax)
        else out.set(qn, ax)
      }
    }
    walkAxes('', this)
    return out
  }

  /** The fold: flatten nesting to the flat product over leaves. An already-flat space is returned as is. */
  normalForm(): ContinuumSpace<P> {
    const leafMap = this.leaves()
    const alreadyFlat = sameKeys(leafMap.keys(), this.axes.keys()) && [...this.axes.values()].every(a => a instanceof Continuum)
    if (alreadyFlat) return this
    return new ContinuumSpace<P>({ name: `${this.name}.nf`, axes: leafMap, meaning: this.meaning, invariant: this.invariant })
  }

  #requireAligned(op: string): ReadonlyMap<string, ReadonlyMap<string, number>> {
    if (this.presence === undefined) {
      throw new ContinuumError(
        `space ${repr(this.name)} is a PRODUCT (non-aligned) space; ${op} requires an aligned (sub-)space with a merged ` +
          `presence spectrum (build one with presence, or navigate a specific aligned sub-space)`,
      )
    }
    return this.presence
  }

  // -- axis access -----------------------------------------------------------------------------

  /** The dimension named `name`: a Continuum, or a sub-space in a product space. */
  axis(name: string): Continuum | ContinuumSpace {
    const ax = this.axes.get(name)
    if (ax === undefined) throw new ContinuumError(`${repr(name)} is not an axis of space ${repr(this.name)}; axes: ${reprTuple([...this.axes.keys()])}`)
    return ax
  }

  // Level operations need a leaf axis. Python would raise AttributeError on a sub-space; this
  // raises ContinuumError instead.
  #leaf(name: string): Continuum {
    const ax = this.axis(name)
    if (!(ax instanceof Continuum)) {
      throw new ContinuumError(`axis ${repr(name)} of space ${repr(this.name)} is a sub-space, not a Continuum; address its levels through the sub-space`)
    }
    return ax
  }

  /** The caller-supplied payload at (axis, level), or undefined when none was given. */
  payloadFor(axis: string, level: string): P | undefined {
    this.#leaf(axis).rank(level)
    return this.payloads.get(axis)?.get(level)
  }

  /** The shared-scale presence coordinate of (axis, level). */
  presenceOf(axis: string, level: string): number {
    const presence = this.#requireAligned('presenceOf')
    this.#leaf(axis).rank(level)
    const p = presence.get(axis)?.get(level)
    // Construction proved every (axis, level) has a coordinate.
    if (p === undefined) throw new ContinuumError(`space ${repr(this.name)} has no presence for (${axis},${level})`)
    return p
  }

  /** True when (axis, level) sits at presence 0. */
  isNeutral(axis: string, level: string): boolean {
    return this.presenceOf(axis, level) === 0
  }

  // -- the merged presence spectrum and navigation ---------------------------------------------

  #coords(op: string): [string, string, number][] {
    const presence = this.#requireAligned(op)
    return [...presence].flatMap(([a, m]) => [...m].map(([lvl, p]): [string, string, number] => [a, lvl, p]))
  }

  /** Every NON-neutral state, warm -> cold: the navigable merged ladder (the shared 0 is implicit). */
  spectrum(): readonly (readonly [string, string])[] {
    return this.#coords('spectrum')
      .filter(([, , p]) => p !== 0)
      .sort((x, y) => y[2] - x[2])
      .map(([a, lvl]): readonly [string, string] => [a, lvl])
  }

  /**
   * The next COLDER coordinate on the merged scale, or undefined at the cold pole. Crosses axes at
   * adjacent presence; landing on the shared zero returns THIS axis's neutral. Framing-neutral:
   * a surface labels it stronger or weaker by its own figure pole.
   */
  colderThan(axis: string, level: string): readonly [string, string] | undefined {
    const all = this.#coords('colderThan')
    const cur = this.presenceOf(axis, level)
    return this.#hop(axis, all.filter(([, , p]) => p < cur), (a, b) => Math.max(a, b))
  }

  /** The next WARMER coordinate on the merged scale, or undefined at the warm pole. */
  warmerThan(axis: string, level: string): readonly [string, string] | undefined {
    const all = this.#coords('warmerThan')
    const cur = this.presenceOf(axis, level)
    return this.#hop(axis, all.filter(([, , p]) => p > cur), (a, b) => Math.min(a, b))
  }

  #hop(axis: string, side: [string, string, number][], closest: (a: number, b: number) => number): readonly [string, string] | undefined {
    if (side.length === 0) return undefined
    const target = side.map(([, , p]) => p).reduce(closest)
    if (target === 0) return [axis, this.#leaf(axis).neutral()] // the shared zero -> own default
    const hit = side.find(([, , p]) => p === target)
    return hit === undefined ? undefined : [hit[0], hit[1]]
  }

  // -- slicing: the --cascade apply-mode walks a signed RANGE of rungs --------------------------

  /**
   * The ordered levels of `axis` in a signed rung-step window around `level`, from `lo` steps
   * (negative = colder) to `hi` steps (positive = warmer), inclusive, clamped to the axis. A
   * surface turns ON each rung in the slice (additive). Faithful to upstream, including the
   * negative-index wrap when the window ends before the axis starts.
   */
  slice(axis: string, level: string, opts: { lo?: number; hi?: number } = {}): readonly string[] {
    const cont = this.#leaf(axis)
    cont.rank(level)
    const ordered = cont.levels()
    const i = ordered.indexOf(level)
    const loI = Math.max(0, i + (opts.lo ?? 0))
    const hiI = Math.min(ordered.length - 1, i + (opts.hi ?? 0))
    return ordered.slice(loI, hiI + 1)
  }

  /**
   * The bare --cascade default: `level` and every rung between it and the neutral, excluding the
   * neutral itself (the no-op 'off' state). Direction falls out of the level's presence sign.
   */
  cascadeToNeutral(axis: string, level: string): readonly string[] {
    this.#requireAligned('cascadeToNeutral')
    const p = this.presenceOf(axis, level)
    if (p === 0) return []
    return this.#leaf(axis)
      .levels()
      .filter(lvl => {
        const q = this.presenceOf(axis, lvl)
        return (p < 0 && p <= q && q < 0) || (p > 0 && 0 < q && q <= p)
      })
  }

  // -- interrogation ---------------------------------------------------------------------------

  /** What this space means, its axes with their coordinates, and the merged spectrum. */
  describe(): string {
    const kind = this.isAligned ? 'aligned' : 'product'
    const lines = [`ContinuumSpace ${repr(this.name)} (${kind}): ${this.meaning || '(no stated meaning)'}`]
    if (this.invariant) lines.push(`  conserved at 0: ${this.invariant}`)
    if (this.isAligned) {
      for (const aname of this.axes.keys()) {
        const rungs = this.#leaf(aname)
          .levels()
          .map(lvl => `${lvl}[${signed(this.presenceOf(aname, lvl))}]`)
          .join(', ')
        lines.push(`  axis ${repr(aname)}: ${rungs}`)
      }
      const spec = this.spectrum()
        .map(([a, lvl]) => `${a}:${lvl}`)
        .join(' > ')
      lines.push(`  spectrum (warm->cold): ${spec || '(none)'}`)
    } else {
      for (const [aname, ax] of this.axes) {
        if (ax instanceof ContinuumSpace) lines.push(`  dim ${repr(aname)}: sub-space ${repr(ax.name)} (${ax.isAligned ? 'aligned' : 'product'})`)
        else lines.push(`  dim ${repr(aname)}: continuum (${ax.levels().join(' -> ')})`)
      }
      lines.push(`  leaves (normal form): ${[...this.leaves().keys()].join(', ')}`)
    }
    return lines.join('\n')
  }

  // -- the pairwise view: the 4-quadrant wheel is a 2-axis PROJECTION, never a structural limit.

  /** A QuadrantView over two distinct axes; axis1 plays the first channel, axis2 the second. */
  quadrants(axis1: string, axis2: string): QuadrantView {
    for (const a of [axis1, axis2]) {
      if (!this.axes.has(a)) throw new ContinuumError(`${repr(a)} is not an axis of space ${repr(this.name)}; axes: ${reprTuple([...this.axes.keys()])}`)
    }
    if (axis1 === axis2) throw new ContinuumError(`quadrants needs two DISTINCT axes (got ${repr(axis1)} twice)`)
    return new QuadrantView(this, axis1, axis2)
  }
}

// ---------------------------------------------------------------------------------------------
// QuadrantView -- the SH four-phase wheel as a pairwise view over two axes. Two channels cross
// into four sign-quadrants; each of the four primitives (the two polarity signs and the two
// channel names) cycles through {begin, peak, end, hidden}, and "the primitive absent from a
// quadrant's formula sits at its hidden phase" is the checkable criticality predicate. Derived,
// never stored.
// ---------------------------------------------------------------------------------------------

const QS = ['Q1', 'Q2', 'Q3', 'Q4'] as const
const PHASES = ['begin', 'peak', 'end', 'hidden'] as const
type Quadrant = (typeof QS)[number]
type Phase = (typeof PHASES)[number]
type Orbit = readonly [Phase, Phase, Phase, Phase]

// (first-sign, second-sign) and the same/diff signature per quadrant. Q2 = full collapse
// (both same); Q4 = full differentiation.
const QUADRANT_SIG: Readonly<Record<Quadrant, { sign: readonly [number, number]; first: 'same' | 'diff'; second: 'same' | 'diff' }>> = {
  Q1: { sign: [1, 1], first: 'same', second: 'diff' },
  Q2: { sign: [-1, 1], first: 'same', second: 'same' },
  Q3: { sign: [-1, -1], first: 'diff', second: 'same' },
  Q4: { sign: [1, -1], first: 'diff', second: 'diff' },
}
// The phase orbit per primitive, indexed Q1..Q4; the channel roles slot to the chosen axes.
const POLARITY_PHASES: Readonly<Record<'+' | '-', Orbit>> = {
  '+': ['peak', 'end', 'hidden', 'begin'],
  '-': ['hidden', 'begin', 'peak', 'end'],
}
const CHANNEL_PHASES: Readonly<Record<'first' | 'second', Orbit>> = {
  first: ['begin', 'peak', 'end', 'hidden'],
  second: ['end', 'hidden', 'begin', 'peak'],
}

const isQuadrant = (q: string): q is Quadrant => (QS as readonly string[]).includes(q)

/** The SH 4-quadrant wheel over two axes of a space: axis1 the first (meaning) channel, axis2 the second (position). */
export class QuadrantView {
  readonly space: ContinuumSpace
  readonly axis1: string
  readonly axis2: string

  constructor(space: ContinuumSpace, axis1: string, axis2: string) {
    this.space = space
    this.axis1 = axis1
    this.axis2 = axis2
    Object.freeze(this)
  }

  /** The four sign-quadrants (first-sign, second-sign): Q1(+,+) .. Q4(+,-). */
  quadrants(): readonly (readonly [number, number])[] {
    return QS.map(q => QUADRANT_SIG[q].sign)
  }

  #phaseMap(): Map<string, Orbit> {
    // A Map, like the Python dict: an axis named '+' or '-' overwrites in place.
    return new Map<string, Orbit>([
      ['+', POLARITY_PHASES['+']],
      ['-', POLARITY_PHASES['-']],
      [this.axis1, CHANNEL_PHASES.first],
      [this.axis2, CHANNEL_PHASES.second],
    ])
  }

  /** The primitive ABSENT at `quadrant`, the one at its hidden phase: '+', '-', axis1 or axis2. */
  hiddenAt(quadrant: string): string {
    if (!isQuadrant(quadrant)) throw new ContinuumError(`unknown quadrant ${repr(quadrant)}; one of ${reprTuple(QS)}`)
    const i = QS.indexOf(quadrant)
    for (const [prim, phases] of this.#phaseMap()) if (phases[i] === 'hidden') return prim
    throw new ContinuumError(`no hidden primitive at ${repr(quadrant)}`) // unreachable
  }

  /** {Q2, Q4}: both channels at the same resolution. */
  agreementDiagonal(): readonly [string, string] {
    return ['Q2', 'Q4']
  }

  /** {Q1, Q3}: one channel resolved, the other not. */
  disagreementDiagonal(): readonly [string, string] {
    return ['Q1', 'Q3']
  }

  /** The single channel flipped at each boundary Q1->Q2->Q3->Q4->Q1, alternating. */
  tauSteps(): readonly string[] {
    return QS.map((q, i) => {
      const a = QUADRANT_SIG[q]
      const b = QUADRANT_SIG[QS[(i + 1) % 4] ?? 'Q1']
      return a.first !== b.first ? this.axis1 : this.axis2
    })
  }
}

// ---------------------------------------------------------------------------------------------
// children / walk / fold / promote -- the ONE recursive traversal, direction-agnostic: a space's
// children are its axes (outward), a continuum's are its fibers (inward), Groupable and Unified
// are leaves. walk does not know which way it is going.
// ---------------------------------------------------------------------------------------------

/** The ladder-children of `node`, total over the four ladder types. */
export function children(node: RungValue): ReadonlyMap<string, RungValue> {
  if (node instanceof ContinuumSpace) return new Map(node.axes)
  if (node instanceof Continuum) return new Map(node.fibers)
  return new Map() // Groupable, Unified: leaves
}

/** Pre-order over `node` and every descendant, yielding [keyPath, node]. */
export function* walk(node: RungValue, key: readonly string[] = []): Generator<[readonly string[], RungValue]> {
  yield [key, node]
  for (const [name, child] of children(node)) yield* walk(child, [...key, name])
}

/** Bottom-up reduce: leaf(node) at a childless node, combine(node, folded children) otherwise. */
export function fold<T>(node: RungValue, leaf: (n: RungValue) => T, combine: (n: RungValue, kids: T[]) => T): T {
  const kids = children(node)
  if (kids.size === 0) return leaf(node)
  return combine(
    node,
    [...kids.values()].map(c => fold(c, leaf, combine)),
  )
}

/**
 * One rung UP the value ladder: Unified -> Groupable -> Continuum -> ContinuumSpace (a 1-axis
 * product). Promotion adds structure, so reduce . promote == id while promote . reduce is lossy.
 * A ContinuumSpace is the top of the auto-steppable ladder and comes back unchanged.
 */
export function promote(value: Unified): Groupable
export function promote(value: Groupable): Continuum
export function promote(value: Continuum): ContinuumSpace
export function promote<P>(value: ContinuumSpace<P>): ContinuumSpace<P>
export function promote(value: RungValue): RungValue
export function promote(value: RungValue): RungValue {
  if (value instanceof Unified) return value.groupable()
  if (value instanceof Groupable) return Continuum.fromGroupable(value)
  if (value instanceof Continuum) return ContinuumSpace.compose(value.name, new Map([[value.name, value]]))
  return value
}

// ---------------------------------------------------------------------------------------------
// Protocol guards (Python's runtime_checkable isinstance: members present, methods callable).
// ---------------------------------------------------------------------------------------------

const hasMembers = (x: unknown, data: readonly string[], methods: readonly string[]): boolean => {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return data.every(k => k in o) && methods.every(k => typeof o[k] === 'function')
}

export const isContinuumProtocol = (x: unknown): x is ContinuumProtocol =>
  hasMembers(x, ['name'], ['rank', 'neutral', 'coldPole', 'warmPole', 'step', 'passes'])

export const isContinuumSpaceProtocol = (x: unknown): x is ContinuumSpaceProtocol =>
  hasMembers(x, ['name', 'meaning', 'axes'], ['presenceOf', 'payloadFor', 'spectrum', 'colderThan', 'warmerThan'])
