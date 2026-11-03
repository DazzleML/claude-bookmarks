// A project's placement on one machine, for one OS account (the registry design's 17:50 addendum):
// `~/claude/projects/<machine>/<user>/<id>.json`, the plugin's file with one writer. It says where
// the project's root is here, which folders outside the root are members, where its vault is and
// whether its data folder is linked there, and the ordinal `n` this machine shows it under
// (`#7 claude-bookmarks`). The ordinal never leaves the machine: references carry the id.
import { fileSafe, projectOf } from '../lists/lists.ts'
import { parseVersioned, type Parsed } from './project-file.ts'

export const PLACEMENT_VERSION = 1

export type Placement = {
  version: number
  id: string
  /** The project's root folder on this machine, by real path. */
  root: string
  /** Member folders outside the root, as seen here, by real path. */
  members: string[]
  vault?: string
  /** The folder inside the vault the data folder is linked to (`private/claude/bookmarks`). */
  junction_point?: string
  linked: boolean
  /** The display ordinal on this machine: given at first sight, never reused. */
  n: number
  updated_at: string
}

/** A path compared as the design says: one separator, no trailing one, lower case. */
export const normPath = (p: string): string => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/(.)\/$/, '$1').toLowerCase()

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0

export function parsePlacement(text: string): Parsed<Placement> {
  const r = parseVersioned(text, PLACEMENT_VERSION)
  if (r.kind !== 'ok') return r
  const o = r.value
  if (!isText(o.id) || !isText(o.root) || !isText(o.updated_at)) return { kind: 'bad', why: 'id, root or updated_at missing' }
  if (!Array.isArray(o.members) || !o.members.every(m => typeof m === 'string')) return { kind: 'bad', why: 'members is not a list of paths' }
  if (typeof o.n !== 'number' || !Number.isInteger(o.n) || o.n < 1) return { kind: 'bad', why: 'n is not a positive whole number' }
  return {
    kind: 'ok',
    value: {
      version: o.version as number, id: o.id, root: o.root, members: o.members as string[],
      ...(isText(o.vault) ? { vault: o.vault } : {}), ...(isText(o.junction_point) ? { junction_point: o.junction_point } : {}),
      linked: o.linked === true, n: o.n, updated_at: o.updated_at,
    },
  }
}

export function serializePlacement(p: Placement): string {
  const { version, id, root, members, vault, junction_point, linked, n, updated_at } = p
  return JSON.stringify({ version, id, root, members, ...(vault ? { vault } : {}), ...(junction_point ? { junction_point } : {}), linked, n, updated_at }, null, 2) + '\n'
}

/** Where the placement file lives under the projects folder. */
export const placementPath = (projectsDir: string, machine: string, user: string, id: string): string =>
  `${projectsDir.replace(/[\\/]+$/, '')}/${fileSafe(machine)}/${fileSafe(user)}/${id}.json`

/** The next ordinal: one past the highest this machine has given (the files are the record). */
export const nextOrdinal = (placements: readonly Pick<Placement, 'n'>[]): number => placements.reduce((m, p) => Math.max(m, p.n), 0) + 1

const isUnder = (path: string, base: string): boolean => path === base || path.startsWith(base.endsWith('/') ? base : `${base}/`)

export type Membership = { id: string; root: string; via: 'root' | 'member'; base: string }

/**
 * The project a working folder belongs to: the registered root or member folder that is the longest
 * prefix of its real path (the deepest wins, so a project nested in another's tree is its own).
 * Undefined: the folder is under no registered root and is its own project folder.
 */
export function membershipOf(cwdReal: string, placements: readonly Placement[]): Membership | undefined {
  const cwd = normPath(cwdReal)
  let best: Membership | undefined
  for (const p of placements) {
    const bases: [string, 'root' | 'member'][] = [[p.root, 'root'], ...p.members.map(m => [m, 'member'] as [string, 'member'])]
    for (const [base, via] of bases) {
      const b = normPath(base)
      if (isUnder(cwd, b) && (!best || b.length > normPath(best.base).length)) best = { id: p.id, root: p.root, via, base }
    }
  }
  return best
}

/**
 * The folder under the project's `lists/` that holds a working folder's lists: `_root` for the root,
 * the path below the root with `/` written `--`, or `<base>--<hash8>` for a member outside the root.
 */
export function listsFolderOf(root: string, cwdReal: string, hash: (s: string) => string): string {
  const r = normPath(root), c = normPath(cwdReal)
  if (c === r) return '_root'
  if (isUnder(c, r)) {
    // The same path as `c` but in its own case: normPath changes only case, separators and the trailing one.
    const own = cwdReal.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/(.)\/$/, '$1')
    return own.slice(r.length + 1).split('/').filter(Boolean).map(fileSafe).join('--')
  }
  return `${fileSafe(projectOf(cwdReal))}--${hash(c).slice(0, 8)}`
}

/** What the handler found about a candidate root before registering it. */
export type RootFacts = { home: string; hasGit: boolean; hasRepokit: boolean }

/**
 * An umbrella vault is never registered as a project: the home folder (it has `.git`, so the git
 * clause alone would pass it), a drive root, or a folder with neither `.git` nor `.repokit.json`.
 * The reason is returned, for the dry run to print.
 */
export function umbrellaReason(path: string, facts: RootFacts): string | undefined {
  const p = normPath(path)
  if (p === normPath(facts.home)) return 'the home folder'
  if (/^[a-z]:\/?$/.test(p) || p === '/') return 'a drive root'
  if (!facts.hasGit && !facts.hasRepokit) return 'neither .git nor .repokit.json'
  return undefined
}
