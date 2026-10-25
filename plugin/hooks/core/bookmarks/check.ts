// `/bm-check`, a diagnostic linter over the data root (unit 11 of the record-format goal;
// the data design's point 8, and djdarcy 2026-10-16 ~10:25: a check command "as a kind of
// linter to detect problems with migrations", while the migrations themselves run at a
// session's start without anyone asking). It reports and never repairs: every line that
// finds something says what the next start or save will do about it, or what a person can.
//
// Pure: the handler (handlers/bookmarks.ts checkCommand) lists the folders, reads the files,
// hashes the run folders' copies and hands everything here as `CheckInput`.

import { parseIndex } from './session-index.ts'
import { parseRegister } from './register-file.ts'
import type { Manifest } from './migrations.ts'

export type Level = 'ok' | 'note' | 'warn'
export type Line = { level: Level; text: string }

export type CheckInput = {
  /** This build's register version (migrations.ts CURRENT). */
  current: number
  /** The data root, for the report's first line. */
  root: string
  /** Every `<name>.json` under `sessions/` except the index: its name (without `.json`) and text. */
  registers: { name: string; text: string }[]
  /** Every folder under `sessions/` (a conversation's notes live in `<sid>/`). */
  folders: string[]
  /** `sessions/index.json`'s text when it exists. */
  index?: string
  /** Every run folder under `backups/`: its manifest's text and, per file the manifest names, the hash of the copy as it is now (undefined: the copy is missing). */
  runs: { name: string; manifest?: string; hashes: Record<string, string | undefined> }[]
  /** The snapshot folders under `backups/`. */
  snapshots: string[]
  /** The store's keys, and the store's size in characters of JSON against the engine's cap. */
  storeKeys: string[]
  storeChars: number
  storeCap: number
  /** The store key prefixes the migrations move out of the store (`pins:`, `marks:`). */
  storePrefixes: readonly string[]
}

/** The engine's store cap: 4 MiB of JSON text in all (docs/engine-quirks.md). */
export const STORE_CAP = 4 * 1024 * 1024
/** The share of the cap at which the report warns. */
export const STORE_WARN_SHARE = 0.75

