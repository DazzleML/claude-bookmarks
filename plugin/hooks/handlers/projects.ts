// `/bm-project` (0.8.x unit 6b; the registry design's 17:50 addendum, the Director's rulings of
// 2026-11-03 11:2x): where this folder's lists and bundles live and which project it belongs to,
// registering a folder as a project's root on this machine, and renaming a project. The decisions
// are core/projects/project-ops.ts; this reads and writes through the ports. `link`, `unlink` and
// `relink` (the link script) are the unit's second half.
import type { ProjectsPorts } from '../engine/ports.ts'
import type { Lists } from './lists.ts'
import { readPlacements, resolveLayout } from './lists-layout.ts'
import { excludePlan, includePlan, registerPlan, renamePlan, whereRows, whereText, type OwnFolder } from '../core/projects/project-ops.ts'
import { foldersWithId, parseProjectFile } from '../core/projects/project-file.ts'
import { parseIdentity } from '../core/projects/registry.ts'
import { isUnderPath, listsFolderOf, membershipOf, normPath, resolveFolderArg, type Placement } from '../core/projects/placement.ts'

const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
const iso = (ms: number) => new Date(ms).toISOString()
export const PROJECT_USAGE = '/bm-project: where | register [name] [--yes] | rename <name> | exclude <folder> | include <folder>'
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
    for (const line of whereText(whereRows({ placements, names, folders, cwd, cwdReal, rootsMissing, leftBehind }), own)) ports.say(`[bm] ${line}`)
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
      ? `[bm] excluded ${f} from #${placement.n} ${name}: it is its own project now; any lists it had inside ${name} stay there, unread, until it is included again`
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

  if (verb === 'link' || verb === 'unlink' || verb === 'relink') return ports.say(`[bm] /bm-project ${verb} comes with the next build (the link script's wiring)`)
  ports.say(`[bm] ${PROJECT_USAGE}`)
}
