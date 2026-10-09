import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anchorHref, parseAnchor, markdownLinks, markLinks, parsePosition, anchorMarkdown, type AnchorRecord } from '../../../../hooks/core/anchor.ts'

const SID = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const UUID = '230c29e3-f948-454d-87f6-048bc4eefc2e'
const rec = (o: Partial<AnchorRecord> = {}): AnchorRecord => ({ sessionId: SID, uuid: UUID, head: 'h', label: 'L', createdAt: 1, by: 'claude', source: 'tool', ...o })

test('upper-case uuid: parses, lowercases, filename check case-insensitive', () => {
  const href = anchorHref(rec({ uuid: UUID.toUpperCase() }), 'C:/data')
  const p = parseAnchor(href)
  assert.ok(p)
  assert.equal(p!.uuid, UUID)
  assert.equal(p!.sessionId, SID)
})

test('data root with spaces round-trips through the href', () => {
  const href = anchorHref(rec({ line: 5, bytes: [10, 20], words: 'a b' }), 'C:\\My Data\\x y')
  assert.ok(href.includes('My%20Data/x%20y'))
  const p = parseAnchor(href)!
  assert.equal(p.sessionId, SID)
  assert.deepEqual(p.bytes, [10, 20])
  assert.equal(p.words, 'a b')
  assert.equal(markdownLinks(`[x](${href})`)[0]!.kind, 'anchor')
})

for (const words of ['a&b', '50% off', 'c++ and 1+1', 'naïve café 日本語', 'rocket 🚀 ship', 'a=b&c=d', 'x#y', 'q?z', '%26 literal', '100%']) {
  test(`q= words round trip: ${JSON.stringify(words)}`, () => {
    const p = parseAnchor(anchorHref(rec({ words }), 'C:/d'))!
    assert.equal(p.words, words)
  })
}

test('words with leading/trailing space are trimmed on parse (lossy)', () => {
  const p = parseAnchor(anchorHref(rec({ words: ' hi ' }), 'C:/d'))!
  assert.equal(p.words, 'hi')
})

test('DEFECT? data root containing parentheses ("Program Files (x86)") survives markdownLinks', () => {
  const md = anchorMarkdown(rec({ words: 'w' }), 'C:/Program Files (x86)/data')
  const links = markdownLinks(md)
  assert.equal(links.length, 1)
  assert.equal(links[0]!.kind, 'anchor', `href cut at ")": ${links[0]?.href}`)
})

test('DEFECT? data root containing # or ? survives parseAnchor', () => {
  for (const root of ['C:/a#b/data', 'C:/a?b/data']) {
    const p = parseAnchor(anchorHref(rec(), root))
    assert.ok(p, `root ${root} -> ${anchorHref(rec(), root)}`)
    assert.equal(p!.sessionId, SID)
  }
})

test('markdownLinks: nested brackets', () => {
  const href = anchorHref(rec(), 'C:/d')
  assert.equal(markdownLinks(`[a [b] c](${href})`).length, 0) // outer is not matched (documents behaviour)
  const inner = markdownLinks(`[a [b](${href})]`)
  assert.equal(inner.length, 1)
  assert.equal(inner[0]!.label, 'a [b') // the regex starts at the OUTER [ and takes [^\]]* : label includes the inner '['
})

test('markdownLinks: link inside inline code skipped, one after it kept', () => {
  const href = anchorHref(rec(), 'C:/d')
  const l = markdownLinks(`\`[x](${href})\` and [y](${href})`)
  assert.equal(l.length, 1)
  assert.equal(l[0]!.label, 'y')
})

test('markdownLinks: unclosed fence swallows the rest (documented behaviour)', () => {
  const href = anchorHref(rec(), 'C:/d')
  const text = `[a](${href})\n\`\`\`\n[b](${href})\n[c](${href})`
  assert.deepEqual(markdownLinks(text).map(l => l.label), ['a'])
})

test('markdownLinks: ~~~ fence closed by ``` (mismatch) toggles; CommonMark would not', () => {
  const href = anchorHref(rec(), 'C:/d')
  const text = `~~~\n[a](${href})\n\`\`\`\n[b](${href})`
  // CommonMark: ``` does not close ~~~, so b would still be inside code. This impl closes it, so b is found.
  assert.deepEqual(markdownLinks(text).map(l => l.label), ['b'])
})

test('markLinks: start/end offsets after multi-line text are exact', () => {
  const href = anchorHref(rec(), 'C:/d')
  const t = `line1\n\n[a](${href}) tail`
  const l = markdownLinks(t)[0]!
  assert.equal(t.slice(l.start, l.end), `[a](${href})`)
  assert.ok(markLinks(t, 'text').includes('[[bm] a]('))
})

test('parsePosition edge cases', () => {
  assert.deepEqual(parsePosition('C:\\x\\y.ts:10-5'), { path: 'C:\\x\\y.ts', line: 10, endLine: 5 }) // reversed range accepted as-is
  assert.deepEqual(parsePosition('a.ts:0'), { path: 'a.ts', line: 0 }) // line 0 accepted
  assert.deepEqual(parsePosition('C:801'), { path: 'C:801' })
  assert.deepEqual(parsePosition('C:\\x'), { path: 'C:\\x' })
  assert.deepEqual(parsePosition('a.ts:3:7'), { path: 'a.ts', line: 3, column: 7 })
  assert.equal(parsePosition('   '), undefined)
})
