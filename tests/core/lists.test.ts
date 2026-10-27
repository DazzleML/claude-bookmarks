// node --test tests/core/lists.test.ts
// Lists (#45, the first slice): the per-project file, its operations and its Markdown page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  applyListOp, emptyLists, findItem, findList, listsBaseName, listsPage, parseLists, projectOf, serializeLists, templateParts,
  LISTS_PAGE_MARK, LISTS_PAGE_TEMPLATE, LISTS_VERSION, type ListsFile, type OpResult,
} from '../../plugin/hooks/core/lists/lists.ts'
import { parseListsInput } from '../../plugin/hooks/core/lists/lists-tool.ts'

const T = 1_000
const base = () => emptyLists('claude-bookmarks', 'C:/code/claude-bookmarks', 'bookmarks 0.7.6', T)
const ok = (r: OpResult): ListsFile => {
  assert.ok(r.ok, r.ok ? '' : r.error)
  return r.file
}
function withWhatsLeft(): ListsFile {
  let f = ok(applyListOp(base(), { op: 'create', name: "What's left", owner: 'user' }, T))
  for (const label of ['commit 0.7.5', 'the landing fix', 'the release']) f = ok(applyListOp(f, { op: 'add', list: 'what-s-left', item: { label, by: 'claude' } }, T))
  return f
}
const labels = (f: ListsFile, id = 'what-s-left') => f.lists.find(l => l.id === id)!.items.map(i => i.label)

test('the project is the working folder, and a name collision gets a hash', () => {
  assert.equal(projectOf('C:\\code\\claude-bookmarks\\'), 'claude-bookmarks')
  const hash = () => 'abcdef0123'
  assert.equal(listsBaseName('C:/code/claude-bookmarks', undefined, hash), 'claude-bookmarks')
  assert.equal(listsBaseName('C:/code/claude-bookmarks', 'c:\\code\\claude-bookmarks', hash), 'claude-bookmarks')
  assert.equal(listsBaseName('D:/other/claude-bookmarks', 'C:/code/claude-bookmarks', hash), 'claude-bookmarks--abcdef01')
})

test('create, add in order, and a list found by id, name or number', () => {
  const f = withWhatsLeft()
  assert.deepEqual(labels(f), ['commit 0.7.5', 'the landing fix', 'the release'])
  assert.equal(findList(f, "WHAT'S LEFT")?.id, 'what-s-left')
  assert.equal(findList(f, '1', 'user')?.id, 'what-s-left')
  assert.equal(findList(f, '1', 'claude'), undefined)
  assert.deepEqual(f.lists[0]!.items.map(i => i.id), ['i1', 'i2', 'i3'])
})

test('two lists of one name on one side are refused; the other side may have one', () => {
  const f = withWhatsLeft()
  assert.equal(applyListOp(f, { op: 'create', name: "what's left", owner: 'user' }, T).ok, false)
  const g = ok(applyListOp(f, { op: 'create', name: "What's left", owner: 'claude' }, T))
  assert.equal(g.lists[1]!.id, 'what-s-left-2')
})

test('move: to a position, clamped, and the others keep their order', () => {
  const f = withWhatsLeft()
  assert.deepEqual(labels(ok(applyListOp(f, { op: 'move', list: 'what-s-left', item: '3', to: 1 }, T))), ['the release', 'commit 0.7.5', 'the landing fix'])
  assert.deepEqual(labels(ok(applyListOp(f, { op: 'move', list: 'what-s-left', item: 'i1', to: 99 }, T))), ['the landing fix', 'the release', 'commit 0.7.5'])
  assert.deepEqual(labels(ok(applyListOp(f, { op: 'move', list: 'what-s-left', item: '2', to: 0 }, T))), ['the landing fix', 'commit 0.7.5', 'the release'])
})

test('add at a position; remove; an id is never reused', () => {
  let f = withWhatsLeft()
  f = ok(applyListOp(f, { op: 'add', list: 'what-s-left', item: { label: 'first', by: 'user' }, at: 1 }, T))
  assert.deepEqual(labels(f), ['first', 'commit 0.7.5', 'the landing fix', 'the release'])
  f = ok(applyListOp(f, { op: 'remove', list: 'what-s-left', item: 'i4' }, T))
  f = ok(applyListOp(f, { op: 'add', list: 'what-s-left', item: { label: 'again', by: 'user' } }, T))
  assert.equal(findItem(f.lists[0]!, '4')!.id, 'i5')
})

