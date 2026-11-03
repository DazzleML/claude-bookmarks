// A project's bundle set and the references into it (0.8.x unit 4; the registry design, its C-7
// and its 18:02 addendum). Each project has one set, `bundles/index.json` (core/lists/format3.ts);
// an item shows a bundle of its own project's set by id, or another project's by `{ project, bundle }`,
// written `bm:bundle/<project-id>/<bundle-id>`. A reference never changes who made the bundle: a
// bundle Claude made, attached to the person's list, stays Claude's, with its own owner shown
// (djdarcy, 18:02: "compartmentalization between who created what and the ability for something to
// be referenced or used elsewhere"). Pure: the handler reads the sets and the registry.
import type { ListItem } from './lists.ts'
import type { Bundle } from './bundles.ts'
import type { BundleIndex, IndexEntry } from './format3.ts'
import { ID_PATTERN } from '../projects/registry.ts'

export type BundleRef = { project: string; bundle: string }

const REF = /^bm:bundle\/([a-z2-7]{8})\/([A-Za-z0-9_-]+)$/

/** `bm:bundle/<project-id>/<bundle-id>`, or undefined for anything else. */
export function parseBundleRef(text: string): BundleRef | undefined {
  const m = REF.exec(text.trim())
  return m ? { project: m[1]!, bundle: m[2]! } : undefined
}

export function formatBundleRef(r: BundleRef): string {
  if (!ID_PATTERN.test(r.project)) throw new Error(`formatBundleRef: ${r.project} is not a project id`)
  return `bm:bundle/${r.project}/${r.bundle}`
}

/** The bundle an item names, in full: its own project's set unless it names another. Undefined: the item shows no bundle. */
export const refOf = (item: Pick<ListItem, 'bundle' | 'bundleProject'>, ownProject: string): BundleRef | undefined =>
  item.bundle ? { project: item.bundleProject ?? ownProject, bundle: item.bundle } : undefined

/** What a project id leads to, as the handler found it: its set, or that the registry does not know it. */
export type SetLookup = (projectId: string) => BundleIndex | 'unregistered' | undefined

export type Resolved =
  | { kind: 'found'; project: string; entry: IndexEntry; owner: Bundle['by']; crossProject: boolean }
  | { kind: 'dangling'; ref: BundleRef; why: 'no such project' | 'no set' | 'no such bundle' }

/**
 * A reference resolved: through the registry to the project's set, then by id in the set. A
 * missing project or bundle is `dangling` (shown, never an error, and never written over); the
 * owner reported is the bundle's own, whichever list shows it.
 */
export function resolveBundle(ref: BundleRef, ownProject: string, sets: SetLookup): Resolved {
  const set = sets(ref.project)
  if (set === 'unregistered') return { kind: 'dangling', ref, why: 'no such project' }
  if (!set) return { kind: 'dangling', ref, why: 'no set' }
  const entry = set.bundles.find(b => b.id === ref.bundle)
  if (!entry) return { kind: 'dangling', ref, why: 'no such bundle' }
  return { kind: 'found', project: ref.project, entry, owner: entry.by, crossProject: ref.project !== ownProject }
}

/**
 * An item made to show a bundle: within the list's own project by id alone, across projects with
 * the project's id beside it. The bundle itself is not touched, so its owner stays its own.
 */
export function attachRef(item: ListItem, ref: BundleRef, ownProject: string): ListItem {
  const { bundleProject: _old, ...rest } = item
  return { ...rest, bundle: ref.bundle, ...(ref.project !== ownProject ? { bundleProject: ref.project } : {}) }
}

/** A bundle added to the set, or replaced by id; a replaced entry's revision moves on, a new one starts at 1. */
export function putEntry(index: BundleIndex, b: Bundle, file?: string): BundleIndex {
  const at = index.bundles.findIndex(e => e.id === b.id)
  const prev = at < 0 ? undefined : index.bundles[at]!
  const keptFile = file ?? prev?.file
  const entry: IndexEntry = { ...b, rev: prev ? prev.rev + 1 : 1, ...(keptFile ? { file: keptFile } : {}) }
  return { ...index, bundles: at < 0 ? [...index.bundles, entry] : index.bundles.map((e, i) => (i === at ? entry : e)) }
}

/** The entries with no owner (`lists check` reports them: every record carries `by`). */
export const ownerless = (index: BundleIndex): string[] => index.bundles.filter(e => !e.by).map(e => e.id)
