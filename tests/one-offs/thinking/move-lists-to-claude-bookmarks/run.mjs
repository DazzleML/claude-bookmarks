#!/usr/bin/env node
// Moves the two claude-bookmarks lists ("What's left", "Lists slice: proof") and the bundles they
// show from ~/claude/bookmarks/lists/dazzle-claude-plugins.json into a new claude-bookmarks.json,
// recorded for C:/code/claude-projects/claude-bookmarks (djdarcy, 2026-11-02 21:4x: "Move them",
// after the session moved to that folder). Done with the plugin's own lists functions. In the
// dazzle file the lists become removed lists (its `removed` section), never deleted. Refuses to
// write over an existing claude-bookmarks.json; keeps a .bak of the dazzle file as the plugin does.
// Prints counts only. A dry run unless --apply; the backup folder must be named and exist.
//
// Run: node tests/one-offs/thinking/move-lists-to-claude-bookmarks/run.mjs <backup folder> [--apply]

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyListOp, emptyLists, parseLists, serializeLists } from '../../../../plugin/hooks/core/lists/lists.ts'

const [backup, flag] = process.argv.slice(2)
if (!backup || !fs.existsSync(path.join(backup, 'dazzle-claude-plugins.json'))) {
  console.error('usage: run.mjs <backup folder holding dazzle-claude-plugins.json> [--apply]')
  process.exit(2)
}
const apply = flag === '--apply'
const DIR = path.join(os.homedir(), 'claude', 'bookmarks', 'lists')
const FROM = path.join(DIR, 'dazzle-claude-plugins.json')
const TO = path.join(DIR, 'claude-bookmarks.json')
const NAMES = ["What's left", 'Lists slice: proof']
const now = Date.now()

if (fs.existsSync(TO)) { console.error(`refused: ${TO} exists`); process.exit(1) }
const r = parseLists(fs.readFileSync(FROM, 'utf8'))
if (r.kind !== 'ok') { console.error(`refused: the dazzle file reads ${r.kind}`); process.exit(1) }
const from = r.file
const moving = from.lists.filter(l => NAMES.includes(l.name))
if (moving.length !== NAMES.length) { console.error(`refused: found ${moving.length} of ${NAMES.length} lists`); process.exit(1) }
const shown = new Set(moving.flatMap(l => l.items).flatMap(i => (i.bundle ? [i.bundle] : [])))
const bundles = (from.bundles ?? []).filter(b => shown.has(b.id))
const writer = `${from.writer} (moved by hand, 0.8.6)`

let to = emptyLists('claude-bookmarks', 'C:/code/claude-projects/claude-bookmarks', writer, now)
to = { ...to, lists: moving, ...(bundles.length ? { bundles } : {}) }
let left = from
for (const l of moving) {
  const d = applyListOp(left, { op: 'delete', list: l.id }, now)
  if (!d.ok) { console.error(`refused: ${d.error}`); process.exit(1) }
  left = d.file
}
const stillShown = new Set(left.lists.flatMap(l => l.items).flatMap(i => (i.bundle ? [i.bundle] : [])))
console.log(`moving ${moving.map(l => `"${l.name}" (${l.items.length} items)`).join(', ')}; bundles ${bundles.length}`)
console.log(`dazzle file after: ${left.lists.length} lists, ${left.removed.length} removed, ${(left.bundles ?? []).length} bundles kept (${[...stillShown].length} still shown)`)
console.log(`round trip of the new file: ${parseLists(serializeLists(to)).kind}`)
if (!apply) { console.log('dry run: nothing written'); process.exit(0) }
fs.writeFileSync(`${FROM}.bak`, fs.readFileSync(FROM))
fs.writeFileSync(TO, serializeLists(to))
fs.writeFileSync(FROM, serializeLists({ ...left, writer }))
console.log(`written: ${path.basename(TO)}; ${path.basename(FROM)} (its .bak kept)`)
