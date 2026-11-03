// Linking a project's data folder into its vault (0.8.16; the registry design's 17:50 addendum, the
// plan 2026-11-03__15-02-47's row 6b-2): the decisions, pure. The link script (hooks/scripts/
// link-project.ps1, or link-project.sh off Windows) does the moving and refuses anything unsafe;
// this builds its argv -- each argument its own element, never a command string -- reads its one
// JSON line, and says what the placement becomes. handlers/projects.ts runs it.
import { normPath, type Placement } from './placement.ts'

const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

/** Where a project's data appears in its vault: `<vault>/<junction point>`; the vault defaults to the project's root. */
export function linkTarget(p: Placement, junctionPoint: string): { vault: string; junctionPoint: string; target: string } {
  const vault = slash(p.vault ?? p.root)
  const jp = slash(junctionPoint.trim() || 'private/claude/bookmarks').replace(/^\/+/, '')
  return { vault, junctionPoint: jp, target: `${vault}/${jp}` }
}

/** The script's argv: PowerShell with named parameters for a Windows path, else `sh` with positional ones. */
export function linkArgv(o: { scriptsDir: string; source: string; target: string; id: string; dryRun: boolean }): string[] {
  const dir = slash(o.scriptsDir)
  if (/^[A-Za-z]:/.test(o.source)) {
    return ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', `${dir}/link-project.ps1`,
      '-Source', o.source, '-Target', o.target, '-Id', o.id, ...(o.dryRun ? ['-DryRun'] : [])]
  }
  return ['sh', `${dir}/link-project.sh`, o.source, o.target, o.id, ...(o.dryRun ? ['--dry-run'] : [])]
}

export type LinkResult = { ok: boolean; dryRun: boolean; steps: string[]; refused?: string; failedAt?: string; realPath?: string; movedAside?: string; moved: number }

/** The script's answer: its last JSON line; undefined when it printed none (the script did not run). */
export function parseLinkResult(stdout: string): LinkResult | undefined {
  const line = stdout.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l.startsWith('{')).pop()
  if (!line) return undefined
  try {
    const o = JSON.parse(line) as Record<string, unknown>
    if (typeof o.ok !== 'boolean') return undefined
    return {
      ok: o.ok, dryRun: o.dryRun === true, steps: Array.isArray(o.steps) ? o.steps.filter((s): s is string => typeof s === 'string') : [],
      ...(typeof o.refused === 'string' ? { refused: o.refused } : {}), ...(typeof o.failedAt === 'string' ? { failedAt: o.failedAt } : {}),
      ...(typeof o.realPath === 'string' ? { realPath: o.realPath } : {}), ...(typeof o.movedAside === 'string' ? { movedAside: o.movedAside } : {}),
      moved: typeof o.moved === 'number' ? o.moved : 0,
    }
  } catch {
    return undefined
  }
}

/** The placement after a link that succeeded: linked, with the vault and junction point it was linked to. */
export function linkedPlacement(p: Placement, t: { vault: string; junctionPoint: string }, now: string): Placement {
  return { ...p, linked: true, vault: t.vault, junction_point: t.junctionPoint, updated_at: now }
}

/** Whether a successful link's real path is the target it was asked for (the script proves it with a marker; this checks the answer says so). */
export const linkedAt = (r: LinkResult, target: string): boolean => !!r.realPath && normPath(r.realPath) === normPath(target)
