#!/usr/bin/env node
// Red-green audit of 0.8.x unit 3 (the bundle file), on a scratch copy
// only: plugin/hooks/core and tests/core/bundle-file.test.ts are copied into <scratch>/, one behaviour
// mutant applied at a time (its anchor asserted to exist), the new tests run there.
//
// Run: node tests/one-offs/thinking/redgreen-unit3-bundle-file/run.mjs <scratch folder outside the repo>

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
const BS = 'plugin/hooks/core/lists/bundle-file.ts'
const TEST = 'tests/core/bundle-file.test.ts'
const MUTANTS = [
  ['a the end line not required', "if (end < 0) return { kind: 'no-end', data, notes: tail, eol }", "if (end < 0) return { kind: 'ok', data, notes: tail, eol }"],
  ['b the end line by any rev', 'if (m && Number(m[1]) === block.rev) { end = i; break }', 'if (m) { end = i; break }'],
  ['c text after the end line dropped', "const notes = (before ? before + eol : '') + after", "const notes = (before ? before + eol : '')"],
  // Unanchored, and found where it is (the position follows the match, or the mutant fails by accident).
  ['d the block not anchored', "new RegExp(`^(?:${eol})*${FENCE}bm-links${eol}`).exec(text.slice(fm[0].length))\n  if (!opening) return { kind: 'bad', why: 'no links block after the front matter' }\n  const jsonStart = fm[0].length + opening[0].length", "new RegExp(`(?:${eol})${FENCE}bm-links${eol}`).exec(text.slice(fm[0].length))\n  if (!opening) return { kind: 'bad', why: 'no links block after the front matter' }\n  const jsonStart = fm[0].length + opening.index + opening[0].length"],
  ['e the Links-region check removed', "if (!linksRegion.every(l => l === '' || l === '## Links' || l.startsWith('- '))) return", 'if (false) return'],
  ['f an absent why taken as a deletion', 'if (read.why !== undefined && read.why !== base.why) out.why = read.why', 'if (read.why !== base.why) out.why = read.why'],
  ['g a hand-set started lowered', 'current !== base ? current : Math.min(current, earliest)', 'Math.min(current, earliest)'],
  ['h the derived tag not stripped', 'tagsRaw.filter(t => t !== DERIVED_TAG)', 'tagsRaw'],
  ['i the eol forced to LF', "const eol = text.includes('\\r\\n') ? '\\r\\n' : '\\n'", "const eol = '\\n'"],
  ['j the newer check removed', "if (version > BUNDLE_FILE_VERSION) return { kind: 'newer', version }", ''],
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
