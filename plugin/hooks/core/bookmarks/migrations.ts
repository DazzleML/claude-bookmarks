// Migrations of the register file: numbered, pure, deterministic steps from one format
// version to the next (the data design of 2026-10-16, unit 4; djdarcy: "designing this so
// the data can be updated like how Django does migrations"). A file older than the build
// is brought up to date when its conversation starts (the opened one first, the rest in
// the same start); a file newer than the build is read and never written (`newerThanBuild`).
// Every step reads only what the handler backed up first: the run folder holds the
// original file, its `.bak`, and the store keys the step consumed, under a manifest whose
// status moves `started -> backed-up -> done`; a crash leaves a folder `/bm-check` can name.
//
// Pure: no I/O. The handler (handlers/bookmarks.ts migrateAtStart) lists, reads, copies,
// writes and deletes.

import { forwardSlashes } from '../kit/paths.ts'
import { REGISTER_VERSION, type Register } from './register-file.ts'

/** The format this build writes. A file at CURRENT is loaded and never copied. */
export const CURRENT = REGISTER_VERSION

export type MigrationContext = {
  sessionId: string
  /** The transcript path as the running session knows it, when the file's records name none. */
  transcriptHint?: string
  now: number
}

export type Migration = {
  from: number
  to: number
  /** The store keys this step reads for a conversation; the handler copies their values into the run folder before the step runs, and deletes them after. */
  storeKeys: (sessionId: string) => string[]
  apply: (reg: Register, store: Record<string, unknown>, ctx: MigrationContext) => Register
}

/**
 * v1 -> v2: the hoist (`sessionId` and `transcript` once at the top; a record keeps its own
 * only as an override), record numbers (`n` in minting order, `nextN`), and pins moved from
 * the store into the file. djdarcy, 2026-10-16: "The hoist isn't really a problem because
 * we can still check if the record has those items as specific subitems in which case it's
 * an 'override'."
 */
export const v1to2: Migration = {
  from: 1,
  to: 2,
  storeKeys: sid => [`pins:${sid}`],
  apply(reg, store, ctx) {
    // The file's transcript: the spelling most of its own records agree on, slashes forward.
    const own = reg.perma.filter(r => r.sessionId === reg.sessionId && r.transcript).map(r => forwardSlashes(r.transcript!))
    const counts = new Map<string, number>()
    for (const t of own) counts.set(t, (counts.get(t) ?? 0) + 1)
    const transcript = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
      ?? (ctx.transcriptHint ? forwardSlashes(ctx.transcriptHint) : undefined)
    // Numbers in minting order; ties by position in the file. Never reused from here on.
    const order = reg.perma.map((r, i) => ({ r, i })).sort((a, b) => a.r.createdAt - b.r.createdAt || a.i - b.i)
    const numbered = new Map(order.map(({ r }, k) => [r, k + 1]))
    const perma = reg.perma.map(r => ({
      ...r,
      n: numbered.get(r)!,
      ...(r.transcript ? { transcript: forwardSlashes(r.transcript) } : {}),
    }))
    const pinned = store[`pins:${ctx.sessionId}`]
    const pins = Array.isArray(pinned) && pinned.length > 0 ? { pins: { user: pinned.filter((u): u is string => typeof u === 'string') } } : {}
    return {
      ...reg,
      version: 2,
      ...(transcript ? { transcript } : {}),
      nextN: reg.perma.length + 1,
      perma,
      ...pins,
    }
  },
}

export const MIGRATIONS: readonly Migration[] = [v1to2]

/** The steps that take a file at `version` to CURRENT, in order; empty when it is current or newer. */
export function planFor(version: number): Migration[] {
  const steps: Migration[] = []
  let at = version
  while (at < CURRENT) {
    const step = MIGRATIONS.find(m => m.from === at)
    if (!step) break
    steps.push(step)
    at = step.to
  }
  return steps
}

/** Runs every step of a plan. Pure: the same file, store values and context give the same result. */
export function applyMigrations(reg: Register, steps: readonly Migration[], store: Record<string, unknown>, ctx: MigrationContext): Register {
  let out = reg
  for (const s of steps) out = s.apply(out, store, ctx)
  return { ...out, rev: out.rev + 1, updatedAt: ctx.now }
}

/** A time for a folder name: ISO, with the colons Windows refuses turned into dashes, no milliseconds. */
export const stampOf = (now: number): string => new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-')

/** The run folder for one migration of one conversation, under `<dataRoot>/bookmarks/backups/`. */
export function runFolderName(now: number, from: number, to: number, writer: string, sessionId: string): string {
  return `${stampOf(now)}__v${from}-to-v${to}__${writer.replace(/[^A-Za-z0-9.]+/g, '-')}__${sessionId.slice(0, 8)}`
}

/** The one interim snapshot's folder, kept until csb versions ~/claude (the 14:40 addendum). */
export const SNAPSHOT_SUFFIX = '__pre-0.5__snapshot'
export const snapshotFolderName = (now: number): string => `${stampOf(now)}${SNAPSHOT_SUFFIX}`

export type ManifestStatus = 'started' | 'backed-up' | 'done'
export type Manifest = {
  kind: 'migration'
  from: number
  to: number
  writer: string
  sessionId: string
  startedAt: string
  status: ManifestStatus
  /** The files copied into the run folder, with the hash of each as copied. */
  files: { path: string; algo: string; hash: string; bytes: number }[]
  /** The store keys the steps consumed (copied to `store/<sid>.json` before, deleted after). */
  storeKeys: string[]
  finishedAt?: string
}

/**
 * A hash of a file's text for the manifest: SHA-256 through Web Crypto when the runtime
 * has it, else FNV-1a 64-bit (named, so a reader knows which it is looking at).
 */
export async function hashText(text: string): Promise<{ algo: string; hash: string }> {
  const subtle = (globalThis as { crypto?: { subtle?: { digest: (a: string, b: Uint8Array) => Promise<ArrayBuffer> } } }).crypto?.subtle
  if (subtle) {
    try {
      const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text))
      return { algo: 'sha256', hash: [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('') }
    } catch {
      // fall through to FNV
    }
  }
  return { algo: 'fnv1a64', hash: fnv1a64(text) }
}

/** FNV-1a, 64-bit, over the UTF-8 bytes; hex. */
export function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n
  for (const b of new TextEncoder().encode(text)) {
    h ^= BigInt(b)
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return h.toString(16).padStart(16, '0')
}
