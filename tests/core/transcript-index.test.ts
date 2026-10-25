// The transcript index (slice F, U65): a pass's rows without text, the watermark and the
// conversation, serialized in pieces under 3.5 MB and read back; anything that does not fit
// (a version, another conversation, a watermark past the file, a cut piece) rebuilds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INDEX_PIECE_BYTES, INDEX_VERSION, indexBase, indexOf, parseIndex, seedLoader, serializeIndex } from '../../plugin/hooks/core/transcript/index.ts'
import { feed, newLoader } from '../../plugin/hooks/core/transcript/loader.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const U = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`
const file = [
  { type: 'user', uuid: U(1), timestamp: 't1', message: { role: 'user', content: 'first prompt' } },
  { type: 'assistant', uuid: U(2), message: { role: 'assistant', content: [{ type: 'text', text: 'a reply' }] } },
  { type: 'user', uuid: U(3), message: { role: 'user', content: 'second prompt' } },
].map(o => JSON.stringify(o)).join('\n') + '\n'

function loaded() {
  const s = newLoader()
  feed(s, file, true)
  return s
}

test('an index round-trips: the rows without their text, the prompts in order, the watermark and the line count', () => {
  const s = loaded()
  const ix = indexOf(s, SID, file.length)
  const pieces = serializeIndex(ix)
  assert.equal(pieces.length, 2)
  const back = parseIndex(pieces[0], pieces.slice(1), SID, file.length)
  assert.equal(back.kind, 'ok')
  if (back.kind !== 'ok') return
  assert.deepEqual(back.index.header, { version: INDEX_VERSION, sessionId: SID, bytesRead: s.bytes, lines: 3, size: file.length, prompts: [U(1), U(3)], footnotes: [], pieces: 1 })
  assert.deepEqual(back.index.rows.map(r => [r.uuid, r.line, r.kind, r.byteStart, r.byteEnd, r.timestamp]), s.rows.map(r => [r.uuid, r.line, r.kind, r.byteStart, r.byteEnd, r.timestamp]))
  assert.equal('text' in back.index.rows[0]!, false)
})

// 2026-10-23: the index kept rows and prompts but not footnotes, so a resumed pass knew only
// the footnotes in the bytes it had just read, and the publish replaced the stored list with
// that: 56 footnotes in the transcript, 1 in the store. The index carries them now.
test('footnotes survive a resume: the index keeps them, and the new tail adds after them', () => {
  const withFn = file + JSON.stringify({ type: 'user', uuid: U(5), message: { role: 'user', content: '<command-name>/model</command-name><command-args></command-args>' } }) + '\n'
  const s = newLoader()
  feed(s, withFn, true)
  assert.equal(s.footnotes.length, 1)
  const pieces = serializeIndex(indexOf(s, SID, withFn.length))
  const back = parseIndex(pieces[0], pieces.slice(1), SID, withFn.length)
  assert.equal(back.kind, 'ok')
  if (back.kind !== 'ok') return
  const seeded = seedLoader(back.index)
  assert.deepEqual(seeded.footnotes, s.footnotes)
  feed(seeded, JSON.stringify({ type: 'user', uuid: U(6), message: { role: 'user', content: '<bash-input>ls</bash-input>' } }) + '\n', true)
  assert.deepEqual(seeded.footnotes.map(f => f.label), ['/model', '!ls'])
})

test('an index from before footnotes were kept rebuilds', () => {
  const pieces = serializeIndex(indexOf(loaded(), SID, file.length))
  const old = JSON.stringify({ ...JSON.parse(pieces[0]!), version: 1, footnotes: undefined })
  const back = parseIndex(old, pieces.slice(1), SID, file.length)
  assert.equal(back.kind, 'rebuild')
})

test('seeding a loader from an index resumes at the watermark with the texts the pieces supply; the file\'s new tail then adds rows', () => {
  const s = loaded()
  const ix = indexOf(s, SID, file.length)
  const seeded = seedLoader(ix, new Map([[U(1), 'first prompt']]))
  assert.equal(seeded.bytes, s.bytes)
  assert.equal(seeded.line, 3)
  assert.deepEqual(seeded.prompts, [U(1), U(3)])
  assert.equal(seeded.rows[0]!.text, 'first prompt')
  assert.equal(seeded.rows[2]!.text, '', 'a text the pieces did not hold is empty, never undefined')
  const tail = JSON.stringify({ type: 'user', uuid: U(4), message: { role: 'user', content: 'third prompt, appended after the index' } }) + '\n'
  feed(seeded, tail, true)
  assert.equal(seeded.rows.length, 4)
  assert.equal(seeded.rows[3]!.line, 4)
  assert.equal(seeded.rows[3]!.byteStart, s.bytes)
  assert.deepEqual(seeded.prompts, [U(1), U(3), U(4)])
})

test('rebuild: no index, a version mismatch, another conversation, a watermark past the file, a missing or cut piece, a bad row', () => {
  const s = loaded()
  const pieces = serializeIndex(indexOf(s, SID, file.length))
  const why = (r: ReturnType<typeof parseIndex>) => (r.kind === 'rebuild' ? r.why : 'ok')
  assert.equal(why(parseIndex(undefined, [], SID, file.length)), 'no index')
  assert.match(why(parseIndex(pieces[0]!.replace(`"version":${INDEX_VERSION}`, '"version":99'), pieces.slice(1), SID, file.length)), /version 99/)
  assert.equal(why(parseIndex(pieces[0], pieces.slice(1), 'another-session', file.length)), 'another conversation')
  assert.match(why(parseIndex(pieces[0], pieces.slice(1), SID, s.bytes - 1)), /past the file/)
  assert.match(why(parseIndex(pieces[0], [], SID, file.length)), /1 pieces expected, 0 present/)
  assert.match(why(parseIndex(pieces[0], [pieces[1]!.slice(0, 20)], SID, file.length)), /not JSON/)
  assert.match(why(parseIndex(pieces[0], ['[{"uuid":1}]'], SID, file.length)), /bad row/)
  assert.equal(why(parseIndex('{', [], SID, file.length)), 'the header is not JSON')
  assert.equal(parseIndex(pieces[0], pieces.slice(1), SID, file.length + 500).kind, 'ok', 'a file that grew is the normal case')
})

test('pieces stay under the piece size, and the base path has forward slashes', () => {
  const s = newLoader()
  const many = Array.from({ length: 300 }, (_, i) => JSON.stringify({ type: 'user', uuid: U(i + 10), message: { role: 'user', content: `prompt ${i}` } })).join('\n') + '\n'
  feed(s, many, true)
  const pieces = serializeIndex(indexOf(s, SID, many.length), 4000)
  assert.ok(pieces.length > 3, `${pieces.length} pieces`)
  for (const p of pieces.slice(1)) assert.ok(p.length <= 4000, `${p.length}`)
  const back = parseIndex(pieces[0], pieces.slice(1), SID, many.length)
  assert.equal(back.kind, 'ok')
  if (back.kind === 'ok') assert.equal(back.index.rows.length, 300)
  assert.equal(INDEX_PIECE_BYTES, 3_500_000)
  assert.equal(indexBase('C:\\Users\\x\\claude\\', SID), `C:/Users/x/claude/bookmarks/transcript/${SID}`)
})
