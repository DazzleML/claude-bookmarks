#!/usr/bin/env node
// Red-green audit of 0.8.x unit 2 (lists format 3, the pure step), on a scratch copy only:
// plugin/hooks/core and tests/core/format3.test.ts are copied into <scratch>/, one behaviour mutant
// applied at a time (its anchor asserted to exist), the new tests run there. The live tree is never written.
//
// Run: node tests/one-offs/thinking/redgreen-unit2-format3/run.mjs <scratch folder outside the repo>

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

const F3 = 'plugin/hooks/core/lists/format3.ts'
const TEST = 'tests/core/format3.test.ts'
const MUTANTS = [
  ['a the bundles left in lists.json', F3, 'lists: { ...rest, version: LISTS_FORMAT3 },', 'lists: { ...f, version: LISTS_FORMAT3 },'],
  ['b the index order reversed', F3, 'bundles: (bundles ?? []).map(b => ({ ...b, rev: 1 }))', 'bundles: [...(bundles ?? [])].reverse().map(b => ({ ...b, rev: 1 }))'],
  ['c dangling ignores removed lists', F3, 'const itemsOf = (f: Pick<ListsFile, \'lists\' | \'removed\'>) => [...f.lists, ...f.removed]', 'const itemsOf = (f: Pick<ListsFile, \'lists\' | \'removed\'>) => [...f.lists]'],
  ['d the inverse drops a bundle\'s why', F3, '({ rev: _rev, file: _file, ...b }) => b as Bundle', '({ rev: _rev, file: _file, why: _w, ...b }) => b as Bundle'],
  ['e the step re-splits a v3 pair', F3, 'if (input.lists.version >= LISTS_FORMAT3) return', 'if (false) return'],
  ['f the inverse always adds a bundles field', F3, '...(bundles.length ? { bundles } : {})', 'bundles'],
  ['g the lists folder not _root', F3, "listsFolder: '_root',", "listsFolder: 'root',"],
  ['h the index parser accepts an entry with no id', F3, "typeof (e as IndexEntry).id === 'string' && ", ''],
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
