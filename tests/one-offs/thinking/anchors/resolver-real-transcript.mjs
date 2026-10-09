// Real-shaped transcript check. Usage: node resolver-real-transcript.mjs <copy.jsonl>
// Never modifies the file. Runs grep -bnF as the mod's shell pass would.
import { execFileSync, execSync } from 'node:child_process'
import { statSync, readFileSync } from 'node:fs'
import { rowsFromGrep, resolveRows, jsonEscaped } from '../../../../hooks/core/transcript-lines.ts'

const f = process.argv[2]
const buf = readFileSync(f)
const lines = buf.toString('latin1').split('\n') // latin1 keeps byte==char for offsets
const lineLen = i => { let s = 0; for (let k = 0; k < i; k++) s += lines[k].length + 1; return s }
const run = pat => { const t = process.hrtime.bigint(); let out = ''; try { out = execFileSync('grep', ['-bnF', pat, f], { encoding: 'utf8', maxBuffer: 1 << 28 }) } catch (e) { out = e.stdout ?? '' } return { out, ms: Number(process.hrtime.bigint() - t) / 1e6 } }
const check = (label, pat, want) => {
  const g = run(pat)
  const t = process.hrtime.bigint()
  const rows = rowsFromGrep(g.out)
  const res = resolveRows(rows, want)
  const ms2 = Number(process.hrtime.bigint() - t) / 1e6
  console.log(`## ${label}: grepLines=${g.out.split('\n').filter(Boolean).length} rows=${rows.length} kind=${res.kind} grep=${g.ms.toFixed(1)}ms parse+resolve=${ms2.toFixed(2)}ms`)
  const row = res.kind === 'one' ? res.row : res.kind === 'many' ? res.earliest : undefined
  if (row) {
    const headBytes = Number(execSync(`head -n ${row.line - 1} "${f}" | wc -c`, { encoding: 'utf8' }).trim())
    const lineBytes = Buffer.byteLength(lines[row.line - 1], 'latin1')
    console.log(`   line=${row.line} byteStart=${row.byteStart} head|wc=${headBytes} ${row.byteStart === headBytes ? 'OK' : 'MISMATCH'}; span=${row.byteEnd - row.byteStart} lineBytes=${lineBytes} ${row.byteEnd - row.byteStart === lineBytes ? 'OK' : 'MISMATCH'}; uuid=${row.uuid}; slicedUuid=${buf.subarray(row.byteStart, row.byteEnd).toString('utf8').includes(row.uuid)}`)
    if (res.kind === 'many') console.log('   candidates', res.rows.map(r => r.line).join(','))
  }
  return res
}
const frag = process.argv[3]
check('user-row fragment', jsonEscaped(frag), { fragment: frag })
check('quote-bearing fragment', jsonEscaped(process.argv[4]), { fragment: process.argv[4] })
check('last-prompt-only pattern', '"lastPrompt":"RE:{ 2. Submit', { fragment: 'RE:{ 2. Submit' })
check('no match', 'zzz-never-said-qqq', { fragment: 'zzz-never-said-qqq' })
