// SCRATCH PROTOTYPE (round 2, 2026-11-03): plugin/hooks/core/projects/project-file.ts with a
// reconciled `projects` field. Marked `// PROTO` where it differs. Never loaded by the plugin.
import { fileSafe } from '../../../../../plugin/hooks/core/lists/lists.ts'

export const PROJECT_FILE_VERSION = 1

/** PROTO: a relation edge to another project, stored at the asserting end. `since` is the edge's own stamp. */
export type ProjectEdge = { id: string; state?: number; since?: string; by?: string; as?: string }

/** The stamp of each reconciled field: when it last changed, ISO. PROTO: `projects` optional (variant A only). */
export type Stamps = { name: string; members: string; projects?: string }

export type ProjectFile = {
  version: number
  id: string
  name: string
  user: string
  created_at: string
  members: string[]
  /** PROTO */
  projects?: ProjectEdge[]
  stamps: Stamps
}

export type Parsed<T> = { kind: 'ok'; value: T } | { kind: 'newer'; version: number } | { kind: 'bad'; why: string }

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isStamps = (v: unknown): v is Stamps => !!v && typeof v === 'object' && isText((v as Stamps).name) && isText((v as Stamps).members)
const isMembers = (v: unknown): v is string[] => Array.isArray(v) && v.every(m => typeof m === 'string')
// PROTO
const isEdge = (e: unknown): e is ProjectEdge => !!e && typeof e === 'object' && isText((e as ProjectEdge).id)
export const isProjects = (v: unknown): v is ProjectEdge[] => Array.isArray(v) && v.every(isEdge)
export const stampsOf = (s: Partial<Stamps>): Stamps => ({ name: s.name!, members: s.members!, ...(isText(s.projects) ? { projects: s.projects } : {}) })

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
  if (!isMembers(o.members)) return { kind: 'bad', why: 'members is not a list of paths' }
  if (!isStamps(o.stamps)) return { kind: 'bad', why: 'stamps missing' }
  if (o.projects !== undefined && !isProjects(o.projects)) return { kind: 'bad', why: 'projects is not a list of edges with an id' } // PROTO
  return { kind: 'ok', value: { version: o.version as number, id: o.id, name: o.name, user: o.user, created_at: o.created_at, members: o.members, ...(o.projects ? { projects: o.projects as ProjectEdge[] } : {}), stamps: stampsOf(o.stamps) } }
}

export function serializeProjectFile(p: ProjectFile): string {
  const { version, id, name, user, created_at, members, projects, stamps } = p
  return JSON.stringify({ version, id, name, user, created_at, members, ...(projects ? { projects } : {}), stamps: stampsOf(stamps) }, null, 2) + '\n'
}

export const projectFolderName = (name: string, id: string, user: string): string => `${fileSafe(name)}__${id}__${fileSafe(user)}`
export const foldersWithId = (names: readonly string[], id: string): string[] => names.filter(n => n.includes(`__${id}__`))
