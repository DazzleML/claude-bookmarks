// Dry run of the register migrations up to a target version over a COPY of a real bookmark folder
// (generalised from dryrun_v3_to_v4.ts for format v5, the pins-by-name design, 2026-10-26, unit
// P3). Reads the folder's register files and never writes there; writes each migrated copy, and
// the original beside it, under the scratch folder so the two can be diffed.
//
// Usage: node --experimental-strip-types dryrun_migration.ts <bookmarks/sessions folder> <scratch folder> [target version, default 5]
//
// Per file: only version, format, the pins' key (`pins`, `stars`), rev and updatedAt differ; the
// pins before (v3's map, or v4's list) and after are the same set; the result reads back to
// itself; running the plan again adds nothing. Reconciles: files read = migrated + current +
// skipped (by reason).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRegister, serializeRegister, type Register } from '../../../plugin/hooks/core/bookmarks/register-file.ts'
import { applyMigrations, MIGRATIONS, v4to5, type Migration } from '../../../plugin/hooks/core/bookmarks/migrations.ts'

const [src, out, targetArg] = process.argv.slice(2)
if (!src || !out) { console.error('usage: dryrun_migration.ts <sessions folder> <scratch folder> [target]'); process.exit(2) }
const target = Number(targetArg ?? 5)
// The steps as they will be registered: today's, plus v4to5 until it is.
const ALL: Migration[] = [...MIGRATIONS, ...(MIGRATIONS.includes(v4to5) ? [] : [v4to5])]
const plan = (from: number): Migration[] => {
  const steps: Migration[] = []
  for (let at = from; at < target;) {
    const s = ALL.find(m => m.from === at)
    if (!s) break
    steps.push(s)
    at = s.to
  }
  return steps
}
mkdirSync(join(out, 'before'), { recursive: true })
mkdirSync(join(out, 'after'), { recursive: true })

const CHANGED_OK = new Set(['version', 'format', 'pins', 'stars', 'rev', 'updatedAt'])
const pinsOf = (r: Register): string[] => [...new Set([
  ...Object.entries(r.pinsV3 ?? {}).flatMap(([o, l]) => (Array.isArray(l) ? l : []).filter(u => typeof u === 'string').map(u => `${o}|${u}|prompts`)),
  ...(r.pins ?? []).filter(p => p.off === undefined).map(p => `${p.owner}|${p.uuid}|${p.from}`),
])].sort()
const files = readdirSync(src).filter(f => f.endsWith('.json') && f !== 'index.json')
const skipped: Record<string, number> = {}
let migrated = 0, current = 0, pinsIn = 0, pinsOut = 0, problems = 0

for (const f of files) {
  const reg = parseRegister(readFileSync(join(src, f), 'utf8'))
  if (!reg) { skipped['not a register'] = (skipped['not a register'] ?? 0) + 1; continue }
  if (reg.version >= target) { current++; continue }
  const steps = plan(reg.version)
  if (steps.length === 0 || steps.at(-1)!.to !== target) { skipped[`no path from v${reg.version}`] = (skipped[`no path from v${reg.version}`] ?? 0) + 1; continue }
  const after = applyMigrations(reg, steps, {}, { sessionId: reg.sessionId, now: Date.now() })
  const say = (m: string) => { problems++; console.log(`  PROBLEM ${f}: ${m}`) }
  const a = JSON.parse(serializeRegister(reg)) as Record<string, unknown>
  const b = JSON.parse(serializeRegister(after)) as Record<string, unknown>
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!CHANGED_OK.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k])) say(`key ${k} changed`)
  }
  const before = pinsOf(reg), now = pinsOf(after)
  if (JSON.stringify(before) !== JSON.stringify(now)) say(`pins ${before.length} vs ${now.length}`)
  if (b.stars !== undefined) say('a stars key remains')
  const back = parseRegister(serializeRegister(after))
  if (!back || serializeRegister(back) !== serializeRegister(after)) say('does not read back to itself')
  if (plan(after.version).length !== 0) say('the plan would run again')
  writeFileSync(join(out, 'before', f), serializeRegister(reg))
  writeFileSync(join(out, 'after', f), serializeRegister(after))
  migrated++
  pinsIn += before.length
  pinsOut += now.length
  if (before.length) console.log(`  ${f.slice(0, 8)}: v${reg.version} -> v${after.version}, ${before.length} pin(s) -> ${now.length}; ${reg.perma.length} record(s) untouched`)
}
const nSkipped = Object.values(skipped).reduce((s, n) => s + n, 0)
console.log(`files ${files.length} = migrated ${migrated} + already v${target} ${current} + skipped ${nSkipped} ${JSON.stringify(skipped)}`)
console.log(`pins ${pinsIn} -> ${pinsOut}; problems ${problems}`)
console.log(`copies: ${join(out, 'before')} and ${join(out, 'after')}`)
