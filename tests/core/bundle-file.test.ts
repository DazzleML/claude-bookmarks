// A bundle as a file of its own (0.8.x unit 3): the five regions, the end line, rev, and the four
// rules for a read, as the bundles proof of concept settled them; the front matter as Obsidian
// writes it back (its hand test, 2026-11-02: only the edited properties change).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NOTES_MARKER, nextStarted, parseBundleFile, renderBundleFile, writeBack, type BundleFileData } from '../../plugin/hooks/core/lists/bundle-file.ts'

const D: BundleFileData = {
  id: 'kx7m2qab', label: 'The registry epic', why: 'What the 0.8 line moves', tags: ['sample'], by: 'claude', rev: 3,
  links: [{ kind: 'url', url: 'https://example.com/45' } as never, { kind: 'file', path: 'C:/work/demo/docs/data-model.md' } as never],
  created: Date.parse('2026-11-02T18:02:00Z'), updated: Date.parse('2026-11-02T20:30:00Z'), started: Date.parse('2026-11-02T14:20:00Z'),
}
const LINES = ['- [the lists epic](https://example.com/45)', '- [the data model](file:///C:/work/demo/docs/data-model.md)']
// Notes that look like the plugin's own regions, so a split on the first match would go wrong.
const NOTES = ['A note typed by hand.', '', '```bm-links', '{"rev": 99}', '```', '', '---', 'not front matter', NOTES_MARKER, '<!-- bm end: 7 -->', 'a link: bm:8f0f9b27/12d637fb', ''].join('\n')
const render = (d = D, notes = NOTES, eol?: string) => renderBundleFile(d, { notes, linkLines: LINES, ...(eol ? { eol } : {}) })

test('a bundle round-trips: every field, the links, and the notes', () => {
  const r = parseBundleFile(render())
  assert.equal(r.kind, 'ok')
  if (r.kind !== 'ok') return
  assert.deepEqual(r.data, D)
  assert.equal(r.notes, NOTES)
})

test('the notes are byte-identical over three regenerations, regions-lookalikes and all', () => {
  let text = render()
  for (let i = 0; i < 3; i++) {
    const r = parseBundleFile(text)
    assert.equal(r.kind, 'ok')
    if (r.kind !== 'ok') return
    text = render({ ...r.data, rev: r.data.rev + 1, updated: r.data.updated + 1 }, r.notes)
    assert.equal((parseBundleFile(text) as { notes: string }).notes, NOTES)
  }
})

test('every cut at each 1/64 of the file is refused as a whole bundle, notes included', () => {
  const text = render()
  const accepted: number[] = []
  for (let k = 1; k < 64; k++) {
    const cut = text.slice(0, Math.floor((text.length * k) / 64))
    if (parseBundleFile(cut).kind === 'ok') accepted.push(k)
  }
  assert.deepEqual(accepted, [])
})

test('a cut inside the notes reads as no end line, the stable-read case, never as whole', () => {
  const text = render()
  const inNotes = text.slice(0, text.indexOf('a link:'))
  const r = parseBundleFile(inNotes)
  assert.equal(r.kind, 'no-end')
  assert.equal(r.kind === 'no-end' && r.data.id, D.id)
})

test('a deleted end line is accepted on a stable read, and the next write puts it back', () => {
  const text = render().replace(/<!-- bm end: 3 -->\n$/, '')
  const r = parseBundleFile(text)
  assert.equal(r.kind, 'no-end')
  if (r.kind !== 'no-end') return
  const again = render({ ...r.data, rev: 4 }, r.notes)
  assert.ok(again.endsWith('<!-- bm end: 4 -->\n'))
  assert.equal(parseBundleFile(again).kind, 'ok')
})