test('done toggles, and an explicit value sets it', () => {
  let f = withWhatsLeft()
  f = ok(applyListOp(f, { op: 'done', list: 'what-s-left', item: '1' }, T))
  assert.equal(f.lists[0]!.items[0]!.done, true)
  f = ok(applyListOp(f, { op: 'done', list: 'what-s-left', item: '1' }, T))
  assert.equal('done' in f.lists[0]!.items[0]!, false)
  f = ok(applyListOp(f, { op: 'done', list: 'what-s-left', item: '1', done: false }, T))
  assert.equal('done' in f.lists[0]!.items[0]!, false)
})

test('delete keeps the list among the removed; share copies it to the other side', () => {
  const f = withWhatsLeft()
  const d = ok(applyListOp(f, { op: 'delete', list: 'what-s-left' }, T + 1))
  assert.equal(d.lists.length, 0)
  assert.equal(d.removed[0]!.removedAt, T + 1)
  // A new list of the deleted one's name does not take its id.
  assert.equal(ok(applyListOp(d, { op: 'create', name: "What's left", owner: 'user' }, T)).lists[0]!.id, 'what-s-left-2')
  const s = applyListOp(f, { op: 'share', list: 'what-s-left' }, T)
  assert.ok(s.ok)
  assert.equal(s.list!.owner, 'claude')
  assert.deepEqual(s.list!.sharedFrom, { owner: 'user', id: 'what-s-left' })
  assert.deepEqual(labels(s.file, s.list!.id), labels(f))
})

test('the operations never change the file passed in', () => {
  const f = withWhatsLeft()
  const before = serializeLists(f)
  applyListOp(f, { op: 'move', list: 'what-s-left', item: '1', to: 3 }, T)
  applyListOp(f, { op: 'done', list: 'what-s-left', item: '1' }, T)
  applyListOp(f, { op: 'remove', list: 'what-s-left', item: '1' }, T)
  assert.equal(serializeLists(f), before)
})

test('the file reads back as written; a newer version is not read', () => {
  const f = withWhatsLeft()
  const r = parseLists(serializeLists(f))
  assert.equal(r.kind, 'ok')
  assert.deepEqual(r.kind === 'ok' && r.file, f)
  assert.deepEqual(parseLists(JSON.stringify({ ...f, version: LISTS_VERSION + 1 })), { kind: 'newer', version: LISTS_VERSION + 1 })
  assert.equal(parseLists('{').kind, 'bad')
})

// Lists v2 (0.7.10; the links-in-files design, 2026-10-27, step B2): a v1 file is read through the
// registered step into typed links, and every key this version does not know survives a rewrite.
const SID = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const V1 = {
  version: 1, writer: 'bookmarks 0.7.9', project: 'p', cwd: 'C:/p', updatedAt: 5, futureFileKey: 'kept',
  lists: [{
    id: 'what-s-left', name: "What's left", owner: 'user', createdAt: 1, updatedAt: 2, next: 4, futureListKey: [1, 2],
    items: [
      { id: 'i1', label: 'The release', place: { session: SID, uuid: 'f1c069db-67bc-42e3-b6d6-cf200b57d957', part: 0 }, words: 'release', by: 'claude', addedAt: 3, done: true },
      { id: 'i2', label: 'The views', link: 'https://github.com/DazzleML/claude-bookmarks/issues/40', by: 'claude', addedAt: 3, futureItemKey: 'kept' },
      { id: 'i3', label: 'A note', by: 'user', addedAt: 3 },
    ],
  }],
  removed: [],
}

test('a version 1 file is read as version 2: place, words and link become typed links', () => {
  const r = parseLists(JSON.stringify(V1))
  assert.equal(r.kind, 'ok')
  const f = (r as { file: ListsFile }).file
  assert.equal(f.version, LISTS_VERSION)
  const [a, b, c] = f.lists[0]!.items
  assert.deepEqual(a, { id: 'i1', label: 'The release', by: 'claude', addedAt: 3, done: true, links: [{ kind: 'place', session: SID, uuid: 'f1c069db-67bc-42e3-b6d6-cf200b57d957', part: 0, words: 'release' }] })
  assert.deepEqual(b!.links, [{ kind: 'issue', repo: 'DazzleML/claude-bookmarks', n: 40 }])
  assert.deepEqual(c!.links, [])
})

test('keys this version does not know survive two rewrites, at the file, list and item levels (add-only)', () => {
  let text = JSON.stringify(V1)
  for (let n = 0; n < 2; n++) {
    const r = parseLists(text)
    assert.equal(r.kind, 'ok')
    const f = (r as { file: ListsFile }).file
    text = serializeLists(ok(applyListOp(f, { op: 'done', list: 'what-s-left', item: 'i3' }, T + n)))
  }
  const back = JSON.parse(text)
  assert.equal(back.futureFileKey, 'kept')
  assert.deepEqual(back.lists[0].futureListKey, [1, 2])
  assert.equal(back.lists[0].items[1].futureItemKey, 'kept')
  assert.equal(back.version, LISTS_VERSION)
})

