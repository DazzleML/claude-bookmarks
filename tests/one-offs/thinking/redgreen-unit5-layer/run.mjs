#!/usr/bin/env node
// Red-green audit of 0.8.x unit 5's format-3 layer (handlers/lists-layout.ts) and the parseLists
// `at` change, on scratch copies only: plugin/hooks and the layer's test are copied into
// <scratch>/, one behaviour mutant applied at a time (its anchor asserted to exist), the test file
// run there. A mutant no test turns red is SURVIVED.
//
// Run: node tests/one-offs/thinking/redgreen-unit5-layer/run.mjs <scratch folder outside the repo>

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const scratch = path.resolve(process.argv[2] ?? '')
if (!process.argv[2] || !path.relative(REPO, scratch).startsWith('..')) {
  console.error('usage: run.mjs <scratch folder outside the repo>')
  process.exit(2)
}
const LAYER = 'plugin/hooks/handlers/lists-layout.ts'
const TEST = 'tests/core/lists-layout.test.ts'
const MUTANTS = [
  ['a own-folder lookup ignores the recorded cwd', LAYER, 'candidates.push({ folder, ...(cwdOf ? { recordedCwd: cwdOf } : {}) })', 'candidates.push({ folder })'],
  ['b broken read as removed: no parent listing', LAYER, "const listed = stat ? undefined : (await ports.fsList(", 'const listed = undefined; void (await ports.fsList('],
  ['c project.json read whatever the link state', LAYER, "  if (link === 'ok') {\n    const at", "  if (true) {\n    const at"],
  ['d the file wins whatever its rev', LAYER, 'if (p.data.rev >= entry.rev) folded =', 'if (true) folded ='],
  ['e a no-end file taken on one read', LAYER, "const again = await ports.fsRead(path)\n          if (again === text) p = { ...p, kind: 'ok' }", "if (true) p = { ...p, kind: 'ok' }"],
  ['f a bad block not refused', LAYER, 'out.refused.set(entry.id, path)', 'void path'],
  ['g the toast every draw', LAYER, 'if (!toasted.has(path)) {\n            toasted.add(path)', 'if (true) {'],
  ['h a refused bundle written anyway', LAYER, 'if (refusedAt) return { ok: false', 'if (refusedAt && false) return { ok: false'],
  ['i no re-resolve before a creating write', LAYER, "if (again && again.layout.listsPath !== r.layout.listsPath) return", 'if (false) return'],
  ['j the index written before the files', LAYER, "  for (const e of changed) {\n    const prior = prev.files.get(e.id)", "  if (changed.length) await ports.fsWrite(r.layout.indexPath, serializeBundleIndex(index))\n  for (const e of changed) {\n    const prior = prev.files.get(e.id)"],
  ['k lists.json not written last', LAYER, "  if (changed.length || !(await ports.fsExists(r.layout.indexPath))) await ports.fsWrite(r.layout.indexPath, serializeBundleIndex(index))\n  const { bundles: _b, ...rest } = file", "  const { bundles: _b, ...rest } = file\n  await ports.fsWrite(r.layout.listsPath, serializeLists({ ...rest, version: LISTS_FORMAT3 } as ListsFile))\n  if (changed.length || !(await ports.fsExists(r.layout.indexPath))) await ports.fsWrite(r.layout.indexPath, serializeBundleIndex(index))"],
  ['l the flat file rewritten by the split', LAYER, "  await ports.fsWrite(r.layout.listsPath, split.lists)\n  ports.log(`[bm] lists: ${r.flatPath} moved", "  await ports.fsWrite(r.layout.listsPath, split.lists)\n  await ports.fsWrite(r.flatPath, split.lists)\n  ports.log(`[bm] lists: ${r.flatPath} moved"],
  ['m a taken file name reused', LAYER, 'return taken.has(`${base}.md`) ? `${base}-${b.id}.md` : `${base}.md`', 'return `${base}.md`'],
  ['n every bundle rewritten at every write', LAYER, 'if (was?.file && sameBundle(was, b)) continue', 'if (false) continue'],
  // Not here: the split parsing at this build's version instead of 2 is a no-op while LISTS_VERSION
  // is 2 (an unfair mutant); the v3 trial (tests/one-offs/thinking/v3-trial) is its test.
  ['q an unstable no-end read does not refuse writes (the notes would be rewritten empty)', LAYER, '            out.refused.set(entry.id, path)\n', ''],
  ['p a stub taken for the project (own folder)', LAYER, "check = r.id ? checkFolder(contents, r.id).kind : contents.projectFile !== undefined ? 'ok' : contents.movedTo !== undefined ? 'moved' : 'missing'", "check = contents.projectFile !== undefined || contents.movedTo !== undefined ? 'ok' : 'missing'"],
]
function run(dir) {
  let out
  try { out = execFileSync(process.execPath, ['--test', '--test-reporter=tap', TEST], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { out = e.stdout }
  return [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map(m => m[1])
}
// An optional third argument runs one mutant by its letter (and the baseline).
const only = process.argv[3]
for (const [name, file, from, to] of [['baseline', LAYER, '', ''], ...MUTANTS.filter(m => !only || m[0].startsWith(`${only} `))]) {
  const dir = path.join(scratch, name.split(' ')[0])
  fs.mkdirSync(path.join(dir, 'tests/core'), { recursive: true })
  fs.cpSync(path.join(REPO, 'plugin/hooks'), path.join(dir, 'plugin/hooks'), { recursive: true })
  fs.copyFileSync(path.join(REPO, TEST), path.join(dir, TEST))
  if (from) {
    const p = path.join(dir, file), src = fs.readFileSync(p, 'utf8')
    if (!src.includes(from)) throw new Error(`mutant ${name}: anchor not found`)
    fs.writeFileSync(p, src.replace(from, to))
  }
  const failed = run(dir)
  console.log(`${name}: ${failed.length} red${from && !failed.length ? ' -- SURVIVED' : ''}${failed.length ? ` (${failed.map(f => f.slice(0, 50)).join('; ')})` : ''}`)
}
