// node --test tests/core/lineage.test.ts
// The session-lineage rule (tests/fixtures/session-lineage/README.md) run on its own cases, two ways: from
// the transcript's rows parsed, and from the one-pattern scan a large transcript is read with
// (simulated here with the same pattern the plugin's scan uses). Both must give the expected
// answer; Claude-Session-Backup runs the same cases from Python.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LINEAGE_SCAN_PATTERN, lineageOf, rowsOfJsonl, rowsOfScan } from '../../plugin/hooks/core/lineage/lineage.ts'

const CASES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'session-lineage', 'cases')
const names = readdirSync(CASES).filter(f => f.endsWith('.jsonl')).map(f => f.slice(0, -'.jsonl'.length)).sort()

/** What `grep -o -E <pattern> <file> | uniq` prints. */
function scanOf(text: string): string {
  const lines = [...text.matchAll(new RegExp(LINEAGE_SCAN_PATTERN, 'g'))].map(m => m[0])
  return lines.filter((l, i) => i === 0 || l !== lines[i - 1]).join('\n')
}

test('the spec has its cases', () => {
  assert.deepEqual(names, ['continuation-chain', 'fork', 'fork-named-both-ways', 'fork-of-a-continuation', 'no-lineage', 'noise', 'old-transcript-continued'])
})

for (const name of names) {
  const transcript = readFileSync(join(CASES, `${name}.jsonl`), 'utf8')
  const expected = JSON.parse(readFileSync(join(CASES, `${name}.expected.json`), 'utf8')) as { self: string }
  test(`${name}: from the rows`, () => {
    assert.deepEqual(lineageOf(rowsOfJsonl(transcript), expected.self), expected)
  })
  test(`${name}: from the scan`, () => {
    assert.deepEqual(lineageOf(rowsOfScan(scanOf(transcript)), expected.self), expected)
  })
}
