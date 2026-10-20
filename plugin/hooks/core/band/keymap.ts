// The keymap: the person's own keys over the key table (#36, "as versatile as .vimrc";
// the keys design, 2026-10-20, unit 2). Pure: no engine imports, no state. A keymap is
// read from wherever it is kept (unit 3 decides: /config rows, or a file) as one value
// per command, parsed here, and applied to the default tables to make the pair every
// reader of core/band/keys.ts takes. Nothing it cannot use is silently dropped: each
// problem is named, and the default stands for that command, so a bad keymap can never
// leave a command unreachable.
//
// A command's value: its keys separated by spaces, in the order the hint and the help
// name them; `Space` spells the space; `hidden` as the last word takes the command's
// button off the bar; an empty value is the default. Examples: `m`, `' j`, `Space r`,
// `P hidden`, `q hidden`. The list keys are one value, `list`, in the table's own order:
// `j k s h l c q` (the field-only keys, `/` and `*`, are not renamed here).
import { DEFAULT_TABLES, lineHint, type LineCommand, type ListKey, type Tables } from './keys.ts'

export { barHotkey } from './keys.ts'

/** One value per command id, plus `list` for the list keys. */
export type Keymap = { readonly [commandId: string]: string | undefined }

/** Why a value, or part of it, was not applied; the default stands for that command. */
export type Problem = { command: string; key?: string; reason: string }

export const LIST_ROW = 'list'
export const HIDDEN_WORD = 'hidden'
/** Words that spell a key the field cannot show as itself. */
export const KEY_WORDS: Readonly<Record<string, string>> = { Space: ' ', space: ' ' }
/** Names of keys the band never receives on a stock build (docs/engine-quirks.md). */
const UNUSABLE_NAMES = new Set(['Up', 'Down', 'Left', 'Right', 'Tab', 'Enter', 'Esc', 'Escape', 'Backspace'])

/** The rows as read, trimmed; empty values dropped. */
export function parseKeymap(rows: Readonly<Record<string, string | undefined>>): { keymap: Keymap; problems: Problem[] } {
  const keymap: Record<string, string> = {}
  for (const [command, value] of Object.entries(rows)) {
    const v = (value ?? '').trim()
    if (v) keymap[command] = v
  }
  return { keymap, problems: [] }
}

/** One word of a value as a key, or the reason it is not one. */
function keyOf(word: string): { key: string } | { reason: string } {
  const key = KEY_WORDS[word] ?? word
  if (UNUSABLE_NAMES.has(word)) return { reason: `${word} never reaches the band on a stock build` }
  if ([...key].length !== 1) return { reason: `"${word}" is not one key` }
  return { key }
}

/**
 * The tables a keymap makes from the defaults. A command the keymap names gets its keys
 * and its `shown`; a command it does not name keeps the default. Clashes are judged per
 * context (the command line; each list pane): a key two commands claim goes to the first
 * in table order and the second keeps its default, with the problem named. A key may be a
 * line key and a list key at once (`j` is jump on the line and next in a list).
 */
export function applyKeymap(keymap: Keymap, base: Tables = DEFAULT_TABLES): { tables: Tables; problems: Problem[] } {
  const problems: Problem[] = []
  const known = new Set<string>([...base.line.map(c => c.id), LIST_ROW])
  for (const command of Object.keys(keymap)) {
    if (!known.has(command)) problems.push({ command, reason: 'not a command of this version' })
  }

  // The command line. A command's own `route` may answer a hint naming the line's keys
  // (jump does, for a bad letter); it is rewritten to name the keymap's keys, so the hint
  // never shows a key the person changed away. `result` is assigned below, before any
  // route can run.
  let result: Tables = base
  const taken = new Map<string, string>()
  const line: LineCommand[] = base.line.map(c => {
    const value = keymap[c.id]
    let keys: string[] = [...c.keys]
    let shown = c.shown
    if (value !== undefined) {
      const words = value.split(/\s+/).filter(Boolean)
      shown = true
      if (words.at(-1) === HIDDEN_WORD) {
        shown = false
        words.pop()
      }
      const chosen: string[] = []
      for (const w of words) {
        const k = keyOf(w)
        if ('reason' in k) problems.push({ command: c.id, key: w, reason: k.reason })
        else if (!chosen.includes(k.key)) chosen.push(k.key)
      }
      if (chosen.length > 0) keys = chosen
      else if (words.length > 0) problems.push({ command: c.id, reason: 'no usable key; the default is kept' })
    }
    const kept = keys.filter(k => {
      const by = taken.get(k)
      if (by !== undefined && by !== c.id) {
        problems.push({ command: c.id, key: k, reason: `already ${by}` })
        return false
      }
      return true
    })
    const finalKeys = kept.length > 0 ? kept : [...c.keys].filter(k => !taken.has(k) || taken.get(k) === c.id)
    if (kept.length === 0 && finalKeys.length === 0) problems.push({ command: c.id, reason: 'every key is taken; the command has no key' })
    for (const k of finalKeys) taken.set(k, c.id)
    const route: LineCommand['route'] = next => {
      const r = c.route(next)
      return r.operation.op === 'hint' && r.operation.reason === lineHint(base) ? { ...r, operation: { op: 'hint', reason: lineHint(result) } } : r
    }
    return { ...c, keys: finalKeys, shown, route }
  })

  // The list keys, renamed by position in table order; the field-only keys stay.
  const listValue = keymap[LIST_ROW]
  const renamable = base.list.filter(l => !l.field)
  const names: (string | undefined)[] = []
  if (listValue !== undefined) {
    const words = listValue.split(/\s+/).filter(Boolean)
    if (words.length > renamable.length) problems.push({ command: LIST_ROW, reason: `${words.length} keys for ${renamable.length} list commands; the extra are ignored` })
    words.slice(0, renamable.length).forEach((w, i) => {
      const k = keyOf(w)
      if ('reason' in k) problems.push({ command: LIST_ROW, key: w, reason: k.reason })
      else if (/^[0-9]$/.test(k.key)) problems.push({ command: LIST_ROW, key: w, reason: 'a digit is a number in a list' })
      else names[i] = k.key
    })
  }
  let i = 0
  const listTaken = new Map<string, string>() // `${pane}:${key}` -> label; the field prefixes count as taken
  for (const f of base.list.filter(l => l.field)) for (const p of f.panes) listTaken.set(`${p}:${f.key}`, `the ${f.label} prefix`)
  const list: ListKey[] = base.list.map(l => {
    if (l.field) return l
    const wanted = names[i++]
    const key = wanted ?? l.key
    const clash = l.panes.find(p => listTaken.has(`${p}:${key}`))
    const finalKey = clash ? l.key : key
    if (clash) problems.push({ command: LIST_ROW, key, reason: `already ${listTaken.get(`${clash}:${key}`)} in the ${clash} list; ${l.label} keeps ${l.key}` })
    for (const p of l.panes) listTaken.set(`${p}:${finalKey}`, l.label)
    return finalKey === l.key ? l : { ...l, key: finalKey, button: l.button.replace(l.key, finalKey) }
  })

  result = { line, list }
  return { tables: result, problems }
}
