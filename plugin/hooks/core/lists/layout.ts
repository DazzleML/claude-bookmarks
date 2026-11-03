// Where a working folder's lists and its project's bundles live in the format-3 layout (0.8.x unit
// 5; the registry design's 17:50 addendum): `<data root>/bookmarks/projects/<concept>__<id>__<user>/`
// holding `project.json`, `lists/<folder>/lists.json` and `bundles/{index.json, <files>}`. A
// folder under a registered root or member belongs to that project, found by the id in its folder
// name; a folder under none is its own project folder, its lists at `_root`. Pure: the handler
// lists the folders and reads the files.
import { fileSafe, parseLists, projectOf, serializeLists, type ListsFile } from './lists.ts'
import { serializeBundleIndex, toFormat3 } from './format3.ts'
import { listsFolderOf, membershipOf, normPath, type Placement } from '../projects/placement.ts'
import { foldersWithId, projectFolderName } from '../projects/project-file.ts'

export type Layout = {
  /** The project's data folder, under `<data root>/bookmarks/projects/`. */
  folder: string
  listsFolder: string
  listsPath: string
  indexPath: string
  bundlesDir: string
  /** The registered project's id; absent for a folder that is its own project. */
  id?: string
}

export type LayoutAnswer =
  | { kind: 'found'; layout: Layout; candidates: string[] }
  /** Registered, but no data folder carries its id yet: the handler mints it as `<name>__<id>__<user>`. */
  | { kind: 'new-folder'; layout: Layout }
  /** Under no registered root: the handler finds or mints the folder's own project folder. */
  | { kind: 'own'; base: string; candidates: string[] }

const join = (...p: string[]) => p.map((s, i) => (i === 0 ? s.replace(/[\\/]+$/, '') : s.replace(/^[\\/]+|[\\/]+$/g, ''))).join('/')

/**
 * A version 2 flat lists file split for the project folder: the texts of its `lists.json` (version
 * 3, no bundles) and of the set's `index.json`. A file that does not read at version 2 is left as
 * it is and said why; an item naming a bundle the file did not hold is reported, never dropped.
 */
export function splitFlatFile(text: string):
  | { kind: 'split'; lists: string; index: string; bundles: number; dangling: string[] }
  | { kind: 'not-v2'; why: string } {
  // Read at version 2 whatever this build's version is: at 3, parseLists would refuse the
  // bundles (the 2->3 guard) or step a file without them past the split.
  const r = parseLists(text, 2)
  if (r.kind !== 'ok') return { kind: 'not-v2', why: r.kind === 'newer' ? `already at version ${r.version}` : r.why }
  if (r.file.version !== 2) return { kind: 'not-v2', why: `version ${r.file.version}` }
  const out = toFormat3(r.file)
  return { kind: 'split', lists: serializeLists(out.lists as ListsFile), index: serializeBundleIndex(out.index), bundles: out.index.bundles.length, dangling: out.dangling }
}

/** What `$.fs.stat(path, { resolve: true })` answered for the project folder, and how its parent listed it. */
export type LinkFacts = {
  stat?: { kind: string; isLink?: boolean; realPath?: string }
  /** The parent's listing has an entry by this name, and whether it is a link. */
  listed?: { isLink: boolean }
}

export type LinkState = 'ok' | 'broken' | 'removed' | 'elsewhere' | 'not a folder'

/**
 * The dangling check's first half (the registry design's 17:50 addendum): a rejected stat is a
 * state, and the parent's listing tells a broken link (still listed, as a link) from a removed one
 * (not listed); a link with no real path, or anything but a folder, is dangling; a real path that
 * is not the expected target is "points elsewhere". The second half -- project.json's id -- is
 * project-file.ts checkFolder, run on the real-folder branch too.
 */
