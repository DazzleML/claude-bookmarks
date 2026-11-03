// A project's own half of the registry binding (the registry design, 2026-11-02__16-26-45, and its
// 17:13 and 17:50 addenda): `project.json` inside the project's data folder
// `~/claude/bookmarks/projects/<concept>__<id>__<user>/`. It mirrors the identity file's fields, so
// either half can be rebuilt from the other byte for byte, and it is how a folder is told to be the
// project's: a folder is found by the id in its name and confirmed by the id in this file, never by
// its name alone (a rename's stub keeps the old name and holds `moved-to.json` instead).
import { fileSafe } from '../lists/lists.ts'
import { isEdgeDir, isEdgeRank, type EdgeDir, type EdgeRank } from '../kit/edge-state.ts'

export const PROJECT_FILE_VERSION = 1

/**
 * The stamp of each reconciled field: when it last changed, ISO. `projects` has none: each edge's own
 * `since` is its stamp (a list-level stamp lost an edge when two machines added different ones apart,
 * the umbrella consultation's prototype, 2026-11-03). `members` was dropped in 0.8.12: it was always
 * empty, nothing read it, and machine paths belong in the placement, never in a synced file.
 */
export type Stamps = { name: string }

/**
 * A relation to another project, stored once at the project that asserts it, by id (ids never change,
 * so a rename at either end breaks nothing). The other end reads it by a scan. A removal is the
 * ungrouped rank, never an absence: an absent edge is never a deletion.
 */
export type ProjectEdge = { id: string; state?: EdgeRank; dir?: EdgeDir; since?: string; by?: string; as?: string }

export type ProjectFile = {
  version: number
  id: string
  name: string
  /** The OS account the folder belongs to (the `<user>` of the folder name). */
  user: string
  created_at: string
  /** The projects this one relates to (the umbrella); absent when it relates to none. */
  projects?: ProjectEdge[]
  stamps: Stamps
}

export type Parsed<T> = { kind: 'ok'; value: T } | { kind: 'newer'; version: number } | { kind: 'bad'; why: string }

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isStamps = (v: unknown): v is Stamps => !!v && typeof v === 'object' && isText((v as Stamps).name)
const isEdge = (v: unknown): v is ProjectEdge => {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  return isText(e.id)
    && (e.state === undefined || isEdgeRank(e.state))
    && (e.dir === undefined || isEdgeDir(e.dir))
    && (e.since === undefined || isText(e.since))
    && (e.by === undefined || isText(e.by))
    && (e.as === undefined || isText(e.as))
}
/** A list of relation edges, each with an id and, where present, a rank, a direction and text fields. */
export const isProjects = (v: unknown): v is ProjectEdge[] => Array.isArray(v) && v.every(isEdge)
/** The stamps as written: the reconciled fields only (an older file's `members` stamp is not carried). */
export const stampsOf = (s: Stamps): Stamps => ({ name: s.name })
/** The edges as written: absent when there are none, so a file with no relations is unchanged. */
export const projectsOf = (p: { projects?: readonly ProjectEdge[] }): { projects?: ProjectEdge[] } =>
  p.projects && p.projects.length ? { projects: p.projects.map(e => ({ ...e })) } : {}

