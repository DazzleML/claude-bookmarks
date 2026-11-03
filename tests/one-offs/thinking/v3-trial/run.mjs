#!/usr/bin/env node
// The format-3 trial (0.8.x unit 5): the whole of plugin/ and tests/core copied to a scratch folder
// outside the repo, LISTS_VERSION set to 3 there, and the core suite and the kit run on the copy.
// The live tree stays at 2 until the flip, so this is the only way to run the version-3 path
// before it is live (a dormant branch cannot be kit-tested on the live tree).
//
// Run: node tests/one-offs/thinking/v3-trial/run.mjs <scratch folder outside the repo> [--core-only]
//      ... --mutant <letter>   one behaviour mutant of the handler wiring applied on the copy, the kit
//                              run on it (the red-green audit of the format-3 kit cases; core skipped)

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const scratch = path.resolve(process.argv[2] ?? '')
if (!process.argv[2] || !path.relative(REPO, scratch).startsWith('..')) {
  console.error('usage: run.mjs <scratch folder outside the repo> [--core-only]')
  process.exit(2)
}
const coreOnly = process.argv.includes('--core-only')
const mutant = process.argv.includes('--mutant') ? process.argv[process.argv.indexOf('--mutant') + 1] : undefined
// The handler wiring's behaviour mutants (handlers/lists.ts and lists-layout.ts's assemble), each a
// claim the format-3 kit cases make; applied after LISTS_VERSION moves on the copy.
const MUTANTS = {
  a: ['assemble does not refresh the items\' copies from the set', 'plugin/hooks/handlers/lists-layout.ts', 'settle(fromFormat3(lists, set.index), 0)', 'fromFormat3(lists, set.index)'],
  b: ['moved() ignores the set folder', 'plugin/hooks/handlers/lists.ts', 'return setMark(await ports.fsList(c.resolved.layout.bundlesDir).catch(() => [])) !== c.set.mark', 'return false'],
  c: ['an absent own folder refuses the read', 'plugin/hooks/handlers/lists.ts', "chk.link === 'removed' && !r.linked", 'false'],
  d: ['the flat file is never split', 'plugin/hooks/handlers/lists.ts', '!(await ports.fsExists(path)) && (await ports.fsExists(r.flatPath))', 'false'],
  e: ['a change is written the old way at format 3', 'plugin/hooks/handlers/lists.ts', 'if (got.path && LISTS_VERSION >= 3 && at?.resolved && at.set) {', 'if (false) {'],
  f: ['the dangling check is not run on load', 'plugin/hooks/handlers/lists.ts', "const readable = chk.link === 'ok' ? chk.check === 'ok' || chk.check === 'missing' : chk.link === 'removed' && !r.linked", 'const readable = true'],
}

fs.rmSync(scratch, { recursive: true, force: true })
fs.mkdirSync(path.join(scratch, 'tests'), { recursive: true })
fs.cpSync(path.join(REPO, 'plugin'), path.join(scratch, 'plugin'), { recursive: true, filter: p => !p.includes('node_modules') })
fs.cpSync(path.join(REPO, 'tests', 'core'), path.join(scratch, 'tests', 'core'), { recursive: true })
for (const extra of ['tests/fixtures', 'tests/checklists/fixtures']) if (fs.existsSync(path.join(REPO, extra))) fs.cpSync(path.join(REPO, extra), path.join(scratch, extra), { recursive: true })

const lists = path.join(scratch, 'plugin/hooks/core/lists/lists.ts')
const src = fs.readFileSync(lists, 'utf8')
const from = 'export const LISTS_VERSION = 2'
if (!src.includes(from)) throw new Error('LISTS_VERSION = 2 not found; is the live tree already at 3?')
fs.writeFileSync(lists, src.replace(from, 'export const LISTS_VERSION = 3'))
console.log(`scratch: ${scratch} (LISTS_VERSION = 3)`)
if (mutant) {
  const m = MUTANTS[mutant]
  if (!m) throw new Error(`no mutant ${mutant}; have ${Object.keys(MUTANTS).join(', ')}`)
  const p = path.join(scratch, m[1]), s = fs.readFileSync(p, 'utf8')
  if (!s.includes(m[2])) throw new Error(`mutant ${mutant}: anchor not found in ${m[1]}`)
  fs.writeFileSync(p, s.replace(m[2], m[3]))
  console.log(`mutant ${mutant}: ${m[0]}`)
}

// Core.
const core = mutant ? { stdout: '# pass 0\n# fail 0\n', stderr: '' } :spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...fs.readdirSync(path.join(scratch, 'tests/core')).filter(f => f.endsWith('.test.ts')).map(f => `tests/core/${f}`)], { cwd: scratch, encoding: 'utf8' })
const tap = core.stdout + core.stderr
const pass = Number(/^# pass (\d+)$/m.exec(tap)?.[1] ?? NaN), fail = Number(/^# fail (\d+)$/m.exec(tap)?.[1] ?? NaN)
console.log(`core at 3: ${pass} pass, ${fail} fail`)
for (const m of tap.matchAll(/^not ok \d+ - (.*)$/gm)) console.log(`  red: ${m[1]}`)
if (fail) {
  // The first assertion detail of each red test, for the fix.
  for (const m of tap.matchAll(/^not ok \d+ - (.*)\n([\s\S]*?)\n  \.\.\./gm)) {
    const detail = m[2].split('\n').filter(l => /error:|expected:|actual:|location:/.test(l)).slice(0, 4).map(l => `      ${l.trim()}`).join('\n')
    console.log(`    ${m[1].slice(0, 70)}\n${detail}`)
  }
}

if (coreOnly) process.exit(fail ? 1 : 0)

// The kit, on the copy (its own runner; claude-code/testing resolves from the copy's types).
let kitOut
try {
  kitOut = execFileSync('claude', ['plugin', 'test', path.join(scratch, 'plugin')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true })
} catch (e) {
  kitOut = `${e.stdout ?? ''}${e.stderr ?? ''}`
}
const kp = /(\d+) pass/.exec(kitOut)?.[1], kf = /(\d+) fail/.exec(kitOut)?.[1]
console.log(`kit at 3${mutant ? ` under mutant ${mutant}` : ''}: ${kp ?? '?'} pass, ${kf ?? '?'} fail${mutant && kf === '0' ? ' -- SURVIVED' : ''}`)
for (const line of kitOut.split('\n')) if (/^\s*(✗|x|FAIL|not ok)/i.test(line) || /\bfail(ed)?\b/i.test(line) && !/\d+ fail/.test(line)) console.log(`  ${line.trim()}`)
process.exit(fail || (kf && kf !== '0') ? 1 : 0)
