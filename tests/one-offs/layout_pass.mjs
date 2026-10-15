// The layout pass (Q261012-11, the per-file mapping proposed 2026-10-14, 3a74c6d):
// plugin/hooks/core/ grouped by cluster. Run once from the repo root:
//   node tests/one-offs/layout_pass.mjs [--dry]
// 1. git mv each module into its group (settings, palette, store-prune stay in core/).
// 2. In each moved module, every relative import is resolved from its old folder and
//    rewritten from its new one.
// 3. Everywhere else (plugin/, tests/, docs/, CONTRIBUTING.md), every `core/<name>`
//    (an import specifier or a path in a comment) becomes `core/<group>/<name>`.
// tests/core/ stays flat: `node --test tests/core/*.test.ts` is the standing check.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const DRY = process.argv.includes('--dry')
const ROOT = process.cwd()
const CORE = join(ROOT, 'plugin', 'hooks', 'core')

const GROUPS = {
  prompts: ['prompt-rows', 'prompt-store', 'text-store', 'filter', 'list-model', 'view-position'],
  marks: ['marks', 'mark-state', 'highlight'],
  band: ['band-state', 'band-entry', 'keys', 'after-action', 'commands'],
  bookmarks: ['anchor', 'register-file', 'bookmark-tool', 'transcript-lines'],
  log: ['log-ring', 'debug', 'diagnostics'],
  kit: ['continuum', 'message-id', 'latest-burst', 'screen-model', 'pane-position'],
}
const groupOf = new Map()
for (const [g, names] of Object.entries(GROUPS)) for (const n of names) groupOf.set(n, g)

// Every module in core/ must be placed or deliberately left at the top.
const STAY = new Set(['settings', 'palette', 'store-prune'])
const present = readdirSync(CORE).filter(f => f.endsWith('.ts')).map(f => f.replace(/\.ts$/, ''))
const unplaced = present.filter(n => !groupOf.has(n) && !STAY.has(n))
if (unplaced.length) throw new Error(`unplaced modules: ${unplaced.join(', ')}`)
const missing = [...groupOf.keys()].filter(n => !present.includes(n))
if (missing.length) throw new Error(`mapped but absent: ${missing.join(', ')}`)

const oldPath = n => join(CORE, `${n}.ts`)
const newPath = n => (groupOf.has(n) ? join(CORE, groupOf.get(n), `${n}.ts`) : oldPath(n))
const moved = new Map([...groupOf.keys()].map(n => [oldPath(n), newPath(n)]))

const posix = p => p.split(sep).join('/')
const rel = (fromDir, to) => {
  const r = posix(relative(fromDir, to))
  return r.startsWith('.') ? r : `./${r}`
}

// 2. A moved module's relative imports, resolved from where it was.
function rewriteMoved(text, from, to) {
  return text.replace(/(from\s+|import\()(['"])(\.{1,2}\/[^'"]+)\2/g, (all, lead, q, spec) => {
    const target = resolve(dirname(from), spec)
    const withExt = existsSync(target) ? target : existsSync(`${target}.ts`) ? `${target}.ts` : existsSync(`${target}.tsx`) ? `${target}.tsx` : target
    const dest = moved.get(withExt) ?? withExt
    let out = rel(dirname(to), dest)
    // Keep the specifier's own style: with or without the extension.
    if (!/\.tsx?$/.test(spec)) out = out.replace(/\.tsx?$/, '')
    return `${lead}${q}${out}${q}`
  })
}

// 3. Everywhere else: `core/<name>` -> `core/<group>/<name>`, exact names only.
const names = [...groupOf.keys()].sort((a, b) => b.length - a.length)
const pathRe = new RegExp(`\\bcore/(${names.map(n => n.replace(/-/g, '\\-')).join('|')})(?![a-z-])`, 'g')
const rewriteRefs = text => text.replace(pathRe, (all, n) => `core/${groupOf.get(n)}/${n}`)

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    // types: the engine's; checklists: dated, each records its version as it was.
    if (e === 'node_modules' || e === '.git' || e === 'types' || e === 'checklists') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|md|mjs|json)$/.test(e)) out.push(p)
  }
  return out
}

const files = [
  ...walk(join(ROOT, 'plugin')),
  ...walk(join(ROOT, 'tests')),
  ...walk(join(ROOT, 'docs')),
  join(ROOT, 'CONTRIBUTING.md'),
].filter(f => existsSync(f) && f !== join(ROOT, 'tests', 'one-offs', 'layout_pass.mjs'))

let changed = 0
const edits = []
for (const f of files) {
  const before = readFileSync(f, 'utf8')
  let after = moved.has(f) ? rewriteMoved(before, f, moved.get(f)) : before
  after = rewriteRefs(after)
  if (after !== before) edits.push([f, after])
}
console.log(`${moved.size} modules move; ${edits.length} files change`)
if (DRY) {
  for (const [f] of edits) console.log('  ' + posix(relative(ROOT, f)))
  process.exit(0)
}
// Write the contents first (to the old paths), then move: git mv carries the edits.
for (const [f, after] of edits) {
  writeFileSync(f, after)
  changed++
}
for (const [from, to] of moved) {
  mkdirSync(dirname(to), { recursive: true })
  execFileSync('git', ['-C', ROOT, 'mv', posix(relative(ROOT, from)), posix(relative(ROOT, to))])
}
console.log(`wrote ${changed} files; moved ${moved.size}`)
