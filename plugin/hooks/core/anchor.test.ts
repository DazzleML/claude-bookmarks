// node --test hooks/core/anchor.test.ts   (Node 22 runs .ts directly; breakpoints work in VS Code)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  anchorHref,
  anchorLinks,
  anchorMarkdown,
  anchorPath,
  fileUrl,
  markLinks,
  markdownLinks,
  parseAnchor,
  parsePosition,
  utf8ByteLength,
  type AnchorRecord,
} from './anchor.ts'

const ROOT = 'C:\\Users\\Extreme\\claude'
const SESSION = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const UUID = '12d637fb-6d1d-4c3f-bbb6-11c107d8af4e'

const record: AnchorRecord = {
  sessionId: SESSION,
  uuid: UUID,
  line: 5768,
  bytes: [9763906, 9765751],
  words: 'jump back in time to specific parts in the conversation',
  head: 'One thing I\'d really like us to design',
  label: 'the trigger message',
  createdAt: 1,
  by: 'claude',
  source: 'tool',
}

test('the path is under the data root, forward slashes, uuid8 filename', () => {
  assert.equal(anchorPath(ROOT, SESSION, UUID), `C:/Users/Extreme/claude/bookmarks/sessions/${SESSION}/12d637fb.md`)
  assert.equal(anchorPath('/home/d/claude/', SESSION, UUID), `/home/d/claude/bookmarks/sessions/${SESSION}/12d637fb.md`)
})

test('file URLs: drive letter, posix, spaces', () => {
  assert.equal(fileUrl('C:/a b/c.md'), 'file:///C:/a%20b/c.md')
  assert.equal(fileUrl('/home/d/x.md'), 'file:///home/d/x.md')
})

test('a data root with ( ) ? or # still gives a whole link that parses (tester sweep, 2026-10-09)', () => {
  // `)` would end the markdown link early; `?` and `#` would split the path from the query.
  const parens = anchorMarkdown(record, 'C:/Program Files (x86)/data')
  const links = markdownLinks(parens)
  assert.equal(links.length, 1)
  assert.equal(links[0]!.kind, 'anchor')
  assert.equal(links[0]!.anchor?.uuid, UUID)
  assert.ok(parens.includes('Program%20Files%20%28x86%29/data'))
  for (const root of ['C:/a?b/data', 'C:/a#b/data']) {
    const p = parseAnchor(anchorHref(record, root))
    assert.ok(p, root)
    assert.equal(p.sessionId, SESSION, root)
    assert.equal(p.line, 5768, root)
    assert.equal(p.words, record.words, root)
  }
})

test('the href carries the position in a query, never a fragment, and round-trips', () => {
  const href = anchorHref(record, ROOT)
  assert.equal(
    href,
    `file:///C:/Users/Extreme/claude/bookmarks/sessions/${SESSION}/12d637fb.md` +
      `?u=${UUID}&l=5768&b=9763906-9765751&q=jump%20back%20in%20time%20to%20specific%20parts%20in%20the%20conversation&v=1`,
  )
  assert.ok(!href.includes('#'))
  const p = parseAnchor(href)
  assert.ok(p)
  assert.equal(p.sessionId, SESSION)
  assert.equal(p.uuid, UUID)
  assert.equal(p.uuid8, '12d637fb')
  assert.equal(p.line, 5768)
  assert.deepEqual(p.bytes, [9763906, 9765751])
  assert.equal(p.words, record.words)
  assert.equal(p.version, 1)
  assert.equal(p.legacyFragment, false)
})

test('a moved data root still parses to the same identity', () => {
  const moved = anchorHref(record, '/mnt/backup/claude')
  const p = parseAnchor(moved)
  assert.equal(p?.sessionId, SESSION)
  assert.equal(p?.uuid, UUID)
})

test("the morning's fragment form still parses, flagged legacy", () => {
  const p = parseAnchor(`file:///C:/x/bookmarks/sessions/${SESSION}/12d637fb.md#u=${UUID}&l=5768&b=1-2&v=1`)
  assert.equal(p?.uuid, UUID)
  assert.equal(p?.line, 5768)
  assert.equal(p?.legacyFragment, true)
})

