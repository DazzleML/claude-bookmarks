// The plugin's settings: what can be set, the defaults, and how the layers combine.
//
// Pure (imports nothing from the engine), so the rule is testable and the adapters that
// read Claude Code's /config (userConfig) and the plugin store stay thin. Three layers,
// later wins: the defaults here, the machine's values (the person's /config choices,
// stored by Claude Code in settings.json), then a conversation's own values (only the
// debug echo uses this slot today). Claude Code fills every field's declared default into
// the machine layer (a picker field must declare one), so a machine value equal to the
// default reports its source as `default`. A value that does not fit
// its field is rejected and the layer below stands, so a bad setting can never break a
// draw (#7: "an invalid value falls back to the default").
//
// Keys are identifiers because Claude Code requires it of userConfig keys: they become
// CLAUDE_PLUGIN_OPTION_<KEY> environment variables in hooks (Claude Code's manifest
// schema, read 2026-10-11). So `afterAction.focus` is `afterActionFocus`.
//
// The fields, from the asks of 2026-10-11 (ordering DWP, slice 1; the approved plan):
// where the prompts list opens, whether it follows the view, how close two exchanges
// must be for the earlier to win, whether a list stays open after a jump or while the
// person types, where the keyboard goes after an action, and the debug echo's default.

export type EnumField = { kind: 'enum'; values: readonly string[]; default: string; title: string; description: string }
export type BooleanField = { kind: 'boolean'; default: boolean; title: string; description: string }
export type NumberField = { kind: 'number'; min: number; max: number; default: number; title: string; description: string }
export type TextField = { kind: 'text'; default: string; title: string; description: string }
export type Field = EnumField | BooleanField | NumberField | TextField

// U70 (djdarcy, 2026-10-22): "letting users choose how many lines per entry is best. I suspect
// a good default is "2 lines"". The default is his guess, dogfooded; the cap is the loop's.
// A fold row's leading marker (djdarcy, 2026-10-24: "some sort of leading indicator to show
// something is a fold group"): closed in the manifest's title, and the config.describe hook
// draws it open while the fold is shown (core/settings-fold.ts foldLabel). Not `>`, which
// reads as a second copy of the menu's own `❯` cursor.
export const FOLD_CLOSED = '▸'
export const FOLD_OPEN = '▾'

export const ROW_LINES_DEFAULT = 2
export const ROW_LINES_MAX = 5

