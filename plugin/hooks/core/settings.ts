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
export type Field = EnumField | BooleanField | NumberField

export const FIELDS = {
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
    title: 'A list after a jump',
    description: 'close: a jump from a list closes it; stay: the list stays open',
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
  debugDefault: {
    kind: 'enum',
    values: ['off', 'on'],
    default: 'off',
    title: 'Debug echo by default',
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
    title: 'Conversation text in the debug log',
    description: "auto: off in an installed plugin, always in one loaded from a folder; off: log lines name places by id only; with-debug: they also quote the conversation while this conversation's debugging is on; always: they always quote it",
  },
  debugTextLength: {
    kind: 'enum',
    values: ['reference', 'full'],
    default: 'reference',
    title: 'How much text a debug line quotes',
    description: 'reference: a short excerpt, enough to find the place; full: the whole text',
  },
} as const satisfies Record<string, Field>

export type FieldName = keyof typeof FIELDS
type ValueOf<F> = F extends { kind: 'enum'; values: readonly (infer V)[] }
  ? V
  : F extends { kind: 'boolean' }
    ? boolean
    : F extends { kind: 'number' }
      ? number
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
      return [k, { type: 'boolean', ...base }]
    }),
  )
}
