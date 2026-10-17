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
  emptyRegister, exportMarkdown, exportNotesOf, findRecord, idOf, listOf, newerThanBuild, parseRegister, prune, REGISTER_VERSION, serializeRegister,
  type Mint, type Register as BookmarkRegister, type Retention,
} from '../core/bookmarks/register-file.ts'
import { applyOp, type Op, type OpResult } from '../core/bookmarks/register-ops.ts'
import {
  applyMigrations, CURRENT, hashText, planFor, runFolderName, SNAPSHOT_SUFFIX, snapshotFolderName,
  type Manifest, type Migration,
} from '../core/bookmarks/migrations.ts'
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
export async function commitOp(ports: BookmarksPorts, op: Op): Promise<OpResult & { saved?: boolean; replayed?: boolean }> {
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
    if (onDisk) await ports.fsWrite(`${path}.bak`, disk)
    else ports.log(`[bm] register: ${path} does not parse; .bak kept as it was`)
  }
  if (applied.unchanged) {
    registerCache = { session, register: applied.register, text: registerCache?.text }
    return { ...applied, saved: false, replayed }
  }
  ports.expectRedraw('a bookmark saved')
  const register = { ...applied.register, writer: `${ports.pluginName} ${await ports.pluginVersion()}` }
  const text = serializeRegister(register)
  await ports.fsWrite(path, text)
  registerCache = { session, register, text }
  return { ...applied, register, saved: true, replayed }
}

/** One of Claude's records becomes the person's (#21): same message, id and link, saved. The band's `c` and the model's tool both claim here. */
export async function claimBookmark(ports: BookmarksPorts, uuid: string): Promise<{ register: BookmarkRegister; record: AnchorRecord; added: boolean } | { error: string }> {
  const reg = await loadRegister(ports)
  const src = findRecord(reg, uuid, 'claude')
  if (!src) return { error: `no bookmark ${short(uuid)} on Claude's list` }
  const r = await commitOp(ports, { op: 'claim', id: idOf(src) })
  if ('error' in r) return r
  return { register: r.register, record: r.record!, added: r.added ?? false }
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
  // Store-only conversations: pins in the store with no register to move them into.
  const storeKeys = await ports.storeKeys()
  const pinnedOnly = storeKeys.filter(k => k.startsWith('pins:')).map(k => k.slice('pins:'.length)).filter(sid => !registers.includes(sid))
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
  for (const sid of pinnedOnly) {
    const pins = await ports.storeGet(`pins:${sid}`)
    if (!Array.isArray(pins) || pins.length === 0) continue
    await ensureSnapshot()
    const fresh = emptyRegister(sid, `${ports.pluginName} ${await ports.pluginVersion()}`, await ports.now())
    // The same v1 -> v2 step, on an empty v1 file, so the run folder and the store copy are the same shape.
    await migrateOne(ports, root, sid, { ...fresh, version: 1, nextN: undefined }, undefined, planFor(1))
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

// One export per message, shared by both lists. A rewrite keeps whatever was written under
// the notes marker (a person's or Claude's notes, links, context: pillar 3, #11).
async function writeExport(ports: BookmarksPorts, register: BookmarkRegister, record: Mint | { uuid: string; sessionId: string }, messageText: string, now: number) {
  const root = await ports.dataRoot()
  if (!root) return undefined
  const sessionId = 'sessionId' in record ? record.sessionId : register.sessionId
  const exportPath = anchorPath(root, sessionId, record.uuid)
  const existing = (await ports.fsExists(exportPath)) ? await ports.fsRead(exportPath) : undefined
  // A relabel or share has no message text in hand: read it from the transcript again,
  // and if that fails leave the file as it is rather than write an empty message.
  if (!messageText) {
    const found = await ports.resolveTarget({ uuid: record.uuid })
    if (found.kind === 'one') messageText = found.row.text
    else if (existing) return exportPath
  }
  const owners = (['user', 'claude'] as AnchorOwner[]).filter(o => findRecord(register, record.uuid, o))
  // The record to describe: the person's copy first, since the file is theirs to read.
  const main = findRecord(register, record.uuid, 'user') ?? findRecord(register, record.uuid)
  if (!main) return exportPath
  const minted = `${new Date(now).toISOString()} by ${main.by} (${main.source})`
  await ports.fsWrite(exportPath, exportMarkdown(main, messageText, { minted, owners, notes: exportNotesOf(existing) }))
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
  const { query, uuid, label, action, tierAsked, owner, why, words: wordsAsked, temporary } = parseToolInput(input)
  if (action !== 'list' && !query && !uuid) return answer({ error: 'give `query` (a short verbatim fragment of the message) or `uuid`' })
  const root = await ports.dataRoot()
  const describe = (r: AnchorRecord) => describeRecord(r, root)
  const brief = briefRow

  if (action === 'list') {
    const reg = await loadRegister(ports)
    return answer({ yours: listOf(reg, 'user').map(describe), claudes: listOf(reg, 'claude').map(describe), tombstones: reg.tombstones.length })
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
      const r = await commitOp(ports, { op: 'share', id: idOf(target), to })
      if ('error' in r) return answer(r)
      await writeExport(ports, r.register, { uuid: target.uuid, sessionId: r.register.sessionId }, '', now)
      ports.log(`[bm] bookmark shared ${owner} -> ${to}: ${short(target.uuid)} "${r.record!.label}"`, true)
      return answer({ ok: true, added: r.added, shared: describe(r.record!), note: `now on ${listName(to)} list too; the original stays` })
    }
    // relabel
    if (!label && why === undefined && typeof input.words !== 'string') return answer({ error: 'relabel needs `label`, `why` or `words`' })
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
        tier: tierFor(tierAsked, owner),
        by: 'claude',
        source: 'tool',
      },
    },
    row.text,
  )
  if ('error' in minted) return answer(minted)
  if (!minted.saved) return answer({ ok: true, added: minted.added, owner, ...brief(row), note: 'held in memory: no data root to write to, so no link' })
  return answer({
    ok: true,
    added: minted.added,
    owner,
    anchor: minted.href,
    markdown: minted.markdown,
    ...brief(row),
    words: minted.record.words,
    export: minted.exportPath,
    note: `on ${listName(owner)} list. Write \`markdown\` in your reply as the citation; a plain click jumps there, a ctrl-click opens the export`,
  })
}
