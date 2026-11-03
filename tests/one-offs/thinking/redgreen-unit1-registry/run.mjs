#!/usr/bin/env node
// Red-green audit of 0.8.x unit 1 (the registry core), on a scratch copy only: plugin/hooks/core
// and tests/core/registry.test.ts are copied into <scratch>/, one behaviour mutant applied at a
// time (its anchor asserted to exist), the new tests run there. The live tree is never written.
//
// Run: node tests/one-offs/thinking/redgreen-unit1-registry/run.mjs <scratch folder outside the repo>

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

const PF = 'plugin/hooks/core/projects/project-file.ts'
const PL = 'plugin/hooks/core/projects/placement.ts'
const RG = 'plugin/hooks/core/projects/registry.ts'
const TEST = 'tests/core/registry.test.ts'
const MUTANTS = [
  ['a deepest-wins dropped', PL, '(!best || b.length > normPath(best.base).length)', '!best'],
  ['b a stamp tie goes to project.json', RG, 'file.stamps[k] > identity.stamps[k]', 'file.stamps[k] >= identity.stamps[k]'],
  ['c members follow the name (file-wide newest)', RG, "membersFrom = take('members')", 'membersFrom = nameFrom'],
  ['d checkFolder ignores the id', PF, 'r.value.id === id ?', 'true ?'],
  ['e the mirror always written', RG, 'writeProjectFile: !same(projectFile, file)', 'writeProjectFile: true'],
  ['f a colliding id not refused', RG, 'if (mine.created_at !== incoming.created_at || mine.user !== incoming.user)', 'if (false)'],
  ['g extra keys dropped', RG, '...(extra ?? {}) }, null, 2)', '}, null, 2)'],
  ['h the home-folder clause removed', PL, "if (p === normPath(facts.home)) return 'the home folder'", ''],
  ['i a lookalike prefix accepted', PL, 'path.startsWith(base.endsWith(\'/\') ? base : `${base}/`)', 'path.startsWith(base)'],
  ['j foldersWithId matches the bare id', PF, 'n.includes(`__${id}__`)', 'n.includes(id)'],
  ['k the stub read as missing', PF, 'if (c.movedTo !== undefined) {', 'if (false) {'],
  ['l the rebuild loses the members', RG, 'members: [...members], stamps: { ...stamps } }', 'members: [], stamps: { ...stamps } }'],
  ['m the lists folder keeps the slashes', PL, ".map(fileSafe).join('--')", ".join('/')"],
  ['n the ordinal reuses the highest', PL, 'Math.max(m, p.n), 0) + 1', 'Math.max(m, p.n), 0)'],
  ['o the id takes the low bits', RG, '(value >>> (bits - 5)) & 31', 'value & 31'],
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
for (const [name, file, from, to] of MUTANTS) {
  const dir = path.join(scratch, name.split(' ')[0])
  fresh(dir)
  const p = path.join(dir, file)
  const src = fs.readFileSync(p, 'utf8')
  if (!src.includes(from)) throw new Error(`mutant ${name}: anchor not found`)
  fs.writeFileSync(p, src.replace(from, to))
  const r = run(dir)
  console.log(`${name}: ${r.failed.length} red${r.failed.length ? '' : ' -- SURVIVED'}`)
  for (const f of r.failed) killedBy.set(f, [...(killedBy.get(f) ?? []), name.split(' ')[0]])
}
console.log('\nper test, the mutants that turned it red:')
for (const t of [...killedBy.keys()].sort()) console.log(`  ${t}: ${killedBy.get(t).join(', ')}`)
console.log(`never red: ${b.total - killedBy.size} test(s)`)
