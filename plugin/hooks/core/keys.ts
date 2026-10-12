// The plugin's own key router: one table from a key and a context to an operation.
//
// Every surface the plugin draws (the band's command field, a pane's input, a future
// pane) and every way in (the leader, a slash command) asks this module what a key means
// and gets an operation back; no surface holds keys of its own (djdarcy, 2026-10-11: "we
// simply want to have our OWN router that allows us to even add our OWN UI ... so we can
// truly route inputs however we need from our <leader><key> system"; issue #29). The
// hints the band shows are generated from the same table, so a key cannot be listed
// twice or left unexplained, which is what the band's placeholder `' j m p ␣` beside its
// buttons had become.
//
// Pure: no engine imports. The adapter in register.tsx performs the operation.

export type Pane = 'none' | 'list' | 'mark' | 'jump' | 'bookmarks'

export type Operation =
  | { op: 'open'; pane: 'list' | 'mark' | 'jump' | 'bookmarks' }
  | { op: 'jump-mark'; letter: string }
  | { op: 'reading' }
  | { op: 'promote'; letter: string }
  | { op: 'jumplist'; dir: -1 | 1 }
  | { op: 'digit'; digit: string }
  | { op: 'step'; dir: -1 | 1 }
  | { op: 'go' }
  | { op: 'pin' }
  | { op: 'claim' }
  | { op: 'group'; dir: -1 | 1 }
  | { op: 'filter' }
  | { op: 'close' }
  | { op: 'wait' }
  | { op: 'hint'; reason: string }

// `needsMore`: the operation waits for another key (a letter after `P`, a number in a
// list), so whatever runs after it must leave the keyboard where it is (the after-action
// policy reads this first).
export type Routed = { operation: Operation; needsMore: boolean }

// One command of the band's command line (no pane open): its keys, what follows them,
// and how the hint names it. Order is the order of the hint.
type LineCommand = {
  keys: readonly string[]
  then?: 'letter' | 'mark-letter' | 'number'
  label: string
  route: (next: string | undefined) => Routed
}

const done = (operation: Operation): Routed => ({ operation, needsMore: false })
const waiting = (operation: Operation): Routed => ({ operation, needsMore: true })

