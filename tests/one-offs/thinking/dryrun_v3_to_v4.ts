// Dry run of the v3-to-v4 migration (pins become stars; the 0.7 groundwork design, unit 6a) over
// a COPY of a real bookmark folder, before the step is registered (6b). Reads the folder's
// register files and never writes there; writes each migrated copy, and the original beside it,
// under the scratch folder so the two can be diffed. 2026-10-26.
//
// Usage: node --experimental-strip-types dryrun_v3_to_v4.ts <bookmarks/sessions folder> <scratch folder>
//
// Checks per file: only version, format, pins, stars, rev and updatedAt differ; every pin is a
// star from `prompts` and nothing else became one; the result reads back to itself; a second
// run of the step changes nothing more. Reconciles: files read = migrated + skipped (by reason).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRegister, serializeRegister, type Register } from '../../../plugin/hooks/core/bookmarks/register-file.ts'
import { applyMigrations, v3to4 } from '../../../plugin/hooks/core/bookmarks/migrations.ts'

const [src, out] = process.argv.slice(2)
if (!src || !out) { console.error('usage: dryrun_v3_to_v4.ts <sessions folder> <scratch folder>'); process.exit(2) }
mkdirSync(join(out, 'before'), { recursive: true })
mkdirSync(join(out, 'after'), { recursive: true })

const CHANGED_OK = new Set(['version', 'format', 'pins', 'stars', 'rev', 'updatedAt'])
const files = readdirSync(src).filter(f => f.endsWith('.json') && f !== 'index.json')
const skipped: Record<string, string[]> = {}
let migrated = 0, pinsIn = 0, starsOut = 0, problems = 0
const skip = (why: string, f: string) => { (skipped[why] ??= []).push(f) }

for (const f of files) {
  const text = readFileSync(join(src, f), 'utf8')
  const reg = parseRegister(text)
  if (!reg) { skip('not a register', f); continue }
  if (reg.version !== 3) { skip(`version ${reg.version}`, f); continue }
  const after = applyMigrations(reg, [v3to4], {}, { sessionId: reg.sessionId, now: Date.now() })
  const say = (m: string) => { problems++; console.log(`  PROBLEM ${f}: ${m}`) }
  // Only the expected keys differ.
  const a = JSON.parse(serializeRegister(reg)) as Record<string, unknown>
  const b = JSON.parse(serializeRegister(after)) as Record<string, unknown>
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (CHANGED_OK.has(k)) continue
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) say(`key ${k} changed`)
  }
  // Every pin is a star from prompts, and nothing else.
  const pins = Object.entries(reg.pins ?? {}).flatMap(([o, l]) => (Array.isArray(l) ? l : []).filter(u => typeof u === 'string').map(u => `${o}|${u}`))
  const stars = (after.stars ?? []).map(s => `${s.owner}|${s.uuid}`)
  if (new Set(pins).size !== new Set(stars).size || pins.some(p => !stars.includes(p))) say(`pins ${pins.length} vs stars ${stars.length}`)
  if ((after.stars ?? []).some(s => s.from !== 'prompts' || s.file !== undefined || s.off !== undefined)) say('a star not a plain prompts star')
  // Reads back to itself; a second run changes nothing more.
  const back = parseRegister(serializeRegister(after))
  if (!back || serializeRegister(back) !== serializeRegister(after)) say('does not read back to itself')
  const twice = v3to4.apply(after, {}, { sessionId: reg.sessionId, now: 0 })
  if (JSON.stringify(twice.stars ?? []) !== JSON.stringify(after.stars ?? [])) say('a second run changed the stars')
  writeFileSync(join(out, 'before', f), serializeRegister(reg))
  writeFileSync(join(out, 'after', f), serializeRegister(after))
  migrated++
  pinsIn += new Set(pins).size
  starsOut += stars.length
  if (pins.length) console.log(`  ${f.slice(0, 8)}: ${pins.length} pin(s) -> ${stars.length} star(s); ${reg.perma.length} record(s) untouched`)
}

const nSkipped = Object.values(skipped).reduce((s, l) => s + l.length, 0)
console.log(`files ${files.length} = migrated ${migrated} + skipped ${nSkipped} ${JSON.stringify(Object.fromEntries(Object.entries(skipped).map(([k, v]) => [k, v.length])))}`)
console.log(`pins ${pinsIn} -> stars ${starsOut}; problems ${problems}`)
console.log(`copies: ${join(out, 'before')} and ${join(out, 'after')}`)
