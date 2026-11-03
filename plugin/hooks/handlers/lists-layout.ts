// The lists handler's format-3 layer (0.8.x unit 5; the registry design's 17:50 addendum and the
// bundles design, section 4): where a working folder's lists and its project's bundle set live,
// the dangling check before any write that creates, the set read with each bundle's file, the
// one-time split of a format-2 flat file, and the write of the whole. Pure core decides
// (core/lists/layout.ts, format3.ts, bundle-file.ts, bundle-set.ts, core/projects/*); this reads
// and writes through the ports. handlers/lists.ts calls it when LISTS_VERSION is 3 or more.
import { layoutFor, linkState, ownFolderFor, pathsIn, splitFlatFile, writeVerdict, type Layout, type LinkState, type WriteVerdict } from '../core/lists/layout.ts'
import { listsBaseName, parseLists, projectOf, serializeLists, type ListsFile } from '../core/lists/lists.ts'
import { BUNDLE_INDEX_VERSION, LISTS_FORMAT3, fromFormat3, parseBundleIndex, serializeBundleIndex, type BundleIndex, type IndexEntry } from '../core/lists/format3.ts'
import { putEntry } from '../core/lists/bundle-set.ts'
import { parseBundleFile, renderBundleFile, type BundleFileData } from '../core/lists/bundle-file.ts'
import { settle, type Bundle } from '../core/lists/bundles.ts'
import { describeLink } from '../core/lists/lists-tool.ts'
import { hrefOf } from '../core/lists/item-links.ts'
import { checkFolder, projectFolderName, serializeProjectFile, type FolderCheck, type ProjectFile } from '../core/projects/project-file.ts'
import { mintId, newIdentity, parseIdentity, projectFileOf } from '../core/projects/registry.ts'
import { fileSafe } from '../core/lists/lists.ts'
import { parsePlacement, type Placement } from '../core/projects/placement.ts'
export type { Layout }
export { layoutFor, ownFolderFor }

/** What the format-3 layer reads and writes through (a part of the handler's ListsPorts). */
export type LayoutPorts = {
  dataRoot: () => Promise<string | undefined>
  cwd: () => Promise<string>
  /** The OS account and the machine, for the placement files' folder. */
  user: () => Promise<string>
  machine: () => Promise<string>
  fsExists: (path: string) => Promise<boolean>
  fsRead: (path: string) => Promise<string>
  fsWrite: (path: string, text: string) => Promise<unknown>
  /** `$.fs.list`: `{ name, kind, size, mtimeMs, isLink }` each; a link lists as `other` with `isLink`. Rejects on a missing folder. */
  fsList: (path: string) => Promise<readonly { name: string; kind: string; size?: number; mtimeMs?: number; isLink?: boolean }[]>
  /** `$.fs.stat(path, { resolve: true })`: `kind` of what it leads to, `isLink`, `realPath` when it leads somewhere; undefined when the stat rejects. */
  fsStatLink: (path: string) => Promise<{ kind: string; isLink?: boolean; realPath?: string } | undefined>
  /** A file's size and last change, undefined when it is not there (the freshness check). */
  fsStat?: (path: string) => Promise<{ size: number; mtimeMs: number } | undefined>
  randomBytes: (n: number) => ArrayLike<number>
  hash: (text: string) => string
  now: () => Promise<number>
  log: (line: string) => void
  toast: (text: string, timeoutMs?: number) => void
}

const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z')
const ID_IN_NAME = /__([a-z2-7]{8})__/
/** The `cwd` a lists file records, read raw (no format gate). */
const recordedCwd = (text: string): string | undefined => {
  try {
    const c = (JSON.parse(text) as { cwd?: unknown }).cwd
    return typeof c === 'string' && c ? c : undefined
  } catch {
    return undefined
  }
}

/** Where one working folder's lists live, resolved through the registry and the folders on disk. */
export type Resolved = {
  root: string
  layout: Layout
  /** The project's data folder, `<root>/bookmarks/projects/<folder>`. */
  folderPath: string
  /** The project's id: the placement's, or the one in the folder's name. */
  id?: string
  /** The data folder was found on disk (by id, or by the cwd its root lists record); otherwise it is named here and made on the first write. */
  found: boolean
  placement?: Placement
  linked: boolean
  /** `project.json` as the folder's first write makes it: minted for a folder that is its own project, the identity's mirror for a registered one. */
  projectFile?: ProjectFile
  /** The format-2 flat file this folder's lists lived in, split on the first load that finds no `lists.json`. */
  flatPath: string
}

