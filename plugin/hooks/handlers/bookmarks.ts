// The bookmarks cluster (moved whole out of register.tsx under /move-code, 0.4.64, comments
// as they were; `ports.x()` where the code called `$`, read register.tsx's state, or called
// another cluster): the register's I/O, minting and exports, prose anchors, the anchor
// press, a bookmark's arrival and highlight, promoting a mark, and the model's tool.
// The register cache and the prose queue are owned here.

import {
  anchorHref, anchorMarkdown, anchorPath, markdownLinks, ownerOf, parseAnchor, placeOfRecord, tierOf,
  type AnchorOwner, type AnchorRecord, type PlaceOf,
} from '../core/bookmarks/anchor.ts'
import {
  emptyRegister, exportMarkdown, exportNotesOf, findRecord, idOf, listOf, newerThanBuild, parseFrontMatter, parseRegister, prune, recordById, recordsOn, REGISTER_VERSION, serializeRegister,
  type Mint, type Register as BookmarkRegister, type Retention,
} from '../core/bookmarks/register-file.ts'
import { baseOf, ingest, primaryRecord, sameBase } from '../core/bookmarks/note.ts'
import { isOn, pinnedPlaces, type Pin, type PinPlace, type PinScope } from '../core/bookmarks/pins.ts'
import { SEARCH_LIST } from '../core/search/results.ts'
import { buildIndex, emptyIndex, entryOf, INDEX_JSON, INDEX_MD, parseIndex, renderIndexMarkdown, serializeIndex, upsert, type IndexEntry } from '../core/bookmarks/session-index.ts'
import { applyOp, marksOf as marksFromRegister, type Op, type OpResult } from '../core/bookmarks/register-ops.ts'
import {
  applyMigrations, CURRENT, fnv1a64, hashText, planFor, runFolderName, SNAPSHOT_SUFFIX, snapshotFolderName, STORE_PREFIXES,
  type Manifest, type Migration,
} from '../core/bookmarks/migrations.ts'
import { checkReport, drawLine, STORE_CAP, type CheckInput } from '../core/bookmarks/check.ts'
import { dataReadme, README_TEMPLATE, readmeNeedsWrite } from '../core/bookmarks/data-readme.ts'
import { isMarkLetter, type Mark, type Marks } from '../core/marks/marks.ts'
import { rowPlace } from '../core/bookmarks/transcript-lines.ts'
import { forwardSlashes } from '../core/kit/paths.ts'
import { short } from '../core/kit/message-id.ts'
import { answer as toolAnswer, brief as briefRow, describe as describeRecord, listActedOn, listName, parseToolInput, tierFor } from '../core/bookmarks/bookmark-tool.ts'
import type { BookmarksPorts } from '../engine/ports.ts'
import { parseRef } from '../core/bookmarks/ref.ts'
import { cachedRegisters, resolveRef, type RefPorts, type RegisterView, type Resolution } from '../core/bookmarks/ref-resolve.ts'
import { expandRefs } from '../core/bookmarks/ref-expand.ts'

// --- Bookmark anchors (anchors DWP 2026-10-09) -----------------------------------------
// The URL format, its parser and the link finder live in hooks/core/bookmarks/anchor.ts (pure, with
// tests under `node --test`). This file holds what needs the engine: the press, the jump,
// the highlight, the tool and the register's I/O. (Written in register.tsx; since 0.4.64
// this file reaches the engine through BookmarksPorts, engine/ports.ts, and register.tsx
// keeps the tool.call hook and the render hooks that draw anchors.)

// The transient mark an anchor press shows: the words the anchor names, highlighted on
// the target row like a letter's selection, under a key no letter can take. Display
// only; never written to the store (djdarcy, 2026-10-09: "highlighted yellow like how we
// handle a mark when we do <leader>'<mark-key>").
const ANCHOR_MARK = '@'

// --- The register: <dataRoot>/bookmarks/sessions/<sessionId>.json, and one export per
// bookmark beside it. The file is the source of truth (#6); this cache is a copy of what
// was last read or written. `.bak` is written before the file, since `$.fs.write` (ports.fsWrite) is not
// atomic; a main file that fails to parse falls back to it.
// Held for the conversation it was read or written in (`session`): the process outlives a
// conversation (/clear, /resume), and an unkeyed cache handed the next conversation the
// register of the one before (0.4.65; tool.test.ts, "a new conversation reads its own").
// `text` is the main file's text as last read or written, whatever it was: `commitOp`
// compares the disk against it to know whether another writer (or a hand) got there first.
/** `readOnly`: a file below this build's version that could not be migrated at load; it is shown, never written. */
let registerCache: { session: string; register: BookmarkRegister; text?: string; readOnly?: boolean } | undefined

async function registerPath(ports: BookmarksPorts): Promise<string | undefined> {
  const root = await ports.dataRoot()
  return root ? `${root}/bookmarks/sessions/${await ports.sessionId()}.json` : undefined
}

export async function loadRegister(ports: BookmarksPorts): Promise<BookmarkRegister> {
  const session = await ports.sessionId()
  if (registerCache?.session === session) return registerCache.register
  const path = await registerPath(ports)
  let reg: BookmarkRegister | undefined
  let text: string | undefined
  if (path) {
    for (const p of [path, `${path}.bak`]) {
      if (!(await ports.fsExists(p))) continue
      const t = await ports.fsRead(p)
      if (p === path) text = t
      reg = parseRegister(t)
      if (reg) {
        if (p !== path) ports.log(`[bm] register: ${path} unreadable; loaded its .bak (rev ${reg.rev})`)
        break
      }
      ports.log(`[bm] register: ${p} is not a register file`)
    }
  }
  if (!reg) {
    const configDir = await ports.configDir()
    reg = emptyRegister(await ports.sessionId(), `${ports.pluginName} ${await ports.pluginVersion()}`, await ports.now(), {
      ...(configDir ? { configDir } : {}),
      cwd: forwardSlashes(await ports.cwd()),
    })
  } else if (newerThanBuild(reg)) {
    // The guard (0.5.1): a file from a build ahead of this one is read and shown, never
    // written -- a save here would drop what the newer build knows. Said once per load.
    ports.logAlways(`[bm] register: ${path} is version ${reg.version} (written by ${reg.writer}); this build reads version ${REGISTER_VERSION} and will not write it`)
    ports.toast(`bookmarks: this conversation's bookmark file was written by a newer build (format v${reg.version}); it is read-only here until the plugin is updated`, 8000)
  } else if (reg.version < CURRENT) {
    // Migrate on load (the pins-by-name design, 2026-10-26): a file below this build's version
    // is brought up to date, with its backups, before anything uses it, so no old shape is
    // ever read or written by a current build, whether this session started on the build or
    // got it by a reload. Only a file read from its own path: one loaded from its .bak (the
    // file itself torn) is not migrated, since the run would copy the torn text over the .bak.
    const fromMain = text !== undefined && parseRegister(text) !== undefined
    const migrated = fromMain ? await migrateOnLoad(ports, session, reg, text!) : undefined
    if (migrated) return migrated
    ports.logAlways(`[bm] register: ${path} is version ${reg.version} and was not migrated${fromMain ? '' : ' (it was read from its .bak)'}; it is read-only until the next start`)
    ports.toast(`bookmarks: this conversation's bookmark file could not be brought up to date; it is read-only for now (see /bm-check)`, 8000)
    registerCache = { session, register: reg, ...(text !== undefined ? { text } : {}), readOnly: true }
    return reg
  }
  registerCache = { session, register: reg, ...(text !== undefined ? { text } : {}) }
  return reg
}

/**
 * Migrates the session's own file at load, the way a session start does (the one-time
 * snapshot first, then `migrateOne`'s run folder, manifest and .bak). Returns the migrated
 * register, or undefined when there is no path to the current version or the run threw; the
 * caller then holds the file read-only.
 */
async function migrateOnLoad(ports: BookmarksPorts, session: string, reg: BookmarkRegister, text: string): Promise<BookmarkRegister | undefined> {
  const root = await ports.dataRoot()
  if (!root) return undefined
  const steps = planFor(reg.version)
  if (steps.length === 0) return undefined
  try {
    if (!(await hasSnapshot(ports, root))) await takeSnapshot(ports, root)
    await migrateOne(ports, root, session, reg, text, steps)
    ports.logAlways(`[bm] migrate: ${session.slice(0, 8)} brought to version ${CURRENT} on load; the original is under ${backupsDir(root)}`)
    return registerCache?.session === session ? registerCache.register : undefined
  } catch (err) {
    ports.logAlways(`[bm] migrate on load failed for ${session.slice(0, 8)}: ${String(err)}`)
    return undefined
  }
}

