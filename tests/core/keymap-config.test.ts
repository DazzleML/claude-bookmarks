// The keymap's /config rows (the keys design, 2026-10-20, unit 3; the fold look of
// 2026-10-24 chose rows behind a fold): which row is which command, what a row change is
// refused for, and the leader's chord as the person bound it in keybindings.json.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KEY_FIELDS, KEYS_SHOWN_FIELD, LEADER_FIELD, LIST_FIELD, isKeyRow, keymapOf, leaderChord, rowDenial } from '../../plugin/hooks/core/band/keymap.ts'
import { LINE_COMMANDS } from '../../plugin/hooks/core/band/keys.ts'
import { DEFAULTS, FIELDS, manifestUserConfig } from '../../plugin/hooks/core/settings.ts'

test('one row per band command, one for the list keys, the fold and the leader, all in the settings', () => {
  assert.deepEqual(Object.keys(KEY_FIELDS), LINE_COMMANDS.map(c => c.id))
  for (const field of [...Object.values(KEY_FIELDS), LIST_FIELD, LEADER_FIELD]) {
    assert.equal(field in FIELDS, true, field)
    assert.equal((DEFAULTS as Record<string, unknown>)[field], '', `${field} defaults to empty: the table's own keys`)
  }
  assert.equal((DEFAULTS as Record<string, unknown>)[KEYS_SHOWN_FIELD], false, 'the rows start folded away')
  assert.equal(manifestUserConfig()[KEY_FIELDS.mark!]!.type, 'string')
})

test('which rows the fold hides: the key rows, never the fold itself', () => {
  assert.equal(isKeyRow(KEY_FIELDS.mark!), true)
  assert.equal(isKeyRow(LIST_FIELD), true)
  assert.equal(isKeyRow(LEADER_FIELD), true)
  assert.equal(isKeyRow(KEYS_SHOWN_FIELD), false)
  assert.equal(isKeyRow('rowLines'), false)
})

test('the keymap is read from the rows: a command row by its id, the list row as `list`, empty rows left out', () => {
  assert.deepEqual(keymapOf({ [KEY_FIELDS.mark!]: 'x', [KEY_FIELDS.jump!]: '', [LIST_FIELD]: 'n p', rowLines: 2 }), { mark: 'x', list: 'n p' })
  assert.deepEqual(keymapOf({}), {})
})

test('a row change is refused only for what it adds: a clash, an unusable key, no usable key', () => {
  const values = { [KEY_FIELDS.mark!]: '', [KEY_FIELDS.jump!]: '' }
  assert.equal(rowDenial(KEY_FIELDS.mark!, 'x', values), undefined, 'a free key is taken')
  assert.equal(rowDenial(KEY_FIELDS.mark!, 'm hidden', values), undefined, 'hiding the button is no problem')
  assert.equal(rowDenial(KEY_FIELDS.mark!, '', values), undefined, 'empty restores the default')
  assert.match(rowDenial(KEY_FIELDS.mark!, 'j', values) ?? '', /already mark|already jump/, 'j is jump\'s key')
  assert.match(rowDenial(KEY_FIELDS.mark!, 'Up', values) ?? '', /never reaches the band/)
  assert.match(rowDenial(KEY_FIELDS.mark!, 'xy', values) ?? '', /not one key/)
  assert.match(rowDenial(LIST_FIELD, 'j 5', values) ?? '', /digit/)
  // A problem the keymap already had is not this change's to answer for.
  const already = { [KEY_FIELDS.mark!]: 'j' }
  assert.equal(rowDenial(KEY_FIELDS.read!, 'r', already), undefined)
})

test('the leader row is never set here: the refusal says where the leader is bound', () => {
  assert.match(rowDenial(LEADER_FIELD, 'ctrl+k', {}) ?? '', /keybindings\.json/)
  assert.match(rowDenial(LEADER_FIELD, 'ctrl+k', {}) ?? '', /abovePrompt:focus/)
})

test('the leader chord is read from keybindings.json as the person bound it', () => {
  const json = JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'ctrl+]': 'abovePrompt:focus', 'ctrl+x d': 'command:bm-diag-keys' } }] })
  assert.equal(leaderChord(json), 'ctrl+]')
  assert.equal(leaderChord(JSON.stringify({ bindings: [] })), undefined)
  assert.equal(leaderChord('not json'), undefined)
  assert.equal(leaderChord(undefined), undefined)
})