/** Reads a JSON object with a numeric `version`, refusing a newer one (so it is never written over). */
export function parseVersioned(text: string, current: number): Parsed<Record<string, unknown>> {
  let o: unknown
  try {
    o = JSON.parse(text)
  } catch (err) {
    return { kind: 'bad', why: `not JSON: ${String(err)}` }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { kind: 'bad', why: 'not an object' }
  const version = (o as { version?: unknown }).version
  if (typeof version !== 'number') return { kind: 'bad', why: 'no version' }
  if (version > current) return { kind: 'newer', version }
  return { kind: 'ok', value: o as Record<string, unknown> }
}

export function parseProjectFile(text: string): Parsed<ProjectFile> {
  const r = parseVersioned(text, PROJECT_FILE_VERSION)
  if (r.kind !== 'ok') return r
  const o = r.value
  if (!isText(o.id) || !isText(o.name) || !isText(o.user) || !isText(o.created_at)) return { kind: 'bad', why: 'id, name, user or created_at missing' }
  if (o.projects !== undefined && !isProjects(o.projects)) return { kind: 'bad', why: 'projects is not a list of edges with an id' }
  if (!isStamps(o.stamps)) return { kind: 'bad', why: 'stamps missing' }
  // An older file's `members` (always empty) is read past and not written back.
  return { kind: 'ok', value: { version: o.version as number, id: o.id, name: o.name, user: o.user, created_at: o.created_at, ...projectsOf(o as { projects?: ProjectEdge[] }), stamps: stampsOf(o.stamps) } }
}

/** The file's text, keys in one order, so a rebuild is byte-equal to what it replaces. */
export function serializeProjectFile(p: ProjectFile): string {
  const { version, id, name, user, created_at, stamps } = p
  return JSON.stringify({ version, id, name, user, created_at, ...projectsOf(p), stamps: stampsOf(stamps) }, null, 2) + '\n'
}

/** The project's data folder name: the readable concept, the id references carry, the account. */
export const projectFolderName = (name: string, id: string, user: string): string => `${fileSafe(name)}__${id}__${fileSafe(user)}`

/** The folder names under `projects/` that carry `id` (the `*__<id>__*` glob), whatever their concept part says. */
export const foldersWithId = (names: readonly string[], id: string): string[] => names.filter(n => n.includes(`__${id}__`))

/** What a candidate folder holds, as the handler read it: `project.json`'s text, or a stub's `moved-to.json`. */
export type FolderContents = { projectFile?: string; movedTo?: string }

export type FolderCheck =
  | { kind: 'ok'; file: ProjectFile }
  | { kind: 'moved'; to: string }
  | { kind: 'wrong id'; found: string }
  | { kind: 'missing' }
  | { kind: 'bad'; why: string }

/**
 * Whether a folder is the project's: its `project.json` names `id`. A stub left by a rename holds
 * `moved-to.json` and no `project.json`, so it is never taken for the project, even though the path
 * exists (the proof of concept's finding: a check of existence alone passes on a stale link).
 */
export function checkFolder(c: FolderContents, id: string): FolderCheck {
  if (c.projectFile === undefined) {
    if (c.movedTo !== undefined) {
      const r = parseVersioned(c.movedTo, PROJECT_FILE_VERSION)
      const to = r.kind === 'ok' && typeof r.value.moved_to === 'string' ? r.value.moved_to : ''
      return { kind: 'moved', to }
    }
    return { kind: 'missing' }
  }
  const r = parseProjectFile(c.projectFile)
  if (r.kind === 'newer') return { kind: 'bad', why: `written by a newer version (format ${r.version})` }
  if (r.kind === 'bad') return { kind: 'bad', why: r.why }
  return r.value.id === id ? { kind: 'ok', file: r.value } : { kind: 'wrong id', found: r.value.id }
}

/** The one folder for `id` among the candidates: the one whose `project.json` names it; none, or several, said so. */
export function pickFolder(candidates: readonly { name: string; contents: FolderContents }[], id: string):
  | { kind: 'found'; name: string; file: ProjectFile }
  | { kind: 'none'; moved?: string }
  | { kind: 'several'; names: string[] } {
  const checked = candidates.map(c => ({ name: c.name, check: checkFolder(c.contents, id) }))
  const ok = checked.filter(c => c.check.kind === 'ok')
  if (ok.length === 1) return { kind: 'found', name: ok[0]!.name, file: (ok[0]!.check as { file: ProjectFile }).file }
  if (ok.length > 1) return { kind: 'several', names: ok.map(c => c.name) }
  const moved = checked.find(c => c.check.kind === 'moved')
  return moved ? { kind: 'none', moved: (moved.check as { to: string }).to } : { kind: 'none' }
}
