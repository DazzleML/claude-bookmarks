// Diagnostics as pure formatters (refactor-advisor 2026-10-12__15-06-26 row 2; the second
// move of the register.tsx split, Q261012-06): what the /bm-* diagnostic commands decide
// and say. register.tsx's handlers keep only the engine reads (the state, the selection,
// the environment) and the log calls.
import { firstFour, short } from '../kit/message-id.ts'

/** A keystroke for the keystroke log (/bm-diag-keys): modifiers, then `char` for a printable key or the key's own name; a paste or a burst carries no key. */
export function keyLabel(key: { ctrl?: boolean; meta?: boolean; shift?: boolean; key: string } | undefined): string {
  if (!key) return 'paste/burst'
  return `${key.ctrl ? 'ctrl+' : ''}${key.meta ? 'meta+' : ''}${key.shift ? 'shift+' : ''}${key.key.length === 1 ? 'char' : key.key}`
}

/** Who holds the keyboard around a key, to explain a pane kept or refused. Lengths only, never the draft's text. */
export function diagLine(when: string, draftChars: number, lastEditAt: number, now: number, busy: boolean, panes: readonly { id: string; isFocused?: boolean }[]): string {
  const since = lastEditAt ? `${now - lastEditAt} ms` : 'never'
  const open = panes.map(p => `${p.id}${p.isFocused ? '*' : ''}`).join(',') || 'none'
  return `[diag] ${when}: draft ${draftChars} chars, last edit ${since} ago, claude ${busy ? 'BUSY' : 'idle'}, panes ${open}`
}

/** `/bm-diag-keys on|off`, or a bare call that toggles. */
export function parseOnOff(arg: string, current: boolean): boolean {
  const a = arg.trim()
  return a === 'on' ? true : a === 'off' ? false : !current
}

/** One keystroke in the input box, while keystroke logging is on: the key, the draft's length before and the characters it added, and the time since the last edit. Lengths only, never the draft's text. */
export function editLine(key: string, draftChars: number, addedChars: number, lastEditAt: number, now: number): string {
  return `[diag] edit ${key}: draft ${draftChars} -> +${addedChars}, ${lastEditAt ? now - lastEditAt : '-'} ms since last`
}

/** One focus move in the band or a pane, and whether the engine refused it. */
export function focusLine(component: string, element: string | undefined, originKind: string, deny: unknown): string {
  const refused = deny ? ` DENY ${String(deny)}` : ''
  return `[diag] focus ${component} -> ${element ?? '(engine stop)'} by ${originKind}${refused}`
}

/** /bm-ids: a summary, one row per recent prompt saying how it was drawn (under its real uuid, under an id sharing the uuid's first four groups, under some id with the same text, or not seen), and the drawn ids no prompt owns. */
export type IdsReport = { summary: string; rows: string[]; strays: string[] }
export function idsReport(list: readonly { uuid: string; head: string }[], rendered: ReadonlyMap<string, string>, recent = 12, strayCap = 20): IdsReport {
  const appended = new Set(list.map(r => r.uuid))
  const matched = list.filter(r => rendered.has(r.uuid)).length
  const strays = [...rendered.keys()].filter(id => !appended.has(id))
  // How each appended prompt was drawn: under its real uuid, under an id sharing
  // the uuid's first four groups (zero-tailed), under some id with the same text,
  // or not seen at all.
  const ids = [...rendered.keys()]
  const drawnAs = (r: { uuid: string; head: string }) => {
    if (rendered.has(r.uuid)) return 'exact'
    if (ids.some(id => id !== r.uuid && firstFour(id) === firstFour(r.uuid))) return 'pfx  '
    if (ids.some(id => rendered.get(id) === r.head)) return 'text '
    return '-----'
  }
  const tail = list.slice(-recent)
  return {
    summary:
      `[bm] ids: ${matched} of ${list.length} appended prompt uuids were seen as ` +
      `UserMessage requestIds; ${rendered.size} UserMessage ids drawn since load; ` +
      `${strays.length} drawn ids not among appended prompts`,
    rows: tail.map((r, i) => `[bm]  #${list.length - tail.length + i + 1} ${short(r.uuid)} ${drawnAs(r)} ${r.head}`),
    strays: strays.slice(0, strayCap).map(id => `[bm]  drawn, not appended: ${id} ${rendered.get(id)}`),
  }
}

