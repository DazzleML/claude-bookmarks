// node --test tests/core/item-links.test.ts
// A list item's links (core/lists/item-links.ts; the links-in-files design, 2026-10-27, step B2):
// typed links read from either shape, a typed-in link classified, the v1 -> v2 item step.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hrefOf, linkFromText, linkKey, linksOf, placeLinkOf, primaryLink, sameLink, textOf, v1to2Item, type ItemLink } from '../../plugin/hooks/core/lists/item-links.ts'

const SID = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const UUID = 'f1c069db-67bc-42e3-b6d6-cf200b57d957'
const ROOT = 'C:/Users/x/claude'

test('a typed-in link is classified: a GitHub issue or pull request, a web page, a file URL, a path', () => {
  assert.deepEqual(linkFromText('https://github.com/DazzleML/claude-bookmarks/issues/45'), { kind: 'issue', repo: 'DazzleML/claude-bookmarks', n: 45 })
  assert.deepEqual(linkFromText('https://github.com/DazzleTools/git-repokit-common/pull/16#discussion'), { kind: 'issue', repo: 'DazzleTools/git-repokit-common', n: 16 })
  assert.deepEqual(linkFromText('https://example.com/a?b=1'), { kind: 'url', href: 'https://example.com/a?b=1' })
  assert.deepEqual(linkFromText('file:///C:/code/x%20y/notes.md'), { kind: 'file', path: 'C:/code/x y/notes.md' })
  assert.deepEqual(linkFromText('file:///home/me/notes.md'), { kind: 'file', path: '/home/me/notes.md' })
  assert.deepEqual(linkFromText('C:\\code\\notes.md'), { kind: 'file', path: 'C:/code/notes.md' })
  assert.equal(linkFromText('   '), undefined)
})

test('a bm: reference, either form, is a ref link and never a file path; a pasted bookmark link is its place', () => {
  // The bm: short-reference design, unit 6: resolved at add by the handler; kept as typed when it does not resolve.
  for (const text of ['bm:8f0f9b27.12~f1c069db', `bm:8f0f9b27/f1c069db~w:the%20release`, 'bm:list/todo#i3', 'BM:8f0f9b27.3']) {
    assert.deepEqual(linkFromText(text), { kind: 'ref', text }, text)
  }
  assert.deepEqual(linkFromText(' bm:8f0f9b27.12 '), { kind: 'ref', text: 'bm:8f0f9b27.12' }, 'trimmed')
  const anchor = `file:///C:/Users/x/claude/bookmarks/sessions/${SID}/f1c069db.p2.md?u=${UUID}&p=2&q=the%20release&v=1`
  assert.deepEqual(linkFromText(anchor), { kind: 'place', session: SID, uuid: UUID, part: 2, words: 'the release' })
  assert.deepEqual(linkFromText(`<${anchor}>`), { kind: 'place', session: SID, uuid: UUID, part: 2, words: 'the release' }, 'an autolink too')
  const ref: ItemLink = { kind: 'ref', text: 'bm:8f0f9b27.12~f1c069db' }
  assert.equal(textOf(ref), 'bm:8f0f9b27.12~f1c069db', 'a press copies it as typed')
  assert.equal(hrefOf(ref, ROOT), undefined, 'no URL until it resolves')
})

test('a v1 item\'s links: its place with its words, or its link; a v2 item\'s own list', () => {
  const place = { session: SID, uuid: UUID, part: 0 }
  assert.deepEqual(linksOf({ place, words: 'the release' }), [{ kind: 'place', session: SID, uuid: UUID, part: 0, words: 'the release' }])
  assert.deepEqual(linksOf({ link: 'https://github.com/DazzleML/claude-bookmarks/issues/40' }), [{ kind: 'issue', repo: 'DazzleML/claude-bookmarks', n: 40 }])
  assert.deepEqual(linksOf({}), [])
  const v2: ItemLink[] = [{ kind: 'url', href: 'https://a' }, { kind: 'place', session: SID, uuid: UUID }]
  assert.deepEqual(linksOf({ links: v2, link: 'ignored' }), v2, 'links wins over a stray v1 field')
  assert.deepEqual(primaryLink({ links: v2 }), v2[0])
  assert.deepEqual(placeLinkOf({ links: v2 }), v2[1])
  assert.deepEqual(linksOf({ links: [{ kind: 'from-the-future', x: 1 } as unknown as ItemLink, 3 as unknown as ItemLink] }), [{ kind: 'from-the-future', x: 1 }], 'an unknown kind is kept; a non-link dropped')
})

