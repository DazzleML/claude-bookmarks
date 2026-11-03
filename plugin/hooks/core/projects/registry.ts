// The project registry's identity file (the registry design, 2026-11-02__16-26-45, with its 17:13
// and 17:50 addenda): `~/claude/projects/<id>.json`, one per registered project, shared across
// machines (ccs carries it later; djdarcy, 18:02). It names the project and nothing about where it
// is on any one machine (that is the placement file). Its other half is the project folder's
// `project.json`; each is rebuilt from the other, and the two are reconciled field by field.
//
// The id is minted once, where the project is created: 8 base32 characters, random, so two machines
// never mint the same one in practice and there is no counter, no alias and no renumbering (the
// proof of concept refuted the sequential id with an alias rule, arm 4). An unregistered folder has
// a project.json and no identity file: a default install writes nothing here.
import { serializeProjectFile, parseVersioned, isProjects, projectsOf, stampsOf, type Parsed, type ProjectEdge, type ProjectFile, type Stamps } from './project-file.ts'

export const IDENTITY_VERSION = 1

export type Identity = ProjectFile & {
  /** Keys this build does not write (the reserved `sessions` and `position`, a later build's own): kept as they were. */
  extra?: Record<string, unknown>
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
export const ID_PATTERN = /^[a-z2-7]{8}$/

/** An id from five random bytes (40 bits, 8 base32 characters); the caller supplies the bytes (crypto.getRandomValues). */
export function mintId(bytes: ArrayLike<number>): string {
  if (bytes.length < 5) throw new Error('mintId needs five random bytes')
  let bits = 0, value = 0, out = ''
  for (let i = 0; i < 5; i++) {
    value = (value << 8) | (bytes[i]! & 0xff)
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    value &= (1 << bits) - 1
  }
  return out
}

// `members` (dropped in 0.8.12) stays known so an older identity's empty list is read past, not kept as extra.
const KNOWN = new Set(['version', 'id', 'name', 'user', 'created_at', 'members', 'projects', 'stamps'])
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0

export function parseIdentity(text: string): Parsed<Identity> {
  const r = parseVersioned(text, IDENTITY_VERSION)
  if (r.kind !== 'ok') return r
  const o = r.value
  if (!isText(o.id) || !isText(o.name) || !isText(o.user) || !isText(o.created_at)) return { kind: 'bad', why: 'id, name, user or created_at missing' }
  if (o.projects !== undefined && !isProjects(o.projects)) return { kind: 'bad', why: 'projects is not a list of edges with an id' }
  const s = o.stamps as Partial<Stamps> | undefined
  if (!s || !isText(s.name)) return { kind: 'bad', why: 'stamps missing' }
  const extra = Object.fromEntries(Object.entries(o).filter(([k]) => !KNOWN.has(k)))
  return {
    kind: 'ok',
    value: { version: o.version as number, id: o.id, name: o.name, user: o.user, created_at: o.created_at, ...projectsOf(o as { projects?: ProjectEdge[] }), stamps: { name: s.name }, ...(Object.keys(extra).length ? { extra } : {}) },
  }
}

/** The identity file's text: the shared fields in one order, then any keys a later build wrote, as they were. */
export function serializeIdentity(i: Identity): string {
  const { version, id, name, user, created_at, stamps, extra } = i
  return JSON.stringify({ version, id, name, user, created_at, ...projectsOf(i), stamps: stampsOf(stamps), ...(extra ?? {}) }, null, 2) + '\n'
}

export const identityPath = (projectsDir: string, id: string): string => `${projectsDir.replace(/[\\/]+$/, '')}/${id}.json`

/** A new project's identity, its name stamped at its creation. */
export function newIdentity(o: { id: string; name: string; user: string; now: string }): Identity {
  return { version: IDENTITY_VERSION, id: o.id, name: o.name, user: o.user, created_at: o.now, stamps: { name: o.now } }
}

/** A rename: one field and its stamp. Nothing that references the project changes (references carry the id). */
export const renamed = <T extends ProjectFile>(p: T, name: string, now: string): T => ({ ...p, name, stamps: { ...p.stamps, name: now } })

/**
 * One relation set or re-stated: added, or replacing this project's edge to the same id, with `since`
 * now. A removal is `state: -2` (ungrouped), so it travels like any other change and is never lost to
 * an older copy that still holds the edge.
 */
export const withEdge = <T extends ProjectFile>(p: T, edge: Omit<ProjectEdge, 'since'>, now: string): T =>
  ({ ...p, projects: [...(p.projects ?? []).filter(e => e.id !== edge.id), { ...edge, since: now }] })

/**
 * Two copies of a project's relations merged: a union by id; the same id on both sides takes the newer
 * `since`, a tie or a missing `since` the first side's (the identity's). Nothing is deleted.
 */
export function mergeEdges(a: readonly ProjectEdge[] = [], b: readonly ProjectEdge[] = []): ProjectEdge[] {
  const out = new Map<string, ProjectEdge>()
  for (const e of a) out.set(e.id, e)
  for (const e of b) {
    const mine = out.get(e.id)
    if (!mine || (e.since ?? '') > (mine.since ?? '')) out.set(e.id, e)
  }
  return [...out.values()]
}

/** The mirror of an identity, as `project.json` holds it. */
export function projectFileOf(i: Identity): ProjectFile {
  const { version, id, name, user, created_at, stamps } = i
  return { version, id, name, user, created_at, ...projectsOf(i), stamps: stampsOf(stamps) }
}

/** An identity rebuilt from a project folder's `project.json` (the identity file was lost). */
export const identityOf = (p: ProjectFile): Identity => ({ ...projectFileOf(p as Identity), version: IDENTITY_VERSION })

export type Reconciled = { identity: Identity; projectFile: ProjectFile; writeIdentity: boolean; writeProjectFile: boolean }

/**
 * The two halves after each changed apart: the name is taken from the side with the newer stamp, and
 * the relations are merged edge by edge (`mergeEdges`), so a rename in the registry and a relation
 * added through the project folder both survive (a single file-wide stamp lost one of them, the
 * proof's measurement R; a list-level stamp on the relations lost an edge, the umbrella
 * consultation's prototype). A side is written only when it differs from the result: the mirror is
 * written when the entry is newer, not at every load, so the vault's git does not churn.
 */
export function reconcile(identity: Identity, file: ProjectFile): Reconciled {
  if (identity.id !== file.id) throw new Error(`reconcile: ${identity.id} is not ${file.id}`)
  const nameFrom = file.stamps.name > identity.stamps.name ? 'file' : 'identity'
  const name = nameFrom === 'file' ? file.name : identity.name
  const stamps: Stamps = { name: nameFrom === 'file' ? file.stamps.name : identity.stamps.name }
  const { projects: _old, ...rest } = identity
  const merged: Identity = { ...rest, name, ...projectsOf({ projects: mergeEdges(identity.projects, file.projects) }), stamps }
  const projectFile = projectFileOf(merged)
  const same = (a: ProjectFile, b: ProjectFile) => serializeProjectFile(a) === serializeProjectFile(b)
  return { identity: merged, projectFile, writeIdentity: serializeIdentity(merged) !== serializeIdentity(identity), writeProjectFile: !same(projectFile, file) }
}

export type ImportResult =
  | { kind: 'new'; identity: Identity }
  | { kind: 'same'; reconciled: Identity; changed: boolean }
  | { kind: 'collision'; local: Identity; incoming: Identity }

/**
 * An identity from another machine (a sync or a copied file). The same id with the same creation and
 * account is the same project, reconciled field by field; the same id on a different project is
 * refused and reported, never renumbered: with minted ids it should not happen, so when it does a
 * person decides.
 */
export function importIdentity(local: readonly Identity[], incoming: Identity): ImportResult {
  const mine = local.find(i => i.id === incoming.id)
  if (!mine) return { kind: 'new', identity: incoming }
  if (mine.created_at !== incoming.created_at || mine.user !== incoming.user) return { kind: 'collision', local: mine, incoming }
  const r = reconcile(mine, projectFileOf(incoming))
  return { kind: 'same', reconciled: r.identity, changed: r.writeIdentity }
}

/** A project by id: the identity, or `unregistered` (an id in a `.repokit.json` this machine does not know). */
export const lookupProject = (identities: readonly Identity[], id: string): Identity | 'unregistered' =>
  identities.find(i => i.id === id) ?? 'unregistered'
