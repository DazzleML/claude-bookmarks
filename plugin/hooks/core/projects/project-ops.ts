// The `/bm-project` operations, pure (0.8.x unit 6b; the registry design's 17:50 addendum, the
// Director's rulings of 2026-11-03 11:2x): what `register`, `where` and `rename` write, decided
// from what the handler read. A default install writes nothing under `~/claude/projects/` until the
// person registers a project. Registering a folder that already has its own project folder adopts
// that folder's id -- never a fresh one -- so the identity, the placement and the data folder agree
// and no second folder is made. handlers/projects.ts reads and writes.
import { identityOf, mintId, newIdentity, projectFileOf, renamed, serializeIdentity, type Identity } from './registry.ts'
import { membershipOf, nextOrdinal, normPath, placementPath, serializePlacement, umbrellaReason, PLACEMENT_VERSION, type Placement, type RootFacts } from './placement.ts'
import { foldersWithId, serializeProjectFile, type ProjectFile } from './project-file.ts'
import { projectOf } from '../lists/lists.ts'

export type Write = { path: string; text: string }

/** A working folder's own project folder, as the lists layout found it (handlers/lists-layout.ts resolveLayout). */
export type OwnFolder = { folder: string; id: string; projectFile?: ProjectFile }

export type RegisterPlan =
  | { kind: 'refused'; why: string }
  | { kind: 'already'; placement: Placement; name?: string }
  | { kind: 'register'; id: string; adopted: boolean; identity: Identity; placement: Placement; writes: Write[] }

const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

/**
 * Register the working folder as a project's root on this machine: refused for an umbrella (the
 * home folder, a drive root, a folder with neither `.git` nor `.repokit.json`); `already` when a
 * placement has this root; else the identity file, the placement (the next ordinal) and, when the
 * folder's own project folder exists, its `project.json` mirrored from the identity.
 */
export function registerPlan(o: {
  cwdReal: string; dataRoot: string; machine: string; user: string; now: string
  facts: RootFacts; placements: readonly Placement[]; names: ReadonlyMap<string, string>
  own?: OwnFolder; name?: string; bytes: ArrayLike<number>
}): RegisterPlan {
  const root = slash(o.cwdReal)
  const same = o.placements.find(p => normPath(p.root) === normPath(root))
  if (same) return { kind: 'already', placement: same, ...(o.names.get(same.id) ? { name: o.names.get(same.id)! } : {}) }
  const umbrella = umbrellaReason(root, o.facts)
  if (umbrella) return { kind: 'refused', why: `${root} is ${umbrella}: a project's root is a repository or a folder with .repokit.json` }
  const id = o.own?.id ?? mintId(o.bytes)
  const base = o.own?.projectFile ? identityOf(o.own.projectFile) : newIdentity({ id, name: o.name ?? projectOf(root), user: o.user, now: o.now })
  const identity = o.name && o.name !== base.name ? renamed(base, o.name, o.now) : base
  const placement: Placement = { version: PLACEMENT_VERSION, id, root, members: [], linked: false, n: nextOrdinal(o.placements), updated_at: o.now }
  const projectsDir = `${slash(o.dataRoot)}/projects`
  const writes: Write[] = [
    { path: `${projectsDir}/${id}.json`, text: serializeIdentity(identity) },
    { path: placementPath(projectsDir, o.machine, o.user, id), text: serializePlacement(placement) },
  ]
  if (o.own) {
    const mirror = serializeProjectFile(projectFileOf(identity))
    if (!o.own.projectFile || serializeProjectFile(o.own.projectFile) !== mirror) writes.push({ path: `${slash(o.dataRoot)}/bookmarks/projects/${o.own.folder}/project.json`, text: mirror })
  }
  return { kind: 'register', id, adopted: !!o.own, identity, placement, writes }
}

export type WhereRow = { n: number; name: string; id: string; root: string; linked: boolean; target?: string; folder?: string; here: boolean }

/**
 * Every project registered on this machine, the ordinal first, and which one this session is in;
 * plus the warnings `where` prints: this session's folder reached through a link (its real path is
 * elsewhere), and a registered root that is gone.
 */
export function whereRows(o: {
  placements: readonly Placement[]; names: ReadonlyMap<string, string>; folders: readonly string[]
  cwd: string; cwdReal: string; rootsMissing: ReadonlySet<string>
}): { rows: WhereRow[]; warnings: string[] } {
  const here = membershipOf(o.cwdReal, o.placements)?.id
  const rows = [...o.placements].sort((a, b) => a.n - b.n).map(p => {
    const folder = foldersWithId(o.folders, p.id)[0]
    return {
      n: p.n, name: o.names.get(p.id) ?? projectOf(p.root), id: p.id, root: p.root, linked: p.linked,
      ...(p.linked && p.vault ? { target: `${slash(p.vault)}/${p.junction_point ?? 'private/claude/bookmarks'}` } : {}),
      ...(folder ? { folder } : {}), here: p.id === here,
    }
  })
  const warnings: string[] = []
  if (normPath(o.cwd) !== normPath(o.cwdReal)) warnings.push(`this session's folder ${slash(o.cwd)} is reached through a link: its real path is ${slash(o.cwdReal)}, and that is what decides its project`)
  for (const p of o.placements) if (o.rootsMissing.has(p.id)) warnings.push(`the root of #${p.n} ${o.names.get(p.id) ?? p.id} is gone: ${p.root}`)
  return { rows, warnings }
}

/** The `where` answer as lines; `own` names this folder's own project folder when it is under no registered root. */
export function whereText(r: ReturnType<typeof whereRows>, own?: { folder?: string }): string[] {
  const lines = r.rows.length
    ? r.rows.map(x => `${x.here ? '▸' : ' '} #${x.n} ${x.name} (${x.id}) -- ${x.root}${x.linked ? ` -- linked to ${x.target ?? 'its vault'}` : ''}${x.folder ? ` -- ${x.folder}` : ' -- no data folder yet'}`)
    : ['No project is registered on this machine.']
  if (!r.rows.some(x => x.here)) lines.push(own?.folder ? `This folder is its own project: ${own.folder}` : 'This folder is its own project; its folder is made on the first write.')
  return [...lines, ...r.warnings.map(w => `! ${w}`)]
}

/** A rename: the registry's name and its stamp, mirrored into the data folder's `project.json`; the folder keeps its name (folders are found by id). */
export function renamePlan(o: { identity: Identity; name: string; now: string; dataRoot: string; folder?: string }): { identity: Identity; writes: Write[] } | { error: string } {
  const name = o.name.trim()
  if (!name) return { error: 'rename needs a name' }
  if (name === o.identity.name) return { error: `the project is already named ${name}` }
  const identity = renamed(o.identity, name, o.now)
  const projectsDir = `${slash(o.dataRoot)}/projects`
  return {
    identity,
    writes: [
      { path: `${projectsDir}/${identity.id}.json`, text: serializeIdentity(identity) },
      ...(o.folder ? [{ path: `${slash(o.dataRoot)}/bookmarks/projects/${o.folder}/project.json`, text: serializeProjectFile(projectFileOf(identity)) }] : []),
    ],
  }
}
