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
  // Where a list number is typed when the band holds the keyboard (the input-routing design,
  // 2026-10-25; core/band/routes.ts). A new field, never a changed type (docs/engine-quirks.md,
  // "A saved setting of the wrong type stops the plugin loading"): `auto` names the best
  // pathway this build has, so a better one can become the default without a saved value
  // changing meaning.
  listInput: {
    kind: 'enum',
    values: ['auto', 'field', 'buttons'],
    default: 'auto',
    title: 'Typing a list number',
    description: "auto: the best way this Claude Code build allows (today the band's own field); field: the band's own field, where Backspace, /words and * work; buttons: one key per digit, as before 0.6.27",
  },
  // Pins (the 0.7 groundwork design, unit 6; the gate's G-a, djdarcy 2026-10-25: "by default
  // "only where made" but people should be able to choose everywhere too in the config").
  // Every pin records the list it was made in (core/bookmarks/pins.ts). Named `starScope` in
  // 0.7.1; renamed with no carry-over, as no saved value existed (measured 2026-10-26).
  pinScope: {
    kind: 'enum',
    values: ['here', 'everywhere'],
    default: 'here',
    title: 'Pins shown in a list',
    description: 'here: a list shows the pins made in it; everywhere: a list shows a pin on any of its rows, wherever it was made',
  },
  // The search pane's rows behind their own fold, as the keys and the debug rows are (djdarcy,
  // 2026-10-26: "Is there a reason we didn't set this up as a proper foldable?").
  searchShown: {
    kind: 'boolean',
    default: false,
    title: `${FOLD_CLOSED} Search: show the search rows`,
    description: 'true: the rows below set what the search pane opens on, its toggle row, and how a result is labelled and laid out; false: they are folded away (what you set stays)',
  },
  // The search pane's row of on/off toggles for what it searches (the scope design's F7,
  // 2026-10-25: "a setting hides the row"); typed rules (in:tools, -agent:help) work either way.
  searchToggles: {
    kind: 'enum',
    values: ['shown', 'hidden'],
    default: 'shown',
    title: 'Search: the row of toggles',
    description: 'shown: the search pane draws a row of on/off toggles for what it searches (you, claude, tools, outputs, agents, ...); hidden: no row, and in:tools style words in the query still narrow it',
  },
  // What the search pane opens on (djdarcy, 2026-10-26: default "all"; "you+claude+tools+output
  // ... covers most of what users see on the screen"; "a template for a more narrow view as
  // "you+claude+sessions""). The values are core/search/results.ts SEARCH_VIEWS's names.
  searchView: {
    kind: 'enum',
    values: ['all', 'you+claude+sessions+tools+outputs', 'you+claude+sessions', 'custom'],
    default: 'all',
    title: 'Search: what it opens on',
    description: "all: every row; you+claude+sessions+tools+outputs: what the conversation shows on screen, other sessions' messages included; you+claude+sessions: the conversation and other sessions' messages; custom: the kinds you turn on in the rows below. The toggles change it while the pane is open",
  },
  // The custom set (djdarcy, 2026-10-26: "make it a list where users can pick the items they want
  // to "build"". /config has no multi-select, so one on/off row per kind, shown only while the
  // view is `custom`; the defaults are the second preset). Names: core/search/results.ts CUSTOM_FIELDS.
  searchWithYou: customRow('you', true),
  searchWithClaude: customRow('claude', true),
  searchWithAgents: customRow('agents', false),
  searchWithSessions: customRow('sessions', true),
  searchWithTools: customRow('tools', true),
  searchWithOutputs: customRow('outputs', true),
  searchWithThinking: customRow('thinking', false),
  searchWithNotices: customRow('notices', false),
  searchWithOther: customRow('other', false),
  // How a search result's kind is written (djdarcy, 2026-10-26: "a shorthand ... {"cl:", "th:",
  // "to:", ...} this way it doesn't take up quite so much space in the search panel").
  searchLabels: {
    kind: 'enum',
    values: ['words', 'short'],
    default: 'words',
    title: 'Search: how a result says what it is',
    description: 'words: you, claude, thinking, Bash, output, notice; short: the first letters of each (yo, cl, th, ou, no at 2; a tool keeps its name, an agent its type), on the result rows; the toggles keep their words',
  },
  // How many letters a short kind keeps (djdarcy, 2026-10-26: "we still need to let users choose
  // how many letters the shortname should be from the longname. As I suspect many users will
  // want "3" letters. But 2 is my preference."). Shown only while the labels are short.
  searchShortLength: {
    kind: 'number',
    min: 1,
    max: 6,
    default: 2,
    title: 'Search: letters in a short kind',
    description: 'How many letters a short kind keeps (1 to 6): 2 gives cl, ou, th; 3 gives cla, out, thi. Used while "how a result says what it is" is short',
  },
  // How a search result is laid out (djdarcy, 2026-10-26, on "mid-engineer · SubagentHandback:"
  // taking half the row: the kind on its own line, the text "tabbed in slightly" below, the
  // old layout kept as a choice).
  searchLayout: {
    kind: 'enum',
    values: ['stacked', 'inline'],
    default: 'stacked',
    title: 'Search: how a result is laid out',
    description: 'stacked: the number and kind on one line, the text on the lines below, indented; inline: the text beside the kind. With one line per row, always inline',
  },
  // A label that only repeats the one toggle on is left out (djdarcy, 2026-10-26: "When a person
  // has only one tab selected ... we shouldn't need to show the implicit "you:" ... by having this
  // as a config option where users can choose to always keep the identifiers visible versus
  // hidden in implied-mode I think will conserve space").
  searchImplied: {
    kind: 'enum',
    values: ['implied', 'always'],
    default: 'implied',
    title: 'Search: labels in a one-kind view',
    description: 'implied: with one toggle on, a label that only repeats it is left out (claude alone: replies unlabelled, thinking still says so); always: every result keeps its label',
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
  keyLists: keyRow('lists', 'l'),
  keySearch: keyRow('search', '/'),
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
function customRow(kind: string, on: boolean) {
  return {
    kind: 'boolean',
    default: on,
    title: `Search: custom includes ${kind}`,
    description: `true: a search with "what it opens on" set to custom starts with ${kind} on; false: off`,
  } as const
}

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
