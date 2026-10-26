// Runs core/places/place.ts classifyRecord over a real conversation (the main transcript and
// every agent file) and reports: places by kind and author, skips by reason, and the
// reconciliation (classified + skipped + unparsed = lines). Any `other` place is printed, since
// `other` means a shape the classifier does not know (0.7 groundwork, unit 2), 2026-10-25.
//
// Usage: node --experimental-strip-types probe_place_classifier.ts <session.jsonl>
// Read only.
import { createReadStream, existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { classifyRecord, agentFile, type RowContext } from '../../../plugin/hooks/core/places/place.ts'

const main = process.argv[2]
const sid = basename(main, '.jsonl')
const agentsDir = join(dirname(main), sid, 'subagents')
const files: { path: string; ctx: RowContext }[] = [{ path: main, ctx: { session: sid } }]
if (existsSync(agentsDir)) {
  for (const f of readdirSync(agentsDir).filter(f => f.endsWith('.jsonl'))) {
    const id = f.replace(/^agent-/, '').replace(/\.jsonl$/, '')
    let type: string | undefined
    try { type = JSON.parse(readFileSync(join(agentsDir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')).agentType } catch { /* no meta */ }
    files.push({ path: join(agentsDir, f), ctx: { session: sid, file: agentFile(id), agent: { id, ...(type ? { type } : {}) } } })
  }
}

const kinds: Record<string, number> = {}
const skips: Record<string, number> = {}
const others: string[] = []
let lines = 0, recordsWithPlaces = 0, skipped = 0, unparsed = 0, places = 0
for (const { path, ctx } of files) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  for await (const raw of rl) {
    lines++
    let o: unknown
    try { o = JSON.parse(raw) } catch { unparsed++; continue }
    const c = classifyRecord(o, ctx)
    if ('skipped' in c) { skipped++; skips[c.skipped] = (skips[c.skipped] ?? 0) + 1; continue }
    recordsWithPlaces++
    for (const p of c.places) {
      places++
      const k = `${ctx.agent ? 'agent-file' : 'main'} ${p.kind} by ${p.author}`
      kinds[k] = (kinds[k] ?? 0) + 1
      if (p.kind === 'other' && others.length < 8) others.push(`${k}: ${JSON.stringify(p.text.slice(0, 100))}`)
    }
  }
}
const sorted = (r: Record<string, number>) => Object.entries(r).sort((a, b) => b[1] - a[1])
console.log(`files ${files.length}; lines ${lines}; records with places ${recordsWithPlaces}; skipped ${skipped}; unparsed ${unparsed}; reconciles: ${recordsWithPlaces + skipped + unparsed === lines}`)
console.log(`places ${places}`)
for (const [k, n] of sorted(kinds)) console.log(`  ${String(n).padStart(6)}  ${k}`)
console.log('skipped:')
for (const [k, n] of sorted(skips).slice(0, 25)) console.log(`  ${String(n).padStart(6)}  ${k}`)
console.log(`other places (first ${others.length}):`)
for (const s of others) console.log(`  ${s}`)
