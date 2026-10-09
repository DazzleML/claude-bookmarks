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
// already exists"). Design: the capability-paths DWP, 2026-10-05.
//
// A mod can't load code on demand (a module holding `import()` doesn't load), so every
// path is imported up front and the selector only chooses among them.

export type PathName = 'ideal' | 'patched' | 'workaround'

// The order the selector tries paths in when nothing overrides it: the proper API first,
// then a patched build's own route, then the stock workaround.
export const PATH_ORDER: readonly PathName[] = ['ideal', 'patched', 'workaround']

// One line for /bm-env: proves this module loaded, and says which order is in force.
export function describePathOrder(): string {
  return `capability paths: ${PATH_ORDER.join(' > ')}`
}
