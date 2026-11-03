#!/usr/bin/env node
// Red-green audit of 0.8.x unit 6a (link-project.ps1). Each mutant is a scratch COPY of the
// script with one behaviour removed (never a delete added), run through the shell test
// (tests/one-offs/thinking/link-project-scratch/run.mjs) with LINK_PS1 pointing at the copy and
// its own scratch folder. The shell test confines every case to its run folder; its two
// outside-path cases are safe by construction (a UNC host that does not exist; the mapped drive
// under -DryRun). The live script is never written.
//
// Run: node tests/one-offs/thinking/redgreen-unit6a-link/run.mjs <scratch folder outside the repo>

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const scratch = path.resolve(process.argv[2] ?? '')
if (!process.argv[2] || !path.relative(REPO, scratch).startsWith('..')) {
  console.error('usage: run.mjs <scratch folder outside the repo>')
  process.exit(2)
}
const SCRIPT = fs.readFileSync(path.join(REPO, 'plugin/hooks/scripts/link-project.ps1'), 'utf8')
const SHELL_TEST = path.join(REPO, 'tests/one-offs/thinking/link-project-scratch/run.mjs')
const MUTANTS = [
  ['baseline', '', ''],
  ['a the UNC check removed', "if ($Target -match '^[\\\\/]{2}') { Refuse 'the target is a network path (UNC)' }", ''],
  ['b the drive-type check removed', "if ($drive.DriveType -ne 'Fixed' -and $drive.DriveType -ne 'Removable') {", 'if ($false) {'],
  ['c the non-empty check removed', "if (@(Get-ChildItem -LiteralPath $Target -Force).Count -gt 0) { Refuse 'the target is not empty' }", ''],
  ['d the marker check inverted', 'if (-not $seen) {', 'if ($seen) {'],
  ['e the rename aside skipped', 'if (-not (Rename-Retrying $Source (Split-Path -Leaf $aside))) {', 'if ($false) {'],
  ['f the already-linked check removed', 'if ($src.LinkType) {', 'if ($false) {'],
  ['g the project.json check removed', "if (-not (Test-Path -LiteralPath (Join-Path $Source 'project.json') -PathType Leaf)) { Refuse", "if ($false) { Refuse"],
  ['h -DryRun ignored', 'if ($DryRun) { Finish $true @{ moved = 0 } }', ''],
]

for (const [name, from, to] of MUTANTS) {
  const key = name.split(' ')[0]
  const dir = path.join(scratch, key)
  fs.mkdirSync(dir, { recursive: true })
  if (from && !SCRIPT.includes(from)) throw new Error(`mutant ${name}: anchor not found`)
  const copy = path.join(dir, 'link-project.ps1')
  fs.writeFileSync(copy, from ? SCRIPT.replace(from, to) : SCRIPT)
  const r = spawnSync(process.execPath, [SHELL_TEST, path.join(dir, 'tree')], { env: { ...process.env, LINK_PS1: copy }, encoding: 'utf8', timeout: 300_000 })
  const lines = `${r.stdout}`.split('\n')
  const failed = lines.filter(l => l.startsWith('FAIL')).map(l => l.slice(5).split(' -- ')[0])
  const crashed = r.status !== 0 && !failed.length ? `crashed: ${`${r.stderr}`.split('\n').find(l => /Error/.test(l)) ?? r.status}` : ''
  console.log(`${name}: ${failed.length ? `${failed.length} red -- ${failed.join('; ')}` : crashed || (key === 'baseline' ? 'all green' : 'SURVIVED')}`)
}