export const FIELDS = {
  // The fold over every other row (core/settings-fold.ts), first so it heads the plugin's
  // block in /config. djdarcy, 2026-10-24: "every option should be hidden by default".
  // The folds are true/false rows because /config flips those in place with Enter; a
  // plugin's choice row always opens a picker (2.1.310 sets pickToCommit on every one), so
  // the ‹ › cycler the menu's own rows use is not open to a plugin.
  settingsShown: {
    kind: 'boolean',
    default: false,
    title: `${FOLD_CLOSED} Bookmarks`,
    description:
      "true: the plugin's settings appear below (the prompts list, the band, the lists' rows, debugging, colours, and the keys behind their own row); false: folded away, and everything you set still applies",
  },
  listOpensAt: {
    kind: 'enum',
    values: ['nearest', 'newest'],
    default: 'nearest',
    title: 'Prompts list opens at',
    description: 'nearest: centred on the prompt nearest your view; newest: at the newest prompt',
  },
  followHere: {
    kind: 'enum',
    values: ['when-idle', 'always', 'never'],
    default: 'when-idle',
    title: 'Prompts list follows the view',
    description: 'when-idle: slides to keep the yellow row showing unless you are typing a number; always; never',
  },
  closeShare: {
    kind: 'number',
    min: 0,
    max: 1,
    default: 0.6,
    title: 'Closeness for the earlier prompt',
    description: 'An earlier exchange is "nearest" while it holds at least this share of the screen lines the biggest one holds (0 to 1)',
  },
  paneAfterJump: {
    kind: 'enum',
    values: ['close', 'stay'],
    default: 'close',
    // Retitled 2026-10-12: djdarcy looked for this as "keep the Panel open for prompts
    // after I click an item" and did not find it under "A list after a jump".
    title: 'Prompts or bookmarks list after you pick a row',
    description: 'close: clicking a row (or Enter on a number) jumps there and closes the list; stay: the list stays open for the next pick',
  },
  paneWhileTyping: {
    kind: 'enum',
    values: ['close', 'stay'],
    default: 'stay',
    title: 'A list while you type',
    description: 'stay: typing in the input box leaves an open list where it is; close: typing closes it',
  },
  afterActionFocus: {
    kind: 'enum',
    values: ['input', 'band'],
    default: 'input',
    title: 'Keyboard after an action',
    description: 'input: back to the input box once Claude Code allows a plugin to do it; band: stay in the band',
  },
  // #27: a role's colour, background, dim or bold, as JSON; core/palette.ts validates it.
  palette: {
    kind: 'text',
    default: '',
    title: 'Colour overrides',
    description: 'JSON, e.g. {"here": {"color": "cyan"}, "markBand": {"backgroundColor": "#203040"}}. Roles: here, pinned, footnote, legend, heading, mark, markBand, used, unused, unreached, emphasis, search. A colour is a theme key (warning, subtle, ...), a terminal colour name or #rrggbb; anything else is ignored',
  },
  // #33: the person's slash commands, `!` shell commands and interruptions, as N.k rows
  // under their prompt in the prompts list. The fold is the first ladder on the
  // continuum (core/kit/continuum.ts): hidden (-1) < folded (0) < shown (+1).
  footnotes: {
    kind: 'enum',
    values: ['folded', 'shown', 'hidden'],
    default: 'folded',
    title: 'Footnotes in the prompts list',
    description: "folded: a prompt with footnotes (your slash commands, ! shell commands, interruptions) shows an ellipsis, and . unfolds them; shown: always listed under their prompt; hidden: never listed",
  },
  // #28, djdarcy 2026-10-12: "The whole prompt up to a budget is fine, but for private
  // builds and with the dcc-patcher we should be able to go further. So we want to make
  // sure we can allow unlimited for machines that have less limitations."
  promptTextBudget: {
    kind: 'number',
    min: 0,
    max: 1_000_000_000,
    default: 2_000_000,
    title: 'Prompt text kept for the filter (bytes)',
    description: 'How much of your prompts the filter searches, across the conversation; 0 = unlimited (for machines with room to spare). The default keeps whole prompts in most conversations',
  },
  // The input layers (#29) as switches. `band`: full shows the field, the labelled
  // commands and `?`; field shows the field alone. A band with nothing in it cannot take
  // the leader (an Input or a Button is what focuses), so "hidden" waits on Q261012-08.
  band: {
    kind: 'enum',
    values: ['full', 'field'],
    default: 'full',
    title: 'The band',
    description: 'full: the command field, the labelled commands and ? for the rest; field: the command field alone, one short row (the leader still lands there; ? shows the commands)',
  },
  // djdarcy, 2026-10-12 01:30: chords kept, optional, "an easy enable/disable so their
  // removal can be tested".
  chords: {
    kind: 'enum',
    values: ['on', 'off'],
    default: 'on',
    title: 'Chords on their own keybindings',
    description: "on: mark, jump, prompts and read also answer the keybindings bound to their borrowed actions (docs: Optional fast keys); off: only the leader and the band's field",
  },
  panes: {
    kind: 'enum',
    values: ['on', 'off'],
    default: 'on',
    title: 'Lists in a pane',
    description: "on: the prompts and bookmarks lists open in a pane beside the conversation; off: p and b take a number in the band and jump, with no pane",
  },
  // U70: how much of each row the prompts and jump lists show. The pane's width is known, so
  // lines are the one control that matters; the text is cut with an ellipsis at the end of
  // the last line.
  rowLines: {
    kind: 'number',
    min: 1,
    max: ROW_LINES_MAX,
    default: ROW_LINES_DEFAULT,
    title: 'Lines per row in the lists',
    description: 'How many lines each prompt in the prompts list, and each mark in the jump list, may take (1 to 5); the text is cut with an ellipsis at the end of the last line',
  },
  // The keymap (#36; the keys design, unit 3). djdarcy's fold look of 2026-10-24 chose rows
  // behind a fold: `keysShown` hides the rows below it (a config.describe hook), so /config
  // stays short until the person opens it. The names are core/band/keymap.ts KEY_FIELDS,
  // LIST_FIELD and LEADER_FIELD (a core test holds them together). An empty row is the
  // table's own keys; a value is keys separated by spaces, `Space` for the space key, and
  // `hidden` last to take the button off the bar.
  keysShown: {
    kind: 'boolean',
    default: false,
    title: `${FOLD_CLOSED} Keys: show the key rows`,
    description: 'true: the rows below set the band\'s keys, one per command, and the list keys; false: they are folded away (your keys stay as set)',
  },
  keyMark: keyRow('mark', 'm'),
  keyJump: keyRow('jump', "' j"),
  keyPrompts: keyRow('prompts', 'p'),
  keyRead: keyRow('reading position', 'Space r'),
  keyBookmarks: keyRow('bookmarks', 'b'),
  keyPromote: keyRow('promote a mark', 'P'),
  keyDelete: keyRow('clear a mark', 'd'),
  keyForget: keyRow('forget a mark', 'D'),
  keyBack: keyRow('back', 'o'),
  keyForward: keyRow('forward', 'i'),
  keyClose: keyRow('close', 'q'),
  keyHelp: keyRow('help', '?'),
  keyList: {
    kind: 'text',
    default: '',
    title: 'Keys: in a list',
    description: 'The list keys in order: next previous pin previous-group next-group claim remove close (default: j k s h l c d q); empty = the defaults',
  },
  keyLeader: {
    kind: 'text',
    default: '',
    title: 'Keys: the leader',
    description: 'The leader is a Claude Code keybinding (abovePrompt:focus in ~/.claude/keybindings.json), not set here',
  },
  // The debugging rows behind their own fold (djdarcy, 2026-10-24: a fold "for our debug
  // options so they can be grouped together better", each leading with "Debug:"), last in
  // the block so they read as one group.
  debugShown: {
    kind: 'boolean',
    default: false,
    title: `${FOLD_CLOSED} Debug: show the debug rows`,
    description: 'true: the rows below set what the debug log echoes and quotes; false: they are folded away (what you set stays)',
  },
  debugDefault: {
    kind: 'enum',
    values: ['off', 'on'],
    default: 'off',
    title: 'Debug: echo by default',
    description: "Whether the plugin's log lines are echoed into a conversation that has not chosen; /bm-debug decides per conversation",
  },
  // djdarcy, 2026-10-12: "In the dev build it should always be on, and in the main build
  // it should always be off by default unless the person turns the feature on" and
  // "some instances we might want the full output and other times just enough to identify
  // the location". `auto` is that rule: debugTextMode() reads it per build.
  debugText: {
    kind: 'enum',
    values: ['auto', 'off', 'with-debug', 'always'],
    default: 'auto',
    title: 'Debug: conversation text in the log',
    description: "auto: off in an installed plugin, always in one loaded from a folder; off: log lines name places by id only; with-debug: they also quote the conversation while this conversation's debugging is on; always: they always quote it",
  },
  debugTextLength: {
    kind: 'enum',
    values: ['reference', 'full'],
    default: 'reference',
    title: 'Debug: how much text a line quotes',
    description: 'reference: a short excerpt, enough to find the place; full: the whole text',
  },
} as const satisfies Record<string, Field>