test('each kind as a pressable URL and as pasteable text', () => {
  assert.equal(hrefOf({ kind: 'place', session: SID, uuid: UUID, words: 'w' }, ROOT), `file:///C:/Users/x/claude/bookmarks/sessions/${SID}/f1c069db.md?u=${UUID}&q=w&v=1`)
  assert.equal(hrefOf({ kind: 'place', session: SID, uuid: UUID }, undefined), undefined, 'a place needs the data root')
  assert.equal(hrefOf({ kind: 'file', path: 'C:/x y/n.md' }, ROOT), 'file:///C:/x%20y/n.md')
  assert.equal(hrefOf({ kind: 'line', path: 'C:/t/OPEN-LOOPS.md', id: 'wl-a' }, ROOT), 'file:///C:/t/OPEN-LOOPS.md')
  assert.equal(hrefOf({ kind: 'issue', repo: 'o/r', n: 7 }, ROOT), 'https://github.com/o/r/issues/7')
  assert.equal(textOf({ kind: 'file', path: 'C:/x.md' }), 'C:/x.md')
  assert.equal(textOf({ kind: 'issue', repo: 'o/r', n: 7 }), 'https://github.com/o/r/issues/7')
  assert.equal(textOf({ kind: 'place', session: SID, uuid: UUID }), undefined)
})

test('the v1 -> v2 item step moves place, words and link into links and keeps every other key', () => {
  const v1 = { id: 'i3', label: 'The release', why: 'w', place: { session: SID, uuid: UUID, part: 0 }, words: 'release', by: 'claude', addedAt: 5, done: true, futureKey: { a: 1 } }
  assert.deepEqual(v1to2Item(v1), { id: 'i3', label: 'The release', why: 'w', by: 'claude', addedAt: 5, done: true, futureKey: { a: 1 }, links: [{ kind: 'place', session: SID, uuid: UUID, part: 0, words: 'release' }] })
  assert.deepEqual(v1to2Item({ id: 'i4', label: 'x', link: 'C:/a.md' }), { id: 'i4', label: 'x', links: [{ kind: 'file', path: 'C:/a.md' }] })
  assert.deepEqual(v1to2Item({ id: 'i5', label: 'a note' }), { id: 'i5', label: 'a note', links: [] })
  const v2 = { id: 'i6', label: 'y', links: [{ kind: 'url' as const, href: 'https://b' }] }
  assert.equal(v1to2Item(v2), v2, 'a v2 item is returned as it is')
})

// A link's identity (the bundles design, unit 1; U74): what it points at, never how it was stored.
test('a place is one link however it was stored: with or without drawn and words, its fields in any order, any case', () => {
  const a: ItemLink = { kind: 'place', session: SID, uuid: UUID }
  const b: ItemLink = { kind: 'place', uuid: UUID.toUpperCase(), session: SID, drawn: 'f1c069db-67bc-42e3-b6d6-000000000000', words: 'some words' }
  assert.ok(sameLink(a, b))
  assert.equal(linkKey(a), linkKey(b))
  assert.ok(!sameLink(a, { kind: 'place', session: SID, uuid: UUID, part: 1 }), 'another block of the message is another place')
  assert.ok(!sameLink(a, { kind: 'place', session: SID, uuid: UUID, file: 'agent-x.jsonl' }), "a sub-agent's row is another place")
  assert.ok(!sameLink(a, { kind: 'place', session: SID, uuid: '00000000-67bc-42e3-b6d6-cf200b57d957' }))
})

test('files, pages, issues, lines and references: one link by what they name', () => {
  assert.ok(sameLink({ kind: 'file', path: 'C:\\code\\x\\a.md' }, { kind: 'file', path: 'c:/code/x/a.md' }), 'a Windows path, either slash, any case')
  assert.ok(!sameLink({ kind: 'file', path: 'C:/code/x/a.md' }, { kind: 'file', path: 'C:/code/x/b.md' }))
  assert.ok(sameLink({ kind: 'issue', repo: 'DazzleML/claude-bookmarks', n: 45 }, { kind: 'issue', repo: 'dazzleml/claude-bookmarks', n: 45 }))
  assert.ok(!sameLink({ kind: 'issue', repo: 'DazzleML/claude-bookmarks', n: 45 }, { kind: 'issue', repo: 'DazzleML/claude-bookmarks', n: 46 }))
  assert.ok(sameLink({ kind: 'url', href: 'https://example.com/a' }, { kind: 'url', href: 'https://example.com/a' }))
  assert.ok(!sameLink({ kind: 'url', href: 'https://example.com/a' }, { kind: 'url', href: 'https://example.com/A' }), 'a page path is case-sensitive')
  assert.ok(sameLink({ kind: 'line', path: 'C:/v/n.md', id: 'e1' }, { kind: 'line', path: 'c:\\v\\n.md', id: 'e1' }))
  assert.ok(!sameLink({ kind: 'line', path: 'C:/v/n.md', id: 'e1' }, { kind: 'line', path: 'C:/v/n.md', id: 'e2' }))
  assert.ok(sameLink({ kind: 'ref', text: 'bm:8f0f9b27.12' }, { kind: 'ref', text: ' bm:8f0f9b27.12 ' }))
  assert.ok(!sameLink({ kind: 'file', path: 'C:/a' }, { kind: 'url', href: 'C:/a' }), 'different kinds are different links')
})
