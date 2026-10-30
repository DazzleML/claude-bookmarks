// The lineage rule on real transcripts, through the real scan (the U83 design, unit 1's check):
//   grep -o -E "<LINEAGE_SCAN_PATTERN>" <transcript> | uniq | node tests/one-offs/thinking/measure-continuations/scan.ts <self>
// Prints the lineage as JSON (ids only, no message text).
import { readFileSync } from 'node:fs'
import { lineageOf, rowsOfScan } from '../../../../plugin/hooks/core/lineage/lineage.ts'

console.log(JSON.stringify(lineageOf(rowsOfScan(readFileSync(0, 'utf8')), process.argv[2] ?? '')))
