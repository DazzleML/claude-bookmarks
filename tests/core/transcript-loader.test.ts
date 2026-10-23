// The whole-conversation loader (slice F, U65): fed in chunks of any size it yields the
// same rows as the whole file, with the file's line numbers and byte ranges; the rules for
// prompts, footnotes and replies are the shared ones; the carry survives a boundary inside
// a line or inside a multi-byte character. Design: 2026-10-22__21-35-40 (U65).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { utf8ByteLength } from '../../plugin/hooks/core/bookmarks/anchor.ts'
import { CARRY_CAP, REPLY_TEXT_BUDGET, append, classifyLine, feed, loaderLine, newLoader, resolve, textsWithin } from '../../plugin/hooks/core/transcript/loader.ts'

const U = (n: number, prefix = 'aaaaaaaa') => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`
const lines = [
  { type: 'user', uuid: U(1), timestamp: 't1', message: { role: 'user', content: 'Hey Claude, let us learn the TUI ⚓ and anchors' } },
  { type: 'assistant', uuid: U(2), message: { role: 'assistant', content: [{ type: 'text', text: 'Sure. The TUI has panes and a band.' }] } },
  { type: 'user', uuid: U(3), isMeta: true, message: { role: 'user', content: 'a skill body the engine injected' } },
  { type: 'user', uuid: U(4), message: { role: 'user', content: [{ type: 'tool_result', content: 'a tool result alone' }] } },
  // A queued prompt whose pasted text quotes a marker the grep filter excluded (70 of 994 on one transcript, 2026-10-22).
  { type: 'attachment', uuid: U(5), timestamp: 't5', attachment: { type: 'queued_command', prompt: 'look at this log: {"type":"tool_result","isMeta":true} and tell me', humanTurn: true } },
  { type: 'user', uuid: U(6), isCompactSummary: true, message: { role: 'user', content: 'This session is being continued from a previous conversation. Summary: ...' } },
  { type: 'user', uuid: U(7), message: { role: 'user', content: '<command-name>/compact</command-name><command-args></command-args>' } },
  { type: 'user', uuid: U(8), message: { role: 'user', content: 'second prompt, after the compaction' } },
  { type: 'assistant', uuid: U(9, 'bbbbbbbb'), message: { role: 'assistant', content: [{ type: 'text', text: 'A reply with the fragment learn the TUI quoted back.' }] } },
  { type: 'assistant', uuid: U(10, 'bbbbbbbb'), message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read' }] } },
]
const texts = lines.map(o => JSON.stringify(o))
const FILE = texts.join('\n') + '\n'

function loadWhole(file = FILE) {
  const s = newLoader()
  feed(s, file, true)
  return s
}
function loadChunked(size: number, file = FILE) {
  const s = newLoader()
  for (let i = 0; i < file.length; i += size) feed(s, file.slice(i, i + size), i + size >= file.length)
  return s
}

test('the rows: every prompt and reply, with the file\'s line numbers and byte ranges tiling the file', () => {
  const s = loadWhole()
  assert.deepEqual(s.rows.map(r => `${r.line}:${r.kind}`), ['1:prompt', '2:reply', '5:prompt', '6:compaction', '7:other', '8:prompt', '9:reply'])
  assert.deepEqual(s.prompts, [U(1), U(5), U(8)])
  // Byte ranges are the file's: line 1 starts at 0 and ends after its newline; line 5 starts after lines 1-4.
  assert.equal(s.rows[0]!.byteStart, 0)
  assert.equal(s.rows[0]!.byteEnd, utf8ByteLength(texts[0]!) + 1)
  const start5 = texts.slice(0, 4).reduce((n, t) => n + utf8ByteLength(t) + 1, 0)
  assert.equal(s.rows[2]!.byteStart, start5)
  assert.equal(s.bytes, utf8ByteLength(FILE))
  assert.equal(s.line, lines.length)
  assert.equal(s.rows[0]!.timestamp, 't1')
})

test('the queued prompt quoting a marker is a prompt; the compaction summary is a row of its own kind, not a prompt; meta and tool-result-only rows are no rows', () => {
  const s = loadWhole()
  assert.equal(s.rows.find(r => r.uuid === U(5))?.kind, 'prompt')
  assert.equal(s.rows.find(r => r.uuid === U(6))?.kind, 'compaction')
  assert.equal(s.prompts.includes(U(6)), false)
  assert.equal(s.rows.some(r => r.uuid === U(3) || r.uuid === U(4) || r.uuid === U(10, 'bbbbbbbb')), false)
  // The slash command is a footnote after the prompt before it (the queued one, #5).
  assert.deepEqual(s.footnotes, [{ kind: 'command', label: '/compact', uuid: U(7), after: U(5) }])
})

test('fed in chunks of 1, 7 and 100 characters the loader yields the same rows as the whole file (the carry)', () => {
  const whole = loadWhole()
  for (const size of [1, 7, 100, 4096]) {
    const s = loadChunked(size)
    assert.deepEqual(s.rows, whole.rows, `chunk size ${size}`)
    assert.deepEqual([s.line, s.bytes, s.prompts, s.footnotes], [whole.line, whole.bytes, whole.prompts, whole.footnotes], `chunk size ${size}`)
  }
})

test('a boundary inside the ⚓ does not change the bytes; a CRLF file counts its CR; a last line without a newline is taken', () => {
  const at = FILE.indexOf('⚓')
  const s = newLoader()
  feed(s, FILE.slice(0, at))
  feed(s, FILE.slice(at), true)
  assert.deepEqual(s.rows, loadWhole().rows)
  const crlf = texts.join('\r\n') + '\r\n'
  const c = loadWhole(crlf)
  assert.equal(c.rows[0]!.byteEnd, utf8ByteLength(texts[0]!) + 2)
  assert.equal(c.bytes, utf8ByteLength(crlf))
  assert.equal(c.rows.length, 7)
  const noFinalNewline = texts.join('\n')
  const n = loadWhole(noFinalNewline)
  assert.equal(n.rows.length, 7)
  assert.equal(n.bytes, utf8ByteLength(noFinalNewline))
})

test('a line past the carry cap is dropped and counted; a line that is not JSON is counted and skipped', () => {
  const s = newLoader()
  const huge = 'x'.repeat(60)
  feed(s, `${texts[0]}\n${huge}`, false, 50)
  feed(s, `${huge}\n${texts[1]}\n`, true, 50)
  assert.equal(s.dropped, 1)
  assert.deepEqual(s.rows.map(r => r.uuid), [U(1), U(2)])
  // The dropped line is one line of the file however many chunks it spanned.
  assert.equal(s.rows[1]!.line, 3)
  assert.equal(s.bytes, utf8ByteLength(`${texts[0]}\n${huge}${huge}\n${texts[1]}\n`))
  assert.equal(s.dropping, false)
  const u = loadWhole(`${texts[0]}\nnot json at all\n${texts[1]}\n`)
  assert.equal(u.unparsed, 1)
  assert.equal(u.rows[1]!.line, 3)
  assert.equal(CARRY_CAP, 8 * 1024 * 1024)
})

test('a row appended live is kept with unknown hints until the pass reads it, then filled; a second append of the uuid is refused', () => {
  const s = newLoader()
  assert.equal(append(s, { uuid: U(8), role: 'user', text: 'second prompt, after the compaction' }), true)
  assert.equal(append(s, { uuid: U(8), role: 'user', text: 'again' }), false)
  assert.deepEqual(s.prompts, [U(8)])
  assert.equal(s.rows[0]!.line, 0)
  feed(s, FILE, true)
  const row = s.rows.find(r => r.uuid === U(8))!
  assert.equal(row.line, 8)
  assert.ok(row.byteEnd > row.byteStart)
  assert.deepEqual(s.prompts, [U(8), U(1), U(5)], 'the live row keeps its place; the file adds the rest in order')
  assert.equal(s.rows.length, 7)
})

test('resolve: by uuid, by an 8+ prefix (two uuids sharing it are many), by a fragment (the earliest first)', () => {
  const s = loadWhole()
  assert.equal(resolve(s, { uuid: U(2) }).kind, 'one')
  assert.equal(resolve(s, { uuid: 'bbbbbbbb' }).kind, 'one', 'the tool_use row sharing the prefix has no text, so it is no row')
  assert.equal(resolve(s, { uuid: 'bbbbbbb' }).kind, 'none', 'a prefix needs 8 characters')
  const two = newLoader()
  feed(two, `${JSON.stringify({ type: 'user', uuid: U(21, 'cccccccc'), message: { role: 'user', content: 'one' } })}\n${JSON.stringify({ type: 'user', uuid: U(22, 'cccccccc'), message: { role: 'user', content: 'two' } })}\n`, true)
  assert.equal(resolve(two, { uuid: 'cccccccc' }).kind, 'many', 'two message uuids sharing the first eight characters: ask, never guess')
  const r = resolve(s, { fragment: 'learn the TUI' })
  assert.equal(r.kind, 'many')
  if (r.kind === 'many') assert.equal(r.earliest.uuid, U(1))
  assert.equal(resolve(s, { fragment: 'nowhere' }).kind, 'none')
})

test('the texts of a kind newest first under a budget, and the /bm-env line', () => {
  const s = loadWhole()
  const all = textsWithin(s, 'reply', 0)
  assert.deepEqual(all.map(t => t.uuid), [U(9, 'bbbbbbbb'), U(2)])
  const some = textsWithin(s, 'reply', 20)
  assert.equal(some.length, 1)
  assert.equal(some[0]!.uuid, U(9, 'bbbbbbbb'))
  assert.equal(some[0]!.text.length <= 20, true)
  assert.deepEqual(textsWithin(s, 'prompt', 0).map(t => t.uuid), [U(8), U(5), U(1)])
  assert.equal(REPLY_TEXT_BUDGET, 4_000_000)
  assert.equal(loaderLine(s, 1000, 3, 250, false), `loader: 7 rows (3 prompts), ${s.bytes} of 1000 bytes read in 250 ms over 3 chunk(s), done`)
  assert.ok(loaderLine(loadWhole(`${texts[0]}\nnope\n`), undefined, 1, 5, true).endsWith('running; 1 not JSON'))
  assert.deepEqual(classifyLine({ type: 'user', uuid: 'x', isMeta: true, message: { content: 'meta' } }), undefined)
})
