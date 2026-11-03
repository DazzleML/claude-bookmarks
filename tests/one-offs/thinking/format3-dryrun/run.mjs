#!/usr/bin/env node
// The format 3 step's dry run (0.8.x unit 2) on COPIES of the real lists files, held outside the
// repo (they hold private list content). Reads only the folder given; writes nothing anywhere;
// prints counts and checks, never a list's content.
//
// Run: node tests/one-offs/thinking/format3-dryrun/run.mjs <folder holding copies of ~/claude/bookmarks/lists/*.json>

import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { parseLists, serializeLists } from '../../../../plugin/hooks/core/lists/lists.ts'
import { fromFormat3, stepToFormat3, toFormat3 } from '../../../../plugin/hooks/core/lists/format3.ts'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: run.mjs <folder of copies>')
  process.exit(2)
}
const rows = []
let ok = true
for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
  const r = parseLists(fs.readFileSync(path.join(dir, name), 'utf8'))
  if (r.kind !== 'ok') {
    rows.push([name, `not read: ${r.kind}`])
    ok = false
    continue
  }
  const f = r.file
  const out = toFormat3(f)
  const inCount = (f.bundles ?? []).length
  const ids = new Set(out.index.bundles.map(b => b.id))
  const named = [...out.lists.lists, ...out.lists.removed].flatMap(l => l.items).flatMap(i => (i.bundle ? [i.bundle] : []))
  const roundTrip = isDeepStrictEqual(fromFormat3(out.lists, out.index), { ...f, version: 3 })
  const twice = stepToFormat3({ lists: out.lists, index: out.index })
  const noOp = isDeepStrictEqual(twice.lists, out.lists) && isDeepStrictEqual(twice.index, out.index)
  const newer = parseLists(serializeLists(out.lists)).kind === 'newer'
  const items = [...f.lists, ...f.removed].flatMap(l => l.items).length
  const itemsOut = [...out.lists.lists, ...out.lists.removed].flatMap(l => l.items).length
  const good = inCount === out.index.bundles.length && named.every(id => ids.has(id)) && out.dangling.length === 0 && roundTrip && noOp && newer && items === itemsOut
  ok &&= good
  rows.push([name, `bundles ${inCount} in, ${out.index.bundles.length} in the index; items ${items} in, ${itemsOut} out; bundle references ${named.length}, all in the set: ${named.every(id => ids.has(id))}; dangling ${out.dangling.length}; round trip ${roundTrip}; twice a no-op ${noOp}; a v2 reader says newer ${newer} -> ${good ? 'ok' : 'FAILED'}`])
}
for (const [n, s] of rows) console.log(`${n}: ${s}`)
console.log(ok ? 'all held' : 'SOMETHING FAILED')
process.exit(ok ? 0 : 1)
