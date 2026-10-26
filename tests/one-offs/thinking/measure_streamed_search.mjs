// How long a search takes over a whole conversation's text held in 4 MB pieces on disk
// (the 0.7 groundwork design, candidate R1), 2026-10-25.
//
// Pieces are made by measure_places_text_and_agent_identity.py's extraction logic, done here in
// JS so the timing is the runtime the plugin uses: one JSON object per line ({kind, text}),
// cut into ~4 MB files. Then three searches over all pieces, cold-ish (first read) and warm:
// words in any order (case-insensitive), an exact phrase, a regex.
// Known-answer check: the word count for a word planted in the query set ("transcript") must
// be the same in cold and warm runs, and a nonsense word must find 0.
//
// Usage: node measure_streamed_search.mjs <session.jsonl> <scratch dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, createReadStream } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { createInterface } from 'node:readline'

const [main, scratch] = process.argv.slice(2)
mkdirSync(scratch, { recursive: true })
const sid = basename(main, '.jsonl')
const files = [main, ...readdirSync(join(dirname(main), sid, 'subagents')).filter(f => f.endsWith('.jsonl')).map(f => join(dirname(main), sid, 'subagents', f))]

const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b && b.type === 'text').map(b => b.text ?? '').join('\n') : ''
let piece = [], pieceBytes = 0, n = 0, rows = 0
const flush = () => { if (piece.length) { writeFileSync(join(scratch, `piece-${String(n++).padStart(3, '0')}.jsonl`), piece.join('\n')); piece = []; pieceBytes = 0 } }
const push = (kind, text) => { if (!text) return; const line = JSON.stringify({ kind, text }); piece.push(line); pieceBytes += line.length; rows++; if (pieceBytes > 4_000_000) flush() }

let t = performance.now()
for (const f of files) {
  const rl = createInterface({ input: createReadStream(f), crlfDelay: Infinity })
  for await (const raw of rl) {
    let r; try { r = JSON.parse(raw) } catch { continue }
    const m = r && r.message
    if (!m || (r.type !== 'user' && r.type !== 'assistant')) continue
    if (r.type === 'user') {
      if (Array.isArray(m.content) && m.content.some(b => b && b.type === 'tool_result')) { for (const b of m.content) if (b && b.type === 'tool_result') push('tool-result', textOf(b.content)); continue }
      push('prompt', textOf(m.content))
    } else for (const b of Array.isArray(m.content) ? m.content : []) {
      if (b?.type === 'text') push('reply', b.text)
      else if (b?.type === 'thinking') push('thinking', b.thinking)
      else if (b?.type === 'tool_use') push('tool-call', JSON.stringify(b.input ?? {}))
    }
  }
}
flush()
const prepMs = performance.now() - t
const pieces = readdirSync(scratch).filter(f => f.startsWith('piece-')).sort().map(f => join(scratch, f))
const totalMB = pieces.reduce((s, p) => s + statSync(p).size, 0) / 1e6
console.log(`pieces: ${pieces.length}, ${totalMB.toFixed(1)} MB, ${rows} rows, prepared in ${(prepMs / 1000).toFixed(1)} s (${files.length} files)`)

const searches = {
  'words (transcript loader)': text => { const l = text.toLowerCase(); return l.includes('transcript') && l.includes('loader') },
  'phrase ("band field")': text => text.includes('band field'),
  'regex (/fe[a-z]+Input/)': text => /fe[a-z]+Input/.test(text),
  'nonsense word (known 0)': text => text.toLowerCase().includes('zqxjvbrkwm'),
}
for (const pass of ['first', 'second']) {
  for (const [name, test] of Object.entries(searches)) {
    t = performance.now()
    let hits = 0, firstHitMs = -1
    for (const p of pieces) {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        if (!line) continue
        const { text } = JSON.parse(line)
        if (test(text)) { hits++; if (firstHitMs < 0) firstHitMs = performance.now() - t }
      }
    }
    console.log(`${pass.padEnd(6)} ${name.padEnd(28)} ${hits.toString().padStart(6)} hits  ${(performance.now() - t).toFixed(0).padStart(6)} ms total  first hit ${firstHitMs < 0 ? '-' : firstHitMs.toFixed(0) + ' ms'}`)
  }
}