/** What the tool and the band say when a save was refused by the version guard. */
const READ_ONLY_NOTE = 'not saved: this conversation\'s bookmark file was written by a newer build of the plugin and is read-only here; update the plugin'

/** What a save says when the file is older than this build and its migration on load did not run. */
const NOT_MIGRATED_NOTE = 'not saved: this conversation\'s bookmark file is from an older build and could not be brought up to date; it is read-only until the next start (see /bm-check)'

/** The header fields refreshed on every save so a file is findable without renaming it (unit 6): the conversation's title and the project folder's name. */
async function headerFields(ports: BookmarksPorts): Promise<{ title?: string; project?: string }> {
  const title = await ports.title()
  const cwd = forwardSlashes(await ports.cwd()).replace(/\/+$/, '')
  const project = cwd.slice(cwd.lastIndexOf('/') + 1) || undefined
  return { ...(title ? { title } : {}), ...(project ? { project } : {}) }
}

/**
 * Commit by operation (the data design, 2026-10-16): applies `op` to the register this
 * session holds, then writes -- unless the file on disk is no longer the text last seen,
 * in which case the operation is applied again to the disk's version and that is what is
 * written, so another window's or a hand's changes are kept. An operation that cannot be
 * applied to the disk's version (its record is gone) is reported, never resolved silently.
 *
 * The write itself: `.bak` from the previous file only when that file parses (a torn
 * write never becomes the only backup); refused with a toast when the file is from a newer
 * build (`newerThanBuild`), so the caller reports "not saved" and hands out no link.
 * `saved: false` without an error means there is no data root to write to; the change is
 * held in memory for the conversation.
 */
export async function commitOp(ports: BookmarksPorts, op: Op, opts?: { bookkeeping?: boolean }): Promise<OpResult & { saved?: boolean; replayed?: boolean }> {
  const reg = await loadRegister(ports)
  const now = await ports.now()
  const session = await ports.sessionId()
  let applied = applyOp(reg, op, now)
  if ('error' in applied) return applied
  if (applied.unchanged) return { ...applied, saved: false }
  const path = await registerPath(ports)
  if (!path) {
    registerCache = { session, register: applied.register }
    return { ...applied, saved: false }
  }
  if (newerThanBuild(reg)) {
    ports.logAlways(`[bm] register: not saved -- ${path} is version ${reg.version}, ahead of this build's ${REGISTER_VERSION}`)
    ports.toast(`bookmarks: not saved -- the bookmark file is from a newer build (format v${reg.version}); update the plugin`, 8000)
    return { error: READ_ONLY_NOTE }
  }
  if (registerCache?.session === session && registerCache.readOnly) {
    ports.logAlways(`[bm] register: not saved -- ${path} is version ${reg.version} and could not be migrated on load`)
    return { error: NOT_MIGRATED_NOTE }
  }
  let replayed = false
  if (await ports.fsExists(path)) {
    const disk = await ports.fsRead(path)
    const onDisk = parseRegister(disk)
    if (disk !== registerCache?.text && onDisk) {
      // Someone else wrote since this session read: their file is the base, this operation is applied to it.
      if (newerThanBuild(onDisk)) {
        ports.logAlways(`[bm] register: not saved -- ${path} is now version ${onDisk.version}, ahead of this build's ${REGISTER_VERSION}`)
        ports.toast(`bookmarks: not saved -- the bookmark file is from a newer build (format v${onDisk.version}); update the plugin`, 8000)
        registerCache = { session, register: onDisk, text: disk }
        return { error: READ_ONLY_NOTE }
      }
      const again = applyOp(onDisk, op, now)
      if ('error' in again) {
        ports.logAlways(`[bm] register: ${path} changed on disk (rev ${reg.rev} -> ${onDisk.rev}) and the operation no longer applies: ${again.error}`)
        registerCache = { session, register: onDisk, text: disk }
        return { error: `${again.error} (the bookmark file changed since this session read it; nothing was written)` }
      }
      ports.log(`[bm] register: ${path} changed on disk (rev ${reg.rev} -> ${onDisk.rev}); the operation was applied to the disk's version`)
      applied = again
      replayed = true
    }
    // `.bak` is the file before the person's (or Claude's) last action. A bookkeeping write
    // (the note's base, unit 9) follows an action and is not one, so it leaves `.bak` alone.
    if (opts?.bookkeeping) { /* kept as it was */ }
    else if (onDisk) await ports.fsWrite(`${path}.bak`, disk)
    else ports.log(`[bm] register: ${path} does not parse; .bak kept as it was`)
  }
  if (applied.unchanged) {
    registerCache = { session, register: applied.register, text: registerCache?.text }
    return { ...applied, saved: false, replayed }
  }
  ports.expectRedraw('a bookmark saved')
  const register = { ...applied.register, writer: `${ports.pluginName} ${await ports.pluginVersion()}`, ...(await headerFields(ports)) }
  const text = serializeRegister(register)
  await ports.fsWrite(path, text)
  registerCache = { session, register, text }
  await refreshIndex(ports, register)
  return { ...applied, register, saved: true, replayed }
}

// --- The index of every conversation with bookmarks (unit 10) -----------------------------
// `sessions/index.json` and `sessions/INDEX.md` (core/bookmarks/session-index.ts): the
// conversation's entry is upserted after every save, and the whole index is rebuilt from
// every register at a session's start. Neither may fail a save: an index that cannot be
// written is logged and the next save or start writes it again.

/** The uuid8 of every note in a conversation's folder, so the index links only what opens. */
async function notesOf(ports: BookmarksPorts, root: string, sid: string): Promise<Set<string>> {
  const dir = `${sessionsDir(root)}/${sid}`
  if (!(await ports.fsExists(dir))) return new Set()
  return new Set((await ports.fsList(dir)).filter(e => e.kind === 'file' && e.name.endsWith('.md')).map(e => e.name.slice(0, -'.md'.length)))
}

async function writeIndex(ports: BookmarksPorts, root: string, index: ReturnType<typeof emptyIndex>) {
  await ports.fsWrite(`${sessionsDir(root)}/${INDEX_JSON}`, serializeIndex(index))
  await ports.fsWrite(`${sessionsDir(root)}/${INDEX_MD}`, renderIndexMarkdown(index))
}

async function refreshIndex(ports: BookmarksPorts, register: BookmarkRegister): Promise<void> {
  try {
    const root = await ports.dataRoot()
    if (!root) return
    const path = `${sessionsDir(root)}/${INDEX_JSON}`
    const writer = `${ports.pluginName} ${await ports.pluginVersion()}`
    const now = await ports.now()
    const current = ((await ports.fsExists(path)) ? parseIndex(await ports.fsRead(path)) : undefined) ?? emptyIndex(writer, now)
    const entry = entryOf(register, await notesOf(ports, root, register.sessionId))
    await writeIndex(ports, root, upsert(current, entry, writer, now))
  } catch (err) {
    ports.logAlways(`[bm] index: not written: ${String(err)}`)
  }
}

/** The index built whole from every register under the data root (a session's start, after the migrations). */
export async function rebuildIndex(ports: BookmarksPorts): Promise<void> {
  try {
    const root = await ports.dataRoot()
    if (!root) return
    const dir = sessionsDir(root)
    if (!(await ports.fsExists(dir))) return
    const entries: IndexEntry[] = []
    for (const e of await ports.fsList(dir)) {
      if (e.kind !== 'file' || !e.name.endsWith('.json') || e.name === INDEX_JSON) continue
      const reg = parseRegister(await ports.fsRead(`${dir}/${e.name}`))
      if (reg) entries.push(entryOf(reg, await notesOf(ports, root, reg.sessionId)))
    }
    const writer = `${ports.pluginName} ${await ports.pluginVersion()}`
    const index = buildIndex(entries, writer, await ports.now())
    await writeIndex(ports, root, index)
    ports.log(`[bm] index: ${index.sessions.length} conversation(s) with bookmarks, ${dir}/${INDEX_MD}`)
  } catch (err) {
    ports.logAlways(`[bm] index: not rebuilt: ${String(err)}`)
  }
}

// --- The data folder's README (unit 12) --------------------------------------------------------
// `bookmarks/README.md` (core/bookmarks/data-readme.ts): written at a start when it is missing
// or was written by another version of the plugin, left alone otherwise; never fails a start.

