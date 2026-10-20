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
  | { op: 'close' }
  | { op: 'help' }
  | { op: 'wait' }
  | { op: 'hint'; reason: string }
  // Typed in a list pane's own field only (`field` keys below): the filter's prefix (#28).
  | { op: 'filter' }

// `needsMore`: the operation waits for another key (a letter after `P`, a number in a
// list), so whatever runs after it must leave the keyboard where it is (the after-action
// policy reads this first).
export type Routed = { operation: Operation; needsMore: boolean }

// One command of the band's command line (no pane open): its keys, what follows them,
// how the hint and the help name it, and how the band's bar shows it. Order is the order
// of the hint, the help and the bar.
//
// The bar shows a few labelled commands and `?`; `?` shows the rest (djdarcy,
// 2026-10-12: "We should probably just have a "?" and if the user types that we can then
// show them a help message ... for the shortcuts that aren't already on the bar").
// `chord`: the command has a borrowed engine action a keybinding can press (the four
// "optional fast keys"), carried only while the chords setting is on (djdarcy, 01:30:
// kept, optional, "an easy enable/disable so their removal can be tested").
export type Chord = 'mark' | 'jump' | 'prompts' | 'read'
export type LineCommand = {
  id: string
  keys: readonly string[]
  then?: 'letter' | 'mark-letter' | 'number'
  label: string
  // The bar's button text: one word.
  button: string
  shown: boolean
  chord?: Chord
  // One line for the help: what the command does.
  help: string
  route: (next: string | undefined) => Routed
}

const done = (operation: Operation): Routed => ({ operation, needsMore: false })
const waiting = (operation: Operation): Routed => ({ operation, needsMore: true })

