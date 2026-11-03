// `/bm-project` (0.8.x unit 6b; the registry design's 17:50 addendum, the Director's rulings of
// 2026-11-03 11:2x): where this folder's lists and bundles live and which project it belongs to,
// registering a folder as a project's root on this machine, and renaming a project. The decisions
// are core/projects/project-ops.ts; this reads and writes through the ports. `link`, `unlink` and
// `relink` (the link script) are the unit's second half.
import type { ProjectsPorts } from '../engine/ports.ts'
import type { Lists } from './lists.ts'
import { copyTree, readPlacements, resolveLayout, sessionHome } from './lists-layout.ts'
import { excludePlan, includePlan, registerPlan, renamePlan, whereRows, whereText, type OwnFolder } from '../core/projects/project-ops.ts'
import { foldersWithId, parseProjectFile } from '../core/projects/project-file.ts'
import { linkArgv, linkedAt, linkedPlacement, linkTarget, parseLinkResult } from '../core/projects/link.ts'
import { placementPath, serializePlacement } from '../core/projects/placement.ts'
import { parseIdentity } from '../core/projects/registry.ts'
import { isUnderPath, listsFolderOf, membershipOf, normPath, resolveFolderArg, type Placement } from '../core/projects/placement.ts'

const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
const iso = (ms: number) => new Date(ms).toISOString()
export const PROJECT_USAGE = '/bm-project: where | register [name] [--yes] | rename <name> | exclude <folder> | include <folder> | home [<project> | --clear] | link [--dry-run] | relink <path> | unlink'
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

/** A folder argument as a real path: relative ones against the working folder; a link resolved when it exists. */
async function folderArg(ports: ProjectsPorts, cwdReal: string, arg: string): Promise<string> {
  const abs = resolveFolderArg(cwdReal, arg)
  return slash((await ports.fsStatLink(abs))?.realPath ?? abs)
}