export function linkState(f: LinkFacts, expectedTarget?: string): LinkState {
  if (!f.stat) return f.listed ? 'broken' : 'removed'
  if (f.stat.isLink && !f.stat.realPath) return 'broken'
  if (f.stat.kind !== 'dir') return 'not a folder'
  if (expectedTarget && f.stat.realPath && normPath(f.stat.realPath) !== normPath(expectedTarget)) return 'elsewhere'
  return 'ok'
}

/**
 * A folder's own project folder among the candidates `layoutFor` offered (same base name): the one
 * whose root lists file records this working folder, compared as paths (two folders of one name
 * stay apart, the 0.7 rule). None: the handler mints `<base>__<id>__<user>` with a fresh id.
 */
export function ownFolderFor(candidates: readonly { folder: string; recordedCwd?: string }[], cwdReal: string): string | undefined {
  const want = normPath(cwdReal)
  return candidates.find(c => c.recordedCwd !== undefined && normPath(c.recordedCwd) === want)?.folder
}

export type WriteVerdict = { write: boolean; create: boolean; why?: string }

/**
 * Whether a write may go ahead, and whether it may create the project folder, from the folder's
 * link state and its project.json check (project-file.ts checkFolder's kind), re-resolved just
 * before the write. Every failure refuses and never creates a folder; only a folder that is truly
 * absent, for a project not linked into a vault, is made.
 */
export function writeVerdict(link: LinkState, check: 'ok' | 'moved' | 'wrong id' | 'missing' | 'bad', linked: boolean): WriteVerdict {
  if (linked) {
    if (link !== 'ok') return { write: false, create: false, why: `the link to the vault is ${link === 'elsewhere' ? 'pointing elsewhere' : link}` }
    if (check !== 'ok') return { write: false, create: false, why: `the linked folder's project.json is ${check}` }
    return { write: true, create: false }
  }
  if (link === 'removed') return { write: true, create: true }
  if (link !== 'ok') return { write: false, create: false, why: `the project folder is ${link === 'elsewhere' ? 'pointing elsewhere' : link}` }
  if (check === 'ok') return { write: true, create: false }
  if (check === 'missing') return { write: true, create: false, why: 'project.json is written with the first write' }
  return { write: false, create: false, why: check === 'moved' ? 'this folder was renamed; it holds only a stub' : `project.json is ${check}` }
}

/** The paths inside one project data folder, for one working folder's lists. */
export function pathsIn(dataRoot: string, folder: string, listsFolder: string, id?: string): Layout {
  const base = join(dataRoot, 'bookmarks', 'projects', folder)
  return {
    folder, listsFolder,
    listsPath: join(base, 'lists', listsFolder, 'lists.json'),
    indexPath: join(base, 'bundles', 'index.json'),
    bundlesDir: join(base, 'bundles'),
    ...(id ? { id } : {}),
  }
}

/**
 * Where a working folder's data lives. `names` maps a registered id to its project's name (for a
 * folder not made yet); `folders` are the names under `projects/`; `hash` names a member folder
 * outside the root, as `listsFolderOf` does.
 */
export function layoutFor(o: {
  dataRoot: string; cwdReal: string; user: string; placements: readonly Placement[]
  names: ReadonlyMap<string, string>; folders: readonly string[]; hash: (s: string) => string
}): LayoutAnswer {
  const m = membershipOf(o.cwdReal, o.placements)
  if (!m) {
    const base = fileSafe(projectOf(o.cwdReal))
    return { kind: 'own', base, candidates: o.folders.filter(f => f.startsWith(`${base}__`)) }
  }
  const listsFolder = listsFolderOf(m.root, o.cwdReal, o.hash)
  const candidates = foldersWithId(o.folders, m.id)
  if (candidates.length) return { kind: 'found', layout: pathsIn(o.dataRoot, candidates[0]!, listsFolder, m.id), candidates }
  const name = o.names.get(m.id) ?? projectOf(m.root)
  return { kind: 'new-folder', layout: pathsIn(o.dataRoot, projectFolderName(name, m.id, o.user), listsFolder, m.id) }
}