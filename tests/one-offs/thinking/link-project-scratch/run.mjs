#!/usr/bin/env node
// Shell test of plugin/hooks/scripts/link-project.ps1 and .sh (0.8.x unit 6a) on a scratch tree.
// Every path the cases make or change is under run-<stamp>/ inside the scratch folder given, and
// is checked to be. The two refusal cases that name places outside it are safe whatever the
// script does: the UNC case names a host that does not exist, and the mapped-drive case runs with
// -DryRun, which acts on nothing.
//
// Run: node tests/one-offs/thinking/link-project-scratch/run.mjs <scratch folder outside the repo, ~/claude and ~/.claude>

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..', '..')
// LINK_PS1 names a copy of the script instead (the red-green audit's mutants, each a scratch copy).
const PS1 = process.env.LINK_PS1 ?? path.join(REPO, 'plugin/hooks/scripts/link-project.ps1')
const SH = path.join(REPO, 'plugin/hooks/scripts/link-project.sh')
const low = p => path.resolve(p).toLowerCase()
const under = (p, root) => { const r = path.relative(low(root), low(p)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)) }

const arg = process.argv[2]
if (!arg) { console.error('usage: run.mjs <scratch folder>'); process.exit(2) }
const scratch = path.resolve(arg)
for (const f of [REPO, path.join(os.homedir(), 'claude'), path.join(os.homedir(), '.claude')]) {
  if (under(scratch, f) || under(f, scratch)) { console.error(`refused: the scratch folder must not be inside, or hold, ${f}`); process.exit(2) }
}
fs.mkdirSync(scratch, { recursive: true })
const RUN = path.join(scratch, `run-${Date.now()}`)
fs.mkdirSync(RUN)
const inRun = p => { if (!under(p, RUN)) throw new Error(`refused: ${p} is outside the run folder`); return p }