test('a uuid prefix is accepted; a filename that disagrees with u is refused', () => {
  assert.equal(parseAnchor(`file:///x/bookmarks/sessions/${SESSION}/12d637fb.md?u=12d637fb`)?.uuid, '12d637fb')
  assert.equal(parseAnchor(`file:///x/bookmarks/sessions/${SESSION}/deadbeef.md?u=${UUID}`), undefined)
})

test('things that are not anchors', () => {
  assert.equal(parseAnchor('https://example.com/?u=12d637fb'), undefined)
  assert.equal(parseAnchor('file:///C:/notes/a.md'), undefined)
  assert.equal(parseAnchor('file:///C:/notes/a.md?v=1'), undefined)
  assert.equal(parseAnchor('file:///C:/notes/a.md?u=not-a-uuid'), undefined)
  assert.equal(parseAnchor(''), undefined)
})

test('links are found by kind, outside code', () => {
  const href = anchorHref(record, ROOT)
  const text = [
    `See [the trigger](${href}) and [a note](file:///C:/n/x.md) and [the repo](https://github.com/x/y).`,
    '```',
    `not this: [fenced](${href})`,
    '```',
    `inline \`[code](${href})\` is skipped, but [this one](${href}) counts.`,
  ].join('\n')
  const links = markdownLinks(text)
  assert.deepEqual(links.map(l => l.kind), ['anchor', 'file', 'web', 'anchor'])
  assert.equal(anchorLinks(text).length, 2)
  assert.equal(links[0]!.anchor?.uuid, UUID)
  assert.equal(text.slice(links[1]!.start, links[1]!.end), '[a note](file:///C:/n/x.md)')
})

test('markers go on the drawn label only; hrefs are untouched; web links unmarked', () => {
  const href = anchorHref(record, ROOT)
  const text = `[the trigger](${href}) [a note](file:///C:/n/x.md) [repo](https://g.com)`
  const marked = markLinks(text, 'glyph')
  assert.equal(marked, `[⚓ the trigger](${href}) [▤ a note](file:///C:/n/x.md) [repo](https://g.com)`)
  assert.equal(markLinks(text, 'text'), `[[bm] the trigger](${href}) [[file] a note](file:///C:/n/x.md) [repo](https://g.com)`)
  assert.equal(markLinks(text, 'off'), text)
  assert.equal(markLinks(marked, 'glyph'), marked, 'idempotent')
})

test('anchorMarkdown writes a link the parser reads back', () => {
  const md = anchorMarkdown(record, ROOT)
  const [link] = anchorLinks(md)
  assert.equal(link?.label, 'the trigger message')
  assert.equal(link?.anchor?.uuid, UUID)
})

test('positions: vim and VS Code spellings, drive letters are not lines', () => {
  assert.deepEqual(parsePosition('hooks/register.tsx:801-822'), { path: 'hooks/register.tsx', line: 801, endLine: 822 })
  assert.deepEqual(parsePosition('C:\\code\\a.ts:801'), { path: 'C:\\code\\a.ts', line: 801 })
  assert.deepEqual(parsePosition('a.ts:801:5'), { path: 'a.ts', line: 801, column: 5 })
  assert.deepEqual(parsePosition('C:\\code\\a.ts'), { path: 'C:\\code\\a.ts' })
  assert.deepEqual(parsePosition('C:801'), { path: 'C:801' })
  assert.equal(parsePosition('  '), undefined)
})

test('utf8ByteLength agrees with the JSON line that was measured by wc -c', () => {
  assert.equal(utf8ByteLength('abc'), 3)
  assert.equal(utf8ByteLength('é'), 2)
  assert.equal(utf8ByteLength('⚓'), 3)
  assert.equal(utf8ByteLength('😀'), 4)
  assert.equal(utf8ByteLength('a⚓😀'), 8)
})
