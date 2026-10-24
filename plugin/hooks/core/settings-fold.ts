// Which of the plugin's /config rows the menu leaves out, and how a fold row is labelled
// (djdarcy, 2026-10-24: "I think for now every option should be hidden by default as I really
// don't think users are going to want to mess with anything"; the main fold "should
// absolutely be called 'Bookmarks'"; a fold for the debug options, each leading "Debug:"; and
// "some sort of leading indicator to show something is a fold group"). Pure: the
// config.describe hook in register.tsx asks it for every `bookmarks.*` row.
//
// Three folds. The Bookmarks fold (`settingsShown`) hides every other row of the plugin;
// open, it shows the settings and two folds of its own, the keys (`keysShown`) and the
// debugging rows (`debugShown`), whose rows stay hidden until each is opened too. A hidden
// row still holds and applies its value, and `/config bookmarks.<field>=<value>` still sets it.
import { KEYS_SHOWN_FIELD, isKeyRow } from './band/keymap.ts'
import { FOLD_CLOSED, FOLD_OPEN } from './settings.ts'

export const SETTINGS_SHOWN_FIELD = 'settingsShown'
export const DEBUG_SHOWN_FIELD = 'debugShown'
/** The rows behind the debug fold. */
export const DEBUG_ROWS: ReadonlySet<string> = new Set(['debugDefault', 'debugText', 'debugTextLength'])
/** The fold rows, each a true/false setting: /config flips those in place with Enter. */
export const FOLD_FIELDS: ReadonlySet<string> = new Set([SETTINGS_SHOWN_FIELD, KEYS_SHOWN_FIELD, DEBUG_SHOWN_FIELD])

const open = (values: Readonly<Record<string, unknown>>, fold: string) => values[fold] === true

/** Whether the /config menu leaves this plugin row out, given the settings as they stand. */
export function rowHidden(field: string, values: Readonly<Record<string, unknown>>): boolean {
  if (field === SETTINGS_SHOWN_FIELD) return false
  if (!open(values, SETTINGS_SHOWN_FIELD)) return true
  if (isKeyRow(field)) return !open(values, KEYS_SHOWN_FIELD)
  if (DEBUG_ROWS.has(field)) return !open(values, DEBUG_SHOWN_FIELD)
  return false
}

/** A fold row's label with its marker for the fold's state (`▾` open, `▸` closed); any other row's label as it is. */
export function foldLabel(field: string, label: string, values: Readonly<Record<string, unknown>>): string {
  if (!FOLD_FIELDS.has(field)) return label
  const bare = label.replace(new RegExp(`^[${FOLD_CLOSED}${FOLD_OPEN}]\\s*`), '')
  return `${open(values, field) ? FOLD_OPEN : FOLD_CLOSED} ${bare}`
}
