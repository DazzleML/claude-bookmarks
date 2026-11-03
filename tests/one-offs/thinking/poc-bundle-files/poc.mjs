// POC: does the bundles-as-files format hold on the real bundles? See README.md for the
// predictions, written before this ran. Reads copies of the lists files from the folder given
// as the first argument; writes only results.md beside this script.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { parseFrontMatter } from '../../../../plugin/hooks/core/bookmarks/register-file.ts'
import { linkKey } from '../../../../plugin/hooks/core/lists/item-links.ts'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = process.argv[2]
if (!dataDir) throw new Error('usage: node poc.mjs <folder with the copied lists files>')

const FENCE = '```'
const MARKER = '<!-- bm notes: everything below this line is yours; the plugin never rewrites it -->'
const iso = ms => new Date(ms).toISOString()
const NOTES = [
  'My own notes, with a fenced block of my own:',
  '',
  FENCE + 'bm-links',
  '{"not": "the plugin\'s block"}',
  FENCE,
  '',
  '---',
  'a line that looks like front matter',
  '<!-- bm notes: a marker-like line inside the notes -->',
  'and a link I typed: bm:8f0f9b27/12d637fb',
  '',
].join('\n')

// --- the format ---
function render(b, { count = true, end = false, notes = NOTES } = {}) {
  const block = { rev: b.rev ?? 1, ...(count ? { count: b.links.length } : {}), links: b.links, created: b.createdAt, updated: b.updatedAt }
  const fm = ['---', 'kind: bookmarks-bundle', 'version: 1', `id: ${b.id}`, `label: ${b.label ?? ''}`, `why: ${(b.why ?? '').replace(/\n/g, ' ')}`, `by: ${b.by ?? ''}`, `created: ${iso(b.createdAt)}`, `updated: ${iso(b.updatedAt)}`, '---']
  const links = b.links.map(l => `- ${l.kind}: ${l.path ?? l.url ?? (l.repo ? `${l.repo}#${l.n}` : '') ?? ''}${l.uuid ? `${l.session?.slice(0, 8)}/${l.uuid.slice(0, 8)}` : ''}${l.text ?? ''}${l.about ? ` -- ${l.about}` : ''}`)
  const tail = end ? `\n<!-- bm end: ${block.rev} -->\n` : ''
  return [...fm, '', FENCE + 'bm-links', JSON.stringify(block), FENCE, '', '## Links', '', ...links, '', MARKER, notes].join('\n') + tail
}

function parse(text, { needCount = true, needEnd = false } = {}) {
  const fmEnd = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text)
  if (!fmEnd) return { bad: 'no front matter' }
  const fm = parseFrontMatter(text)
  const open = text.indexOf('\n' + FENCE + 'bm-links\n', fmEnd[0].length - 1)
  if (open < 0) return { bad: 'no block' }
  const start = open + FENCE.length + 'bm-links'.length + 2
  const close = text.indexOf('\n' + FENCE + '\n', start)
  if (close < 0) return { bad: 'block not closed' }
  let block
  try { block = JSON.parse(text.slice(start, close)) } catch { return { bad: 'block not JSON' } }
  if (needCount && block.count !== block.links?.length) return { bad: 'count' }
  const m = text.indexOf('\n' + MARKER + '\n', close)
  if (m < 0) return { bad: 'no marker' }
  let notes = text.slice(m + MARKER.length + 2)
  if (needEnd) {
    const e = /\n<!-- bm end: (\d+) -->\n$/.exec(notes)
    if (!e || Number(e[1]) !== block.rev) return { bad: 'no end line' }
    notes = notes.slice(0, e.index)
  }
  return { ok: true, fm, block, notes }
}

// --- the population ---
const files = readdirSync(dataDir).filter(f => f.endsWith('.json'))
const all = []
for (const f of files) {
  const j = JSON.parse(readFileSync(join(dataDir, f), 'utf8'))
  for (const b of j.bundles ?? []) all.push({ file: f, cwd: j.cwd, b })
}
const rows = []
const row = (arm, prediction, observed, pass) => rows.push({ arm, prediction, observed, verdict: pass ? 'held' : 'FAILED' })

// P1 round trip
let p1 = 0; const p1bad = []
for (const { file, b } of all) {
  const r = parse(render(b))
  const same = r.ok && r.fm.id === b.id && r.fm.label === (b.label ?? '') && r.block.links.length === b.links.length
    && JSON.stringify(r.block.links) === JSON.stringify(b.links)
    && r.block.links.map(linkKey).join() === b.links.map(linkKey).join()
    && r.block.created === b.createdAt && r.block.updated === b.updatedAt
  if (same) p1++; else p1bad.push(`${file}:${b.id}${r.bad ? ` (${r.bad})` : ''}`)
}
row('P1 round trip', `${all.length}/${all.length} equal`, `${p1}/${all.length} equal${p1bad.length ? `; not equal: ${p1bad.join(', ')}` : ''}`, p1 === all.length)

