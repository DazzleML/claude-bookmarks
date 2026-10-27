// The lists v1 -> v2 step, dry-run on a COPY of the real lists folder before LISTS_VERSION moves
// (the links-in-files design, 2026-10-27, step B2; the house rule: register the step, dry-run it on
// a copy, then move the version). Reads ~/claude/bookmarks/lists/*.json, never writes there; the
// migrated files go to the scratch folder given as the first argument.
//
// Checks, per file: the same lists and items in the same order; every item's links after the step
// equal its links read through linksOf before it (so the pane draws the same thing); every other key
// of every item, list and the file kept; `place`, `link`, `words` gone from every item.
// Run: node tests/one-offs/thinking/dry-run-lists-v2/run.ts <scratch dir>
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { LISTS_MIGRATIONS } from '../../../../plugin/hooks/core/lists/lists.ts'
import { linksOf } from '../../../../plugin/hooks/core/lists/item-links.ts'

const real = join(process.env.USERPROFILE ?? homedir(), 'claude', 'bookmarks', 'lists')
const out = process.argv[2]
if (!out) throw new Error('give a scratch folder')
mkdirSync(out, { recursive: true })

type Obj = Record<string, unknown>
const problems: string[] = []
let files = 0
let lists = 0
let items = 0
const kinds = new Map<string, number>()
for (const name of readdirSync(real).filter(n => n.endsWith('.json'))) {
  copyFileSync(join(real, name), join(out, name))
  const before = JSON.parse(readFileSync(join(out, name), 'utf8')) as Obj & { version: number; lists: Obj[]; removed?: Obj[] }
  if (before.version !== 1) { problems.push(`${name}: version ${before.version}, not 1`); continue }
  const after = LISTS_MIGRATIONS[0]!(structuredClone(before)) as typeof before
  files++
  writeFileSync(join(out, name.replace(/\.json$/, '.v2.json')), JSON.stringify(after, null, 2))
  if (after.version !== 2) problems.push(`${name}: version after the step is ${after.version}`)
  for (const k of Object.keys(before)) if (!(k in after)) problems.push(`${name}: file key ${k} lost`)
  for (const group of ['lists', 'removed'] as const) {
    const b = (before[group] ?? []) as Obj[]
    const a = (after[group] ?? []) as Obj[]
    if (b.length !== a.length) problems.push(`${name} ${group}: ${b.length} lists before, ${a.length} after`)
    b.forEach((bl, li) => {
      const al = a[li]!
      lists++
      for (const k of Object.keys(bl)) if (!(k in al)) problems.push(`${name} ${group}[${li}]: list key ${k} lost`)
      const bi = bl.items as Obj[]
      const ai = al.items as Obj[]
      if (bi.length !== ai.length) problems.push(`${name} ${bl.id}: ${bi.length} items before, ${ai.length} after`)
      bi.forEach((item, ii) => {
        items++
        const moved = ai[ii]!
        const want = JSON.stringify(linksOf(item as never))
        const got = JSON.stringify(moved.links)
        if (want !== got) problems.push(`${name} ${bl.id}/${item.id}: links ${got} != ${want}`)
        for (const k of Object.keys(item)) if (!['place', 'link', 'words'].includes(k) && JSON.stringify(item[k]) !== JSON.stringify(moved[k])) problems.push(`${name} ${bl.id}/${item.id}: key ${k} changed`)
        for (const k of ['place', 'link', 'words']) if (k in moved) problems.push(`${name} ${bl.id}/${item.id}: ${k} still there`)
        for (const l of (moved.links as { kind: string }[]) ?? []) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + 1)
      })
    })
  }
}
console.log(`${files} file(s), ${lists} list(s), ${items} item(s) stepped; link kinds after: ${JSON.stringify(Object.fromEntries(kinds))}`)
console.log(problems.length ? `PROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}` : 'no problems: every item kept, every key kept, links equal to what linksOf read before')
process.exit(problems.length ? 1 : 0)