test('text a person adds after the end line is notes, and the next write moves the end line to the bottom', () => {
  const text = render(D, 'first\n') + 'added after the end line\n'
  const r = parseBundleFile(text)
  assert.equal(r.kind, 'ok')
  if (r.kind !== 'ok') return
  assert.equal(r.notes, 'first\nadded after the end line\n')
  assert.ok(render(r.data, r.notes).endsWith('added after the end line\n<!-- bm end: 3 -->\n'))
})

test('a block that does not parse, or a missing block or marker, is bad: every write is refused', () => {
  assert.equal(parseBundleFile(render().replace(/"rev":3/, '"rev":3,,')).kind, 'bad')
  assert.equal(parseBundleFile(render().replace('```bm-links', '```json')).kind, 'bad')
  assert.equal(parseBundleFile(render().replace(NOTES_MARKER, '<!-- notes -->')).kind, 'bad')
  assert.equal(parseBundleFile('no front matter at all').kind, 'bad')
  assert.equal(parseBundleFile(render().replace('type: bookmarks-bundle', 'type: postmortem')).kind, 'bad')
})

test("a block the person typed in the notes is never taken for the plugin's when the plugin's is damaged", () => {
  const decoy = ['```bm-links', '{"rev":3,"links":[],"created":0,"updated":0,"started":0}', '```', NOTES_MARKER, 'what remains', ''].join('\n')
  const damaged = render(D, decoy).replace('```bm-links', '```json')
  assert.equal(parseBundleFile(damaged).kind, 'bad')
})

test('a newer file version is not read, so it is never written over', () => {
  assert.deepEqual(parseBundleFile(render().replace('version: 1', 'version: 2')), { kind: 'newer', version: 2 })
})

test("an edit in Obsidian's Properties is taken; an id edit is not", () => {
  // What Obsidian wrote back in its hand test: why changed, a tag line added in the same block style.
  const edited = render().replace('why: What the 0.8 line moves', 'why: Anything').replace('  - bm/sample\n', '  - bm/sample\n  - bm/obsidian-test\n').replace('id: kx7m2qab', 'id: zzzzzzzz')
  const r = parseBundleFile(edited)
  assert.equal(r.kind, 'ok')
  if (r.kind !== 'ok') return
  const taken = writeBack(r.data, { label: D.label, why: D.why, tags: D.tags, started: D.started })
  assert.deepEqual(taken, { why: 'Anything', tags: ['sample', 'obsidian-test'] })
  assert.equal('id' in taken, false)
})

test('a write-back field absent from the file is never a deletion', () => {
  const { why: _w, ...noWhy } = D
  const r = parseBundleFile(render(noWhy as BundleFileData))
  assert.equal(r.kind, 'ok')
  assert.deepEqual(writeBack((r as { data: BundleFileData }).data, { label: D.label, why: D.why, tags: D.tags, started: D.started }), {})
})

test('started set by hand is kept; one the plugin set only moves earlier', () => {
  const plugin = D.started, hand = D.started + 3_600_000, earlier = D.started - 86_400_000
  assert.equal(nextStarted(hand, plugin, earlier), hand)
  assert.equal(nextStarted(plugin, plugin, earlier), earlier)
  assert.equal(nextStarted(plugin, plugin, plugin + 5), plugin)
})

test('a file with CRLF line endings reads, and is written back with them, its notes byte for byte', () => {
  const notes = 'line one\r\nline two\r\n'
  const text = render(D, notes, '\r\n')
  assert.ok(!/[^\r]\n/.test(text))
  const r = parseBundleFile(text)
  assert.equal(r.kind, 'ok')
  if (r.kind !== 'ok') return
  assert.equal(r.eol, '\r\n')
  assert.equal(r.notes, notes)
  assert.equal(render(r.data, r.notes, r.eol), text)
})

test('the derived bm/bundle tag is written, and stripped on read', () => {
  const text = render()
  assert.ok(text.includes('  - bm/bundle\n  - bm/sample\n'))
  assert.deepEqual((parseBundleFile(text) as { data: BundleFileData }).data.tags, ['sample'])
})
