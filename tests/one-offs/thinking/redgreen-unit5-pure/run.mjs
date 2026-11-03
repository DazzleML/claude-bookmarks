#!/usr/bin/env node
// Red-green audit of 0.8.x unit 5's pure layer (layout.ts and the 2->3 guard in lists.ts), on
// scratch copies only: plugin/hooks/core and the tests are copied into <scratch>/, one behaviour
// mutant applied at a time (its anchor asserted to exist), the mutant's own test file run there.
//
// Run: node tests/one-offs/thinking/redgreen-unit5-pure/run.mjs <scratch folder outside the repo>

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
const LAYOUT = 'plugin/hooks/core/lists/layout.ts', LISTS = 'plugin/hooks/core/lists/lists.ts'
const LT = 'tests/core/layout.test.ts', F3 = 'tests/core/format3.test.ts'
const MUTANTS = [
  ['a found folder ignores the id', LAYOUT, LT, 'const candidates = foldersWithId(o.folders, m.id)', 'const candidates = [...o.folders]'],
  ['b a removed link created for a linked project', LAYOUT, LT, "if (link !== 'ok') return { write: false, create: false, why: `the link to the vault is", "if (link !== 'ok' && link !== 'removed') return { write: false, create: false, why: `the link to the vault is"],
  ['c linkState skips the real path', LAYOUT, LT, "if (expectedTarget && f.stat.realPath && normPath(f.stat.realPath) !== normPath(expectedTarget)) return 'elsewhere'", ''],
  ['d writeVerdict writes on a stub', LAYOUT, LT, "if (check === 'ok') return { write: true, create: false }", "if (check === 'ok' || check === 'moved') return { write: true, create: false }"],
  ['e ownFolderFor by name only', LAYOUT, LT, 'candidates.find(c => c.recordedCwd !== undefined && normPath(c.recordedCwd) === want)', 'candidates.find(() => true)'],
  ['f needsSplit on an empty array', LISTS, F3, 'Array.isArray(raw.bundles) && raw.bundles.length > 0', 'Array.isArray(raw.bundles)'],
  ['g the 2->3 step keeps bundles', LISTS, F3, 'const { bundles: _none, ...rest } = f as RawFile & { bundles?: unknown }', 'const rest = f'],
]
function run(dir, test) {
  let out
  try { out = execFileSync(process.execPath, ['--test', '--test-reporter=tap', test], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { out = e.stdout }
  return [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map(m => m[1])
}
for (const [name, file, test, from, to] of [['baseline', LAYOUT, LT, '', ''], ...MUTANTS]) {
  const dir = path.join(scratch, name.split(' ')[0])
  fs.mkdirSync(path.join(dir, 'tests/core'), { recursive: true })
  fs.cpSync(path.join(REPO, 'plugin/hooks/core'), path.join(dir, 'plugin/hooks/core'), { recursive: true })
  for (const t of [LT, F3]) fs.copyFileSync(path.join(REPO, t), path.join(dir, t))
  if (from) {
    const p = path.join(dir, file), src = fs.readFileSync(p, 'utf8')
    if (!src.includes(from)) throw new Error(`mutant ${name}: anchor not found`)
    fs.writeFileSync(p, src.replace(from, to))
  }
  const failed = from ? run(dir, test) : [...run(dir, LT), ...run(dir, F3)]
  console.log(`${name}: ${failed.length} red${from && !failed.length ? ' -- SURVIVED' : ''}${failed.length ? ` (${failed.join('; ')})` : ''}`)
}
