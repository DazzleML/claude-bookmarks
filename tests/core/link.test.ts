// Linking a project's data folder into its vault (0.8.16; the registry design's 17:50 addendum): the
// script's argv (each argument its own element, so a path cannot become a command), its one JSON
// line read back, the target, and the placement after a link.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkArgv, linkedAt, linkedPlacement, linkTarget, parseLinkResult } from '../../plugin/hooks/core/projects/link.ts'
import type { Placement } from '../../plugin/hooks/core/projects/placement.ts'

const P: Placement = { version: 1, id: 'eqtp5tl4', root: 'C:/code/claude-bookmarks', members: [], exclude: [], linked: false, n: 1, updated_at: '2026-11-03T12:00:00Z' }

test('the target is the vault and the junction point; the vault defaults to the project root', () => {
  assert.deepEqual(linkTarget(P, 'private/claude/bookmarks'), { vault: 'C:/code/claude-bookmarks', junctionPoint: 'private/claude/bookmarks', target: 'C:/code/claude-bookmarks/private/claude/bookmarks' })
  assert.equal(linkTarget({ ...P, vault: 'D:\\vaults\\cb\\' }, '/notes/bm/').target, 'D:/vaults/cb/notes/bm')
  assert.equal(linkTarget(P, '  ').junctionPoint, 'private/claude/bookmarks')
})

test('the argv: PowerShell with named parameters for a Windows path, sh with positional ones elsewhere; a hostile path stays one argument', () => {
  const win = linkArgv({ scriptsDir: 'C:/p/hooks/scripts/', source: 'C:/Users/me/claude/bookmarks/projects/x__eqtp5tl4__me', target: 'C:/code/a b; rm -rf/private', id: 'eqtp5tl4', dryRun: true })
  assert.deepEqual(win.slice(0, 7), ['powershell', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'C:/p/hooks/scripts/link-project.ps1'])
  assert.equal(win[win.indexOf('-Target') + 1], 'C:/code/a b; rm -rf/private')
  assert.equal(win.at(-1), '-DryRun')
  const nix = linkArgv({ scriptsDir: '/p/hooks/scripts', source: '/home/me/claude/bookmarks/projects/x', target: '/home/me/code/x/private/claude/bookmarks', id: 'eqtp5tl4', dryRun: false })
  assert.deepEqual(nix, ['sh', '/p/hooks/scripts/link-project.sh', '/home/me/claude/bookmarks/projects/x', '/home/me/code/x/private/claude/bookmarks', 'eqtp5tl4'])
})

test('the answer is the script\'s last JSON line; no line, or one without ok, is no answer', () => {
  const out = 'noise\r\n{"ok":false,"dryRun":false,"steps":["check"],"refused":"the target is not empty","moved":0}\r\n'
  assert.deepEqual(parseLinkResult(out), { ok: false, dryRun: false, steps: ['check'], refused: 'the target is not empty', moved: 0 })
  // Two JSON lines: the last is the answer (red-green: a first-line reader passed the single-line case).
  assert.equal(parseLinkResult('{"ok":false,"dryRun":true,"steps":[],"moved":0}\n{"ok":true,"dryRun":false,"steps":[],"moved":2}')?.moved, 2)
  assert.equal(parseLinkResult(''), undefined)
  assert.equal(parseLinkResult('{"steps":[]}'), undefined)
  assert.equal(parseLinkResult('{not json'), undefined)
})

test('a link that succeeded marks the placement linked with its vault and junction point; its real path must be the target', () => {
  const t = linkTarget(P, 'private/claude/bookmarks')
  const after = linkedPlacement(P, t, '2026-11-03T19:00:00Z')
  assert.deepEqual([after.linked, after.vault, after.junction_point, after.updated_at], [true, 'C:/code/claude-bookmarks', 'private/claude/bookmarks', '2026-11-03T19:00:00Z'])
  const ok = parseLinkResult('{"ok":true,"dryRun":false,"steps":[],"realPath":"c:\\\\code\\\\claude-bookmarks\\\\private\\\\claude\\\\bookmarks","moved":3}')!
  assert.equal(linkedAt(ok, t.target), true)
  assert.equal(linkedAt({ ...ok, realPath: 'C:/elsewhere' }, t.target), false)
})