export async function ensureReadme(ports: BookmarksPorts): Promise<void> {
  try {
    const root = await ports.dataRoot()
    if (!root) return
    const path = `${root}/bookmarks/README.md`
    const writer = `${ports.pluginName} ${await ports.pluginVersion()}`
    const existing = (await ports.fsExists(path)) ? await ports.fsRead(path) : undefined
    if (!readmeNeedsWrite(existing, writer)) return
    // The prose is the plugin's template file; a missing one is a packaging bug and is said so,
    // never filled from code (djdarcy, 2026-10-20).
    const template = await ports.pluginFile(README_TEMPLATE)
    if (template === undefined) {
      ports.logAlways(`[bm] data folder: README.md not written: the plugin's ${README_TEMPLATE} is missing (a packaging bug; nothing else is affected)`)
      return
    }
    await ports.fsWrite(path, dataReadme(writer, template))
    ports.log(`[bm] data folder: README.md ${existing === undefined ? 'written' : 'rewritten'} by ${writer}`)
  } catch (err) {
    ports.logAlways(`[bm] data folder: README.md not written: ${String(err)}`)
  }
}

// --- /bm-check (unit 11): a linter over the data root, never a migration path ---------------
// Gathers what core/bookmarks/check.ts judges: the registers' texts, the note folders, the
// index, every run folder's manifest with the current hash of each copy it lists, the
// snapshots, and the store's keys and size. Reads only; every line is drawn whatever the echo.

export async function checkCommand(ports: BookmarksPorts): Promise<void> {
  const root = await ports.dataRoot()
  if (!root) {
    ports.logAlways('[bm] bm-check: no data root (no home folder found), so bookmarks live in memory for this conversation and there is nothing on disk to check')
    return
  }
  const dir = sessionsDir(root)
  const entries = (await ports.fsExists(dir)) ? await ports.fsList(dir) : []
  const registers: CheckInput['registers'] = []
  for (const e of entries) {
    if (e.kind !== 'file' || !e.name.endsWith('.json') || e.name === INDEX_JSON) continue
    registers.push({ name: e.name.slice(0, -'.json'.length), text: await ports.fsRead(`${dir}/${e.name}`) })
  }
  const folders = entries.filter(e => e.kind === 'dir').map(e => e.name)
  const indexPath = `${dir}/${INDEX_JSON}`
  const index = (await ports.fsExists(indexPath)) ? await ports.fsRead(indexPath) : undefined
  const bdir = backupsDir(root)
  const backups = (await ports.fsExists(bdir)) ? await ports.fsList(bdir) : []
  const snapshots = backups.filter(e => e.kind === 'dir' && e.name.endsWith(SNAPSHOT_SUFFIX)).map(e => e.name)
  const runs: CheckInput['runs'] = []
  for (const e of backups) {
    if (e.kind !== 'dir' || e.name.endsWith(SNAPSHOT_SUFFIX)) continue
    const mpath = `${bdir}/${e.name}/manifest.json`
    const manifest = (await ports.fsExists(mpath)) ? await ports.fsRead(mpath) : undefined
    const hashes: Record<string, string | undefined> = {}
    let files: { path: string; algo: string }[] = []
    try {
      files = manifest ? ((JSON.parse(manifest) as Manifest).files ?? []) : []
    } catch {
      files = []
    }
    for (const f of Array.isArray(files) ? files : []) {
      const p = `${bdir}/${e.name}/${f.path}`
      if (!(await ports.fsExists(p))) {
        hashes[f.path] = undefined
        continue
      }
      const text = await ports.fsRead(p)
      // The manifest's own algorithm, so a copy hashed by FNV on one runtime is not judged by SHA-256 on another.
      hashes[f.path] = f.algo === 'fnv1a64' ? fnv1a64(text) : (await hashText(text)).hash
    }
    runs.push({ name: e.name, manifest, hashes })
  }
  const storeKeys = [...(await ports.storeKeys())]
  let storeChars = 0
  for (const k of storeKeys) storeChars += k.length + JSON.stringify((await ports.storeGet(k)) ?? null).length
  const lines = checkReport({ current: CURRENT, root, registers, folders, index, runs, snapshots, storeKeys, storeChars, storeCap: STORE_CAP, storePrefixes: STORE_PREFIXES })
  // A command's answer is always drawn, whatever the echo setting (the diagnostics' rule).
  for (const l of lines) ports.logAlways(drawLine(l))
}

/** One of Claude's records becomes the person's (#21): same message, id and link, saved. The band's `c` and the model's tool both claim here. */
export async function claimBookmark(ports: BookmarksPorts, uuid: string): Promise<{ register: BookmarkRegister; record: AnchorRecord; added: boolean } | { error: string }> {
  const reg = await loadRegister(ports)
  const src = findRecord(reg, uuid, 'claude')
  if (!src) return { error: `no bookmark ${short(uuid)} on Claude's list` }
  await ingestNote(ports, src.uuid, placeOfRecord(src))
  const r = await commitOp(ports, { op: 'claim', id: idOf(src) })
  if ('error' in r) return r
  // A link is handed out (the band's toast, the tool's answer), so the record's file is written (unit 7).
  if (r.saved) await writeExport(ports, r.register, { uuid: r.record!.uuid, sessionId: r.register.sessionId, ...placeOfRecord(r.record!) }, '', await ports.now())
  return { register: r.register, record: r.record!, added: r.added ?? false }
}

// --- Marks: the letters and the reading position, in the register since 0.5.5 -------------
// A letter is a slot pointing at a record of tier `mark` (core/bookmarks/register-ops.ts
// setMark, marksOf). The store (`marks:<sid>`) is read for a file the migration has not yet
// reached (no `slots`), and is the home when there is no data root at all.

const marksStoreKey = (sid: string) => `marks:${sid}`

async function marksInStore(ports: BookmarksPorts): Promise<Marks> {
  return ((await ports.storeGet(marksStoreKey(await ports.sessionId()))) as Marks | undefined) ?? {}
}

/** The conversation's marks as the panes draw them: from the register's slots, or the store when the file is not there yet. */
export async function marksOf(ports: BookmarksPorts): Promise<Marks> {
  if (!(await ports.dataRoot())) return marksInStore(ports)
  const reg = await loadRegister(ports)
  if (reg.slots === undefined) return marksInStore(ports)
  return marksFromRegister(reg, 'user')
}

/** A letter (or the reading position's key) set: one committed operation on the register, or the store when there is no data root. */
export async function setMarkOp(ports: BookmarksPorts, letter: string, mark: Mark): Promise<{ error?: string }> {
  if (!(await ports.dataRoot())) {
    const key = marksStoreKey(await ports.sessionId())
    await ports.storeSet(key, { ...(await marksInStore(ports)), [letter]: mark })
    return {}
  }
  const place = { uuid: mark.uuid, head: mark.head, ...(mark.snippet ? { words: mark.snippet } : {}) }
  const r = await commitOp(ports, { op: 'setMark', owner: 'user', letter, place, at: mark.markedAt })
  return 'error' in r ? r : {}
}

/** Letters cleared: the slot's current becomes null, its history kept, the record stays. */
export async function clearMarksOp(ports: BookmarksPorts, letters: string[]): Promise<{ error?: string }> {
  if (!(await ports.dataRoot())) {
    const key = marksStoreKey(await ports.sessionId())
    const marks = { ...(await marksInStore(ports)) }
    for (const l of letters) delete marks[l]
    await ports.storeSet(key, marks)
    return {}
  }
  const r = await commitOp(ports, { op: 'clearMarks', owner: 'user', letters })
  return 'error' in r ? r : {}
}

/** `D` + letter (handlers/marks.ts forgetLetter): the letter's current record leaves the file and the history (register-ops.ts `forget`); with no data root the store's marks hold no records, so the letter is cleared. */
export async function forgetOp(ports: BookmarksPorts, letter: string): Promise<{ error?: string; tombstoned?: boolean }> {
  if (!(await ports.dataRoot())) return clearMarksOp(ports, [letter])
  const r = await commitOp(ports, { op: 'forget', owner: 'user', letter })
  return 'error' in r ? r : { tombstoned: r.tombstoned }
}

/** `d` after a number in the bookmarks list: the record leaves the person's list and a tombstone keeps its place, as the tool's remove does. */
export async function removeBookmark(ports: BookmarksPorts, target: AnchorRecord) {
  const r = await commitOp(ports, { op: 'remove', id: idOf(target), removedBy: 'user' })
  if ('error' in r) return void ports.toast(r.error, 8000)
  ports.log(`[bm] bookmark removed by the person: ${short(target.uuid)} "${target.label}" (tombstoned)`, true)
  ports.toast(`removed bookmark: ${target.label.slice(0, 40)}`)
}

