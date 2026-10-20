// The bookmarks cluster (moved whole out of register.tsx under /move-code, 0.4.64, comments
// as they were; `ports.x()` where the code called `$`, read register.tsx's state, or called
// another cluster): the register's I/O, minting and exports, prose anchors, the anchor
// press, a bookmark's arrival and highlight, promoting a mark, and the model's tool.
// The register cache and the prose queue are owned here.

import {
  anchorHref, anchorMarkdown, anchorPath, markdownLinks, ownerOf, parseAnchor, tierOf,
  type AnchorOwner, type AnchorRecord,
} from '../core/bookmarks/anchor.ts'
import {
  emptyRegister, exportMarkdown, exportNotesOf, findRecord, idOf, listOf, newerThanBuild, parseFrontMatter, parseRegister, prune, recordsOn, REGISTER_VERSION, serializeRegister,
  type Mint, type Register as BookmarkRegister, type Retention,
} from '../core/bookmarks/register-file.ts'
import { baseOf, ingest, primaryRecord, sameBase } from '../core/bookmarks/note.ts'
import { buildIndex, emptyIndex, entryOf, INDEX_JSON, INDEX_MD, parseIndex, renderIndexMarkdown, serializeIndex, upsert, type IndexEntry } from '../core/bookmarks/session-index.ts'
import { applyOp, marksOf as marksFromRegister, type Op, type OpResult } from '../core/bookmarks/register-ops.ts'
import {
  applyMigrations, CURRENT, fnv1a64, hashText, planFor, runFolderName, SNAPSHOT_SUFFIX, snapshotFolderName, STORE_PREFIXES,
  type Manifest, type Migration,
} from '../core/bookmarks/migrations.ts'
import { checkReport, drawLine, STORE_CAP, type CheckInput } from '../core/bookmarks/check.ts'
import { dataReadme, readmeNeedsWrite } from '../core/bookmarks/data-readme.ts'
import type { Mark, Marks } from '../core/marks/marks.ts'
import { rowPlace } from '../core/bookmarks/transcript-lines.ts'
import { forwardSlashes } from '../core/kit/paths.ts'
import { short } from '../core/kit/message-id.ts'
import { answer as toolAnswer, brief as briefRow, describe as describeRecord, listActedOn, listName, parseToolInput, tierFor } from '../core/bookmarks/bookmark-tool.ts'
import type { BookmarksPorts } from '../engine/ports.ts'

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
let registerCache: { session: string; register: BookmarkRegister; text?: string } | undefined

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
  }
  registerCache = { session, register: reg, ...(text !== undefined ? { text } : {}) }
  return reg
}

/** What the tool and the band say when a save was refused by the version guard. */
const READ_ONLY_NOTE = 'not saved: this conversation\'s bookmark file was written by a newer build of the plugin and is read-only here; update the plugin'

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
    await ports.fsWrite(path, dataReadme(writer))
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
  await ingestNote(ports, src.uuid)
  const r = await commitOp(ports, { op: 'claim', id: idOf(src) })
  if ('error' in r) return r
  // A link is handed out (the band's toast, the tool's answer), so the record's file is written (unit 7).
  if (r.saved) await writeExport(ports, r.register, { uuid: r.record!.uuid, sessionId: r.register.sessionId }, '', await ports.now())
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

// --- Pins: the person's pinned prompts, in the register since 0.5.4 ----------------------

/** The pinned prompts of this conversation, by message uuid, in the order pinned. */
export async function pinnedPrompts(ports: BookmarksPorts): Promise<string[]> {
  return (await loadRegister(ports)).pins?.user ?? []
}

/** Pins or unpins a prompt for the person, as one committed operation. */
export async function togglePinned(ports: BookmarksPorts, uuid: string, on: boolean): Promise<{ pinned: string[] } | { error: string }> {
  const r = await commitOp(ports, { op: 'pin', owner: 'user', uuid, on })
  if ('error' in r) return r
  return { pinned: r.register.pins?.user ?? [] }
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
  await ingestNote(ports, op.op === 'mint' ? op.mint.uuid : op.id.uuid)
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
async function ingestNote(ports: BookmarksPorts, uuid: string): Promise<void> {
  const root = await ports.dataRoot()
  if (!root) return
  const register = await loadRegister(ports)
  const main = primaryRecord(recordsOn(register, uuid))
  if (!main) return
  const path = anchorPath(root, register.sessionId, main.uuid)
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
async function writeExport(ports: BookmarksPorts, register: BookmarkRegister, record: Mint | { uuid: string; sessionId: string }, messageText: string, now: number) {
  const root = await ports.dataRoot()
  if (!root) return undefined
  const sessionId = 'sessionId' in record ? record.sessionId : register.sessionId
  const exportPath = anchorPath(root, sessionId, record.uuid)
  const existing = (await ports.fsExists(exportPath)) ? await ports.fsRead(exportPath) : undefined
  const main = primaryRecord(recordsOn(register, record.uuid))
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
    const found = await ports.resolveTarget({ uuid: record.uuid })
    if (found.kind === 'one') messageText = found.row.text
    else if (existing) {
      await settleBase()
      return exportPath
    }
  }
  const records = recordsOn(register, main.uuid)
  const minted = `${new Date(now).toISOString()} by ${main.by} (${main.source})`
  const header = await headerFields(ports)
  const writer = `${ports.pluginName} ${await ports.pluginVersion()}`
  await ports.fsWrite(exportPath, exportMarkdown(main, messageText, { minted, records, notes: exportNotesOf(existing), writer, ...header }))
  await settleBase()
  return exportPath
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
  const words = a.words ?? (await loadRegister(ports)).perma.find(r => r.uuid === uuid)?.words
  const deny = await ports.jumpTo(uuid, 'anchor press', `anchor ${short(uuid)}${a.line ? ` (line ${a.line})` : ''}`, words)
  if (deny || !words) return
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
export async function arriveAtBookmark(ports: BookmarksPorts, record: { uuid: string; words?: string; label: string }, via: string): Promise<string | undefined> {
  const deny = await ports.jumpTo(record.uuid, via, `bookmark ${short(record.uuid)}`, record.words)
  if (!deny && record.words) await highlightWords(ports, record.uuid, record.words)
  return deny
}

// /bm-promote <letter> (moved from register.tsx's registration, 0.4.94).
export async function promoteCommand(ports: BookmarksPorts, args: string | undefined) {
  const letter = (args ?? '').trim()
  if (!/^[a-z`]$/.test(letter)) {
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
export async function bookmarkTool(ports: BookmarksPorts, e: unknown) {
  const { tool, tool_use_id, agentId, requestMeta, ...input } = e as unknown as Record<string, unknown>
  void agentId
  void requestMeta
  ports.log(`[bm] ${String(tool)} called (${String(tool_use_id).slice(0, 12)}) with ${ports.cut(JSON.stringify(input), 160)}`, true)
  const answer = toolAnswer
  const { query, uuid, label, action, tierAsked, owner, why, words: wordsAsked, temporary, tags, x } = parseToolInput(input)
  if (action !== 'list' && !query && !uuid) return answer({ error: 'give `query` (a short verbatim fragment of the message) or `uuid`' })
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
      await ingestNote(ports, target.uuid)
      const r = await commitOp(ports, { op: 'share', id: idOf(target), to })
      if ('error' in r) return answer(r)
      await writeExport(ports, r.register, { uuid: target.uuid, sessionId: r.register.sessionId }, '', now)
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
