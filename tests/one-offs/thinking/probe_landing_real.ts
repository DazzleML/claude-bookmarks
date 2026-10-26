// Runs core/places/landing.ts landingFor over every place of a REAL conversation's index (as
// probe_places_pass_real.ts left it under a scratch data root) and counts where each kind of
// place would land on stock: on itself, on a message, or outside (0.7 groundwork, unit 5),
// 2026-10-25. Read only.
//
// Usage: node --experimental-strip-types probe_landing_real.ts <scratch places dir for the session>
import { readFileSync } from 'node:fs'
import { parsePlaceIndex } from '../../../plugin/hooks/core/places/reader.ts'
import { landingFor } from '../../../plugin/hooks/core/places/landing.ts'

const dir = process.argv[2]!
const header = readFileSync(`${dir}/index.json`, 'utf8')
const h = JSON.parse(header)
const rowPieces = Array.from({ length: h.rowPieces }, (_, i) => readFileSync(`${dir}/index.${i}.jsonl`, 'utf8'))
let openText: string | undefined
try { openText = readFileSync(`${dir}/text.${h.open.n}.jsonl`, 'utf8') } catch { openText = undefined }
const read = parsePlaceIndex(header, rowPieces, openText, h.session)
if (read.kind !== 'ok') throw new Error(read.why)
const rows = read.idx.rows
const counts: Record<string, number> = {}
const outside: Record<string, number> = {}
const t = performance.now()
rows.forEach((r, i) => {
  const l = landingFor(rows, i)
  const where = r.at.file ? r.at.file.split(':')[0] : 'main'
  const k = `${where} ${r.kind} -> ${l.on}`
  counts[k] = (counts[k] ?? 0) + 1
  if (l.on === 'outside') outside[l.why] = (outside[l.why] ?? 0) + 1
})
console.log(`${rows.length} places, landed in ${(performance.now() - t).toFixed(0)} ms`)
for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${k}`)
console.log('outside, by reason:')
for (const [k, n] of Object.entries(outside).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${k}`)