// --- Pins: the person's pinned prompts, in the register since 0.5.4 ------------------------
// Since 0.7.1 a pin records the list it was made in (core/bookmarks/pins.ts). `scope` is the
// pinScope setting: `here` shows the pins made in the prompts list, `everywhere` a pin on a
// prompt made in any list.

/** The pinned prompts of this conversation, by message uuid, in the order pinned. */
export async function pinnedPrompts(ports: BookmarksPorts, scope: PinScope): Promise<string[]> {
  return pinnedOf((await loadRegister(ports)).pins, scope)
}

/** The prompt uuids the person's pins mark in the prompts list: the main transcript's rows, each once. */
export function pinnedOf(pins: readonly Pin[] | undefined, scope: PinScope): string[] {
  const out: string[] = []
  for (const s of pins ?? []) {
    if (!isOn(s) || s.owner !== 'user' || s.file !== undefined || s.part !== undefined) continue
    if (scope === 'here' && s.from !== PROMPTS_LIST) continue
    if (!out.includes(s.uuid)) out.push(s.uuid)
  }
  return out
}

/** The list name the prompts list's pins carry. */
export const PROMPTS_LIST = 'prompts'

/** Pins or unpins a prompt for the person, as one committed operation. */
export async function togglePinned(ports: BookmarksPorts, uuid: string, on: boolean, scope: PinScope): Promise<{ pinned: string[] } | { error: string }> {
  const r = await commitOp(ports, { op: 'pin', owner: 'user', place: { uuid }, from: PROMPTS_LIST, on, scope, at: await ports.now() })
  if ('error' in r) return r
  return { pinned: pinnedOf(r.register.pins, scope) }
}

/** The places the person's pins mark in the search list (pins.ts pinPlaceKey), as the pinScope setting shows them. */
export async function searchPins(ports: BookmarksPorts, scope: PinScope): Promise<Set<string>> {
  return pinnedPlaces((await loadRegister(ports)).pins, 'user', SEARCH_LIST, scope)
}

/** Pins or unpins a place for the person from the search list (the search-pane-and-links design, unit U-S): a tool row or an agent's message keeps its file and block. */
export async function togglePlacePin(ports: BookmarksPorts, place: PinPlace, on: boolean, scope: PinScope): Promise<{ pinned: Set<string> } | { error: string }> {
  const r = await commitOp(ports, { op: 'pin', owner: 'user', place, from: SEARCH_LIST, on, scope, at: await ports.now() })
  if ('error' in r) return r
  return { pinned: pinnedPlaces(r.register.pins, 'user', SEARCH_LIST, scope) }
}

// --- Migrations at a conversation's start (the data design, 2026-10-16, unit 4) -----------
// Every register under the data root that is older than this build is brought up to date,
// the opened conversation first and the rest in the same start; a conversation with pins
// in the store and no register gets one. Before the first migration ever runs on a data
// root, one snapshot of `sessions/` is taken (the 14:40 addendum: "one backup copy that we
// make for the time being"), kept until csb versions ~/claude. Each migration gets its own
// run folder with a manifest, the original files and the store keys it consumed.

const sessionsDir = (root: string) => `${root}/bookmarks/sessions`
const backupsDir = (root: string) => `${root}/bookmarks/backups`

