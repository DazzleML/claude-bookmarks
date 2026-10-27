// B1's check (the links-in-files design, 2026-10-27): every real link the census found reads
// through ref.ts parseRef with the same identity parseAnchor gives it today, so the new parser
// regresses nothing. Reads links.txt, written by `probe.py --dump`; that file holds this
// machine's paths and session ids, so it is never committed (regenerate it instead).
// Run: node tests/one-offs/thinking/measure-link-durability/through_ref.ts
import { readFileSync } from 'node:fs'
import { parseAnchor } from '../../../../plugin/hooks/core/bookmarks/anchor.ts'
import { parseRef } from '../../../../plugin/hooks/core/bookmarks/ref.ts'

// Trimmed: Python on Windows writes links.txt with \r\n, and a stray \r on the last parameter
// made parseAnchor (which does not trim) refuse 12 links in the first run -- a method error.
const links = readFileSync(new URL('./links.txt', import.meta.url), 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
const KNOWN = '77dd45ab-3ee4-4853-aeb8-9ed031c24de9'
let same = 0
let anchorOnly = 0
let refOnly = 0
let neither = 0
const differ: string[] = []
let known = false
for (const href of links) {
  const a = parseAnchor(href)
  const r = parseRef(href)
  if (!a && !r) { neither++; continue }
  if (a && !r) { anchorOnly++; differ.push(`ref missed: ${href.slice(0, 120)}`); continue }
  if (!a && r) { refOnly++; differ.push(`ref only: ${href.slice(0, 120)}`); continue }
  const ka = JSON.stringify([a!.sessionId, a!.uuid, a!.file, a!.part, a!.words, a!.line, a!.bytes])
  const kr = JSON.stringify([r!.session, r!.uuid, r!.file, r!.part, r!.words, r!.line, r!.bytes])
  if (ka === kr) same++
  else differ.push(`differ: ${ka} vs ${kr}`)
  if (r!.uuid === KNOWN) known = true
}
console.log(`known answer (${KNOWN}) read: ${known}`)
console.log(`${links.length} links: ${same} same identity, ${anchorOnly} read only by parseAnchor, ${refOnly} only by parseRef, ${neither} by neither, ${differ.length - anchorOnly - refOnly} differ`)
console.log(`reconcile: ${same} + ${anchorOnly} + ${refOnly} + ${neither} + ${differ.length - anchorOnly - refOnly} = ${same + anchorOnly + refOnly + neither + differ.length - anchorOnly - refOnly}`)
for (const d of differ.slice(0, 10)) console.log('  ' + d)
process.exit(known && differ.length === 0 ? 0 : 1)