/** The placement files for this machine and account, and the registered projects' names by id. */
export async function readPlacements(ports: LayoutPorts, root: string): Promise<{ placements: Placement[]; names: Map<string, string> }> {
  const dir = `${root}/projects/${fileSafe(await ports.machine())}/${fileSafe(await ports.user())}`
  const placements: Placement[] = []
  for (const e of await ports.fsList(dir).catch(() => [])) {
    if (e.kind !== 'file' || !e.name.endsWith('.json')) continue
    const r = parsePlacement(await ports.fsRead(`${dir}/${e.name}`).catch(() => ''))
    if (r.kind === 'ok') placements.push(r.value)
    else ports.log(`[bm] lists: the placement file ${dir}/${e.name} is not read (${r.kind === 'bad' ? r.why : `format ${r.version}`})`)
  }
  const names = new Map<string, string>()
  for (const p of placements) {
    const r = parseIdentity(await ports.fsRead(`${root}/projects/${p.id}.json`).catch(() => ''))
    if (r.kind === 'ok') names.set(p.id, r.value.name)
  }
  return { placements, names }
}

/** The format-2 flat file for a working folder: `<root>/bookmarks/lists/<project>[--<hash8>].json` (the plain name's file may hold another folder of the same name, L-1). */
export async function flatPathOf(ports: LayoutPorts, root: string, cwd: string): Promise<string> {
  const dir = `${root}/bookmarks/lists`
  const plain = `${dir}/${listsBaseName(cwd, undefined, ports.hash)}.json`
  let holder: string | undefined
  if (await ports.fsExists(plain)) {
    const r = parseLists(await ports.fsRead(plain))
    holder = r.kind === 'ok' ? r.file.cwd || undefined : undefined
  }
  return `${dir}/${listsBaseName(cwd, holder, ports.hash)}.json`
}

/**
 * Where this working folder's lists live: under a registered root, the project's folder found by
 * id (or named from the registry when none is made yet); under none, the folder's own project
 * folder -- the candidate whose root lists record this folder, else one minted now and made on the
 * first write. Undefined with no data root.
 */
export async function resolveLayout(ports: LayoutPorts): Promise<Resolved | undefined> {
  const rootRaw = await ports.dataRoot()
  if (!rootRaw) return undefined
  const root = slash(rootRaw)
  const cwd = slash(await ports.cwd())
  const cwdReal = slash((await ports.fsStatLink(cwd))?.realPath ?? cwd)
  const user = await ports.user()
  const { placements, names } = await readPlacements(ports, root)
  const projectsDir = `${root}/bookmarks/projects`
  const folders = (await ports.fsList(projectsDir).catch(() => [])).filter(e => e.kind === 'dir' || e.isLink).map(e => e.name)
  const flatPath = await flatPathOf(ports, root, cwd)
  const a = layoutFor({ dataRoot: root, cwdReal, user, placements, names, folders, hash: ports.hash })
  if (a.kind !== 'own') {
    const placement = placements.find(p => p.id === a.layout.id)
    const identity = parseIdentity(await ports.fsRead(`${root}/projects/${a.layout.id}.json`).catch(() => ''))
    return {
      root, layout: a.layout, folderPath: `${projectsDir}/${a.layout.folder}`, id: a.layout.id, found: a.kind === 'found', placement, linked: placement?.linked === true, flatPath,
      ...(identity.kind === 'ok' ? { projectFile: projectFileOf(identity.value) } : {}),
    }
  }
  // Its own project: among the folders of this base name, the one whose root lists record this
  // working folder. The `cwd` is read raw, whatever the file's format version: a file a newer
  // build wrote still says which folder it belongs to, and minting a second folder for it is worse.
  const candidates: { folder: string; recordedCwd?: string }[] = []
  for (const folder of a.candidates) {
    const text = await ports.fsRead(`${projectsDir}/${folder}/lists/_root/lists.json`).catch(() => '')
    const cwdOf = text ? recordedCwd(text) : undefined
    candidates.push({ folder, ...(cwdOf ? { recordedCwd: cwdOf } : {}) })
  }
  const found = ownFolderFor(candidates, cwdReal)
  if (found) {
    const id = ID_IN_NAME.exec(found)?.[1]
    return { root, layout: pathsIn(root, found, '_root', id), folderPath: `${projectsDir}/${found}`, ...(id ? { id } : {}), found: true, linked: false, flatPath }
  }
  const id = mintId(ports.randomBytes(5))
  const name = projectOf(cwdReal)
  const folder = projectFolderName(name, id, user)
  const projectFile = projectFileOf(newIdentity({ id, name, user, now: iso(await ports.now()) }))
  return { root, layout: pathsIn(root, folder, '_root', id), folderPath: `${projectsDir}/${folder}`, id, found: false, linked: false, projectFile, flatPath }
}

