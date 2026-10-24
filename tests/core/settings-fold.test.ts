// The plugin's settings behind one fold (djdarcy, 2026-10-24: "I think for now every option
// should be hidden by default as I really don't think users are going to want to mess with
// anything"; the main fold "should absolutely be called 'Bookmarks'"). The rule for which
// /config row the menu leaves out, with the keys' own fold inside it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEBUG_ROWS, DEBUG_SHOWN_FIELD, SETTINGS_SHOWN_FIELD, foldLabel, rowHidden } from '../../plugin/hooks/core/settings-fold.ts'
import { DEFAULTS, FIELDS, FOLD_CLOSED, FOLD_OPEN } from '../../plugin/hooks/core/settings.ts'

const values = (over: Record<string, boolean> = {}) => ({ ...DEFAULTS, ...over }) as unknown as Record<string, unknown>

test('the Bookmarks fold is a setting, first in the list, folded by default', () => {
  assert.equal(Object.keys(FIELDS)[0], SETTINGS_SHOWN_FIELD)
  assert.equal(FIELDS[SETTINGS_SHOWN_FIELD as keyof typeof FIELDS].title, `${FOLD_CLOSED} Bookmarks`)
  assert.equal((DEFAULTS as Record<string, unknown>)[SETTINGS_SHOWN_FIELD], false)
})

// /config flips a true/false row in place with Enter; a plugin's choice row opens a picker.
test('every fold is a true/false row, so Enter flips it in place', () => {
  for (const fold of [SETTINGS_SHOWN_FIELD, 'keysShown', DEBUG_SHOWN_FIELD]) assert.equal(FIELDS[fold as keyof typeof FIELDS].kind, 'boolean', fold)
})

test('folded, every row but the Bookmarks fold is hidden, the keys fold among them', () => {
  for (const field of Object.keys(FIELDS)) assert.equal(rowHidden(field, values()), field !== SETTINGS_SHOWN_FIELD, field)
})

test('unfolded, every setting shows and the key rows stay behind their own fold', () => {
  const open = values({ [SETTINGS_SHOWN_FIELD]: true })
  assert.equal(rowHidden('rowLines', open), false)
  assert.equal(rowHidden('band', open), false)
  assert.equal(rowHidden('keysShown', open), false)
  assert.equal(rowHidden('keyMark', open), true)
  assert.equal(rowHidden('keyLeader', open), true)
  const both = values({ [SETTINGS_SHOWN_FIELD]: true, keysShown: true })
  assert.equal(rowHidden('keyMark', both), false)
  assert.equal(rowHidden('keyLeader', both), false)
})

test('the keys fold alone does not show the key rows while the Bookmarks fold is closed', () => {
  assert.equal(rowHidden('keyMark', values({ keysShown: true })), true)
})

test('the debug rows sit together at the end behind their own fold, each titled "Debug:"', () => {
  const names = Object.keys(FIELDS)
  assert.deepEqual(names.slice(-4), [DEBUG_SHOWN_FIELD, ...DEBUG_ROWS])
  for (const row of DEBUG_ROWS) assert.match(FIELDS[row as keyof typeof FIELDS].title, /^Debug: /, row)
  const open = values({ [SETTINGS_SHOWN_FIELD]: true })
  assert.equal(rowHidden(DEBUG_SHOWN_FIELD, open), false)
  for (const row of DEBUG_ROWS) assert.equal(rowHidden(row, open), true, row)
  for (const row of DEBUG_ROWS) assert.equal(rowHidden(row, values({ [SETTINGS_SHOWN_FIELD]: true, [DEBUG_SHOWN_FIELD]: true })), false, row)
})

test('a fold row leads with ▸ while closed and ▾ while open; any other row keeps its label', () => {
  assert.equal(foldLabel(SETTINGS_SHOWN_FIELD, `${FOLD_CLOSED} Bookmarks`, values()), `${FOLD_CLOSED} Bookmarks`)
  assert.equal(foldLabel(SETTINGS_SHOWN_FIELD, `${FOLD_CLOSED} Bookmarks`, values({ [SETTINGS_SHOWN_FIELD]: true })), `${FOLD_OPEN} Bookmarks`)
  assert.equal(foldLabel('keysShown', 'Keys: show the key rows', values({ keysShown: true })), `${FOLD_OPEN} Keys: show the key rows`)
  assert.equal(foldLabel('rowLines', 'Lines per row in the lists', values()), 'Lines per row in the lists')
})
