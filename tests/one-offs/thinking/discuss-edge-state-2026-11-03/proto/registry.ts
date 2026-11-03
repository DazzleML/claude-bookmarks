// SCRATCH PROTOTYPE (round 2, 2026-11-03): plugin/hooks/core/projects/registry.ts with a reconciled
// `projects` field, in two variants of the merge: A (one list-level stamp, `take('projects')`, the
// pattern `name`/`members` use) and B (a union by edge id, each edge's own `since` as its stamp, no
// list stamp). Marked `// PROTO`. Never loaded by the plugin.
import { serializeProjectFile, parseVersioned, isProjects, stampsOf, type Parsed, type ProjectFile, type ProjectEdge, type Stamps } from './project-file.ts'

export const IDENTITY_VERSION = 1

export type Identity = ProjectFile & { extra?: Record<string, unknown> }

const KNOWN = new Set(['version', 'id', 'name', 'user', 'created_at', 'members', 'projects', 'stamps']) // PROTO: + projects
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0

export function parseIdentity(text: string): Parsed<Identity> {
  const r = parseVersioned(text, IDENTITY_VERSION)
  if (r.kind !== 'ok') return r
  const o = r.value
  if (!isText(o.id) || !isText(o.name) || !isText(o.user) || !isText(o.created_at)) return { kind: 'bad', why: 'id, name, user or created_at missing' }
  if (!Array.isArray(o.members) || !o.members.every(m => typeof m === 'string')) return { kind: 'bad', why: 'members is not a list of paths' }
  const s = o.stamps as Partial<Stamps> | undefined
  if (!s || !isText(s.name) || !isText(s.members)) return { kind: 'bad', why: 'stamps missing' }
  if (o.projects !== undefined && !isProjects(o.projects)) return { kind: 'bad', why: 'projects is not a list of edges with an id' } // PROTO
  const extra = Object.fromEntries(Object.entries(o).filter(([k]) => !KNOWN.has(k)))
  return {
    kind: 'ok',
    value: { version: o.version as number, id: o.id, name: o.name, user: o.user, created_at: o.created_at, members: o.members as string[], ...(o.projects ? { projects: o.projects as ProjectEdge[] } : {}), stamps: stampsOf(s), ...(Object.keys(extra).length ? { extra } : {}) },
  }
}

export function serializeIdentity(i: Identity): string {
  const { version, id, name, user, created_at, members, projects, stamps, extra } = i
  return JSON.stringify({ version, id, name, user, created_at, members, ...(projects ? { projects } : {}), stamps: stampsOf(stamps), ...(extra ?? {}) }, null, 2) + '\n'
}

export function newIdentity(o: { id: string; name: string; user: string; now: string; members?: string[] }): Identity {
  return { version: IDENTITY_VERSION, id: o.id, name: o.name, user: o.user, created_at: o.now, members: o.members ?? [], stamps: { name: o.now, members: o.now } }
}

export const renamed = <T extends ProjectFile>(p: T, name: string, now: string): T => ({ ...p, name, stamps: { ...p.stamps, name: now } })
export const withMembers = <T extends ProjectFile>(p: T, members: string[], now: string): T => ({ ...p, members, stamps: { ...p.stamps, members: now } })
/** PROTO variant A: the whole list replaced, one stamp. */
export const withProjectsA = <T extends ProjectFile>(p: T, projects: ProjectEdge[], now: string): T => ({ ...p, projects, stamps: { ...p.stamps, projects: now } })
/** PROTO variant B: one edge set (added or re-stated), its own `since` the stamp; no list stamp. */
export const withEdgeB = <T extends ProjectFile>(p: T, edge: Omit<ProjectEdge, 'since'>, now: string): T =>
  ({ ...p, projects: [...(p.projects ?? []).filter(e => e.id !== edge.id), { ...edge, since: now }] })

export function projectFileOf(i: Identity): ProjectFile {
  const { version, id, name, user, created_at, members, projects, stamps } = i
  return { version, id, name, user, created_at, members: [...members], ...(projects ? { projects: projects.map(e => ({ ...e })) } : {}), stamps: stampsOf(stamps) }
}

export const identityOf = (p: ProjectFile): Identity => ({ ...projectFileOf(p as Identity), version: IDENTITY_VERSION })

export type Reconciled = { identity: Identity; projectFile: ProjectFile; writeIdentity: boolean; writeProjectFile: boolean }

/** PROTO variant B's merge: union by id; the same id on both sides takes the newer `since` (a tie: the identity); never a deletion. */
export function mergeEdges(a: readonly ProjectEdge[] = [], b: readonly ProjectEdge[] = []): ProjectEdge[] {
  const out = new Map<string, ProjectEdge>()
  for (const e of a) out.set(e.id, e)
  for (const e of b) {
    const mine = out.get(e.id)
    if (!mine || (e.since ?? '') > (mine.since ?? '')) out.set(e.id, e)
  }
  return [...out.values()]
}

export function reconcile(identity: Identity, file: ProjectFile, variant: 'A' | 'B' = 'B'): Reconciled {
  if (identity.id !== file.id) throw new Error(`reconcile: ${identity.id} is not ${file.id}`)
  const stamp = (s: Stamps, k: keyof Stamps) => s[k] ?? ''
  const take = (k: keyof Stamps) => (stamp(file.stamps, k) > stamp(identity.stamps, k) ? 'file' : 'identity')
  const nameFrom = take('name'), membersFrom = take('members')
  const name = nameFrom === 'file' ? file.name : identity.name
  const members = membersFrom === 'file' ? file.members : identity.members
  let projects: ProjectEdge[] | undefined
  let projectsStamp: string | undefined
  if (variant === 'A') {
    const from = take('projects')
    projects = from === 'file' ? file.projects : identity.projects
    projectsStamp = from === 'file' ? file.stamps.projects : identity.stamps.projects
  } else {
    const m = mergeEdges(identity.projects, file.projects)
    projects = m.length ? m : undefined
  }
  const stamps: Stamps = {
    name: nameFrom === 'file' ? file.stamps.name : identity.stamps.name,
    members: membersFrom === 'file' ? file.stamps.members : identity.stamps.members,
    ...(projectsStamp ? { projects: projectsStamp } : {}),
  }
  const merged: Identity = { ...identity, name, members: [...members], ...(projects ? { projects } : {}), stamps }
  if (!projects) delete (merged as { projects?: unknown }).projects
  const projectFile = projectFileOf(merged)
  const same = (a: ProjectFile, b: ProjectFile) => serializeProjectFile(a) === serializeProjectFile(b)
  return { identity: merged, projectFile, writeIdentity: serializeIdentity(merged) !== serializeIdentity(identity), writeProjectFile: !same(projectFile, file) }
}

export type ImportResult =
  | { kind: 'new'; identity: Identity }
  | { kind: 'same'; reconciled: Identity; changed: boolean }
  | { kind: 'collision'; local: Identity; incoming: Identity }

export function importIdentity(local: readonly Identity[], incoming: Identity, variant: 'A' | 'B' = 'B'): ImportResult {
  const mine = local.find(i => i.id === incoming.id)
  if (!mine) return { kind: 'new', identity: incoming }
  if (mine.created_at !== incoming.created_at || mine.user !== incoming.user) return { kind: 'collision', local: mine, incoming }
  const r = reconcile(mine, projectFileOf(incoming), variant)
  return { kind: 'same', reconciled: r.identity, changed: r.writeIdentity }
}

export const lookupProject = (identities: readonly Identity[], id: string): Identity | 'unregistered' =>
  identities.find(i => i.id === id) ?? 'unregistered'
