// Lists format 3, the step (0.8.x unit 2; the registry design, 2026-11-02__16-26-45, its 17:50
// addendum and the 20:21 one): a version 2 lists file splits into its `lists.json` (version 3, no
// bundles) and the project's bundle set index `bundles/index.json`, under the project's data folder
// `projects/<concept>__<id>__<user>/lists/<folder>/`. The step is pure and has an inverse, so the
// move is proven to lose no record before any real file is touched.
//
// Not yet live: LISTS_VERSION stays at 2 until the handler reads the folder layout (unit 5), and
// the first load after that is the one-time run (unit 7), after the snapshot. Until unit 3 writes
// a file per bundle, each index entry holds the bundle's whole record and no `file`.
import type { ListsFile } from './lists.ts'
import type { Bundle } from './bundles.ts'
import { parseVersioned, projectFolderName, type Parsed, type ProjectFile } from '../projects/project-file.ts'
import { newIdentity, projectFileOf } from '../projects/registry.ts'

export const LISTS_FORMAT3 = 3
export const BUNDLE_INDEX_VERSION = 1

/** A bundle in its set's index: its record, its revision, and (from unit 3) its file. */
export type IndexEntry = Bundle & { rev: number; file?: string }
export type BundleIndex = { version: number; bundles: IndexEntry[] }

/** A lists file in format 3: what version 2 held, less the bundles. */
export type ListsFile3 = Omit<ListsFile, 'bundles'>

export type Format3 = {
  lists: ListsFile3
  index: BundleIndex
  /** Bundle ids an item names that the file did not hold: carried as they are, and reported. */
  dangling: string[]
}

const itemsOf = (f: Pick<ListsFile, 'lists' | 'removed'>) => [...f.lists, ...f.removed].flatMap(l => l.items)

/** The split: the lists at version 3 without their bundles, and the bundles as the set's index, in their order. */
export function toFormat3(f: ListsFile): Format3 {
  if (f.version >= LISTS_FORMAT3) throw new Error(`toFormat3: the file is already at version ${f.version}`)
  const { bundles, ...rest } = f
  const held = new Set((bundles ?? []).map(b => b.id))
  const dangling = [...new Set(itemsOf(f).flatMap(i => (i.bundle && !held.has(i.bundle) ? [i.bundle] : [])))]
  return {
    lists: { ...rest, version: LISTS_FORMAT3 },
    index: { version: BUNDLE_INDEX_VERSION, bundles: (bundles ?? []).map(b => ({ ...b, rev: 1 })) },
    dangling,
  }
}

/** The inverse, the in-memory file the handler works on: the lists with their set's bundles back in, in the index's order. */
export function fromFormat3(lists: ListsFile3, index: BundleIndex): ListsFile {
  const bundles = index.bundles.map(({ rev: _rev, file: _file, ...b }) => b as Bundle)
  return { ...lists, ...(bundles.length ? { bundles } : {}) }
}

/** The step on whatever is there: a version 2 file is split; a version 3 pair is returned as it was (so the step twice changes nothing). */
export function stepToFormat3(input: { lists: ListsFile | ListsFile3; index?: BundleIndex }): Format3 {
  if (input.lists.version >= LISTS_FORMAT3) return { lists: input.lists as ListsFile3, index: input.index ?? { version: BUNDLE_INDEX_VERSION, bundles: [] }, dangling: [] }
  return toFormat3(input.lists as ListsFile)
}

/** Where a flat file's lists go when its folder is under no registered root: its own project folder, minted, with its lists at `_root`. */
export function ownProjectOf(f: Pick<ListsFile, 'project'>, o: { id: string; user: string; now: string }): { folder: string; listsFolder: string; projectFile: ProjectFile } {
  return {
    folder: projectFolderName(f.project, o.id, o.user),
    listsFolder: '_root',
    projectFile: projectFileOf(newIdentity({ id: o.id, name: f.project, user: o.user, now: o.now })),
  }
}

export const serializeBundleIndex = (i: BundleIndex): string => `${JSON.stringify(i, null, 2)}\n`

/** Reads the set's index; a newer one is not read, so it is never written over. */
export function parseBundleIndex(text: string): Parsed<BundleIndex> {
  const r = parseVersioned(text, BUNDLE_INDEX_VERSION)
  if (r.kind !== 'ok') return r
  const b = r.value.bundles
  if (!Array.isArray(b) || !b.every(e => e && typeof e === 'object' && typeof (e as IndexEntry).id === 'string' && typeof (e as IndexEntry).rev === 'number')) {
    return { kind: 'bad', why: 'bundles is not a list of entries with an id and a rev' }
  }
  return { kind: 'ok', value: { version: r.value.version as number, bundles: b as IndexEntry[] } }
}
