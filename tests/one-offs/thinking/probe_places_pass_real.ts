// Runs handlers/places.ts startPlacesPass over a REAL conversation with Node file reads as its
// ports, writing the pieces and the index under a SCRATCH data root (never the person's), and
// reports time, places, pieces and their sizes; then runs it again to show the resume (0.7
// groundwork, unit 3), 2026-10-25.
//
// Usage: node --experimental-strip-types probe_places_pass_real.ts <session.jsonl> <scratch data root>
// Reads the conversation; writes only under the scratch root.
import { existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, basename } from 'node:path'
import { startPlacesPass, placesIndex, placesStatus, newConversation, PLACES_CHUNK } from '../../../plugin/hooks/handlers/places.ts'
import type { PlacesPorts } from '../../../plugin/hooks/engine/ports.ts'

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
    // Cut back to a UTF-8 character boundary, as hooks/scripts/read-chunk.ps1 does.
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
  log: l => { console.log('  log:', l); if (l.startsWith('[bm] places:') && l.includes(', done')) done = true },
}

for (const run of ['first', 'second (resume)']) {
  newConversation()
  done = false
  const t = performance.now()
  const mem0 = process.memoryUsage().heapUsed
  await startPlacesPass(ports)
  while (!done) await new Promise(r => setTimeout(r, 20))
  const idx = placesIndex()!
  const dir = `${norm(root!)}/bookmarks/places/${sid}`
  const pieces = readdirSync(dir).filter(f => f.startsWith('text.'))
  const mb = pieces.reduce((s, f) => s + statSync(`${dir}/${f}`).size, 0) / 1e6
  const g = (globalThis as { gc?: () => void }).gc
  if (g) g()
  console.log(`${run}: ${((performance.now() - t) / 1000).toFixed(1)} s, ${idx.rows.length} places, ${pieces.length} text pieces (${mb.toFixed(1)} MB), heap +${((process.memoryUsage().heapUsed - mem0) / 1e6).toFixed(0)} MB${g ? ' retained after gc' : ' (no gc: run node with --expose-gc)'}`)
  console.log(`  ${placesStatus()}`)
}
