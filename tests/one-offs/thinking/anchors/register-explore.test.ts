import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyRegister, addOrRelabel, prune, serializeRegister, parseRegister, exportNotesOf, exportMarkdown, EXPORT_NOTES_MARKER, listOf, type Mint } from '../../../../hooks/core/register-file.ts'
import type { AnchorRecord } from '../../../../hooks/core/anchor.ts'

const SID = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const mint = (uuid: string, o: Partial<Mint> = {}): Mint => ({ uuid, owner: 'claude', label: 'L', head: 'h', by: 'claude', source: 'tool', ...o })
const rec = (o: Partial<AnchorRecord> = {}): AnchorRecord => ({ sessionId: SID, uuid: '230c29e3-f948-454d-87f6-048bc4eefc2e', head: 'h', label: 'L', createdAt: 1, by: 'claude', source: 'tool', ...o })
const DAY = 86_400_000

test('two DIFFERENT full uuids sharing first 8 chars do not collide', () => {
  let r = emptyRegister(SID, 'w', 0)
  r = addOrRelabel(r, mint('230c29e3-aaaa-454d-87f6-048bc4eefc2e'), 1).register
  const res = addOrRelabel(r, mint('230c29e3-bbbb-454d-87f6-048bc4eefc2e', { label: 'second' }), 2)
  assert.equal(res.added, true)
  assert.equal(res.register.perma.length, 2)
})

test('an 8-char prefix mint collides with the first of several same-prefix uuids (ambiguity)', () => {
  let r = emptyRegister(SID, 'w', 0)
  r = addOrRelabel(r, mint('230c29e3-aaaa-454d-87f6-048bc4eefc2e'), 1).register
  r = addOrRelabel(r, mint('230c29e3-bbbb-454d-87f6-048bc4eefc2e'), 2).register
  const res = addOrRelabel(r, mint('230c29e3', { label: 'by prefix' }), 3)
  assert.equal(res.added, false)
  assert.equal(res.record.uuid, '230c29e3-aaaa-454d-87f6-048bc4eefc2e') // silently picks the first
})

test('prune: exactly at the retention boundary is kept; one ms older is pruned', () => {
  const now = 100 * DAY
  const base = emptyRegister(SID, 'w', 0)
  const at = { ...base, perma: [rec({ temporary: true, createdAt: now - 30 * DAY })] }
  assert.equal(prune(at, '30d', now).pruned.length, 0)
  const older = { ...base, perma: [rec({ temporary: true, createdAt: now - 30 * DAY - 1 })] }
  const p = prune(older, '30d', now)
  assert.equal(p.pruned.length, 1)
  assert.equal(p.register.tombstones[0]!.prunedAt, now)
  assert.equal(p.register.rev, 1)
})

test('prune: updatedAt (relabel) refreshes age; non-temporary never pruned', () => {
  const now = 100 * DAY
  const base = emptyRegister(SID, 'w', 0)
  const r = { ...base, perma: [rec({ temporary: true, createdAt: 0, updatedAt: now }), rec({ uuid: 'b'.repeat(8), createdAt: 0 })] }
  assert.equal(prune(r, '7d', now).pruned.length, 0)
})

test('serializeRegister with undefined optional fields: no "undefined"/null keys, round trips', () => {
  const r = { ...emptyRegister(SID, 'w', 5), configDir: undefined, cwd: undefined, perma: [rec({ line: undefined, bytes: undefined, words: undefined, why: undefined, transcript: undefined, owner: undefined })] }
  const s = serializeRegister(r)
  assert.ok(!/undefined|null/.test(s))
  const back = parseRegister(s)!
  assert.equal(back.perma.length, 1)
  assert.equal(serializeRegister(back), s)
})

test('parseRegister drops malformed records but keeps good ones', () => {
  const back = parseRegister(JSON.stringify({ sessionId: SID, perma: [{ uuid: 'x', label: 'l' }, { uuid: 5 }, null, 'str'] }))!
  assert.equal(back.perma.length, 1)
})

test('exportNotesOf: marker twice -> first marker wins, a later marker is dropped (fixed 2026-10-09; it used to leak into the notes)', () => {
  const text = `top\n${EXPORT_NOTES_MARKER}\n\nmine\n${EXPORT_NOTES_MARKER}\nmore`
  const notes = exportNotesOf(text)
  assert.equal(notes, `mine\n\nmore`)
})

test('DEFECT? notes containing the marker: a rewrite should leave exactly one marker', () => {
  const text = exportMarkdown(rec(), 'msg', { notes: `mine\n${EXPORT_NOTES_MARKER}\nmore` })
  assert.equal(text.split(EXPORT_NOTES_MARKER).length - 1, 1, 'marker count after one rewrite')
})

test('exportNotesOf: absent/undefined/empty', () => {
  assert.equal(exportNotesOf(undefined), '')
  assert.equal(exportNotesOf('no marker'), '')
})

test('exportMarkdown: regex metacharacters in words are treated literally', () => {
  const words = 'a.*b(c)[d]^+?|\\'
  const md = exportMarkdown(rec({ words }), `before ${words} after`)
  assert.ok(md.includes(`> before **${words}** after`), md.split('\n').find(l => l.startsWith('> ')))
})

test('DEFECT? exportMarkdown: dollar-ampersand, $$, $\' and $` in words are replacement patterns, not literal', () => {
  for (const words of ['cost $& more', 'price $$5', "a $' b", 'x $` y']) {
    const msg = `intro ${words} outro`
    const md = exportMarkdown(rec({ words }), msg)
    assert.ok(md.includes(`> intro **${words}** outro`), `words=${JSON.stringify(words)} got: ${md.split('\n').find(l => l.startsWith('> '))}`)
  }
})

test('exportMarkdown: words twice in message -> only the first is bolded', () => {
  const md = exportMarkdown(rec({ words: 'foo' }), 'foo and foo')
  assert.ok(md.includes('> **foo** and foo'))
})

test('exportMarkdown: words not in message -> no bold, no throw', () => {
  const md = exportMarkdown(rec({ words: 'zzz' }), 'hello')
  assert.ok(md.includes('> hello') && !md.includes('**zzz**'))
})

test('exportMarkdown: long message with words puts heading just above the words paragraph', () => {
  const msg = 'para\n'.repeat(400) + 'target words here\nend'
  const md = exportMarkdown(rec({ words: 'target words' }), msg)
  assert.ok(md.includes('[jump to the bookmarked words](#the-bookmarked-words)'))
  const lines = md.split('\n')
  const h = lines.indexOf('### The bookmarked words')
  assert.ok(lines[h + 2]!.startsWith('> **target words**'))
})

test('exportMarkdown: label with YAML-hostile chars is quoted in front matter', () => {
  const md = exportMarkdown(rec({ label: 'a: b # c', why: 'multi\nline' }), 'm')
  assert.ok(md.includes('label: "a: b # c"'))
  assert.ok(md.includes('why: "multi\\nline"'))
})

test('listOf orders by createdAt', () => {
  let r = emptyRegister(SID, 'w', 0)
  r = addOrRelabel(r, mint('aaaaaaaa-0000-0000-0000-000000000000'), 5).register
  r = addOrRelabel(r, mint('bbbbbbbb-0000-0000-0000-000000000000'), 3).register
  assert.deepEqual(listOf(r, 'claude').map(x => x.uuid.slice(0, 1)), ['b', 'a'])
})
