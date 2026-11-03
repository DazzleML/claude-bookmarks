#!/usr/bin/env node
// Red-green audit of 0.8.x unit 0b (the lists pane's per-draw freshness check), on a scratch
// copy of plugin/ only: the live plugin/ hot-reloads every open session and is never written.
// Each mutant copies plugin/ fresh, applies one behaviour change (its anchor asserted to exist),
// runs the kit there, and reports the new tests' results.
//
// Run: node tests/one-offs/thinking/redgreen-080b-freshness/run.mjs <scratch folder outside the repo>

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

const LISTS = 'hooks/handlers/lists.ts'
const REGISTER = 'hooks/register.tsx'
const NEW = [
  "another session's change to the lists file shows at the pane's next draw",
  'an unchanged lists file is not read again at the next draw',
  'after a press writes the file, the pane shows it and later draws do not read it again',
  "after a press of ours, another session's later change still shows at the next draw",
]
const MUTANTS = [
  ['baseline', null, '', ''],
  ['a no freshness check', LISTS, 'if (!file || (await this.moved(ports))) {', 'if (!file) {'],
  ['b every draw re-reads', LISTS, 'return c.mark === undefined || (await this.markOf(ports, c.path)) !== c.mark', 'return true'],
  ['c the stat port not wired', REGISTER, "    fsStat: path => $.fs.stat(path).then(s => ({ size: s.size, mtimeMs: s.mtimeMs }), () => undefined),\n", ''],
  ['d the write keeps no watermark and never re-reads', LISTS, 'return c.mark === undefined || (await', 'return c.mark !== undefined && (await'],
]

const results = []
for (const [name, file, from, to] of MUTANTS) {
  const dir = path.join(scratch, name.split(' ')[0], 'plugin')
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  fs.cpSync(path.join(REPO, 'plugin'), dir, { recursive: true, filter: s => !s.includes(`${path.sep}node_modules${path.sep}`) })
  if (file) {
    const p = path.join(dir, file)
    const src = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
    if (!src.includes(from)) throw new Error(`mutant ${name}: anchor not found`)
    fs.writeFileSync(p, src.replace(from, to))
  }
  let out
  try {
    out = execFileSync('claude', ['plugin', 'test', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true, timeout: 300_000 })
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  const row = NEW.map(t => (out.includes(`(fail) ${t}`) ? 'RED' : out.includes(`(pass) ${t}`) ? 'green' : '??'))
  const otherFails = [...out.matchAll(/^\(fail\) (.*?) \[/gm)].map(m => m[1]).filter(t => !NEW.includes(t))
  results.push([name, row, otherFails])
  console.log(`${name}: ${row.join(' / ')}${otherFails.length ? `  (other fails: ${otherFails.join('; ')})` : ''}`)
}