// One keymap row: a text field whose empty value is the command's default keys.
function keyRow(what: string, defaults: string) {
  return {
    kind: 'text',
    default: '',
    title: `Keys: ${what}`,
    description: `Keys for ${what}, separated by spaces (default: ${defaults}); Space spells the space key; end with hidden to take its button off the bar; empty = the default`,
  } as const
}

export type FieldName = keyof typeof FIELDS
type ValueOf<F> = F extends { kind: 'enum'; values: readonly (infer V)[] }
  ? V
  : F extends { kind: 'boolean' }
    ? boolean
    : F extends { kind: 'number' }
      ? number
      : F extends { kind: 'text' }
        ? string
        : never
export type Settings = { [K in FieldName]: ValueOf<(typeof FIELDS)[K]> }
export type Source = 'default' | 'machine' | 'conversation'
export type Layer = Readonly<Record<string, unknown>>

export const DEFAULTS: Settings = Object.fromEntries(
  Object.entries(FIELDS).map(([k, f]) => [k, f.default]),
) as Settings

// Whether a value fits its field. Numbers given as strings (as a text field may hold
// them) are accepted when they parse and fall within the range.
export function fit(field: Field, raw: unknown): { ok: true; value: string | boolean | number } | { ok: false } {
  switch (field.kind) {
    case 'enum':
      return typeof raw === 'string' && field.values.includes(raw) ? { ok: true, value: raw } : { ok: false }
    case 'boolean':
      if (typeof raw === 'boolean') return { ok: true, value: raw }
      if (raw === 'true' || raw === 'false') return { ok: true, value: raw === 'true' }
      return { ok: false }
    case 'number': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
      return Number.isFinite(n) && n >= field.min && n <= field.max ? { ok: true, value: n } : { ok: false }
    }
    case 'text':
      return typeof raw === 'string' ? { ok: true, value: raw } : { ok: false }
  }
}