/** /bm-jump's argument: nothing or `last`, `first`, a prompt number, `r<N>` for a reply, or a uuid prefix of a captured row. A full uuid nobody captured is tried raw (an id known only from the transcript file; Claude Code may refuse one never drawn). */
export type JumpTarget = { kind: 'row'; uuid: string; label: string } | { kind: 'raw'; uuid: string } | { kind: 'none'; prompts: number }
export function jumpTarget(arg: string, rows: readonly { uuid: string; door: 'prompt' | 'response' }[]): JumpTarget {
  const prompts = rows.filter(r => r.door === 'prompt')
  const found = (row: { uuid: string } | undefined, label: string): JumpTarget | undefined => (row ? { kind: 'row', uuid: row.uuid, label } : undefined)
  let target: JumpTarget | undefined
  if (arg === '' || arg === 'last') target = found(prompts.at(-1), 'last prompt')
  else if (arg === 'first') target = found(prompts[0], 'first prompt')
  else if (/^\d+$/.test(arg)) target = found(prompts[Number(arg) - 1], `prompt #${arg}`)
  else if (/^r\d+$/.test(arg)) target = found(rows.filter(r => r.door === 'response')[Number(arg.slice(1)) - 1], `reply #${arg.slice(1)}`)
  else target = found(rows.find(r => r.uuid.startsWith(arg)), arg)
  if (target) return target
  // Not a captured row: try the raw id anyway, for an id known only from the
  // transcript file (paste a uuid from jq); Claude Code may refuse one never drawn.
  if (/^[0-9a-f-]{36}$/.test(arg)) return { kind: 'raw', uuid: arg }
  return { kind: 'none', prompts: prompts.length }
}

/** /bm-sel: what the selection's row id is to the plugin. */
export function selectionKind(id: string | undefined, savedDoor: string | undefined, drawn: boolean): string {
  if (!id) return 'no row (spans rows / outside transcript)'
  if (savedDoor) return `saved ${savedDoor} row`
  if (drawn) return 'drawn id only (not a saved uuid)'
  return 'unknown id (maybe a tool_use_id or a reply)'
}

/** /bm-debug's words: the channels (list, enable, disable), this conversation's echo (on, off, reset), the machine's policy (default or force, on or off), else status. */
export type DebugOp =
  | { kind: 'channels'; action: 'channels' | 'enable' | 'disable'; rest: string }
  | { kind: 'echo'; choice: boolean | undefined }
  | { kind: 'policy'; policy: { default: boolean; forced: boolean } }
  | { kind: 'status' }
export const DEBUG_USAGE = '/bm-debug on|off|reset (this conversation) | default on|off (every conversation without a choice) | force on|off (every conversation, no choice) | channels | enable|disable <channel,...> | status'
export function parseDebugArgs(args: string): DebugOp {
  const trimmed = args.trim()
  const [a, b] = trimmed.toLowerCase().split(/\s+/)
  if (a === 'channels' || a === 'enable' || a === 'disable') return { kind: 'channels', action: a, rest: trimmed.slice(a.length) }
  if (a === 'on' || a === 'off' || a === 'reset') return { kind: 'echo', choice: a === 'reset' ? undefined : a === 'on' }
  if ((a === 'default' || a === 'force') && (b === 'on' || b === 'off')) return { kind: 'policy', policy: { default: b === 'on', forced: a === 'force' } }
  return { kind: 'status' }
}

/** /bm-config: each setting, its value and where it came from (`machine` is said as `/config`). */
export function settingsRows(values: Record<string, unknown>, sources: Record<string, string>): string[] {
  return Object.keys(values).map(k => `${k}=${JSON.stringify(values[k])} (${sources[k] === 'machine' ? '/config' : sources[k]})`)
}
export function configListedLine(listed: readonly string[], total: number): string {
  return `[bm] /config lists ${listed.length} of this plugin's ${total} fields${listed.length ? ` (${listed.join(', ')})` : ''}`
}
export function notAppliedLine(rejected: readonly string[], unknown: readonly string[]): string | undefined {
  if (!rejected.length && !unknown.length) return undefined
  return `[bm] settings not applied: ${[...rejected.map(x => `${x} (does not fit)`), ...unknown.map(x => `${x} (no such setting)`)].join('; ')}`
}

/** /bm-env: dcc-patcher's build signal (its H patch README, "For plugin authors"): DCC_PATCH_H is set by the history patch itself; DCC_PATCHES and DCC_PATCHER by its launcher. Stock started by that launcher has none of them. */
export function dccLine(version: string | undefined, patchH: string | undefined, patches: string | undefined, echoState: string): string {
  return `[bm] dcc-patcher: ${version ? `v${version}` : 'none seen'}; DCC_PATCH_H=${patchH ?? '(unset)'}; DCC_PATCHES=${patches ?? '(unset)'}; log echo ${echoState}`
}
