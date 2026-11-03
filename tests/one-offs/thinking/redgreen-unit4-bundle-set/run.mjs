#!/usr/bin/env node
// Red-green audit of 0.8.x unit 4 (the bundle set and cross-project references), on a scratch copy
// only: plugin/hooks/core and tests/core/bundle-set.test.ts are copied into <scratch>/, one behaviour
// mutant applied at a time (its anchor asserted to exist), the new tests run there.
//
// Run: node tests/one-offs/thinking/redgreen-unit4-bundle-set/run.mjs <scratch folder outside the repo>

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
const BS = 'plugin/hooks/core/lists/bundle-set.ts'
const TEST = 'tests/core/bundle-set.test.ts'
const MUTANTS = [
  ['a crossProject always false', 'crossProject: ref.project !== ownProject }', 'crossProject: false }'],
  ['b the owner not the entry\'s', 'owner: entry.by,', "owner: 'user',"],
  ['c unregistered read as no set', "if (set === 'unregistered') return", "if (false) return"],
  ['d attachRef always writes bundleProject', '...(ref.project !== ownProject ? { bundleProject: ref.project } : {})', 'bundleProject: ref.project'],
  ['e attachRef keeps a stale bundleProject', 'const { bundleProject: _old, ...rest } = item', 'const rest = item'],
  ['f putEntry rev not moved', 'rev: prev ? prev.rev + 1 : 1', 'rev: prev ? prev.rev : 1'],
  ['g putEntry drops the kept file', 'const keptFile = file ?? prev?.file', 'const keptFile = file'],
  ['h the grammar accepts a name', 'bm:bundle\\/([a-z2-7]{8})\\/', 'bm:bundle\\/([^/]+)\\/'],
  ['i refOf ignores bundleProject', 'project: item.bundleProject ?? ownProject', 'project: ownProject'],
  ['j ownerless reports nothing', 'index.bundles.filter(e => !e.by).map(e => e.id)', '[]'],
]

function fresh(dir) {
  fs.mkdirSync(dir, { recursive: true })
  fs.cpSync(path.join(REPO, 'plugin/hooks/core'), path.join(dir, 'plugin/hooks/core'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests/core'), { recursive: true })
  fs.copyFileSync(path.join(REPO, TEST), path.join(dir, TEST))
}
function run(dir) {
  let out
  try {
    out = execFileSync(process.execPath, ['--test', '--test-reporter=tap', TEST], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = e.stdout
  }
  return { failed: [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map(m => m[1]), total: Number(/^# tests (\d+)$/m.exec(out)?.[1]) }
}

const base = path.join(scratch, 'baseline')
fresh(base)
const b = run(base)
console.log(`baseline: ${b.total - b.failed.length}/${b.total} green`)
if (b.failed.length) process.exit(1)
const killedBy = new Map()
for (const [name, from, to] of MUTANTS) {
  const dir = path.join(scratch, name.split(' ')[0])
  fresh(dir)
  const p = path.join(dir, BS)
  const src = fs.readFileSync(p, 'utf8')
  if (!src.includes(from)) throw new Error(`mutant ${name}: anchor not found`)
  fs.writeFileSync(p, src.replace(from, to))
  const r = run(dir)
  console.log(`${name}: ${r.failed.length} red${r.failed.length ? '' : ' -- SURVIVED'}`)
  for (const f of r.failed) killedBy.set(f, [...(killedBy.get(f) ?? []), name.split(' ')[0]])
}
console.log(`never red: ${b.total - killedBy.size} test(s)`)
for (const t of [...killedBy.keys()].sort()) console.log(`  ${t}: ${killedBy.get(t).join(', ')}`)