// P2 notes kept across three regenerations (render, parse, render from the parsed notes)
let p2 = 0
for (const { b } of all) {
  let notes = NOTES, ok = true
  for (let i = 0; i < 3; i++) {
    const r = parse(render(b, { notes }))
    if (!r.ok || r.notes !== NOTES) { ok = false; break }
    notes = r.notes
  }
  if (ok) p2++
}
row('P2 notes kept', `${all.length}/${all.length} byte-identical after 3 regenerations`, `${p2}/${all.length}`, p2 === all.length)

// Truncation sweeps: every 1/64 of the length
function sweep(opts, popts) {
  let shorterBlock = 0, shorterNotes = 0, cuts = 0
  for (const { b } of all) {
    const full = render(b, opts)
    const fullParse = parse(full, popts)
    for (let k = 1; k < 64; k++) {
      const cut = full.slice(0, Math.floor((full.length * k) / 64))
      cuts++
      const r = parse(cut, popts)
      if (!r.ok) continue
      if (r.block.links.length < b.links.length) shorterBlock++
      else if (r.notes !== fullParse.notes) shorterNotes++
    }
  }
  return { cuts, shorterBlock, shorterNotes }
}
const a = sweep({ count: false }, { needCount: false })
row('P3a control: no count', '>= 1 cut parses as a bundle with fewer links (predicted to fail)', `${a.shorterBlock} of ${a.cuts} cuts parsed with fewer links`, a.shorterBlock >= 1)
const bsw = sweep({ count: true }, { needCount: true })
row('P3b count on', '0 cuts parse with fewer links', `${bsw.shorterBlock} of ${bsw.cuts} cuts`, bsw.shorterBlock === 0)
row('P3c notes cut, count only', '>= 1 cut parses with shorter notes (predicted gap)', `${bsw.shorterNotes} of ${bsw.cuts} cuts parsed with shorter notes`, bsw.shorterNotes >= 1)
const d = sweep({ count: true, end: true }, { needCount: true, needEnd: true })
row('P3d end line', '0 cuts accepted as anything but the full file', `${d.shorterBlock + d.shorterNotes} of ${d.cuts} cuts accepted short`, d.shorterBlock + d.shorterNotes === 0)

// P4 ids
const byId = new Map()
for (const { file, b } of all) byId.set(b.id, [...(byId.get(b.id) ?? []), file])
const collide = [...byId.entries()].filter(([, fs]) => new Set(fs).size > 1)
const minted = new Set(all.map(() => randomBytes(4).toString('hex').slice(0, 6)))
row('P4 ids', 'today > 0 collisions across files; minted 0', `today ${collide.length} ids shared across files (${collide.map(([id, fs]) => `${id}: ${fs.join('+')}`).join('; ')}); minted ${all.length - minted.size} collisions of ${all.length}`, collide.length > 0 && minted.size === all.length)

// P5 file names per project (cwd)
const slug = s => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'bundle'
const names = new Map()
for (const { cwd, b } of all) {
  const n = `${iso(b.createdAt).slice(0, 10)}__${slug(b.label)}.md`
  const key = `${cwd}|${n}`
  names.set(key, (names.get(key) ?? 0) + 1)
}
const dup = [...names.entries()].filter(([, c]) => c > 1)
row('P5 file names', '0 collisions per project', `${dup.length} collisions${dup.length ? ': ' + dup.map(([k, c]) => `${k.split('|')[1]} x${c}`).join('; ') : ''}`, dup.length === 0)

// P6 size
const sizes = all.map(({ b }) => Buffer.byteLength(render(b, { end: true })))
const max = Math.max(...sizes)
row('P6 size', '< 65,536 bytes', `largest ${max} bytes; median ${sizes.sort((x, y) => x - y)[Math.floor(sizes.length / 2)]}`, max < 65536)

// --- report ---
const out = [
  '# Results (written by poc.mjs)',
  '',
  `Run ${new Date().toISOString()} over ${files.length} lists files, ${all.length} bundles.`,
  '',
  '| Arm | Prediction | Observed | Verdict |',
  '|---|---|---|---|',
  ...rows.map(r => `| ${r.arm} | ${r.prediction} | ${r.observed.replace(/\|/g, '/')} | ${r.verdict} |`),
  '',
  '"held" means the arm came out as predicted; for P3a and P3c the prediction is a failure of the format, so "held" there means the failure was found.',
  '',
].join('\n')
writeFileSync(join(here, 'results.md'), out)
console.log(out)
