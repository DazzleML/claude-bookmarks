// Capability paths (issue #18): for each engine API Claude Code is missing, the plugin
// can hold up to three implementations and pick one at run time.
//
//   ideal       written against the API we'd propose upstream; runs as soon as Claude
//               Code (stock, or a patched build implementing the proposal) offers it
//   patched     only for a patched build exposing something that isn't the proposal
//   workaround  what works on stock Claude Code today
//
// Code that uses an API Claude Code already has is written directly and never comes
// through here (djdarcy, 2026-10-05: "we shouldn't need #2 ... nor need #3 ... if #1
// already exists"). Design: the capability-paths DWP, 2026-10-05; the spine built under
// U59 (2026-10-22__21-00-54): a table of the gaps, a chooser over the signals the start
// hook reads once, and the chosen path reported per gap.
//
// A mod can't load code on demand (a module holding `import()` doesn't load), so every
// path is imported up front and the selector only chooses among them.
//
// djdarcy, 2026-10-15: "it's really not 4-states it's checking for 4 properties
// potentially with #2 being more synthesis". So: three implementation slots (ideal,
// patched, workaround), and `current` as the fourth *answer*, reported when a gap has no
// path at all and the plugin's plain behaviour is what runs. A row never registers a
// `current` implementation.

export type PathName = 'ideal' | 'patched' | 'workaround'
export type Chosen = PathName | 'current'

// The order the selector tries paths in when nothing overrides it: the proper API first,
// then a patched build's own route, then the stock workaround.
export const PATH_ORDER: readonly PathName[] = ['ideal', 'patched', 'workaround']

/** The engine APIs the plugin stands in for (docs/engine-quirks.md names each). */
export type Gap = 'history.reach' | 'focus.handoff' | 'focus.leftSite' | 'keys.chord' | 'hover.multiline'

/** What the start hook reads once: the build, and dcc-patcher's markers (`DCC_PATCH_H` is set by its history patch, `DCC_PATCHES` and `DCC_PATCHER` by its launcher). */
export type Signals = { version: string; base?: string; dccPatcher?: string; dccPatchH?: string; dccPatches?: string }
export const NO_SIGNALS: Signals = { version: '0.0.0' }

export type Capability = {
  gap: Gap
  /** The missing API, in a clause. */
  missing: string
  /** The build the proposed API arrived in, when one has; the chooser compares versions. */
  ideal: { since: string } | null
  /** The patch that supplies a route: `H` (the history patch, `DCC_PATCH_H`) or a name listed in `DCC_PATCHES`. */
  patched: { patch: string } | null
  /** What stock Claude Code gets today, in a clause; null when the plain behaviour is all there is. */
  workaround: string | null
  /** The builds the workaround was checked on (djdarcy, 2026-10-15: "did we check if they broke between builds?"). */
  verifiedOn?: readonly string[]
}

export const CAPABILITIES: readonly Capability[] = [
  {
    gap: 'history.reach',
    missing: 'a scroll to a message from before the last compaction after a resume (logicalParentUuid is not followed)',
    ideal: null,
    patched: { patch: 'H' },
    workaround: 'the clipboard phrase, then Ctrl+O, [ and the terminal\'s Find',
    verifiedOn: ['2.1.289', '2.1.308'],
  },
  {
    gap: 'focus.handoff',
    missing: 'a call that returns the keyboard to the input box (abovePrompt:leave from a plugin)',
    ideal: null,
    patched: null,
    workaround: 'the Esc reminder after a band action',
  },
  {
    gap: 'focus.leftSite',
    missing: 'an event when the band loses the keyboard',
    ideal: null,
    patched: null,
    workaround: 'the keyboard probe (watchBand) and the first edit in the input box',
  },
  {
    gap: 'keys.chord',
    missing: 'a plugin-defined keyboard shortcut',
    ideal: null,
    patched: null,
    workaround: 'the leader through abovePrompt:focus and four borrowed engine actions',
  },
  {
    gap: 'hover.multiline',
    missing: 'a hover highlight over every line of a multi-line Button (djdarcy, 2026-10-22)',
    ideal: null,
    patched: null,
    workaround: null,
  },
]

export function capabilityOf(gap: Gap): Capability {
  const row = CAPABILITIES.find(c => c.gap === gap)
  if (!row) throw new Error(`no capability row for ${gap}`)
  return row
}

/** `a.b.c` at or past `x.y.z`, on the three numbers; a suffix (`-dev`, `+dcc`) is ignored. */
export function versionAtLeast(version: string, since: string): boolean {
  const nums = (v: string) => v.split(/[^0-9.]/)[0]!.split('.').map(n => Number(n) || 0)
  const [a, b] = [nums(version), nums(since)]
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return true
}

function patchSignalled(patch: string, s: Signals): string | undefined {
  if (patch === 'H') return s.dccPatchH ? `DCC_PATCH_H=${s.dccPatchH}` : undefined
  const listed = (s.dccPatches ?? '').split(',').map(t => t.trim()).includes(patch)
  return listed ? `DCC_PATCHES names ${patch}` : undefined
}

/** The path that runs for a gap on this build, and why, in PATH_ORDER; `current` when no path applies. */
export function choose(cap: Capability, s: Signals): { path: Chosen; why: string } {
  const build = s.base ?? s.version
  if (cap.ideal && versionAtLeast(build, cap.ideal.since)) return { path: 'ideal', why: `Claude Code ${build} has it (since ${cap.ideal.since})` }
  const signal = cap.patched && patchSignalled(cap.patched.patch, s)
  if (signal) return { path: 'patched', why: signal }
  if (cap.workaround) return { path: 'workaround', why: `stock; ${cap.workaround}` }
  return { path: 'current', why: `no path; ${cap.missing}` }
}

export function chooseAll(s: Signals): { gap: Gap; path: Chosen; why: string }[] {
  return CAPABILITIES.map(c => ({ gap: c.gap, ...choose(c, s) }))
}

/** One line for /bm-env: the chosen path per gap, with its reason. */
export function pathsLine(chosen: readonly { gap: Gap; path: Chosen; why: string }[]): string {
  return `capability paths: ${chosen.map(c => `${c.gap}=${c.path} (${c.why})`).join('; ')}`
}