export function checkReport(i: CheckInput): Line[] {
  const out: Line[] = []
  const say = (level: Level, text: string) => out.push({ level, text })

  // Registers, by version against this build.
  const parsed = i.registers.map(r => ({ ...r, reg: parseRegister(r.text) }))
  const bad = parsed.filter(r => !r.reg)
  const regs = parsed.filter(r => r.reg).map(r => ({ name: r.name, reg: r.reg! }))
  const atCurrent = regs.filter(r => r.reg.version === i.current)
  const older = regs.filter(r => r.reg.version < i.current)
  const newer = regs.filter(r => r.reg.version > i.current)
  say('ok', `data root ${i.root}: ${i.registers.length} register file(s) under bookmarks/sessions; ${atCurrent.length} at v${i.current} (this build's)`)
  for (const r of older) say('warn', `${r.name}.json is v${r.reg.version}, older than this build: it migrates at the next start (its original goes to a run folder under bookmarks/backups)`)
  for (const r of newer) say('warn', `${r.name}.json is v${r.reg.version}, newer than this build: read-only here; update the plugin to write it`)
  for (const r of bad) say('warn', `${r.name}.json is not a register file: left as it is at every start (a .bak beside it is read instead when one parses)`)

  // Conversations whose register names a different session, and note folders with no register.
  for (const r of regs) if (r.reg.sessionId !== r.name) say('warn', `${r.name}.json says its session is ${r.reg.sessionId}: a copy under another name; its records belong to the file named for them`)
  const names = new Set(regs.map(r => r.name))
  for (const f of i.folders) if (!names.has(f)) say('warn', `bookmarks/sessions/${f}/ holds notes but has no ${f}.json: the notes are orphans until a register exists; a bookmark minted in that conversation makes one`)

  // The index against the registers with bookmarks.
  const withBookmarks = regs.filter(r => r.reg.perma.some(p => (p.tier ?? 'bookmark') !== 'mark')).length
  if (i.index === undefined) say('note', `bookmarks/sessions/index.json is missing: written at the next save or start`)
  else {
    const idx = parseIndex(i.index)
    if (!idx) say('warn', `bookmarks/sessions/index.json does not parse: rebuilt at the next start`)
    else if (idx.sessions.length !== withBookmarks) say('note', `index.json lists ${idx.sessions.length} conversation(s) but ${withBookmarks} register(s) have bookmarks: stale; rebuilt at the next start`)
    else say('ok', `index.json lists ${idx.sessions.length} conversation(s) with bookmarks, matching the registers`)
  }

  // Backups: run folders with their manifests and hashes, and the snapshots.
  let intact = 0
  for (const run of i.runs) {
    if (run.manifest === undefined) {
      say('warn', `backups/${run.name}/ has no manifest.json: not a run this plugin finished starting; look inside before trusting it`)
      continue
    }
    let m: Manifest | undefined
    try {
      m = JSON.parse(run.manifest) as Manifest
    } catch {
      m = undefined
    }
    if (!m || m.kind !== 'migration' || !Array.isArray(m.files)) {
      say('warn', `backups/${run.name}/manifest.json is not a migration manifest`)
      continue
    }
    let ok = true
    if (m.status !== 'done') {
      ok = false
      say('warn', `backups/${run.name}/: the migration v${m.from} -> v${m.to} stopped at "${m.status}"; the original${m.status === 'backed-up' ? ' is in the folder and' : ' may be incomplete there;'} the live file ${m.status === 'backed-up' ? 'may be half-written -- compare them, and a restored original migrates again at the next start' : 'was not touched'}`)
    }
    for (const f of m.files) {
      const actual = run.hashes[f.path]
      if (actual === undefined) {
        ok = false
        say('warn', `backups/${run.name}/${f.path} is missing though the manifest lists it`)
      } else if (actual !== f.hash) {
        ok = false
        say('warn', `backups/${run.name}/${f.path} differs from its manifest hash (${f.algo}): the copy was changed after it was taken`)
      }
    }
    if (ok) intact++
  }
  say(i.runs.length === intact ? 'ok' : 'note', `backups: ${i.runs.length} migration run(s), ${intact} done and intact; ${i.snapshots.length} snapshot(s)${i.snapshots.length === 0 && i.runs.length > 0 ? ' -- none, though migrations ran: the one interim copy was expected first' : ''}`)

  // The store: ours against the cap, and marks or pins left in it with no register to move into.
  const share = i.storeCap > 0 ? i.storeChars / i.storeCap : 0
  say(share >= STORE_WARN_SHARE ? 'warn' : 'ok', `store: ${i.storeKeys.length} key(s), ${kib(i.storeChars)} of the ${kib(i.storeCap)} cap (${Math.round(share * 100)}%)${share >= STORE_WARN_SHARE ? ' -- near the cap, past which every write is refused; the prune at a start trims what it can' : ''}`)
  const orphans = new Set<string>()
  for (const k of i.storeKeys) {
    const p = i.storePrefixes.find(p => k.startsWith(p))
    if (!p) continue
    const sid = k.slice(p.length)
    if (sid && !names.has(sid)) orphans.add(sid)
  }
  for (const sid of [...orphans].sort()) say('note', `store holds marks or pins for ${sid.slice(0, 8)} with no register: a register is made for it at the next start`)

  // A letter's record (tier `mark`) that no letter names: an orphan a mark forgotten outright
  // on another copy can leave in this one, or a hand edit. A union drops such a record when
  // it arrives from the other copy (register-ops.ts); one already in a file stays until
  // someone decides, and this only reports it (the keys design, unit 5).
  for (const r of regs) {
    const named = new Set<number>()
    for (const letters of Object.values(r.reg.slots ?? {})) for (const s of Object.values(letters ?? {})) for (const h of s.history) named.add(h.n)
    const unnamed = r.reg.perma.filter(p => (p.tier ?? 'bookmark') === 'mark' && p.n !== undefined && !named.has(p.n))
    if (unnamed.length > 0) say('note', `${r.name}.json holds ${unnamed.length} letter record(s) no letter names (#${unnamed.map(p => p.n).join(', #')}): orphans a forgotten mark can leave on another copy; nothing points at them, and nothing is changed`)
  }

  const warnings = out.filter(l => l.level === 'warn').length
  say(warnings > 0 ? 'warn' : 'ok', warnings > 0 ? `bm-check: ${warnings} warning(s); nothing was changed` : 'bm-check: nothing to report; nothing was changed')
  return out
}

const kib = (chars: number) => (chars >= 1024 * 1024 ? `${(chars / (1024 * 1024)).toFixed(1)} MiB` : `${Math.round(chars / 1024)} KiB`)

/** A line as the log draws it. */
export const drawLine = (l: Line): string => `[bm] ${l.level === 'warn' ? 'WARN ' : l.level === 'note' ? 'note ' : ''}${l.text}`
