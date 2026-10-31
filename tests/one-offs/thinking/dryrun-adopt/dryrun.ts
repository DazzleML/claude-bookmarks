// U83 unit 6: adoption (core/bookmarks/adopt.ts, the 'adopt' op) dry-run on COPIES of real
// bookmark files. Reads the live data root only; writes only under the scratch folder given.
//   node tests/one-offs/thinking/dryrun-adopt/dryrun.ts <scratch-dir>
// Case A: 432b5fd1 (no file yet) takes in fe8a1041 then 8ed53c04 (newest first).
// Case B: fe8a1041 (its own records) takes in 8ed53c04 -- what a resumed fe8a1041 would do.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { emptyRegister, parseRegister, serializeRegister, type Register } from '../../../../plugin/hooks/core/bookmarks/register-file.ts'
import { applyOp } from '../../../../plugin/hooks/core/bookmarks/register-ops.ts'

const LIVE = join(homedir(), 'claude', 'bookmarks', 'sessions')
const SCRATCH = process.argv[2]
if (!SCRATCH) throw new Error('give a scratch folder')
const ROOT = join(SCRATCH, 'sessions')
mkdirSync(ROOT, { recursive: true })

const NEWEST = '432b5fd1-2af8-4008-baf1-c8e33f495795'
const MID = 'fe8a1041-3a7a-4754-8741-443af6e189f7'
const OLDEST = '8ed53c04-304a-4519-a151-7e93495c6632'

// Copies: each register and its note folder.
for (const sid of [MID, OLDEST]) {
  cpSync(join(LIVE, `${sid}.json`), join(ROOT, `${sid}.json`))
  if (existsSync(join(LIVE, sid))) cpSync(join(LIVE, sid), join(ROOT, sid), { recursive: true })
}
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16)
const before = Object.fromEntries([MID, OLDEST].map(s => [s, sha(join(ROOT, `${s}.json`))]))
const load = (sid: string): Register => {
  const r = parseRegister(readFileSync(join(ROOT, `${sid}.json`), 'utf8'))
  if (!r) throw new Error(`${sid} does not parse`)
  return r
}

function adopt(current: Register, earlier: Register[], label: string): Register {
  let reg = current
  for (const e of earlier) {
    const r = applyOp(reg, { op: 'adopt', earlier: e }, Date.now())
    if ('error' in r) throw new Error(r.error)
    console.log(`  ${label}: from ${e.sessionId.slice(0, 8)} adopted ${r.adopted ?? 0}${r.unchanged ? ' (unchanged)' : ''}`)
    reg = r.register
  }
  return reg
}

function check(reg: Register, label: string) {
  const ns = reg.perma.map(r => r.n).filter((n): n is number => n !== undefined)
  const tn = reg.tombstones.map(t => t.n).filter((n): n is number => n !== undefined)
  const all = [...ns, ...tn]
  const dup = all.filter((n, i) => all.indexOf(n) !== i)
  const max = Math.max(0, ...all)
  const bySession: Record<string, number> = {}
  for (const r of reg.perma) bySession[(r.sessionId ?? reg.sessionId).slice(0, 8)] = (bySession[(r.sessionId ?? reg.sessionId).slice(0, 8)] ?? 0) + 1
  // Every copied record's note, where it had one before: sessions/<its session>/<uuid8>*.md
  let notes = 0
  let noNote = 0
  for (const r of reg.perma) {
    const sid = r.sessionId ?? reg.sessionId
    if (sid === reg.sessionId) continue
    const dir = join(ROOT, sid)
    const has = existsSync(dir) && readdirSync(dir).some(f => f.startsWith(r.uuid.slice(0, 8)) && f.endsWith('.md'))
    if (has) notes++
    else noNote++
  }
  const slots = Object.entries(reg.slots ?? {}).map(([o, l]) => `${o}:${Object.keys(l ?? {}).sort().join('')}`).join(' ')
  const slotBad = Object.values(reg.slots ?? {}).flatMap(l => Object.values(l ?? {})).filter(s => s.current !== null && !reg.perma.some(r => r.n === s.current)).length
  const text = serializeRegister(reg)
  const round = serializeRegister(parseRegister(text)!) === text
  console.log(`  ${label}: records ${reg.perma.length} by session ${JSON.stringify(bySession)}, tombstones ${reg.tombstones.length}, pins ${reg.pins?.length ?? 0}`)
  console.log(`  ${label}: numbers unique ${dup.length === 0 ? 'yes' : `NO ${dup}`}; nextN ${reg.nextN} > max ${max}: ${(reg.nextN ?? 0) > max}; letters [${slots}] pointing at a missing record: ${slotBad}`)
  console.log(`  ${label}: copied records with their note found ${notes}, without ${noNote}; save round-trips: ${round}`)
  return text
}

console.log('Case A: 432b5fd1 starts empty')
const a = adopt(emptyRegister(NEWEST, 'dryrun', Date.now()), [load(MID), load(OLDEST)], 'A')
writeFileSync(join(ROOT, `${NEWEST}.json`), check(a, 'A'))
const a2 = adopt(a, [load(MID), load(OLDEST)], 'A again')
console.log(`  A again: same register: ${a2 === a}`)

console.log('Case B: fe8a1041 resumed, its own records kept')
const own = load(MID)
const b = adopt(own, [load(OLDEST)], 'B')
console.log(`  B: own records ${own.perma.length} -> ${b.perma.length}; own numbers unchanged: ${own.perma.every(r => b.perma.find(x => x.uuid === r.uuid && x.createdAt === r.createdAt)?.n === r.n)}`)
check(b, 'B')

const after = Object.fromEntries([MID, OLDEST].map(s => [s, sha(join(ROOT, `${s}.json`))]))
console.log(`Earlier files byte-identical: ${JSON.stringify(before) === JSON.stringify(after)}`)
const liveSame = [MID, OLDEST].every(s => sha(join(LIVE, `${s}.json`)) === before[s])
console.log(`Live files untouched (same hash as the copies): ${liveSame}`)