export type LayoutCheck = { link: LinkState; check: FolderCheck['kind']; verdict: WriteVerdict }

/**
 * The dangling check (the registry design's 17:50 addendum), at load and again before a write that
 * would create the folder: `stat` with `resolve`, the parent's listing to tell a broken link from a
 * removed folder, the real path against the placement's target, and only then `project.json`'s id.
 * A link pointing elsewhere is reported before `project.json` is read.
 */
export async function checkLayout(ports: LayoutPorts, r: Resolved): Promise<LayoutCheck> {
  const stat = await ports.fsStatLink(r.folderPath)
  const name = r.folderPath.slice(r.folderPath.lastIndexOf('/') + 1)
  const listed = stat ? undefined : (await ports.fsList(r.folderPath.slice(0, r.folderPath.lastIndexOf('/'))).catch(() => [])).find(e => e.name === name)
  const expected = r.placement?.linked && r.placement.vault ? `${slash(r.placement.vault)}/${r.placement.junction_point ?? 'private/claude/bookmarks'}` : undefined
  const link = linkState({ ...(stat ? { stat } : {}), ...(listed ? { listed: { isLink: listed.isLink === true } } : {}) }, expected)
  let check: FolderCheck['kind'] = 'missing'
  if (link === 'ok') {
    const at = slash(stat?.realPath ?? r.folderPath)
    const readIf = async (p: string) => ((await ports.fsExists(p)) ? await ports.fsRead(p) : undefined)
    const projectFile = await readIf(`${at}/project.json`)
    const movedTo = projectFile === undefined ? await readIf(`${at}/moved-to.json`) : undefined
    const contents = { ...(projectFile !== undefined ? { projectFile } : {}), ...(movedTo !== undefined ? { movedTo } : {}) }
    check = r.id ? checkFolder(contents, r.id).kind : contents.projectFile !== undefined ? 'ok' : contents.movedTo !== undefined ? 'moved' : 'missing'
  }
  return { link, check, verdict: writeVerdict(link, check, r.linked) }
}

// --- The bundle set: the index and one file per bundle ---------------------------------------

/** A bundle's file as last read: its data, the person's notes, the line ending it keeps. */
export type FileRead = { data: BundleFileData; notes: string; eol: string }

export type SetRead = {
  /** The index, each bundle's file folded in where the file won (its block parses and its rev is at least the index's). */
  index: BundleIndex
  /** The per-draw mark of `bundles/`: one listing, `name:size:mtimeMs` per entry. */
  mark: string
  files: Map<string, FileRead>
  /** Bundles whose file could not be read (a bad block, a newer version): every write to them is refused; by id, the file's path. */
  refused: Map<string, string>
  /** Why the set cannot be written at all: its index is newer than this build, or unreadable. */
  frozen?: string
}

const emptyIndex = (): BundleIndex => ({ version: BUNDLE_INDEX_VERSION, bundles: [] })

/** The per-draw mark of `bundles/` from one listing: a bundle file written by another session moves it. */
export const setMark = (entries: readonly { name: string; size?: number; mtimeMs?: number }[]): string =>
  entries.map(e => `${e.name}:${e.size ?? ''}:${e.mtimeMs ?? ''}`).sort().join('|')
const bundleOfFile = (d: BundleFileData): Bundle =>
  ({ id: d.id, label: d.label, ...(d.why !== undefined ? { why: d.why } : {}), links: d.links, by: d.by as Bundle['by'], createdAt: d.created, updatedAt: d.updated })
const fileOfBundle = (b: Bundle, rev: number, prior?: FileRead): BundleFileData => ({
  id: b.id, label: b.label, ...(b.why !== undefined ? { why: b.why } : {}), tags: prior?.data.tags ?? [], by: b.by, rev, links: b.links,
  created: b.createdAt, updated: b.updatedAt, started: prior?.data.started ?? b.createdAt, ...(prior?.data.touched !== undefined ? { touched: prior.data.touched } : {}),
})

/** The file name a bundle gets, once: `<created date>__<slug>.md`, its id appended when another bundle took that name. */
export function bundleFileName(b: Pick<Bundle, 'id' | 'label' | 'createdAt'>, taken: ReadonlySet<string>): string {
  const slug = b.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || b.id
  const base = `${iso(b.createdAt).slice(0, 10)}__${slug}`
  return taken.has(`${base}.md`) ? `${base}-${b.id}.md` : `${base}.md`
}