export async function migrateAtStart(ports: BookmarksPorts): Promise<void> {
  const root = await ports.dataRoot()
  if (!root) return
  const session = await ports.sessionId()
  const dir = sessionsDir(root)
  const entries = (await ports.fsExists(dir)) ? await ports.fsList(dir) : []
  const registers = entries.filter(e => e.kind === 'file' && e.name.endsWith('.json')).map(e => e.name.slice(0, -'.json'.length))
  // Store-only conversations: pins or marks in the store with no register to move them into.
  const storeKeys = await ports.storeKeys()
  const storeOnly = [...new Set(storeKeys
    .filter(k => STORE_PREFIXES.some(p => k.startsWith(p)))
    .map(k => k.slice(k.indexOf(':') + 1))
    .filter(sid => sid && !registers.includes(sid)))]
  const order = [session, ...registers.filter(s => s !== session)]
  let snapshot = await hasSnapshot(ports, root)
  const ensureSnapshot = async () => {
    if (snapshot) return
    await takeSnapshot(ports, root)
    snapshot = true
  }
  let migrated = 0
  for (const sid of order) {
    const path = `${dir}/${sid}.json`
    if (!(await ports.fsExists(path))) continue
    const text = await ports.fsRead(path)
    const reg = parseRegister(text)
    if (!reg) {
      ports.log(`[bm] migrate: ${path} is not a register file; left as it is`)
      continue
    }
    if (reg.version >= CURRENT) continue
    const steps = planFor(reg.version)
    if (steps.length === 0) {
      ports.logAlways(`[bm] migrate: no path from version ${reg.version} to ${CURRENT} for ${path}; left as it is`)
      continue
    }
    await ensureSnapshot()
    await migrateOne(ports, root, sid, reg, text, steps)
    migrated++
  }
  for (const sid of storeOnly) {
    // Something to move? An empty list or map is nothing.
    let any = false
    for (const p of STORE_PREFIXES) {
      const v = await ports.storeGet(`${p}${sid}`)
      if (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' && Object.keys(v as object).length > 0) any = true
    }
    if (!any) continue
    await ensureSnapshot()
    const fresh = emptyRegister(sid, `${ports.pluginName} ${await ports.pluginVersion()}`, await ports.now())
    // The whole plan from v1, on an empty v1 file, so the run folder and the store copy are the same shape as any other's.
    const { nextN: _n, slots: _s, ...v1 } = fresh
    await migrateOne(ports, root, sid, { ...v1, version: 1 }, undefined, planFor(1))
    migrated++
  }
  if (migrated > 0) ports.logAlways(`[bm] migrate: ${migrated} register(s) brought to version ${CURRENT}; originals under ${backupsDir(root)}`)
}

async function hasSnapshot(ports: BookmarksPorts, root: string): Promise<boolean> {
  const dir = backupsDir(root)
  if (!(await ports.fsExists(dir))) return false
  return (await ports.fsList(dir)).some(e => e.kind === 'dir' && e.name.endsWith(SNAPSHOT_SUFFIX))
}

/** Copies every file under `sessions/` (registers, their .bak, the exports) into one snapshot folder, with a manifest. */
async function takeSnapshot(ports: BookmarksPorts, root: string): Promise<void> {
  const now = await ports.now()
  const target = `${backupsDir(root)}/${snapshotFolderName(now)}`
  const copied: string[] = []
  const walk = async (rel: string) => {
    for (const e of await ports.fsList(`${sessionsDir(root)}${rel}`)) {
      const sub = `${rel}/${e.name}`
      if (e.kind === 'dir') await walk(sub)
      else if (e.kind === 'file') {
        await ports.fsWrite(`${target}/sessions${sub}`, await ports.fsRead(`${sessionsDir(root)}${sub}`))
        copied.push(`sessions${sub}`)
      }
    }
  }
  if (await ports.fsExists(sessionsDir(root))) await walk('')
  await ports.fsWrite(`${target}/manifest.json`, JSON.stringify({ kind: 'snapshot', at: new Date(now).toISOString(), why: 'the one interim copy before the first migration on this data root; kept until csb versions ~/claude', files: copied }, null, 2) + '\n')
  ports.logAlways(`[bm] migrate: snapshot of ${copied.length} file(s) under ${target}`)
}

/**
 * One register, one run folder: manifest `started`; the original, its .bak and the store
 * keys the steps consume copied in; manifest `backed-up`; the migrated file written (the
 * original becoming its .bak); the consumed store keys deleted; manifest `done`.
 */
async function migrateOne(ports: BookmarksPorts, root: string, sid: string, reg: BookmarkRegister, originalText: string | undefined, steps: readonly Migration[]) {
  const now = await ports.now()
  const writer = `${ports.pluginName} ${await ports.pluginVersion()}`
  const from = reg.version
  const to = steps[steps.length - 1]!.to
  const run = `${backupsDir(root)}/${runFolderName(now, from, to, writer, sid)}`
  const keys = [...new Set(steps.flatMap(s => s.storeKeys(sid)))]
  const manifest: Manifest = { kind: 'migration', from, to, writer, sessionId: sid, startedAt: new Date(now).toISOString(), status: 'started', files: [], storeKeys: keys }
  const writeManifest = () => ports.fsWrite(`${run}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n')
  await writeManifest()
  const path = `${sessionsDir(root)}/${sid}.json`
  const copy = async (rel: string, text: string) => {
    await ports.fsWrite(`${run}/${rel}`, text)
    manifest.files.push({ path: rel, ...(await hashText(text)), bytes: new TextEncoder().encode(text).length })
  }
  if (originalText !== undefined) await copy(`sessions/${sid}.json`, originalText)
  if (await ports.fsExists(`${path}.bak`)) await copy(`sessions/${sid}.json.bak`, await ports.fsRead(`${path}.bak`))
  const store: Record<string, unknown> = {}
  for (const k of keys) {
    const v = await ports.storeGet(k)
    if (v !== undefined) store[k] = v
  }
  if (Object.keys(store).length > 0) await copy(`store/${sid}.json`, JSON.stringify(store, null, 2) + '\n')
  manifest.status = 'backed-up'
  await writeManifest()
  const migrated = applyMigrations(reg, steps, store, { sessionId: sid, transcriptHint: sid === (await ports.sessionId()) ? await ports.transcriptPath() : undefined, now })
  const text = serializeRegister({ ...migrated, writer })
  if (originalText !== undefined) await ports.fsWrite(`${path}.bak`, originalText)
  await ports.fsWrite(path, text)
  for (const k of Object.keys(store)) await ports.storeDelete(k)
  manifest.status = 'done'
  manifest.finishedAt = new Date(await ports.now()).toISOString()
  await writeManifest()
  if (sid === (await ports.sessionId())) registerCache = { session: sid, register: parseRegister(text) ?? migrated, text }
  ports.log(`[bm] migrate: ${sid.slice(0, 8)} v${from} -> v${to} (${reg.perma.length} record(s)${store[`pins:${sid}`] ? ', pins moved from the store' : ''}); run folder ${run.slice(root.length + 1)}`)
}

// How long a `temporary` bookmark is kept before it is pruned (to a tombstone). A
// setting with the archive-retention picker (#7, #10); a constant until then.
const TEMPORARY_RETENTION: Retention = '30d'

// The register's part of a session start (moved out of register.tsx's session.start hook,
// 0.4.67): migrate what is older than this build, load it, say where it is, and age out
// temporary bookmarks.
export async function startRegister(ports: BookmarksPorts) {
  try {
    await migrateAtStart(ports)
  } catch (err) {
    ports.logAlways(`[bm] migrate failed: ${String(err)}`)
  }
  await rebuildIndex(ports)
  await ensureReadme(ports)
  try {
    const reg = await loadRegister(ports)
    ports.log(`[bm] register: ${reg.perma.length} bookmark(s), rev ${reg.rev}, ${await registerPath(ports)}`)
    // Temporary bookmarks age out (a setting later, #7); each leaves a tombstone.
    const { pruned: gone } = prune(reg, TEMPORARY_RETENTION, await ports.now())
    if (gone.length > 0) {
      const r = await commitOp(ports, { op: 'prune', retention: TEMPORARY_RETENTION })
      if ('error' in r) ports.logAlways(`[bm] register: prune not saved: ${r.error}`)
      else ports.log(`[bm] register: pruned ${r.pruned?.length ?? 0} temporary bookmark(s) older than ${TEMPORARY_RETENTION}`)
    }
  } catch (err) {
    ports.logAlways(`[bm] register failed to load: ${String(err)}`)
  }
}

// Mint a bookmark: commit the operation (a mint adds or relabels by message; a relabel
// names an existing record), write the export, and hand back the anchor URL and the
// markdown link a reply writes.
type Minted = { record: AnchorRecord; added: boolean; saved: boolean; href?: string; markdown?: string; exportPath?: string; rev: number }
async function mintBookmark(ports: BookmarksPorts, op: Extract<Op, { op: 'mint' | 'relabel' }>, messageText: string): Promise<Minted | { error: string }> {
  // The note of the record's own place (a tool row's note is not its reply's).
  const before = op.op === 'mint' ? op.mint : recordById(await loadRegister(ports), op.id)
  await ingestNote(ports, op.op === 'mint' ? op.mint.uuid : op.id.uuid, before ? placeOfRecord(before) : {})
  const r = await commitOp(ports, op)
  if ('error' in r) return r
  const { register, record, added } = r as { register: BookmarkRegister; record: AnchorRecord; added?: boolean }
  // Not saved (no data root): the record lives in memory for the conversation; no export and no link,
  // since neither would name a record on disk.
  if (!r.saved) return { record, added: added ?? false, saved: false, rev: register.rev }
  const exportPath = await writeExport(ports, register, record, messageText, await ports.now())
  const root = await ports.dataRoot()
  const href = root ? anchorHref(record, root) : undefined
  const markdown = root ? anchorMarkdown(record, root) : undefined
  ports.log(`[bm] bookmark ${added ? 'added' : 'relabelled'}: ${short(record.uuid)} "${record.label}" (${ownerOf(record)}'s list; ${record.by}/${record.source}) rev ${register.rev}${r.replayed ? ' (replayed onto a changed file)' : ''}`, true)
  return { record, added: added ?? false, saved: true, href, markdown, exportPath, rev: register.rev }
}

// Ingest before regenerate (unit 9, core/bookmarks/note.ts): before an action on a message
// whose note exists, the note's writable fields are read back against the primary record's
// base, and a label, why or tags edited in Obsidian becomes a relabel. It runs BEFORE the
// action (a mint, a claim, a share), so the action is the later intent and wins over the
// note where they meet; the note is then regenerated from the register by `writeExport`.
async function ingestNote(ports: BookmarksPorts, uuid: string, place: PlaceOf = {}): Promise<void> {
  const root = await ports.dataRoot()
  if (!root) return
  const register = await loadRegister(ports)
  const main = primaryRecord(recordsOn(register, uuid, place))
  if (!main) return
  const path = anchorPath(root, register.sessionId, main.uuid, place)
  if (!(await ports.fsExists(path))) return
  const got = ingest(parseFrontMatter(await ports.fsRead(path)), main.md?.base)
  if (!got.changes) {
    ports.log(`[bm] note: ${short(main.uuid)}.md read back: ${got.reason}`)
    return
  }
  const r = await commitOp(ports, { op: 'relabel', id: idOf(main), changes: got.changes, by: 'user' })
  if ('error' in r) ports.logAlways(`[bm] note: ${short(main.uuid)}.md was edited but the edit could not be kept: ${r.error}`)
  else ports.log(`[bm] note: ${short(main.uuid)}.md edited by hand; adopted ${Object.keys(got.changes).join(', ')} (rev ${r.register.rev})`, true)
}

// One export per message, shared by every list: an Obsidian note (unit 9). A rewrite keeps
// whatever was written under the notes marker (a person's or Claude's notes, links, context:
// pillar 3, #11). The note is written from the register's primary record and every record
// on the message; the base it was written from is then committed to the record.
async function writeExport(ports: BookmarksPorts, register: BookmarkRegister, record: Mint | { uuid: string; sessionId: string; file?: string; part?: number }, messageText: string, now: number) {
  const root = await ports.dataRoot()
  if (!root) return undefined
  const sessionId = 'sessionId' in record ? record.sessionId : register.sessionId
  // A row that is not a prompt or a reply has its own note (the search-pane-and-links design, 2026-10-26).
  const place: PlaceOf = { ...(record.file !== undefined ? { file: record.file } : {}), ...(record.part !== undefined ? { part: record.part } : {}) }
  const exportPath = anchorPath(root, sessionId, record.uuid, place)
  const existing = (await ports.fsExists(exportPath)) ? await ports.fsRead(exportPath) : undefined
  const main = primaryRecord(recordsOn(register, record.uuid, place))
  if (!main) return exportPath
  // The base the note is (or stays) written from: a bookkeeping write, so `.bak` stays the
  // file before the action. A note that cannot be regenerated below still holds what it
  // holds, so the base follows the record either way.
  const settleBase = async () => {
    const base = baseOf(main)
    if (sameBase(main.md?.base, base)) return
    const r = await commitOp(ports, { op: 'noteBase', id: idOf(main), base }, { bookkeeping: true })
    if ('error' in r) ports.logAlways(`[bm] note: the base of ${short(main.uuid)}.md was not kept: ${r.error}`)
  }
  // A relabel or share has no message text in hand: read it from the transcript again,
  // and if that fails leave the file as it is rather than write an empty message.
  if (!messageText) {
    const found = await ports.resolveTarget({ uuid: record.uuid, ...place })
    if (found.kind === 'one') messageText = found.row.text
    else if (existing) {
      await settleBase()
      return exportPath
    }
  }
  const records = recordsOn(register, main.uuid, place)
  const minted = `${new Date(now).toISOString()} by ${main.by} (${main.source})`
  const header = await headerFields(ports)
  const writer = `${ports.pluginName} ${await ports.pluginVersion()}`
  await ports.fsWrite(exportPath, exportMarkdown(main, messageText, { minted, records, notes: exportNotesOf(existing), writer, ...header }))
  await settleBase()
  return exportPath
}

// Replies whose links were already logged and queued (a reply is drawn many times).
// Cleared per conversation (newConversation): until U60 commit B it was never cleared.
const anchorRowsLogged = new Set<string>()
/** A reply carrying bookmark links, the first time this conversation draws it: log the counts and queue its prose anchors. */
export function noteAnchoredReply(ports: BookmarksPorts, requestId: string, links: ReturnType<typeof markdownLinks>): void {
  if (anchorRowsLogged.has(requestId)) return
  anchorRowsLogged.add(requestId)
  const anchors = links.filter(l => l.kind === 'anchor')
  ports.log(`[bm] reply ${short(requestId)}: ${anchors.length} bookmark link(s), ${links.filter(l => l.kind === 'file').length} file link(s)`)
  queueProseAnchors(ports, anchors)
}
/** A new conversation: the replies seen belong to the one before. */
export function newConversation(): void {
  anchorRowsLogged.clear()
}

// A perma record's link is drawn without the bookmark glyph (#21).
export async function permaTest(ports: BookmarksPorts): Promise<(href: string) => boolean> {
  const reg = await loadRegister(ports)
  return (href: string) => {
    const a = parseAnchor(href)
    const r = a && findRecord(reg, a.uuid)
    return r ? tierOf(r) === 'perma' : false
  }
}

// A bookmark link written by hand (or by an older session) is a bookmark too: once drawn,
// any anchor the register does not know is resolved by uuid and recorded with
// `by: 'prose'`. Off the render path (a clock tick), one attempt per uuid per load.
const proseQueued = new Set<string>()
export function queueProseAnchors(ports: BookmarksPorts, anchors: ReturnType<typeof markdownLinks>) {
  for (const l of anchors) {
    const a = l.anchor
    if (!a || proseQueued.has(a.uuid8)) continue
    proseQueued.add(a.uuid8)
    ports.after(0, () => {
      void (async () => {
        const reg = await loadRegister(ports)
        if (findRecord(reg, a.uuid8)) return
        if (a.sessionId && a.sessionId !== (await ports.sessionId())) return // another conversation's bookmark
        const found = await ports.resolveTarget({ uuid: a.uuid })
        if (found.kind !== 'one') {
          ports.log(`[bm] prose bookmark ${a.uuid8} not recorded: ${found.kind === 'none' ? found.reason : 'ambiguous uuid'}`)
          return
        }
        const row = found.row
        await mintBookmark(
          ports,
          {
            op: 'mint',
            mint: {
              ...rowPlace(row, await ports.transcriptPath()),
              label: l.label.replace(/^(⚓|▤|\[bm\]|\[file\])\s*/, '') || `bookmark ${a.uuid8}`,
              ...(a.words && row.text.includes(a.words) ? { words: a.words } : {}),
              owner: 'claude',
              by: 'prose',
              source: 'prose',
            },
          },
          row.text,
        )
      })().catch(err => ports.log(`[bm] prose bookmark ${a.uuid8} failed: ${String(err)}`))
    })
  }
}

// The press on an anchor link: resolve a uuid prefix against the rows this mod knows,
// then the same jump as a mark (with its refused-jump fallbacks).
export async function onAnchorPress(ports: BookmarksPorts, href: string) {
  const a = parseAnchor(href)
  ports.log(`[bm] anchor link pressed: ${ports.cut(href, 120)} -> ${a ? `uuid ${a.uuid}` : 'NOT an anchor'}`, true)
  if (!a) return
  let uuid = a.uuid
  if (uuid.length < 36) {
    const row = (await ports.allRows()).find(r => r.uuid.startsWith(uuid))
    if (row) uuid = row.uuid
    else ports.log(`[bm] anchor link: no known row starts with ${uuid}; trying it as written`)
  }
  // The jump records itself in the jumplist (jumpTo, handlers/navigation.ts), so <leader> o comes back here. The
  // reading position is left alone: it is the person's (djdarcy, 2026-10-09).
  // The words to highlight (and, on a refused jump, the phrase the fallback copies): the
  // link's `q`, else the register's record.
  const place: PlaceOf = { ...(a.file !== undefined ? { file: a.file } : {}), ...(a.part !== undefined ? { part: a.part } : {}) }
  const record = findRecord(await loadRegister(ports), uuid, undefined, place)
  const words = a.words ?? record?.words
  // A row that is not a prompt or a reply is jumped to by the id Claude Code draws it under (a
  // tool row's `tool_use` id, an agent's Agent call: measured 2026-10-26), and is not
  // highlighted, since only prompts and replies are drawn by this plugin.
  const drawn = record?.drawn
  const label = `anchor ${short(uuid)}${a.part !== undefined ? ` part ${a.part}` : ''}${a.file ? ` in ${a.file}` : ''}${a.line ? ` (line ${a.line})` : ''}`
  const r = await jumpToRecord(ports, { uuid, ...(drawn !== undefined ? { drawn } : {}), ...place }, 'anchor press', label, words)
  if (r.deny || !words || drawn) return
  await highlightWords(ports, uuid, words)
  ports.log(`[bm] anchor words highlighted on ${short(uuid)}: "${ports.cut(words, 60)}"`, true)
}

// --- Bookmarks in the pane and the band ---------------------------------------------------
// Numbered in the order minted (#1 the first), so a number read off the pane stays good.
// Bookmarks only: a permalink (tier `perma`, Claude's default way to cite a place) is not
// listed here, so the pane holds what the person and Claude chose to keep (djdarcy,
// 2026-10-14, Q261012-07: "we keep BOOKMARKS as a discrete concept"); a Permas group,
// folded by the message each link belongs to, is #38.
export async function bookmarkList(ports: BookmarksPorts) {
  return [...(await loadRegister(ports)).perma].filter(r => tierOf(r) !== 'perma').sort((a, b) => a.createdAt - b.createdAt)
}

// Highlight `words` on a message, as a letter's jump does (the marks cluster's
// handlers/marks.ts showWords), under the anchor's own letter.
async function highlightWords(ports: BookmarksPorts, uuid: string, words: string) {
  await ports.highlightWords(ANCHOR_MARK, uuid, words)
}

// Jump to a bookmark and highlight its words. Returns the scroll's refusal, if any.
export async function arriveAtBookmark(ports: BookmarksPorts, record: { uuid: string; words?: string; label: string; drawn?: string; file?: string; part?: number }, via: string): Promise<string | undefined> {
  // A tool row's or an agent's record jumps to the id its row is drawn under, unhighlighted (as the anchor press).
  const r = await jumpToRecord(ports, record, via, `bookmark ${short(record.uuid)}`, record.words)
  if (!r.deny && record.words && !record.drawn) await highlightWords(ports, record.uuid, record.words)
  return r.deny
}

/**
 * Jump to a record: by the id its row is drawn under when it has one, and if Claude Code has
 * nothing drawn under that id, by the record's own uuid (0.7.6). Claude Code draws a Bash call
 * under its `tool_use` id (measured 0.7.3) but not every tool: a link to an AskUserQuestion
 * row was refused, "nothing drawn under that requestId" (djdarcy, 2026-10-26). The first try
 * is quiet, so one press shows at most one toast; the last try reports as any jump does.
 */
export async function jumpToRecord(ports: BookmarksPorts, record: { uuid: string; drawn?: string; file?: string; part?: number }, via: string, label: string, words?: string): Promise<{ deny?: string; landedOn?: string }> {
  // Only a row with its own drawn id falls back; a prompt or a reply jumps as it always has.
  if (record.drawn === undefined || record.drawn === record.uuid) {
    const deny = await ports.jumpTo(record.uuid, via, label, words)
    return deny ? { deny } : { landedOn: record.uuid }
  }
  const nothingDrawn = (deny: string | undefined) => deny !== undefined && /nothing drawn/i.test(deny)
  const first = await ports.jumpTo(record.drawn, via, label, words, true)
  if (!first) return { landedOn: record.drawn }
  if (!nothingDrawn(first)) return { deny: first }
  // The message before, from the place reader's index when it is loaded (never started here: its
  // first read of a long conversation takes minutes). A row in an agent's file has no row of its
  // own in the main transcript, so it skips straight to that.
  const msg = ports.messageOf({ uuid: record.uuid, ...(record.file !== undefined ? { file: record.file } : {}), ...(record.part !== undefined ? { part: record.part } : {}) })
  const before = msg && msg.uuid !== record.uuid ? msg : undefined
  if (record.file === undefined) {
    ports.log(`[bm] ${via}: nothing drawn under ${short(record.drawn)}; trying the record's own id ${short(record.uuid)}`)
    const second = await ports.jumpTo(record.uuid, via, label, words, before !== undefined)
    if (!second) {
      ports.toast('Claude Code draws no row of its own for that call: this is the reply it was made in.')
      return { landedOn: record.uuid }
    }
    if (!nothingDrawn(second) || !before) return { deny: second }
  } else if (!before) {
    // An agent's row has no row of its own in the main transcript: with no index to place it, the refusal as any jump reports it.
    const again = await ports.jumpTo(record.drawn, via, label, words)
    return again ? { deny: again } : { landedOn: record.drawn }
  }
  ports.log(`[bm] ${via}: nothing drawn for ${short(record.uuid)}; landing on the message it belongs to, ${short(before.uuid)}`)
  const third = await ports.jumpTo(before.uuid, via, label, words)
  if (third) return { deny: third }
  ports.toast(`Claude Code draws no row for that place${before.why ? ` (${before.why})` : ''}: this is the message it belongs to.`)
  return { landedOn: before.uuid }
}

// /bm-promote <letter> (moved from register.tsx's registration, 0.4.94).
export async function promoteCommand(ports: BookmarksPorts, args: string | undefined) {
  const letter = (args ?? '').trim()
  if (!isMarkLetter(letter, true)) {
    ports.toast('/bm-promote <letter>: promote that mark into a bookmark')
    return
  }
  await promoteLetter(ports, letter)
}

// Promote one of the person's marks (a letter, or ` for the reading position) into a
// bookmark: same message, the mark's words, `by: 'user'`. The letter is left as it is.
// The markdown link goes to the clipboard, ready to paste into a note.
export async function promoteLetter(ports: BookmarksPorts, letter: string) {
  const mark = (await ports.loadMarks())[letter]
  if (!mark) return void ports.toast(`mark ${letter} is not set`)
  const found = await ports.resolveTarget({ uuid: mark.uuid })
  if (found.kind !== 'one') {
    ports.toast(`Can't promote ${letter}: ${found.kind === 'none' ? found.reason : 'the message is ambiguous in the transcript'}`)
    return
  }
  const row = found.row
  const words = mark.snippet && row.text.includes(mark.snippet) ? mark.snippet : undefined
  const minted = await mintBookmark(
    ports,
    {
      op: 'mint',
      mint: {
        ...rowPlace(row, await ports.transcriptPath()),
        label: (words ?? mark.head).slice(0, 80),
        ...(words ? { words } : {}),
        owner: 'user',
        by: 'user',
        source: 'promote',
      },
    },
    row.text,
  )
  if ('error' in minted) return void ports.toast(minted.error, 8000)
  if (!minted.saved) return
  const copied = minted.markdown ? (await ports.copy(minted.markdown)).isCopied : false
  ports.toast(`${minted.added ? 'bookmarked' : 'already a bookmark, relabelled'}: ${minted.record.label.slice(0, 40)}${copied ? ' (link copied)' : ''}`, 6000)
}

// The model's tool call (`mcp__bookmarks__bookmark`): what it takes and how it answers is
// core/bookmarks/bookmark-tool.ts; register.tsx's tool.call hook hands the event here.
// --- References (the bm: short-reference design, units 2 and 3a) -------------------------
// What a `bm:` reference or a bookmark link names, through core/bookmarks/ref-resolve.ts. This
// conversation is read through the loader (resolveTarget); another conversation only through
// what this plugin keeps of it, its register, never its transcript, so a reference to a row
// there that no record names is found but unverified.

const registerView = (reg: BookmarkRegister): RegisterView => ({
  records: reg.perma.map(r => ({ ...(r.n !== undefined ? { n: r.n } : {}), uuid: r.uuid, ...(r.part !== undefined ? { part: r.part } : {}), ...(r.file !== undefined ? { file: r.file } : {}), label: r.label })),
  tombstones: reg.tombstones.map(t => ({ ...(t.n !== undefined ? { n: t.n } : {}), uuid: t.uuid })),
})

/** The resolver's ports over BookmarksPorts, for one use (a call, a draw): conversations listed and registers read once. */
export async function refPortsOf(ports: BookmarksPorts): Promise<RefPorts> {
  const current = (await ports.sessionId()).toLowerCase()
  const root = await ports.dataRoot()
  const config = await ports.configDir()
  let ids: string[] | undefined
  const allIds = async (): Promise<string[]> => {
    if (ids) return ids
    const found: string[] = []
    if (config) {
      for (const d of await ports.fsList(`${config}/projects`).catch(() => [])) {
        if (d.kind !== 'dir') continue
        for (const f of await ports.fsList(`${config}/projects/${d.name}`).catch(() => [])) if (f.name.endsWith('.jsonl')) found.push(f.name.slice(0, -6).toLowerCase())
      }
    }
    return (ids = [...new Set(found)])
  }
  const otherRegister = async (sid: string): Promise<BookmarkRegister | undefined> => {
    const path = root ? `${root}/bookmarks/sessions/${sid}.json` : undefined
    try {
      return path && (await ports.fsExists(path)) ? parseRegister(await ports.fsRead(path)) : undefined
    } catch {
      return undefined
    }
  }
  const register = cachedRegisters(async sid => {
    const reg = sid === current ? await loadRegister(ports) : await otherRegister(sid)
    return reg ? registerView(reg) : undefined
  })
  const bare = (s: string) => s.replace(/-/g, '').toLowerCase()
  return {
    currentSession: () => current,
    sessionsByPrefix: async p => {
      const out: { id: string; title?: string }[] = []
      for (const id of (await allIds()).filter(i => i.startsWith(p))) {
        const title = (await otherRegister(id) as { title?: unknown } | undefined)?.title
        out.push({ id, ...(typeof title === 'string' && title.trim() ? { title: title.trim() } : {}) })
      }
      return out
    },
    rowsByPrefix: async (sid, p) => {
      if (sid === current) {
        if (bare(p).length < 8) return []
        const found = await ports.resolveTarget({ uuid: p })
        return found.kind === 'one' ? [{ uuid: found.row.uuid, text: found.row.text }] : found.kind === 'many' ? found.rows.map(r => ({ uuid: r.uuid, text: r.text })) : []
      }
      const known = ((await register(sid))?.records ?? []).filter(r => bare(r.uuid).startsWith(bare(p)))
      return known.length ? known.map(r => ({ uuid: r.uuid, ...(r.label ? { text: r.label } : {}) })) : undefined
    },
    register,
  }
}

/** What a reference's text names, or undefined when the text is not a reference. */
export async function resolveRefText(ports: BookmarksPorts, text: string): Promise<Resolution | undefined> {
  const ref = parseRef(text)
  return ref ? resolveRef(ref, await refPortsOf(ports)) : undefined
}

/**
 * A reply's text with each `bm:` reference it names turned into its `file:` anchor, so the reply
 * hook draws it as a pressable link (the bm: design, unit 4); one that does not resolve to a place
 * stays as written. Text with no reference, or no data root, comes back unchanged.
 */
export async function expandReplyRefs(ports: BookmarksPorts, text: string): Promise<string> {
  if (!/bm:[0-9a-f]/i.test(text)) return text
  const root = await ports.dataRoot()
  if (!root) return text
  let refPorts: RefPorts | undefined
  return expandRefs(text, async raw => {
    const ref = parseRef(raw)
    if (!ref) return undefined
    refPorts ??= await refPortsOf(ports)
    const r = await resolveRef(ref, refPorts)
    if (r.kind !== 'found') return undefined
    return anchorHref({
      sessionId: r.session,
      uuid: r.uuid,
      ...(r.part !== undefined ? { part: r.part } : {}),
      ...(r.file !== undefined ? { file: r.file } : {}),
      ...(r.words ? { words: r.words } : {}),
    }, root)
  })
}

/** One sentence for an outcome that is not a single place here. */
function refProblem(r: Resolution): string {
  switch (r.kind) {
    case 'ambiguous-row': return `that prefix names ${r.candidates.length} messages; give more of the uuid, or words with ~w:`
    case 'ambiguous-session': return `that prefix names ${r.candidates.length} conversations; give more of the session id`
    case 'mismatch': return `record #${r.record} in that conversation is not the one the check names${r.fallback ? '; the message the check names is in the answer' : ''}`
    case 'removed': return `record #${r.record} was removed (a tombstone)`
    case 'not-found': return 'no such place in that conversation'
    case 'not-on-this-machine': return 'that conversation is not on this machine'
    default: return 'that place is in another conversation; a bookmark is made in the conversation it belongs to'
  }
}

export async function bookmarkTool(ports: BookmarksPorts, e: unknown) {
  const { tool, tool_use_id, agentId, requestMeta, ...input } = e as unknown as Record<string, unknown>
  void agentId
  void requestMeta
  ports.log(`[bm] ${String(tool)} called (${String(tool_use_id).slice(0, 12)}) with ${ports.cut(JSON.stringify(input), 160)}`, true)
  const answer = toolAnswer
  const { query, uuid: uuidGiven, ref, label, action, tierAsked, owner, why, words: wordsGiven, temporary, tags, x } = parseToolInput(input)
  let uuid = uuidGiven
  let wordsAsked = wordsGiven
  if (ref && action !== 'list') {
    // A reference names a place; one in this conversation goes on as its uuid, so a place
    // already bookmarked is answered with its record and nothing new is minted.
    const r = await resolveRefText(ports, ref)
    if (!r) return answer({ error: '`ref` is not a bm: reference or a bookmark link' })
    if (r.kind !== 'found' || r.unverified || r.session !== (await ports.sessionId()).toLowerCase()) {
      return answer({ error: refProblem(r), resolution: r })
    }
    uuid = r.uuid
    wordsAsked = wordsAsked ?? r.words
    if (!label && action === 'add') {
      const existing = findRecord(await loadRegister(ports), uuid, owner)
      if (existing) return answer({ ok: true, added: false, ...describeRecord(existing, await ports.dataRoot()) })
    }
  }
  if (action !== 'list' && !query && !uuid) return answer({ error: 'give `query` (a short verbatim fragment of the message), `uuid` or `ref`' })
  const root = await ports.dataRoot()
  const describe = (r: AnchorRecord) => describeRecord(r, root)
  const brief = briefRow

  if (action === 'list') {
    // Every record with its number; a link only where the record's file exists, so nothing unresolvable is handed out (unit 7).
    const reg = await loadRegister(ports)
    const listed = async (owner: AnchorOwner) => {
      const out = []
      for (const r of listOf(reg, owner)) {
        const linked = !!root && (await ports.fsExists(anchorPath(root, r.sessionId, r.uuid)))
        out.push(describeRecord(r, root, linked))
      }
      return out
    }
    return answer({ yours: await listed('user'), claudes: await listed('claude'), tombstones: reg.tombstones.length })
  }

  if (action === 'relabel' || action === 'remove' || action === 'share' || action === 'claim') {
    // These act on a record that exists: by uuid (full or 8+ prefix) on `owner`'s list
    // (Claude's, for a claim).
    const from: AnchorOwner = listActedOn(action, owner)
    const reg = await loadRegister(ports)
    let target = uuid ? findRecord(reg, uuid, from) : undefined
    if (!target && query) {
      const found = await ports.resolveTarget({ fragment: query })
      if (found.kind === 'one') target = findRecord(reg, found.row.uuid, from)
      else if (found.kind === 'many') target = found.rows.map(r => findRecord(reg, r.uuid, from)).find(Boolean)
    }
    if (!target) return answer({ error: `no bookmark for that on ${listName(from)} list`, hint: 'action: "list" shows both lists with their uuids' })
    const now = await ports.now()
    if (action === 'claim') {
      const r = await claimBookmark(ports, target.uuid)
      if ('error' in r) return answer(r)
      ports.log(`[bm] bookmark claimed by the person: ${short(target.uuid)} "${r.record.label}"`, true)
      return answer({ ok: true, claimed: describe(r.record), note: "now on the person's list; same message, id and link" })
    }
    if (action === 'remove') {
      const r = await commitOp(ports, { op: 'remove', id: idOf(target), removedBy: `claude${owner === 'user' ? ' (on the person\'s behalf)' : ''}` })
      if ('error' in r) return answer(r)
      ports.log(`[bm] bookmark removed from ${owner}'s list: ${short(target.uuid)} "${target.label}" (tombstoned)`, true)
      return answer({ ok: true, removed: describe(r.removed!), note: 'archived as a tombstone in the register, not deleted' })
    }
    if (action === 'share') {
      const to: AnchorOwner = owner === 'claude' ? 'user' : 'claude'
      await ingestNote(ports, target.uuid, placeOfRecord(target))
      const r = await commitOp(ports, { op: 'share', id: idOf(target), to })
      if ('error' in r) return answer(r)
      await writeExport(ports, r.register, { uuid: target.uuid, sessionId: r.register.sessionId, ...placeOfRecord(target) }, '', now)
      ports.log(`[bm] bookmark shared ${owner} -> ${to}: ${short(target.uuid)} "${r.record!.label}"`, true)
      return answer({ ok: true, added: r.added, shared: describe(r.record!), note: `now on ${listName(to)} list too; the original stays` })
    }
    // relabel
    if (!label && why === undefined && typeof input.words !== 'string' && !tags && !x) return answer({ error: 'relabel needs `label`, `why`, `words` or `meta`' })
    const minted = await mintBookmark(
      ports,
      {
        op: 'relabel',
        id: idOf(target),
        changes: {
          ...(label ? { label } : {}),
          ...(why !== undefined ? { why } : {}),
          ...(wordsAsked ? { words: wordsAsked } : {}),
          ...(temporary ? { temporary: true } : {}),
          ...(tierAsked ? { tier: tierAsked } : {}),
          ...(tags ? { tags } : {}),
          ...(x ? { x } : {}),
        },
        by: 'claude',
      },
      '',
    )
    if ('error' in minted) return answer(minted)
    if (!minted.saved) return answer({ ok: true, relabelled: describe(minted.record), note: 'held in memory: no data root to write to' })
    return answer({ ok: true, relabelled: describe(minted.record) })
  }

  if (!label) return answer({ error: 'give `label`: what the bookmark is for, a few words' })
  const found = await ports.resolveTarget(uuid ? { uuid } : { fragment: query })
  ports.log(`[bm] bookmark: ${found.kind}${'via' in found && found.via ? ` via ${found.via} in ${found.ms} ms` : ''}${found.kind === 'none' ? `: ${found.reason}` : ''}`)
  if (found.kind === 'none') return answer({ error: found.reason, hint: 'use a verbatim fragment that appears in the message itself, or its uuid' })
  if (found.kind === 'many') {
    return answer({
      ambiguous: true,
      note: 'several messages contain that fragment; the earliest is where it was first said. Call again with `uuid` to choose, or a longer fragment.',
      earliest: brief(found.earliest),
      candidates: found.rows.slice(0, 12).map(brief),
    })
  }
  const row = found.row
  const words = wordsAsked ?? (query || undefined)
  const minted = await mintBookmark(
    ports,
    {
      op: 'mint',
      mint: {
        ...rowPlace(row, await ports.transcriptPath()),
        owner,
        label,
        ...(why ? { why } : {}),
        ...(words && row.text.includes(words) ? { words } : {}),
        ...(temporary ? { temporary: true } : {}),
        ...(tags ? { tags } : {}),
        ...(x ? { x } : {}),
        tier: tierFor(tierAsked, owner),
        by: 'claude',
        source: 'tool',
      },
    },
    row.text,
  )
  if ('error' in minted) return answer(minted)
  if (!minted.saved) return answer({ ok: true, added: minted.added, n: minted.record.n, owner, ...brief(row), note: 'held in memory: no data root to write to, so no link' })
  return answer({
    ok: true,
    added: minted.added,
    n: minted.record.n,
    owner,
    anchor: minted.href,
    markdown: minted.markdown,
    ...brief(row),
    words: minted.record.words,
    export: minted.exportPath,
    note: `on ${listName(owner)} list. Write \`markdown\` in your reply as the citation; a plain click jumps there, a ctrl-click opens the export`,
  })
}
