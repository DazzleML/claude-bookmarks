#!/usr/bin/env node
// Red-green audit of 0.8.0 unit 0 (the age formatter), on a scratch copy only.
// Copies plugin/hooks/core and tests/core/since.test.ts into <scratch>/, applies one behaviour
// mutant at a time (each anchor asserted to exist), runs the new tests there, and reports which
// went red and why. The live tree is never written: plugin/ hot-reloads every open session.
//
// Run: node tests/one-offs/thinking/redgreen-080-since/run.mjs <scratch folder outside the repo>

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

const SINCE = 'plugin/hooks/core/time/since.ts'
const MODEL = 'plugin/hooks/core/prompts/list-model.ts'
const MUTANTS = [
  ['a round, not floor', SINCE, 'Math.floor(left / size)', 'Math.round(left / size)'],
  ['b zero rungs dropped', SINCE, 'parts.push(`${n}${u}`)', 'if (n) parts.push(`${n}${u}`)'],
  ["c 'w' for weeks", SINCE, "['wk', 7", "['w', 7"],
  ['d quarters ignored', SINCE, "filter(([u]) => quarters || u !== 'q')", "filter(([u]) => u !== 'q')"],
  ['e floor ignored', SINCE, 'const end = LADDER.findIndex(([u]) => u === floor)', 'const end = LADDER.length - 1'],
  ['f depth ignored', SINCE, 'Math.max(0, depth)', '1'],
  ['i default depth 0', SINCE, '{ depth = 1,', '{ depth = 0,'],
  ['j the zero answer empty', SINCE, 'return `0${floor}`', "return ''"],
  ['h age, the old rounding body', MODEL,
    "export const age = (now: number, t: number): string => since(now, t, { depth: 0, floor: 'm' })",
    'export const age = (now: number, t: number): string => { const m = Math.round((now - t) / 60_000); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d` }'],
]

function fresh(dir) {
  fs.mkdirSync(dir, { recursive: true })
  fs.cpSync(path.join(REPO, 'plugin/hooks/core'), path.join(dir, 'plugin/hooks/core'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests/core'), { recursive: true })
  fs.copyFileSync(path.join(REPO, 'tests/core/since.test.ts'), path.join(dir, 'tests/core/since.test.ts'))
}

function run(dir) {
  let out
  try {
    out = execFileSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/core/since.test.ts'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = e.stdout
  }
  const failed = [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map(m => m[1])
  const reasons = [...out.matchAll(/^\s+error: '(.*)'$/gm)].map(m => m[1])
  const total = [...out.matchAll(/^# tests (\d+)$/gm)].map(m => Number(m[1]))[0]
  return { failed, reasons, total }
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
  console.log(`\n${name}: ${r.failed.length} red${r.failed.length ? '' : ' -- SURVIVED'}`)
  for (const f of r.failed) { console.log(`  - ${f}`); killedBy.set(f, [...(killedBy.get(f) ?? []), name.split(' ')[0]]) }
  if (r.reasons[0]) console.log(`  first reason: ${r.reasons[0].slice(0, 140)}`)
}
console.log('\nper test, the mutants that turned it red:')
for (const t of [...new Set([...killedBy.keys()])].sort()) console.log(`  ${t}: ${killedBy.get(t).join(', ')}`)