/** The `## Links` region for people: one line per link, a Markdown link where it has an address. */
export const linkLines = (links: readonly Bundle['links'][number][], root: string | undefined): string[] =>
  links.map(l => {
    const what = describeLink(l, 0, root).what
    const href = hrefOf(l, root)
    return href ? `- [${what.replace(/[[\]]/g, ' ')}](${href})` : `- ${what}`
  })

/**
 * The set as it stands: the index, one listing of `bundles/` (the per-draw mark), and each indexed
 * bundle's file. A file whose block parses and whose rev is at least the index's wins; one with no
 * end line is read again and taken only when the second read is the same (a torn write is read
 * next draw); one that does not parse leaves the index copy in force, refuses every write to that
 * bundle, and is named in a toast once per session.
 */
export async function readSet(ports: LayoutPorts, r: Resolved, toasted: Set<string>): Promise<SetRead> {
  const { indexPath, bundlesDir } = r.layout
  const out: SetRead = { index: emptyIndex(), mark: '', files: new Map(), refused: new Map() }
  if (await ports.fsExists(indexPath)) {
    const p = parseBundleIndex(await ports.fsRead(indexPath))
    if (p.kind === 'ok') out.index = p.value
    else out.frozen = p.kind === 'newer' ? `the bundle set ${indexPath} was written by a newer version of the plugin (format ${p.version}); update the plugin to change it` : `the bundle set ${indexPath} could not be read (${p.why}); it is left as it is`
  }
  out.mark = setMark(await ports.fsList(bundlesDir).catch(() => []))
  const bundles: IndexEntry[] = []
  for (const entry of out.index.bundles) {
    let folded = entry
    if (entry.file) {
      const path = `${bundlesDir}/${entry.file}`
      if (await ports.fsExists(path)) {
        const text = await ports.fsRead(path)
        let p = parseBundleFile(text)
        if (p.kind === 'no-end') {
          const again = await ports.fsRead(path)
          if (again === text) p = { ...p, kind: 'ok' }
          else {
            // Being written by someone else: shown from the index copy, and not written over
            // until a stable read has its notes (a write now would rewrite the file without them).
            ports.log(`[bm] lists: bundle ${entry.id}'s file is being written (${path}); the index copy is shown and the bundle is not changed until it reads whole`)
            out.refused.set(entry.id, path)
          }
        }
        if (p.kind === 'ok') {
          out.files.set(entry.id, { data: p.data, notes: p.notes, eol: p.eol })
          if (p.data.rev >= entry.rev) folded = { ...entry, ...bundleOfFile(p.data), rev: p.data.rev, file: entry.file }
        } else if (p.kind === 'bad' || p.kind === 'newer') {
          out.refused.set(entry.id, path)
          if (!toasted.has(path)) {
            toasted.add(path)
            ports.toast(`Bundle "${entry.label}" is not changed: its file ${p.kind === 'bad' ? `could not be read (${p.why})` : `was written by a newer version (format ${p.version})`}: ${path}`, 10000)
          }
        }
      } else ports.log(`[bm] lists: bundle ${entry.id}'s file is missing (${path}); the index copy is shown and the file is written back at the next change`)
    }
    bundles.push(folded)
  }
  out.index = { ...out.index, bundles }
  return out
}

// --- The writes ---------------------------------------------------------------------------------

const canon = (o: object): string => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))))
const sameBundle = (e: IndexEntry, b: Bundle): boolean => {
  const { rev: _r, file: _f, ...rest } = e
  return canon(rest) === canon(b)
}

/**
 * The one-time split of a format-2 flat file into the project folder (the first load at format 3
 * that finds no `lists.json`): `project.json` when the folder is new, one file per bundle, the
 * index, and last `lists.json` at version 3. The flat file is left as it was. A refused folder
 * (the dangling check) writes nothing.
 */
