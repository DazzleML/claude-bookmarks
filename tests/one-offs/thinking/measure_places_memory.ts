// What holds the places pass's retained heap (0.7 groundwork, before unit 7 wires the pass;
// the design's ledger reopens R5, lazy agent files, past 10 MB), 2026-10-26.
//
// Usage: node --expose-gc --experimental-strip-types measure_places_memory.ts <session.jsonl> <scratch data root>
// Reads the conversation; writes only under the scratch root (the pass's pieces and index).
//
// Method: gc before every reading; the heap after a full pass is the baseline delta. Then the
// index's parts are released one at a time (the open piece's lines, sealed text, heads, byKey,
// the rows) with a gc after each, so each part's share is the drop it causes. Known answer: an
// empty index (newConversation with nothing read) gives a delta near 0.
import { existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, basename } from 'node:path'
import { startPlacesPass, placesIndex, newConversation, PLACES_CHUNK } from '../../../plugin/hooks/handlers/places.ts'
import type { PlacesPorts } from '../../../plugin/hooks/engine/ports.ts'

const gc = (globalThis as { gc?: () => void }).gc
if (!gc) { console.error('run with node --expose-gc'); process.exit(2) }
const heap = () => { gc!(); gc!(); return process.memoryUsage().heapUsed }
const mb = (b: number) => (b / 1e6).toFixed(1)

const [main, root] = process.argv.slice(2)
const sid = basename(main!, '.jsonl')
const norm = (p: string) => p.replace(/\\/g, '/')
let done = false
const ports: PlacesPorts = {
  sessionId: async () => sid,
  transcriptPath: async () => norm(main!),
  fileSize: async p => (existsSync(p) ? statSync(p).size : undefined),
  readChunk: async (p, offset) => {
    const fd = openSync(p, 'r')
    const buf = Buffer.alloc(PLACES_CHUNK)
    const n = readSync(fd, buf, 0, PLACES_CHUNK, offset)
    closeSync(fd)
    let end = n
    if (n === PLACES_CHUNK) { while (end > 0 && (buf[end - 1]! & 0xc0) === 0x80) end--; if (end > 0 && buf[end - 1]! >= 0xc0) end-- }
    return { stdout: buf.subarray(0, end).toString('utf8'), via: 'sh' }
  },
  fsList: async d => readdirSync(d, { withFileTypes: true }).map(e => ({ name: e.name, kind: e.isDirectory() ? 'dir' : 'file' })),
  dataRoot: async () => norm(root!),
  fsExists: async p => existsSync(p),
  fsRead: async p => readFileSync(p, 'utf8'),
  fsWrite: async (p, t) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t) },
  after: (_ms, fn) => { setImmediate(fn); return { cancel: () => {} } },
  log: l => { if (l.startsWith('[bm] places:') && l.includes(', done')) done = true },
}

// Known answer: nothing read.
newConversation()
const e0 = heap()
newConversation()
console.log(`known answer, an empty conversation: delta ${mb(heap() - e0)} MB (expect ~0)`)

// A first pass from nothing: the scratch root must be new, so nothing resumes.
if (existsSync(`${norm(root!)}/bookmarks/places/${sid}`)) { console.error('use a new scratch root: an index exists there'); process.exit(2) }
newConversation()
const h0 = heap()
await startPlacesPass(ports)
while (!done) await new Promise(r => setTimeout(r, 20))
const idx = placesIndex()!
const total = heap() - h0
console.log(`first pass: ${idx.rows.length} places; retained ${mb(total)} MB`)

// Sizes by field, as JSON text (a lower bound on the strings' heap; V8 stores one-byte strings at 1 B/char).
const fieldBytes: Record<string, number> = {}
for (const r of idx.rows) for (const [k, v] of Object.entries(r)) fieldBytes[k] = (fieldBytes[k] ?? 0) + JSON.stringify(v).length
console.log('rows as JSON, by field (MB):', Object.entries(fieldBytes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${mb(v)}`).join(', '))
console.log(`open piece: ${idx.open.lines.length} lines, ${mb(idx.open.bytes)} MB; sealed waiting: ${idx.sealed.length} (${mb(idx.sealed.reduce((s, p) => s + p.text.length, 0))} MB)`)

// Release parts one at a time and read each drop.
const parts: [string, () => void][] = [
  ['the open piece\'s lines', () => { idx.open.lines = [] }],
  ['sealed pieces waiting', () => { idx.sealed = [] }],
  // The same text in strings of their own: if a head is a slice of its line, V8 keeps the
  // whole line alive through it, and a flat copy releases the line.
  ['the heads copied flat (same text)', () => { for (const r of idx.rows) r.head = Buffer.from(r.head, 'utf8').toString('utf8') }],
  ['the heads', () => { for (const r of idx.rows) r.head = '' }],
  ['byKey', () => { idx.byKey = new Map() }],
  ['the rows', () => { idx.rows = [] }],
]
let before = heap()
let sum = 0
for (const [name, release] of parts) {
  release()
  const now = heap()
  sum += before - now
  console.log(`  ${name}: ${mb(before - now)} MB`)
  before = now
}
newConversation()
const rest = before - heap()
sum += rest
console.log(`  the pass's other state (cursors, the module's pass): ${mb(rest)} MB`)
console.log(`reconcile: parts ${mb(sum)} MB of ${mb(total)} MB retained (left over: ${mb(total - sum)} MB)`)
console.log(`the heap at the end against the one before the pass: ${mb(heap() - h0)} MB (negative: that much was on the heap before the pass and freed during it)`)