export async function projectsCommand(ports: ProjectsPorts, lists: Lists, args: string): Promise<void> {
  const [verb = 'where', ...rest] = args.trim().split(/\s+/).filter(Boolean)
  const tail = rest.join(' ')
  const rootRaw = await ports.dataRoot()
  if (!rootRaw) return ports.say('[bm] /bm-project: there is no data folder (CLAUDE_USER_DIR, or the home folder), so no project is kept here')
  const root = slash(rootRaw)
  const cwd = slash(await ports.cwd())
  const cwdReal = slash((await ports.fsStatLink(cwd))?.realPath ?? cwd)
  const { placements, names } = await readPlacements(ports, root)
  const folders = (await ports.fsList(`${root}/bookmarks/projects`).catch(() => [])).filter(e => e.kind === 'dir' || e.isLink).map(e => e.name)

  if (verb === 'where') {
    const rootsMissing = new Set<string>()
    for (const p of placements) if (!(await ports.fsExists(p.root))) rootsMissing.add(p.id)
    // An excluded folder whose lists are still inside the project: its lists folder there holds a lists.json.
    const leftBehind = new Map<string, string[]>()
    for (const p of placements) {
      const folder = foldersWithId(folders, p.id)[0]
      if (!folder) continue
      const found: string[] = []
      for (const e of p.exclude) if (await ports.fsExists(`${root}/bookmarks/projects/${folder}/lists/${listsFolderOf(p.root, e, ports.hash)}/lists.json`)) found.push(e)
      if (found.length) leftBehind.set(p.id, found)
    }
    const r = await resolveLayout(ports)
    const own = r && !r.placement ? (r.found ? { folder: r.layout.folder } : {}) : undefined
    const homeId = await sessionHome(ports, root)
    for (const line of whereText(whereRows({ placements, names, folders, cwd, cwdReal, rootsMissing, leftBehind, ...(homeId ? { homeId } : {}) }), own)) ports.say(`[bm] ${line}`)
    return
  }

  if (verb === 'home') {
    if (!tail) {
      const homeId = await sessionHome(ports, root)
      const p = homeId ? placements.find(x => x.id === homeId) : undefined
      return ports.say(homeId
        ? `[bm] this session's home: ${p ? `#${p.n} ${names.get(p.id) ?? p.id}` : `${homeId} (not registered on this machine)`}; /bm-project home --clear forgets it`
        : '[bm] this session has no home: its folder decides its project. /bm-project home <project> (a name, #n or id) works on that project from here')
    }
    if (tail === '--clear') {
      const r = await ports.setHome(undefined)
      if (r.error) return ports.say(`[bm] the home was not cleared: ${r.error}`)
      lists.newConversation()
      ports.say("[bm] this session's home is cleared: its folder decides its project again")
      await ports.redraw()
      return
    }
    // A project by #n, by id, or by name (the registered name, case-insensitive).
    const want = tail.replace(/^#/, '')
    const p = placements.find(x => String(x.n) === want) ?? placements.find(x => x.id === want)
      ?? placements.find(x => (names.get(x.id) ?? '').toLowerCase() === tail.toLowerCase())
    if (!p) return ports.say(`[bm] no registered project matches ${tail}; /bm-project lists them`)
    const r = await ports.setHome(p.id)
    if (r.error) return ports.say(`[bm] the home was not set: ${r.error}`)
    lists.newConversation()
    ports.say(`[bm] this session now works on #${p.n} ${names.get(p.id) ?? p.id} (its home), whatever folder it runs in: that project's root lists and its bundles`)
    await ports.redraw()
    return
  }

  if (verb === 'exclude' || verb === 'include') {
    if (!tail) return ports.say(`[bm] /bm-project ${verb} <folder>: a folder inside a registered project (a relative path is read from this folder)`)
    const f = await folderArg(ports, cwdReal, tail)
    // exclude: the project whose root or member is the deepest one holding the folder; include: the one that excluded it.
    const holder = (p: Placement) => Math.max(-1, ...[p.root, ...p.members].filter(b => isUnderPath(f, b)).map(b => normPath(b).length))
    const placement = verb === 'exclude'
      ? [...placements].filter(p => holder(p) >= 0).sort((a, b) => holder(b) - holder(a))[0]
      : placements.find(p => p.exclude.some(e => normPath(e) === normPath(f)))
    if (!placement) return ports.say(verb === 'exclude' ? `[bm] ${f} is in no registered project, so there is nothing to exclude it from` : `[bm] ${f} is not excluded from any registered project`)
    const o = { placement, folderReal: f, now: iso(await ports.now()), dataRoot: root, machine: await ports.machine(), user: await ports.user() }
    const plan = verb === 'exclude' ? excludePlan(o) : includePlan(o)
    if ('error' in plan) return ports.say(`[bm] ${plan.error}`)
    for (const w of plan.writes) await ports.fsWrite(w.path, w.text)
    lists.newConversation()
    const name = names.get(placement.id) ?? placement.id
    ports.say(verb === 'exclude'
      ? `[bm] excluded ${f} from #${placement.n} ${name}: it is in no registered project now (nothing is registered for it; it keeps lists of its own only if you make some there); any lists it had inside ${name} stay there, unread, until it is included again`
      : `[bm] included ${f} in #${placement.n} ${name} again: its lists inside ${name} are read from there`)
    await ports.redraw()
    return
  }

  if (verb === 'register') {
    // A folder that already has its own project folder keeps its id (the Director's ruling): read it and its project.json.
    const r = await resolveLayout(ports)
    let own: OwnFolder | undefined
    if (r && !r.placement && r.found && r.id) {
      const at = `${r.folderPath}/project.json`
      const pf = (await ports.fsExists(at)) ? parseProjectFile(await ports.fsRead(at)) : undefined
      own = { folder: r.layout.folder, id: r.id, ...(pf?.kind === 'ok' ? { projectFile: pf.value } : {}) }
    }
    const facts = { home: slash((await ports.home()) ?? ''), hasGit: await ports.fsExists(`${cwdReal}/.git`), hasRepokit: await ports.fsExists(`${cwdReal}/.repokit.json`) }
    const yes = rest.includes('--yes')
    const name = rest.filter(t => t !== '--yes').join(' ')
    // For the dry run: the folders beneath with lists of their own today -- each own project folder's root lists record its folder.
    const registeredIds = new Set(placements.map(p => p.id))
    const ownBeneath: string[] = []
    for (const folder of folders) {
      const id = ID_IN_NAME.exec(folder)?.[1]
      if (!id || registeredIds.has(id) || id === own?.id) continue
      const at = recordedCwd(await ports.fsRead(`${root}/bookmarks/projects/${folder}/lists/_root/lists.json`).catch(() => ''))
      if (at) ownBeneath.push(at)
    }
    const plan = registerPlan({
      cwdReal, dataRoot: root, machine: await ports.machine(), user: await ports.user(), now: iso(await ports.now()),
      facts, placements, names, ...(own ? { own } : {}), ...(name ? { name } : {}), bytes: ports.randomBytes(5), yes, ownBeneath,
    })
    if (plan.kind === 'confirm') {
      ports.say(`[bm] not registered yet: ${plan.root} is ${plan.why}. A project takes in every folder beneath its root.`)
      if (plan.registeredBeneath.length) ports.say(`[bm]   registered projects beneath it stay their own: ${plan.registeredBeneath.map(p => `#${p.n} ${p.name}`).join(', ')}`)
      ports.say(plan.ownBeneath.length
        ? `[bm]   ${plan.ownBeneath.length} folder${plan.ownBeneath.length === 1 ? '' : 's'} beneath it with lists of their own would join it (their lists from before stay in their own data folders, unread from there): ${plan.ownBeneath.join(', ')}`
        : '[bm]   no folder beneath it has lists of its own today')
      ports.say(`[bm]   to register it: /bm-project register${name ? ` ${name}` : ''} --yes; to keep a folder out later: /bm-project exclude <folder>`)
      return
    }
    if (plan.kind === 'already') return ports.say(`[bm] already registered: #${plan.placement.n} ${plan.name ?? plan.placement.id} (${plan.placement.id})`)
    for (const w of plan.writes) await ports.fsWrite(w.path, w.text)
    // The folder now resolves through the registry: the lists' cache is dropped, so the next draw reads it there.
    lists.newConversation()
    ports.say(`[bm] registered #${plan.placement.n} ${plan.identity.name} (${plan.id})${plan.adopted && own ? `, keeping the id of its data folder ${own.folder}` : ''}: ${cwdReal}`)
    // A folder beneath with lists of its own is taken in now, whether or not a dry run came first (scenario S2 of 0.8.14).
    const takenIn = ownBeneath.filter(f => isUnderPath(f, cwdReal) && normPath(f) !== normPath(cwdReal))
    if (takenIn.length) ports.say(`[bm]   ${takenIn.length} folder${takenIn.length === 1 ? '' : 's'} beneath it had lists of their own, which stay in their own data folders, unread from there: ${takenIn.join(', ')}; /bm-project exclude <folder> keeps one out`)
    await ports.redraw()
    return
  }

  if (verb === 'rename') {
    const m = membershipOf(cwdReal, placements)
    if (!m) return ports.say('[bm] rename is for a registered project: /bm-project register first')
    const identity = parseIdentity(await ports.fsRead(`${root}/projects/${m.id}.json`).catch(() => ''))
    if (identity.kind !== 'ok') return ports.say(`[bm] the identity file of ${m.id} could not be read (${identity.kind === 'bad' ? identity.why : `format ${identity.version}`}); nothing is renamed`)
    const folder = foldersWithId(folders, m.id)[0]
    const plan = renamePlan({ identity: identity.value, name: tail, now: iso(await ports.now()), dataRoot: root, ...(folder ? { folder } : {}) })
    if ('error' in plan) return ports.say(`[bm] ${plan.error}`)
    for (const w of plan.writes) await ports.fsWrite(w.path, w.text)
    ports.say(`[bm] renamed ${identity.value.name} to ${plan.identity.name} (${m.id}); its data folder keeps its name and is found by the id`)
    return
  }

  if (verb === 'link' || verb === 'relink') {
    // The project this folder belongs to (its home does not move another project's data).
    const m = membershipOf(cwdReal, placements)
    const placement = m ? placements.find(p => p.id === m.id) : undefined
    if (!placement) return ports.say(`[bm] /bm-project ${verb} is for a registered project: /bm-project register first`)
    if (!ports.projectVault()) return ports.say("[bm] not linked: keeping a project's lists and bundles in its vault is off in /config (Bookmarks: keep a project's data in its vault)")
    const folder = foldersWithId(folders, placement.id)[0]
    if (!folder) return ports.say(`[bm] not linked: #${placement.n} has no data folder yet; it is made on the first list written`)
    const dryRun = rest.includes('--dry-run')
    const pathArg = rest.filter(t => t !== '--dry-run').join(' ')
    // relink <path>: the vault is now at <path>. A folder still linked to the old one is left as it is, with the way to finish.
    const vaultFor = verb === 'relink' ? (pathArg ? await folderArg(ports, cwdReal, pathArg) : '') : undefined
    if (verb === 'relink' && !vaultFor) return ports.say('[bm] /bm-project relink <path>: the vault folder the project\'s data should appear in now')
    const based = vaultFor ? { ...placement, vault: vaultFor } : placement
    const t = linkTarget(based, ports.junctionPoint())
    const source = `${root}/bookmarks/projects/${folder}`
    if (!dryRun && (await ports.fsStatLink(source))?.isLink) {
      if (verb === 'link') return ports.say(`[bm] already linked: ${source} is a link${placement.linked ? ` to ${linkTarget(placement, placement.junction_point ?? ports.junctionPoint()).target}` : ''}`)
      return ports.say(`[bm] not relinked yet: ${source} is still a link to the old vault. Remove that link (dz safedel "${source}" removes the link and keeps the files it pointed at), then /bm-project link`)
    }
    const argv = linkArgv({ scriptsDir: ports.scriptsDir(), source, target: t.target, id: placement.id, dryRun })
    const run = await ports.runLink(argv).catch(err => ({ exitCode: 1, stdout: '', stderr: String(err) }))
    const r = parseLinkResult(run.stdout)
    if (!r) return ports.say(`[bm] the link script did not answer (exit ${run.exitCode})${run.stderr ? `: ${run.stderr.trim().split('\n')[0]}` : ''}; nothing was changed`)
    for (const s of r.steps) ports.say(`[bm]   ${r.dryRun ? 'would ' : ''}${s}`)
    if (r.refused) return ports.say(`[bm] not linked: ${r.refused}`)
    if (!r.ok) return ports.say(`[bm] the link stopped${r.failedAt ? ` at ${r.failedAt}` : ''}; both folders are left readable, nothing was deleted`)
    if (r.dryRun) return ports.say(`[bm] dry run: nothing was changed; /bm-project ${verb}${pathArg ? ` ${pathArg}` : ''} links ${source} into ${t.target}`)
    if (!linkedAt(r, t.target)) ports.say(`[bm] the script reports ${r.realPath ?? 'no real path'}, not ${t.target}; check it with /bm-project`)
    const placementNow = linkedPlacement(based, t, iso(await ports.now()))
    await ports.fsWrite(placementPath(`${root}/projects`, await ports.machine(), await ports.user(), placement.id), serializePlacement(placementNow))
    lists.newConversation()
    ports.say(`[bm] linked #${placement.n} ${names.get(placement.id) ?? placement.id}: its lists and bundles now live in ${t.target} (${r.moved} moved${r.movedAside ? `; the emptied folder is kept as ${r.movedAside}` : ''})`)
    await ports.redraw()
    return
  }
  if (verb === 'unlink') {
    // A copy back, a mark and a recipe (the registry design's 18:4x ruling): nothing is removed here.
    const m = membershipOf(cwdReal, placements)
    const placement = m ? placements.find(p => p.id === m.id) : undefined
    if (!placement) return ports.say('[bm] /bm-project unlink is for a registered project')
    const folder = foldersWithId(folders, placement.id)[0]
    const source = folder ? `${root}/bookmarks/projects/${folder}` : ''
    if (!folder || !(await ports.fsStatLink(source))?.isLink) return ports.say(`[bm] not unlinked: #${placement.n}'s data folder is not linked into a vault${placement.linked ? ' (the placement said it was; nothing changed)' : ''}`)
    const stamp = iso(await ports.now()).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
    const copy = `${source}.__unlinked-${stamp}`
    const n = await copyTree(ports, source, copy)
    const placementNow: Placement = { ...placement, linked: false, updated_at: iso(await ports.now()) }
    await ports.fsWrite(placementPath(`${root}/projects`, await ports.machine(), await ports.user(), placement.id), serializePlacement(placementNow))
    ports.say(`[bm] unlinked #${placement.n} ${names.get(placement.id) ?? placement.id}: ${n} files copied out of the vault to ${copy}; the lists still read the vault through the link until it is removed`)
    ports.say(`[bm]   to finish: dz safedel "${source}" removes the link and keeps the vault's files; the next draw then copies the vault's current files back into ${source} (the copy above is kept as it is)`)
    await ports.redraw()
    return
  }
  ports.say(`[bm] ${PROJECT_USAGE}`)
}