export async function migrateFlat(ports: LayoutPorts, r: Resolved, flatText: string): Promise<{ ok: true; bundles: number; dangling: string[] } | { ok: false; error: string }> {
  const split = splitFlatFile(flatText)
  if (split.kind !== 'split') return { ok: false, error: `the lists file ${r.flatPath} could not be moved into its project folder (${split.why}); it is left as it is` }
  const chk = await checkLayout(ports, r)
  if (!chk.verdict.write) return { ok: false, error: `the lists are not moved into their project folder: ${chk.verdict.why}` }
  if ((chk.verdict.create || chk.check === 'missing') && r.projectFile) await ports.fsWrite(`${r.folderPath}/project.json`, serializeProjectFile(r.projectFile))
  const parsed = parseBundleIndex(split.index)
  const index = parsed.kind === 'ok' ? parsed.value : emptyIndex()
  const taken = new Set<string>()
  const bundles = index.bundles.map(e => {
    const file = bundleFileName(e, taken)
    taken.add(file)
    return { ...e, file }
  })
  for (const e of bundles) await ports.fsWrite(`${r.layout.bundlesDir}/${e.file}`, renderBundleFile(fileOfBundle(e, e.rev), { notes: '', linkLines: linkLines(e.links, r.root) }))
  await ports.fsWrite(r.layout.indexPath, serializeBundleIndex({ ...index, bundles }))
  await ports.fsWrite(r.layout.listsPath, split.lists)
  ports.log(`[bm] lists: ${r.flatPath} moved into ${r.folderPath} (${bundles.length} bundle file${bundles.length === 1 ? '' : 's'}${split.dangling.length ? `; items name bundles the file did not hold: ${split.dangling.join(', ')}` : ''})`)
  return { ok: true, bundles: bundles.length, dangling: split.dangling }
}

/**
 * The whole written after a change: a changed or new bundle gets its file (its notes kept, its rev
 * moved on) before the index; `lists.json` last, at version 3 and without the bundles, its previous
 * text kept as `.bak`. A write that would create the folder is re-resolved first (another session
 * may have made it meanwhile) and goes through the dangling check; a bundle whose file could not be
 * read is never written over.
 */
export async function writeAll(ports: LayoutPorts, r: Resolved, file: ListsFile, prev: SetRead): Promise<{ ok: true; index: BundleIndex } | { ok: false; error: string }> {
  if (prev.frozen) return { ok: false, error: prev.frozen }
  let index = prev.index
  const changed: IndexEntry[] = []
  const taken = new Set(index.bundles.flatMap(e => (e.file ? [e.file] : [])))
  for (const b of file.bundles ?? []) {
    const was = index.bundles.find(e => e.id === b.id)
    if (was?.file && sameBundle(was, b)) continue
    const refusedAt = prev.refused.get(b.id)
    if (refusedAt) return { ok: false, error: `bundle "${b.label}" is not changed: its file could not be read; fix or remove it first: ${refusedAt}` }
    const name = was?.file ?? bundleFileName(b, taken)
    taken.add(name)
    index = putEntry(index, b, name)
    changed.push(index.bundles.find(e => e.id === b.id)!)
  }
  const chk = await checkLayout(ports, r)
  if (!chk.verdict.write) return { ok: false, error: `the change is not written: ${chk.verdict.why}` }
  if (chk.verdict.create) {
    // Another session may have made this folder's lists meanwhile: a folder now found on disk at
    // another path is theirs, and this change is made again on top of it. A re-resolve that finds
    // nothing names a folder afresh (a new minted id), which is the same situation, not a conflict.
    const again = await resolveLayout(ports)
    if (again?.found && again.layout.listsPath !== r.layout.listsPath) return { ok: false, error: 'another session set up this folder\'s lists meanwhile; the change is not written -- make it again' }
  }
  if ((chk.verdict.create || chk.check === 'missing') && r.projectFile) await ports.fsWrite(`${r.folderPath}/project.json`, serializeProjectFile(r.projectFile))
  for (const e of changed) {
    const prior = prev.files.get(e.id)
    await ports.fsWrite(`${r.layout.bundlesDir}/${e.file}`, renderBundleFile(fileOfBundle(e, e.rev, prior), { notes: prior?.notes ?? '', linkLines: linkLines(e.links, r.root), ...(prior ? { eol: prior.eol } : {}) }))
  }
  if (changed.length || !(await ports.fsExists(r.layout.indexPath))) await ports.fsWrite(r.layout.indexPath, serializeBundleIndex(index))
  const { bundles: _b, ...rest } = file
  if (await ports.fsExists(r.layout.listsPath)) await ports.fsWrite(`${r.layout.listsPath}.bak`, await ports.fsRead(r.layout.listsPath))
  await ports.fsWrite(r.layout.listsPath, serializeLists({ ...rest, version: LISTS_FORMAT3 } as ListsFile))
  return { ok: true, index }
}

/**
 * The in-memory file the handler works on: the lists with their set's bundles back in, and every
 * bundled item's copy of its links refreshed from the set (core/lists/bundles.ts settle). At format
 * 2 the copies were refreshed by whoever wrote the one file; at 3 another session's change to a
 * bundle lands in the set and not in this folder's lists.json, so the refresh happens on read.
 */
export const assemble = (lists: ListsFile, set: SetRead): ListsFile => settle(fromFormat3(lists, set.index), 0)