export const LINE_COMMANDS: readonly LineCommand[] = [
  {
    id: 'mark',
    keys: ['m'],
    then: 'letter',
    label: 'mark',
    button: 'mark',
    shown: true,
    chord: 'mark',
    help: 'set a mark a-z on the line at the top of your view (or your selection)',
    route: () => waiting({ op: 'open', pane: 'mark' }),
  },
  {
    // `j` stays beside vim's `'` (djdarcy, 2026-10-12: "it should be clear that mark is
    // m, j is jump, etc since it's already literally saying it on the bar").
    id: 'jump',
    keys: ["'", 'j'],
    then: 'letter',
    label: 'jump',
    button: 'jump',
    shown: true,
    chord: 'jump',
    help: 'jump to a mark; alone, the list of marks',
    // Alone it opens the jump pane, whose buttons take the letter (v0.1.7's shape); a
    // letter typed fast enough to arrive with it jumps directly.
    route: next =>
      next === undefined
        ? waiting({ op: 'open', pane: 'jump' })
        : /^[a-z]$/.test(next)
          ? done({ op: 'jump-mark', letter: next })
          : done({ op: 'hint', reason: lineHint() }),
  },
  {
    id: 'prompts',
    keys: ['p'],
    then: 'number',
    label: 'prompt',
    button: 'prompts',
    shown: true,
    chord: 'prompts',
    help: 'your prompts, numbered; a number jumps to one',
    route: () => waiting({ op: 'open', pane: 'list' }),
  },
  {
    id: 'read',
    keys: [' ', 'r'],
    label: 'reading',
    button: 'read',
    shown: true,
    chord: 'read',
    help: 'go to your reading position, or back to where you were',
    route: () => done({ op: 'reading' }),
  },
  {
    id: 'bookmarks',
    keys: ['b'],
    label: 'bookmarks',
    button: 'bookmarks',
    shown: false,
    help: "the bookmarks list, yours and Claude's",
    route: () => waiting({ op: 'open', pane: 'bookmarks' }),
  },
  {
    id: 'promote',
    keys: ['P'],
    then: 'mark-letter',
    label: 'promote',
    button: 'promote',
    shown: false,
    help: 'turn mark a-z into a bookmark that lasts',
    route: next =>
      next === undefined
        ? waiting({ op: 'wait' })
        : /^[a-z`]$/.test(next)
          ? done({ op: 'promote', letter: next })
          : done({ op: 'hint', reason: 'P then a mark letter (a-z) promotes that mark into a bookmark' }),
  },
  { id: 'back', keys: ['o'], label: 'back', button: 'back', shown: false, help: 'back to where the last jump left from', route: () => done({ op: 'jumplist', dir: -1 }) },
  { id: 'forward', keys: ['i'], label: 'forward', button: 'forward', shown: false, help: 'forward again', route: () => done({ op: 'jumplist', dir: 1 }) },
  // `q` quits a view, as in Neovim's and Emacs's non-editing buffers: needed once a list
  // can stay open after a jump (djdarcy, 2026-10-12, Q261012-09: "<leader> q, and q in a
  // list").
  { id: 'close', keys: ['q'], label: 'close', button: 'close', shown: false, help: "close the plugin's pane and end what the band is doing", route: () => done({ op: 'close' }) },
  { id: 'help', keys: ['?'], label: 'help', button: '?', shown: true, help: 'this help', route: () => done({ op: 'help' }) },
]

// What a key shows as in a hint: Space has no glyph of its own.
const keyName = (k: string) => (k === ' ' ? 'Space' : k)

// The command line's hint, generated from the table: every key once, with what follows.
// Every reader below takes the tables it reads (`DEFAULT_TABLES` unless a keymap, #36,
// supplied others through core/band/keymap.ts), so the band, the panes and the help agree
// on whatever keys the person chose.
export function lineHint(tables: Tables = DEFAULT_TABLES): string {
  const parts = tables.line.map(c => {
    const keys = c.keys.map(keyName).join(' or ')
    const then = c.then === 'letter' || c.then === 'mark-letter' ? ' + letter' : c.then === 'number' ? ' + number' : ''
    return `${keys}${then} (${c.label})`
  })
  return `bm: ${parts.join('  ')}`
}

// A list pane's keys (the prompts and bookmarks lists), in the order of their hint.
// `button`: how the band's number row draws it (the band-mode row is generated from this
// table too, so it cannot offer a key the hint does not name). `field`: a key typed only
// in the pane's own `#` field, as the prefix of what follows -- the filter's `/` (#28,
// djdarcy 2026-10-12: "Pane field only") and the pin's `*` -- never on the band's number
// row and never in the hint (the field's placeholder says them); it is in the table so a
// keymap (#36) reaches it like any other key (the keys design, 2026-10-20, unit 1).
export type ListKey = { key: string; label: string; button: string; panes: readonly Pane[]; field?: true; route: () => Routed }
export const LIST_KEYS: readonly ListKey[] = [
  { key: 'j', label: 'next', button: 'j↓', panes: ['list', 'bookmarks'], route: () => waiting({ op: 'step', dir: 1 }) },
  { key: 'k', label: 'previous', button: 'k↑', panes: ['list', 'bookmarks'], route: () => waiting({ op: 'step', dir: -1 }) },
  { key: 's', label: 'pin', button: 's★ pin', panes: ['list'], route: () => waiting({ op: 'pin' }) },
  { key: 'h', label: 'previous group', button: 'h◂', panes: ['bookmarks'], route: () => waiting({ op: 'group', dir: -1 }) },
  { key: 'l', label: 'next group', button: '▸l', panes: ['bookmarks'], route: () => waiting({ op: 'group', dir: 1 }) },
  { key: 'c', label: 'claim', button: 'c claim', panes: ['bookmarks'], route: () => waiting({ op: 'claim' }) },
  { key: 'q', label: 'close', button: 'q close', panes: ['list', 'bookmarks'], route: () => done({ op: 'close' }) },
  { key: '/', label: 'filter', button: '/ filter', panes: ['list'], field: true, route: () => waiting({ op: 'filter' }) },
  { key: '*', label: 'pin prefix', button: '* pin', panes: ['list'], field: true, route: () => waiting({ op: 'pin' }) },
]
// The two tables every reader works from. The defaults are the tables above; a keymap
// (core/band/keymap.ts) derives another pair from them, and a caller that has one passes
// it to each reader.
export type Tables = { line: readonly LineCommand[]; list: readonly ListKey[] }
export const DEFAULT_TABLES: Tables = { line: LINE_COMMANDS, list: LIST_KEYS }

// The bar's hotkey for a command: the first of its keys the engine takes as a Button
// hotkey -- one digit or one lowercase letter ("anything else is refused", and Shift+w is
// "w": plugin/.claude-plugin/types/claude-code/index.d.ts, Button.hotkey). `'`, Space,
// `?` and an uppercase key are typed in the field; their buttons are click-only.
export function barHotkey(keys: readonly string[]): string | undefined {
  return keys.find(k => /^[a-z0-9]$/.test(k))
}

// A pane's list keys, as the band draws them: the field-only keys are not among them.
export function listKeysFor(pane: Pane, tables: Tables = DEFAULT_TABLES): readonly ListKey[] {
  return tables.list.filter(l => l.panes.includes(pane) && !l.field)
}
// A pane's field-only keys: the prefixes its `#` field reads.
export function fieldKeysFor(pane: Pane, tables: Tables = DEFAULT_TABLES): readonly ListKey[] {
  return tables.list.filter(l => l.panes.includes(pane) && l.field === true)
}
// What follows a field key in the pane's `#` field, when `typed` starts with the key that
// routes to `op` (`/words` -> `words`; `*21` -> `21`), else undefined.
export function fieldRest(typed: string, pane: Pane, op: 'filter' | 'pin', tables: Tables = DEFAULT_TABLES): string | undefined {
  const k = fieldKeysFor(pane, tables).find(l => l.route().operation.op === op)
  return k && typed.startsWith(k.key) ? typed.slice(k.key.length) : undefined
}

// Route what was typed in a context. `typed` is the whole command line for the band with
// no pane (a command and maybe its argument), or a single key in a list pane.
export function route(typed: string, ctx: { pane: Pane }, tables: Tables = DEFAULT_TABLES): Routed {
  if (typed === '') return waiting({ op: 'wait' })
  if (typed === '\u001b' || typed === 'Escape') return done({ op: 'close' })
  if (ctx.pane === 'list' || ctx.pane === 'bookmarks') {
    if (/^[0-9]$/.test(typed)) return waiting({ op: 'digit', digit: typed })
    if (typed === '\r' || typed === 'Enter') return done({ op: 'go' })
    const k = tables.list.find(l => l.key === typed && l.panes.includes(ctx.pane))
    if (k) return k.route()
    return waiting({ op: 'hint', reason: listHint(ctx.pane, tables) })
  }
  const first = typed[0]!
  const cmd = tables.line.find(c => c.keys.includes(first))
  if (!cmd) return done({ op: 'hint', reason: lineHint(tables) })
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

export function listHint(pane: Pane, tables: Tables = DEFAULT_TABLES): string {
  const keys = listKeysFor(pane, tables).map(l => `${l.key} ${l.label}`)
  return ['number + Enter jump', ...keys, 'Esc close'].join(' · ')
}

// Every key the command line routes, for tests and for a surface that draws one button
// per command.
export function lineKeys(tables: Tables = DEFAULT_TABLES): string[] {
  return tables.line.flatMap(c => [...c.keys])
}

// The band's bar: one button per shown command, in table order. Its key is the command's
// key a press stands for (`route(key)`); `hotkey` only where the engine takes one (a
// letter or digit: not `'`, Space or `?`, which are typed in the field); `chord` only
// while chords are on. The field beside the buttons has no placeholder: the buttons say
// what the keys are, and `?` says the rest (it replaced `' m ␣ p b P o i`, which named
// keys without saying what they did).
export type BandButton = { id: string; key: string; label: string; hotkey?: string; chord?: Chord }
export function bandButtons(opts: { chords: boolean }, tables: Tables = DEFAULT_TABLES): BandButton[] {
  return tables.line.filter(c => c.shown).map(c => {
    const hotkey = barHotkey(c.keys)
    return {
      id: c.id,
      key: c.keys[0]!,
      label: c.button,
      ...(hotkey ? { hotkey } : {}),
      ...(opts.chords && c.chord ? { chord: c.chord } : {}),
    }
  })
}

// The help `?` shows: every command with its keys and what it does, the list keys, and
// the switches as they are now. One string per line.
export function helpLines(now: { leader: string; chords: boolean; panes: boolean }, tables: Tables = DEFAULT_TABLES): string[] {
  const keysOf = (c: LineCommand) => {
    const then = c.then === 'letter' || c.then === 'mark-letter' ? ' + letter' : c.then === 'number' ? ' + number' : ''
    return `${c.keys.map(keyName).join(' or ')}${then}`
  }
  const width = Math.max(...tables.line.map(c => keysOf(c).length))
  const filterKey = fieldKeysFor('list', tables).find(k => k.route().operation.op === 'filter')?.key ?? '/'
  return [
    `${now.leader}, then:`,
    ...tables.line.map(c => `  ${keysOf(c).padEnd(width)}  ${c.help}`),
    'In the prompts list:',
    `  ${listHint('list', tables)}; type ${filterKey}words in its # field to filter, N.k for a footnote`,
    'In the bookmarks list:',
    `  ${listHint('bookmarks', tables)}`,
    `Chords (mark, jump, prompts, read on their own keybindings): ${now.chords ? 'on' : 'off'}. Lists in a pane: ${now.panes ? 'on' : 'off'}. Both in /config.`,
  ]
}

// The same help in four lines, for a band too short for one line per command: each line
// wraps to the band's width instead of adding rows the band would have to scroll.
export function helpShort(now: { leader: string; chords: boolean; panes: boolean }, tables: Tables = DEFAULT_TABLES): string[] {
  const full = helpLines(now, tables)
  const filterKey = fieldKeysFor('list', tables).find(k => k.route().operation.op === 'filter')?.key ?? '/'
  return [
    `${now.leader}, then: ${lineHint(tables).replace(/^bm: /, '').split('  ').join(' · ')}`,
    `Prompts list: ${listHint('list', tables)}; ${filterKey}words in its # field filters, N.k is a footnote`,
    `Bookmarks list: ${listHint('bookmarks', tables)}`,
    full.at(-1)!,
  ]
}
