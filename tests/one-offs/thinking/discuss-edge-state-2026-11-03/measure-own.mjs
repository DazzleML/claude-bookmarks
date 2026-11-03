// D6 measurement: what the 0.8.9 reviewed pass kept as an item's `own`, and how many bundles are
// shown in more than one list today. Read-only over the live lists files.
import fs from 'node:fs'
const home = (process.env.USERPROFILE ?? process.env.HOME).replace(/\\/g, '/')
const root = `${home}/claude/bookmarks/projects`
const short = l => `${l.kind}:${String(l.path ?? l.href ?? l.text ?? (l.repo ? `${l.repo}#${l.n}` : '') ?? '').slice(-48)}${l.about ? ` (${l.about.slice(0, 50)})` : ''}`
for (const d of fs.readdirSync(root)) {
  const base = `${root}/${d}/lists`
  if (!fs.existsSync(base)) continue
  for (const f of fs.readdirSync(base)) {
    const p = `${base}/${f}/lists.json`
    if (!fs.existsSync(p)) continue
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    const items = j.lists.flatMap(l => l.items.map(i => ({ list: l.name, ...i })))
    const bundled = items.filter(i => i.bundle), own = items.filter(i => i.own?.length)
    const byBundle = new Map()
    for (const i of bundled) (byBundle.get(i.bundle) ?? byBundle.set(i.bundle, new Set()).get(i.bundle)).add(i.list)
    const multi = [...byBundle.values()].filter(s => s.size > 1).length
    console.log(`${d}/${f}: lists=${j.lists.length} items=${items.length} bundled=${bundled.length} withOwn=${own.length} ownLinks=${own.reduce((n, i) => n + i.own.length, 0)} bundlesShownIn>1list=${multi}`)
    for (const i of own) console.log(`   [${i.list}] ${i.label.slice(0, 56)}\n      own: ${i.own.map(short).join('\n      own: ')}`)
  }
}
