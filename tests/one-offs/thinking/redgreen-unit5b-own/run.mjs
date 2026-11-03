#!/usr/bin/env node
// Red-green audit of 0.8.x unit 5b (an item's own links beside its bundle), on scratch copies only:
// core mutants copy plugin/hooks and tests/core/bundles.test.ts to <scratch>/<letter>/ and run that
// file; the kit mutant copies plugin/ whole and runs `claude plugin test` on the copy. One
// behaviour mutant each, its anchor asserted to exist; a mutant no test turns red is SURVIVED.
//
// Run: node tests/one-offs/thinking/redgreen-unit5b-own/run.mjs <scratch folder outside the repo> [letter]

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const scratch = path.resolve(process.argv[2] ?? '')
if (!process.argv[2] || !path.relative(REPO, scratch).startsWith('..')) {
  console.error('usage: run.mjs <scratch folder outside the repo> [letter]')
  process.exit(2)
}
const B = 'plugin/hooks/core/lists/bundles.ts', PANE = 'plugin/hooks/views/lists-pane.tsx', TOOL = 'plugin/hooks/core/lists/lists-tool.ts'
const MUTANTS = [
  ['a settle drops the own links', 'core', B, 'const all = [...b.links, ...own]', 'const all = [...b.links]'],
  ['b into is ignored: every added link joins the bundle', 'core', B, "...(into === 'bundle' ? added : [])])\n  const ownLinks", '...added])\n  const ownLinks'],
  ['c bundle ignores own', 'core', B, 'const r = bundleItem(f, list, item, now, ownKeys)', 'const r = bundleItem(f, list, item, now)'],
  ['d an own link the bundle holds is kept (doubles)', 'core', B, '(item.own ?? []).filter(o => !b.links.some(x => sameLink(x, o)))', '(item.own ?? [])'],
  ['e the face only among the bundle\'s links', 'core', B, 'const links = b ? allLinksOf(b, item) : linksOf(item)', 'const links = b ? b.links : linksOf(item)'],
  ['f a bundle may be emptied by moving every link out', 'core', B, "if (!stays.length) return { ok: false, error: 'a bundle keeps at least one link' }", ''],
  ['g the pane does not mark an own link', 'kit', PANE, "const ownTag = isOwnLink(item, l) ? ' · this list' : ''", "const ownTag = ''"],
  ['h the tool does not flag an own link', 'kit', TOOL, '...(isOwnLink(i, l) ? { own: true } : {})', ''],
]
const only = process.argv[3]
function core(dir) {
  let out
  try { out = execFileSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/core/bundles.test.ts'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { out = e.stdout }
  return [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map(m => m[1])
}
function kit(dir) {
  let out
  try { out = execFileSync('claude', ['plugin', 'test', path.join(dir, 'plugin')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true }) } catch (e) { out = `${e.stdout ?? ''}${e.stderr ?? ''}` }
  return [...out.matchAll(/^\(fail\) (.*?)(?: \[[\d.]+ms\])?$/gm)].map(m => m[1])
}
for (const [name, kind, file, from, to] of [['baseline', 'core', B, '', ''], ...MUTANTS.filter(m => !only || m[0].startsWith(`${only} `))]) {
  const dir = path.join(scratch, name.split(' ')[0])
  fs.rmSync(dir, { recursive: true, force: true })
  if (kind === 'kit') fs.cpSync(path.join(REPO, 'plugin'), path.join(dir, 'plugin'), { recursive: true, filter: p => !p.includes('node_modules') })
  else {
    fs.mkdirSync(path.join(dir, 'tests/core'), { recursive: true })
    fs.cpSync(path.join(REPO, 'plugin/hooks'), path.join(dir, 'plugin/hooks'), { recursive: true })
    fs.copyFileSync(path.join(REPO, 'tests/core/bundles.test.ts'), path.join(dir, 'tests/core/bundles.test.ts'))
  }
  if (from) {
    const p = path.join(dir, file), src = fs.readFileSync(p, 'utf8')
    if (!src.includes(from)) throw new Error(`mutant ${name}: anchor not found`)
    fs.writeFileSync(p, src.replace(from, to))
  }
  const failed = kind === 'kit' ? kit(dir) : core(dir)
  console.log(`${name}: ${failed.length} red${from && !failed.length ? ' -- SURVIVED' : ''}${failed.length ? ` (${failed.map(f => f.slice(0, 60)).join('; ')})` : ''}`)
}
console.log('done')
