// Runs core/search searchPlaces over a REAL conversation's place index and text pieces, as
// probe_places_pass_real.ts left them under a scratch data root, and times a few queries
// (0.7 groundwork, unit 4), 2026-10-25. Read only.
//
// Usage: node --experimental-strip-types probe_search_real.ts <scratch places dir for the session>
import { readFileSync, readdirSync } from 'node:fs'
import { parsePlaceIndex } from '../../../plugin/hooks/core/places/reader.ts'
import { parseQuery, type Preset } from '../../../plugin/hooks/core/search/query.ts'
import { searchPlaces } from '../../../plugin/hooks/core/search/search.ts'

const dir = process.argv[2]!
const header = readFileSync(`${dir}/index.json`, 'utf8')
const h = JSON.parse(header)
const rowPieces = Array.from({ length: h.rowPieces }, (_, i) => readFileSync(`${dir}/index.${i}.jsonl`, 'utf8'))
// A finished pass seals its last piece, so the saved open piece is empty and was never written.
let openText: string | undefined
try { openText = readFileSync(`${dir}/text.${h.open.n}.jsonl`, 'utf8') } catch { openText = undefined }
const read = parsePlaceIndex(header, rowPieces, openText, h.session)
if (read.kind !== 'ok') throw new Error(read.why)
const rows = read.idx.rows
const pieceFiles = readdirSync(dir).filter(f => f.startsWith('text.'))
console.log(`${rows.length} rows, ${pieceFiles.length} text pieces`)
const cases: [string, Preset[] | undefined][] = [
  ['loader', undefined],
  ['"band field"', undefined],
  ['m/fe[a-z]+Input/', undefined],
  ['loader agent:oracle', ['agents']],
  ['zqxjvbrkwm', undefined],
  ['in:tools tool:Bash', undefined],
  ['loader', ['user', 'claude']],
]
for (const [text, toggles] of cases) {
  const t = performance.now()
  let reads = 0
  const r = searchPlaces(rows, parseQuery(text), n => { reads++; try { return readFileSync(`${dir}/text.${n}.jsonl`, 'utf8') } catch { return undefined } }, toggles ? { toggles } : {})
  console.log(`${(text + (toggles ? ` [${toggles.join('+')}]` : '')).padEnd(36)} ${String(r.hits.length).padStart(6)} hits of ${String(r.inScope).padStart(6)} in scope, ${reads} piece(s) read, ${(performance.now() - t).toFixed(0)} ms`)
}
