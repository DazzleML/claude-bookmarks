// `/bm-project` (0.8.x unit 6b; the registry design's 17:50 addendum, the Director's rulings of
// 2026-11-03 11:2x): where this folder's lists and bundles live and which project it belongs to,
// registering a folder as a project's root on this machine, and renaming a project. The decisions
// are core/projects/project-ops.ts; this reads and writes through the ports. `link`, `unlink` and
// `relink` (the link script) are the unit's second half.
import type { ProjectsPorts } from '../engine/ports.ts'
import type { Lists } from './lists.ts'
import { readPlacements, resolveLayout } from './lists-layout.ts'
import { registerPlan, renamePlan, whereRows, whereText, type OwnFolder } from '../core/projects/project-ops.ts'
import { foldersWithId, parseProjectFile } from '../core/projects/project-file.ts'
import { parseIdentity } from '../core/projects/registry.ts'
import { membershipOf } from '../core/projects/placement.ts'

const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
const iso = (ms: number) => new Date(ms).toISOString()
export const PROJECT_USAGE = '/bm-project: where | register [name] | rename <name>'

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
    const r = await resolveLayout(ports)
    const own = r && !r.placement ? (r.found ? { folder: r.layout.folder } : {}) : undefined
    for (const line of whereText(whereRows({ placements, names, folders, cwd, cwdReal, rootsMissing }), own)) ports.say(`[bm] ${line}`)
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
    const plan = registerPlan({
      cwdReal, dataRoot: root, machine: await ports.machine(), user: await ports.user(), now: iso(await ports.now()),
      facts, placements, names, ...(own ? { own } : {}), ...(tail ? { name: tail } : {}), bytes: ports.randomBytes(5),
    })
    if (plan.kind === 'refused') return ports.say(`[bm] not registered: ${plan.why}`)
    if (plan.kind === 'already') return ports.say(`[bm] already registered: #${plan.placement.n} ${plan.name ?? plan.placement.id} (${plan.placement.id})`)
    for (const w of plan.writes) await ports.fsWrite(w.path, w.text)
    // The folder now resolves through the registry: the lists' cache is dropped, so the next draw reads it there.
    lists.newConversation()
    ports.say(`[bm] registered #${plan.placement.n} ${plan.identity.name} (${plan.id})${plan.adopted && own ? `, keeping the id of its data folder ${own.folder}` : ''}: ${cwdReal}`)
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
