// Every colour the plugin draws, by what it means rather than where it is drawn (#27).
//
// A role names a meaning (the prompt nearest the view, a pinned prompt, a footnote row,
// a mark's highlighted words); its style is the engine's own style shape (the colour,
// background, dim and bold a Text takes). Defaults use Claude Code's theme keys wherever
// one fits: a theme key "follows the person's theme" (the engine's Color type), so the
// same role reads on a dark and on a light terminal without the plugin knowing which.
// The one colour with no theme key, the mark's background band, has a dark and a light
// value chosen from the theme's name; a theme whose name says neither gets the dark one.
//
// Overrides (a setting, #7) are validated here: an unknown role or a colour that is not
// a theme key, a hex value or a terminal colour name is dropped, and the default stands
// (#7: "an invalid colour falls back to the palette default").

export type Role = 'here' | 'pinned' | 'footnote' | 'legend' | 'mark' | 'markBand' | 'used' | 'unused' | 'unreached' | 'emphasis' | 'search'
export type Style = { color?: string; backgroundColor?: string; dimColor?: boolean; bold?: boolean }
export type Palette = Record<Role, Style>

// Claude Code's theme keys (plugin/.claude-plugin/types/claude-code/index.d.ts, ThemeKey).
export const THEME_KEYS = [
  'text', 'inverseText', 'inactive', 'subtle', 'suggestion', 'remember', 'success', 'error', 'warning',
  'merged', 'claude', 'permission', 'planMode', 'autoAccept', 'promptBorder', 'bashBorder', 'ide',
  'diffAdded', 'diffRemoved', 'diffAddedDimmed', 'diffRemovedDimmed', 'diffAddedWord', 'diffRemovedWord',
] as const

const NAMED = new Set([
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray', 'grey',
  'blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright',
])

// The mark band behind a highlighted line. Dark: a soft navy below the selection blue
// (#264F78), the value the plugin has drawn since round 4. Light: its counterpart.
export const MARK_BAND = { dark: '#1B3754', light: '#D6E4F5' } as const

export const DEFAULTS: Palette = {
  here: { color: 'warning', bold: true }, // the prompt nearest the view (yellow in the default themes)
  pinned: { color: 'warning' }, // the pin star
  footnote: { color: 'subtle', dimColor: true }, // non-prompt rows (#33): below whole prompts in priority; dim, since a Button row can't take the colour
  legend: { dimColor: true },
  mark: { color: 'warning', bold: true }, // a mark's highlighted words
  markBand: { backgroundColor: MARK_BAND.dark },
  used: { color: 'inactive' }, // a mark letter already taken, in the mark pane
  unused: { dimColor: true }, // a mark letter still free
  unreached: { dimColor: true }, // a prompt not drawn since load, possibly out of reach
  emphasis: { bold: true }, // what the person is typing (a prompt number), the letter just marked
  search: { color: 'suggestion', bold: true }, // search matches (#20): a cool colour, never the marks' yellow
}

export function brightness(themeName: string | undefined): 'light' | 'dark' {
  return themeName && /light/i.test(themeName) ? 'light' : 'dark'
}

export function isColour(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ((THEME_KEYS as readonly string[]).includes(value) || /^#[0-9a-f]{6}$/i.test(value) || NAMED.has(value))
  )
}

export function resolvePalette(opts: { theme?: string; overrides?: Readonly<Record<string, unknown>> } = {}): {
  palette: Palette
  dropped: string[]
} {
  const palette = Object.fromEntries(Object.entries(DEFAULTS).map(([r, s]) => [r, { ...s }])) as Palette
  palette.markBand.backgroundColor = MARK_BAND[brightness(opts.theme)]
  const dropped: string[] = []
  for (const [role, raw] of Object.entries(opts.overrides ?? {})) {
    if (!(role in DEFAULTS) || typeof raw !== 'object' || raw === null) {
      dropped.push(role)
      continue
    }
    const style = raw as Record<string, unknown>
    const target = palette[role as Role]
    for (const [k, v] of Object.entries(style)) {
      if ((k === 'color' || k === 'backgroundColor') && isColour(v)) target[k] = v
      else if ((k === 'dimColor' || k === 'bold') && typeof v === 'boolean') target[k] = v
      else dropped.push(`${role}.${k}`)
    }
  }
  return { palette, dropped }
}
