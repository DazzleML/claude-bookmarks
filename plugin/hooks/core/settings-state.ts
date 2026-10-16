// The plugin's settings as they stand, owned in one place (the one-owner principle,
// notes/meta/2026-10-12__22-48-40): the person's /config values and the theme's name, with
// the resolution and the palette kept until one of them changes. These were module
// `let`s in register.tsx (machineOptions, themeName, paletteCache), and every read
// re-resolved every field; here the writes are named and a read is a lookup.
import { resolve, type Resolved, type Settings } from './settings.ts'
import { resolvePalette, type Palette } from './palette.ts'

export class SettingsState {
  // The person's /config values (the `userConfig` in plugin.json), which Claude Code hands
  // to `register` with every default filled in and a change to which arrives as
  // `config.set`, over the defaults in core/settings.ts.
  private machine: Record<string, unknown> = {}
  // The theme's name (/config's `theme` row): the mark band's light or dark value.
  private theme: string | undefined
  private resolution: Resolved | undefined
  private paletteCache: { key: string; palette: Palette } | undefined

  /** The /config values Claude Code handed `register` at load. */
  loaded(options: Record<string, unknown>): void {
    this.machine = { ...options }
    this.resolution = undefined
  }
  /** One of this plugin's /config fields changed (`bookmarks.<field>`). */
  changed(field: string, value: unknown): void {
    this.machine = { ...this.machine, [field]: value }
    this.resolution = undefined
  }
  /** The theme's name, from /config's `theme` row. */
  themeIs(name: string): void {
    this.theme = name
  }

  /** The resolution: each value and where it came from (for /bm-config). */
  resolved(): Resolved {
    return (this.resolution ??= resolve(this.machine))
  }
  current(): Settings {
    return this.resolved().values
  }

  // Every colour, background, dim and bold the plugin draws comes from the palette by role
  // (#27, core/palette.ts): theme keys first, so a role reads on dark and light themes; the
  // mark band's light or dark value from the theme's name (/config's `theme` row, kept
  // current by a config.set hook); the person's overrides from the `palette` setting.
  palette(): Palette {
    const overrides = this.current().palette
    const key = `${this.theme ?? ''}|${overrides}`
    if (this.paletteCache?.key !== key) {
      let parsed: Record<string, unknown> = {}
      try {
        const v: unknown = overrides.trim() ? JSON.parse(overrides) : {}
        if (v && typeof v === 'object') parsed = v as Record<string, unknown>
      } catch {
        // Not JSON: the defaults stand, as for any override that does not fit.
      }
      this.paletteCache = { key, palette: resolvePalette({ theme: this.theme, overrides: parsed }).palette }
    }
    return this.paletteCache.palette
  }
}