export const LINE_COMMANDS: readonly LineCommand[] = [
  {
    keys: ["'", 'j'],
    then: 'letter',
    label: 'jump',
    // Alone it opens the jump pane, whose buttons take the letter (v0.1.7's shape); a
    // letter typed fast enough to arrive with it jumps directly.
    route: next =>
      next === undefined
        ? waiting({ op: 'open', pane: 'jump' })
        : /^[a-z]$/.test(next)
          ? done({ op: 'jump-mark', letter: next })
          : done({ op: 'hint', reason: lineHint() }),
  },
  { keys: ['m'], then: 'letter', label: 'mark', route: () => waiting({ op: 'open', pane: 'mark' }) },
  { keys: [' ', 'r'], label: 'reading', route: () => done({ op: 'reading' }) },
  { keys: ['p'], then: 'number', label: 'prompt', route: () => waiting({ op: 'open', pane: 'list' }) },
  { keys: ['b'], label: 'bookmarks', route: () => waiting({ op: 'open', pane: 'bookmarks' }) },
  {
    keys: ['P'],
    then: 'mark-letter',
    label: 'promote',
    route: next =>
      next === undefined
        ? waiting({ op: 'wait' })
        : /^[a-z`]$/.test(next)
          ? done({ op: 'promote', letter: next })
          : done({ op: 'hint', reason: 'P then a mark letter (a-z) promotes that mark into a bookmark' }),
  },
  { keys: ['o'], label: 'back', route: () => done({ op: 'jumplist', dir: -1 }) },
  { keys: ['i'], label: 'forward', route: () => done({ op: 'jumplist', dir: 1 }) },
]

// What a key shows as in a hint: Space has no glyph of its own.
const keyName = (k: string) => (k === ' ' ? 'Space' : k)

// The command line's hint, generated from the table: every key once, with what follows.
export function lineHint(): string {
  const parts = LINE_COMMANDS.map(c => {
    const keys = c.keys.map(keyName).join(' or ')
    const then = c.then === 'letter' || c.then === 'mark-letter' ? ' + letter' : c.then === 'number' ? ' + number' : ''
    return `${keys}${then} (${c.label})`
  })
  return `bm: ${parts.join('  ')}`
}

// A list pane's keys (the prompts and bookmarks lists), in the order of their hint.
type ListKey = { key: string; label: string; panes: readonly Pane[]; route: () => Routed }
export const LIST_KEYS: readonly ListKey[] = [
  { key: 'j', label: 'next', panes: ['list', 'bookmarks'], route: () => waiting({ op: 'step', dir: 1 }) },
  { key: 'k', label: 'previous', panes: ['list', 'bookmarks'], route: () => waiting({ op: 'step', dir: -1 }) },
  { key: 's', label: 'pin', panes: ['list'], route: () => waiting({ op: 'pin' }) },
  { key: 'h', label: 'previous group', panes: ['bookmarks'], route: () => waiting({ op: 'group', dir: -1 }) },
  { key: 'l', label: 'next group', panes: ['bookmarks'], route: () => waiting({ op: 'group', dir: 1 }) },
  { key: 'c', label: 'claim', panes: ['bookmarks'], route: () => waiting({ op: 'claim' }) },
  { key: '/', label: 'filter', panes: ['list'], route: () => waiting({ op: 'filter' }) },
]

// Route what was typed in a context. `typed` is the whole command line for the band with
// no pane (a command and maybe its argument), or a single key in a list pane.
export function route(typed: string, ctx: { pane: Pane }): Routed {
  if (typed === '') return waiting({ op: 'wait' })
  if (typed === '\u001b' || typed === 'Escape') return done({ op: 'close' })
  if (ctx.pane === 'list' || ctx.pane === 'bookmarks') {
    if (/^[0-9]$/.test(typed)) return waiting({ op: 'digit', digit: typed })
    if (typed === '\r' || typed === 'Enter') return done({ op: 'go' })
    const k = LIST_KEYS.find(l => l.key === typed && l.panes.includes(ctx.pane))
    if (k) return k.route()
    return waiting({ op: 'hint', reason: listHint(ctx.pane) })
  }
  const first = typed[0]!
  const cmd = LINE_COMMANDS.find(c => c.keys.includes(first))
  if (!cmd) return done({ op: 'hint', reason: lineHint() })
  return cmd.route(typed.length > 1 ? typed[1] : undefined)
}

// A list pane's hint, generated from LIST_KEYS for that pane.
// What a number typed into a list means (#33): `3` the prompt, `3.` unfold #3's
// footnotes, `3.1` its first footnote; `0.1` a footnote before the first prompt.
export type ListNumber = { n: number; k?: number; unfold?: true }
export function parseListNumber(typed: string): ListNumber | undefined {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(typed.trim())
  if (!m) return undefined
  const n = Number(m[1])
  if (m[2] === undefined) return { n }
  if (m[2] === '') return { n, unfold: true }
  return { n, k: Number(m[2]) }
}

export function listHint(pane: Pane): string {
  const keys = LIST_KEYS.filter(l => l.panes.includes(pane)).map(l => `${l.key} ${l.label}`)
  return ['number + Enter jump', ...keys, 'Esc close'].join(' · ')
}

// Every key the command line routes, for tests and for a surface that draws one button
// per command.
export function lineKeys(): string[] {
  return LINE_COMMANDS.flatMap(c => [...c.keys])
}

// The band field's placeholder: the first key of every command, in table order, Space
// drawn as ␣. It replaces the hand-typed `' j m p ␣`, which left out b, P, o and i.
export function linePlaceholder(): string {
  return LINE_COMMANDS.map(c => (c.keys[0] === ' ' ? '␣' : c.keys[0])).join(' ')
}