const ps = (args) => JSON.parse(execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1, ...args], { encoding: 'utf8' }).trim())
const sh = (args) => JSON.parse(execFileSync('sh', [SH, ...args], { encoding: 'utf8' }).trim())
const tree = dir => {
  const out = []
  const walk = d => { for (const n of fs.readdirSync(d).sort()) { const p = path.join(d, n); const st = fs.lstatSync(p); out.push(`${path.relative(RUN, p)}${st.isSymbolicLink() ? ' ->' : st.isDirectory() ? '/' : ''}`); if (st.isDirectory() && !st.isSymbolicLink()) walk(p) } }
  walk(dir)
  return out.join('\n')
}
function project(name) {
  const dir = inRun(path.join(RUN, 'bookmarks', 'projects', name))
  fs.mkdirSync(path.join(dir, 'lists', '_root'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'bundles'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ version: 1, id: 'k7mq2xab', name: 'demo' }) + '\n')
  fs.writeFileSync(path.join(dir, 'lists', '_root', 'lists.json'), '{"version":3,"lists":[]}\n')
  fs.writeFileSync(path.join(dir, 'bundles', 'index.json'), '{"version":1,"bundles":[]}\n')
  fs.writeFileSync(path.join(dir, '.hidden-note'), 'kept\n')
  return dir
}
const results = []
const check = (name, ok, detail) => { results.push([name, ok, detail]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` -- ${detail}` : ''}`) }

// A: the dry run prints the steps and acts on nothing.
{
  const src = project('dry__k7mq2xab__Extreme')
  const tgt = inRun(path.join(RUN, 'vault-a', 'private', 'claude', 'bookmarks'))
  const before = tree(RUN)
  const r = ps(['-Source', src, '-Target', tgt, '-Id', 'k7mq2xab', '-DryRun'])
  check('A dry run: ok, six steps, nothing changed', r.ok === true && r.dryRun === true && r.steps.length === 6 && tree(RUN) === before, `${r.steps.length} steps`)
}

// B: a local link is made, proven by the marker, and the contents moved; the source is renamed aside, never deleted.
const linked = project('demo__k7mq2xab__Extreme')
const vaultB = inRun(path.join(RUN, 'vault-b', 'private', 'claude', 'bookmarks'))
{
  const r = ps(['-Source', linked, '-Target', vaultB, '-Id', 'k7mq2xab'])
  const isLink = fs.lstatSync(linked).isSymbolicLink()
  const moved = fs.readdirSync(vaultB).sort()
  const aside = r.movedAside && fs.existsSync(r.movedAside) ? fs.readdirSync(r.movedAside) : null
  const markerLeft = moved.some(n => n.startsWith('.bm-link-check-'))
  const pjThrough = fs.existsSync(path.join(linked, 'project.json'))
  const real = low(fs.realpathSync(linked)) === low(vaultB)
  check('B link made: ok; the source is a link to the target', r.ok === true && isLink && real, `realPath ${r.realPath ? 'reported' : 'missing'}`)
  check('B the four entries moved, the marker removed', moved.join(',') === '.hidden-note,bundles,lists,project.json' && !markerLeft && r.moved === 4, moved.join(','))
  check('B the emptied source renamed aside, not deleted', Array.isArray(aside) && aside.length === 0 && /k7mq2xab\.__moved-/.test(r.movedAside ?? ''))
  check('B project.json reads through the link', pjThrough)
}

// C: a UNC target is refused before anything is made (the host does not exist, so nothing could be).
{
  const src = project('unc__k7mq2xab__Extreme')
  const before = tree(RUN)
  const r = ps(['-Source', src, '-Target', '\\\\bm-no-such-host\\share\\bookmarks', '-Id', 'k7mq2xab'])
  check('C UNC target refused, nothing changed', r.ok === false && /UNC/.test(r.refused ?? '') && tree(RUN) === before, r.refused)
}

// D: a mapped network drive is refused (run as a dry run, so nothing could be made there either way).
{
  const src = project('mapped__k7mq2xab__Extreme')
  const target = `Z:\\bm-no-such-folder-${Date.now()}`
  const r = ps(['-Source', src, '-Target', target, '-Id', 'k7mq2xab', '-DryRun'])
  check('D mapped drive refused', r.ok === false && /Network/.test(r.refused ?? '') && !fs.existsSync(target), r.refused)
}

// E: a target that holds anything is refused; the source is untouched.
{
  const src = project('full__k7mq2xab__Extreme')
  const tgt = inRun(path.join(RUN, 'vault-e', 'bookmarks'))
  fs.mkdirSync(tgt, { recursive: true })
  fs.writeFileSync(path.join(tgt, 'someone-elses.md'), 'x\n')
  const before = tree(RUN)
  const r = ps(['-Source', src, '-Target', tgt, '-Id', 'k7mq2xab'])
  check('E non-empty target refused, nothing changed', r.ok === false && /not empty/.test(r.refused ?? '') && tree(RUN) === before, r.refused)
}

// F: a source that is already a link is refused (B's, run again).
{
  const r = ps(['-Source', linked, '-Target', inRun(path.join(RUN, 'vault-f', 'bookmarks')), '-Id', 'k7mq2xab'])
  check('F already linked: refused', r.ok === false && /already a link/.test(r.refused ?? ''), r.refused)
}

// G: a folder with no project.json is refused.
{
  const src = inRun(path.join(RUN, 'bookmarks', 'projects', 'nopj__k7mq2xab__Extreme'))
  fs.mkdirSync(src, { recursive: true })
  const r = ps(['-Source', src, '-Target', inRun(path.join(RUN, 'vault-g', 'bookmarks')), '-Id', 'k7mq2xab'])
  check('G no project.json: refused', r.ok === false && /project.json/.test(r.refused ?? '') && !fs.existsSync(path.join(RUN, 'vault-g')), r.refused)
}

// H: dz safedel of the link (the person's unlink recipe) leaves the target and its files intact.
{
  let ran = true
  try { execFileSync('dz', ['safedel', '--yes', inRun(linked)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true }) } catch { ran = false }
  const kept = fs.existsSync(vaultB) ? fs.readdirSync(vaultB).sort().join(',') : ''
  check('H dz safedel of the link: the link gone, the target intact', ran && !fs.existsSync(linked) && kept === '.hidden-note,bundles,lists,project.json', kept)
}

// I: the POSIX script on this machine: its dry run, then a real run (Git Bash may make a copy, not a link: the marker must refuse it).
{
  const src = project('posix__k7mq2xab__Extreme').replace(/\\/g, '/')
  const tgt = inRun(path.join(RUN, 'vault-i', 'bookmarks')).replace(/\\/g, '/')
  const toSh = p => p.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`)
  const dry = sh([toSh(src), toSh(tgt), 'k7mq2xab', '--dry-run'])
  check('I .sh dry run: six steps, ok', dry.ok === true && dry.steps.length === 6, `${dry.steps.length} steps`)
  const real = sh([toSh(src), toSh(tgt), 'k7mq2xab'])
  const truth = real.ok ? `linked; source is a link: ${fs.lstatSync(src).isSymbolicLink()}` : `refused at step ${real.failedAt}: ${real.error}`
  const safe = real.ok ? fs.lstatSync(src).isSymbolicLink() : real.failedAt === 3 && fs.existsSync(path.join(src, 'project.json'))
  check('I .sh real run: a real link, or refused at the marker with the source intact', safe, truth)
}

const failed = results.filter(r => !r[1]).length
console.log(failed ? `${failed} FAILED` : 'all held')
process.exit(failed ? 1 : 0)