test('a version that is not a number is refused; version 0 reads as 1', () => {
  assert.equal(parseLists(JSON.stringify({ ...V1, version: 0 })).kind, 'ok', 'version 0 reads as 1 (the first version had no number below it)')
  assert.equal(parseLists(JSON.stringify({ ...V1, version: 'two' })).kind, 'bad')
})

const TEMPLATE = readFileSync(new URL(`../../plugin/${LISTS_PAGE_TEMPLATE}`, import.meta.url), 'utf8')

test('the page: yours, then Claude\'s, each item a link where it has one, done struck through', () => {
  let f = withWhatsLeft()
  f = ok(applyListOp(f, { op: 'done', list: 'what-s-left', item: '1' }, T))
  f = ok(applyListOp(f, { op: 'create', name: 'Mine', owner: 'claude' }, T))
  const r = listsPage(f, 'claude-bookmarks.json', i => (i.id === 'i2' ? 'file:///x' : undefined), TEMPLATE)
  assert.ok('text' in r, JSON.stringify(r))
  const page = r.text
  assert.match(page, /^# Lists: claude-bookmarks/)
  assert.ok(page.includes(`${LISTS_PAGE_MARK} claude-bookmarks.json; edits here are overwritten. -->`))
  assert.match(page, /1\. ~~commit 0\.7\.5~~/)
  assert.match(page, /2\. \[the landing fix\]\(file:\/\/\/x\)/)
  assert.ok(page.indexOf('## Yours') < page.indexOf("## Claude's"))
  assert.match(page, /### Mine\n\n\(empty\)/)
})

test("the page draws an item's other links after its label (lists v2, several links per item)", () => {
  const f = withWhatsLeft()
  const r = listsPage(f, 'x.json', i => (i.id === 'i1' ? 'file:///first' : undefined), TEMPLATE, i => (i.id === 'i1' ? [{ label: 'DazzleML/claude-bookmarks#45', href: 'https://github.com/DazzleML/claude-bookmarks/issues/45' }] : []))
  assert.ok('text' in r)
  const page = (r as { text: string }).text
  assert.match(page, /1\. \[commit 0\.7\.5\]\(file:\/\/\/first\) · \[DazzleML\/claude-bookmarks#45\]\(https:\/\/github\.com\/DazzleML\/claude-bookmarks\/issues\/45\)/)
  assert.doesNotMatch(page, /2\. [^\n]* · /, 'an item with no other links gets none')
})

test('the page says which template parts are missing and writes nothing from code in their place', () => {
  const r = listsPage(withWhatsLeft(), 'x.json', () => undefined, '<!-- part: page -->\n# {{project}}\n')
  assert.deepEqual(r, { missing: ['yours', 'claudes', 'empty-list', 'no-lists'] })
  assert.deepEqual(Object.keys(templateParts(TEMPLATE)).sort(), ['claudes', 'empty-list', 'no-lists', 'page', 'yours'])
  // A CRLF checkout of the template reads the same.
  assert.deepEqual(templateParts(TEMPLATE.replace(/\n/g, '\r\n')), templateParts(TEMPLATE))
})

// refactor-advisor 2026-10-27, row 5: one finder for the tool and /bm-lists.
test('findList: a number in tab order with no owner, then id, exact name, then a part of the name', () => {
  let f = withWhatsLeft()
  f = ok(applyListOp(f, { op: 'create', name: 'Tests to run', owner: 'claude' }, T))
  assert.equal(findList(f, '2')?.name, 'Tests to run')
  assert.equal(findList(f, '1', 'claude')?.name, 'Tests to run')
  assert.equal(findList(f, 'tests')?.name, 'Tests to run')
  assert.equal(findList(f, "what's")?.id, 'what-s-left')
  assert.equal(findList(f, '   '), undefined)
  assert.equal(findList(f, 'nothing like it'), undefined)
})

test('the tool input: trimmed strings, numbers from text, an item number as a string, the defaults', () => {
  assert.deepEqual(parseListsInput({}), { action: 'lists', owner: 'claude' })
  assert.deepEqual(parseListsInput({ action: 'move', list: ' Proof ', item: 3, to: '1', owner: 'user', done: 'yes' }), { action: 'move', list: 'Proof', item: '3', to: 1, owner: 'user' })
})