export type Resolved = {
  values: Settings
  sources: Record<FieldName, Source>
  // Values that were given but did not fit, as `layer.key=value`, for /bm-config and the log.
  rejected: string[]
  // Keys a layer held that are not fields (a renamed or retired setting), as `layer.key`.
  unknown: string[]
}

export function resolve(machine: Layer = {}, conversation: Layer = {}): Resolved {
  const values = { ...DEFAULTS } as Record<string, unknown>
  const sources = Object.fromEntries(Object.keys(FIELDS).map(k => [k, 'default'])) as Record<FieldName, Source>
  const rejected: string[] = []
  const unknown: string[] = []
  for (const [layerName, layer] of [['machine', machine], ['conversation', conversation]] as const) {
    for (const [key, raw] of Object.entries(layer)) {
      if (raw === undefined) continue
      if (!(key in FIELDS)) {
        unknown.push(`${layerName}.${key}`)
        continue
      }
      const name = key as FieldName
      const fitted = fit(FIELDS[name], raw)
      if (!fitted.ok) {
        rejected.push(`${layerName}.${key}=${JSON.stringify(raw)}`)
        continue
      }
      values[name] = fitted.value
      // The machine layer carries every default Claude Code filled in: a value equal to
      // the default is not a choice anyone made.
      if (!(layerName === 'machine' && fitted.value === FIELDS[name].default)) sources[name] = layerName
    }
  }
  return { values: values as Settings, sources, rejected, unknown }
}

// What `debugText` means in this build: `auto` is off in an installed plugin and
// always in one loaded from a folder (a developer's build).
export function debugTextMode(value: Settings['debugText'], loadedFromFolder: boolean): 'off' | 'with-debug' | 'always' {
  return value === 'auto' ? (loadedFromFolder ? 'always' : 'off') : value
}

// Whether the plugin was loaded from Claude Code's plugin cache (a marketplace install)
// rather than a folder (`--plugin-dir`, a working tree). Slashes either way.
export function installedFromCache(pluginRoot: string): boolean {
  return /[\\/]plugins[\\/]cache[\\/]/.test(pluginRoot)
}

// The `userConfig` block for plugin.json, generated from FIELDS so the manifest and the
// code cannot drift (a test compares the two). Enum fields become strings with an
// `options` list, which /config draws as a picker; every field declares its default (the
// validator requires it of a picker).
export function manifestUserConfig(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(FIELDS).map(([k, f]) => {
      const base = { title: f.title, description: f.description, default: f.default }
      if (f.kind === 'enum') return [k, { type: 'string', ...base, options: [...f.values] }]
      if (f.kind === 'number') return [k, { type: 'number', ...base, min: f.min, max: f.max }]
      if (f.kind === 'text') return [k, { type: 'string', ...base }]
      return [k, { type: 'boolean', ...base }]
    }),
  )
}
