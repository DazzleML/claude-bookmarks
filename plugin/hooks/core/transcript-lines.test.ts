// node --test hooks/core/transcript-lines.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { utf8ByteLength } from './anchor.ts'
import {
  headOf,
  jsonEscaped,
  messageTextOf,
  parseGrepLine,
  resolveRows,
  rowsFromGrep,
  uuidPattern,
} from './transcript-lines.ts'

// A small transcript: the shapes Claude Code writes, in file order.
const lines = [
  { type: 'user', uuid: 'aaaaaaaa-0000-0000-0000-000000000001', timestamp: 't1', message: { role: 'user', content: 'Hey Claude, let us learn the TUI' } },
  { type: 'assistant', uuid: 'bbbbbbbb-0000-0000-0000-000000000002', message: { role: 'assistant', content: [{ type: 'text', text: 'Sure. The TUI has panes ⚓ and a band.' }] } },
  { type: 'last-prompt', lastPrompt: 'Hey Claude, let us learn the TUI' },
  { type: 'user', uuid: 'cccccccc-0000-0000-0000-000000000003', isMeta: true, message: { role: 'user', content: 'learn the TUI (meta)' } },
  { type: 'user', uuid: 'dddddddd-0000-0000-0000-000000000004', message: { role: 'user', content: [{ type: 'tool_result', content: 'learn the TUI in a tool result' }] } },
  { type: 'user', uuid: 'eeeeeeee-0000-0000-0000-000000000005', message: { role: 'user', content: [{ type: 'text', text: 'RE: "learn the TUI" -- yes, quoting you' }] } },
  { type: 'system', uuid: 'ffffffff-0000-0000-0000-000000000006', content: 'learn the TUI (system)' },
  // A user row with a tool result and a text block (both kinds in one row): the text counts.
  { type: 'user', uuid: '99999999-0000-0000-0000-000000000007', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }, { type: 'text', text: 'mid-turn: also learn the TUI' }] } },
  // A message typed while Claude was working: an attachment row, type queued_command.
  { type: 'attachment', uuid: '88888888-0000-0000-0000-000000000008', timestamp: 't8', attachment: { type: 'queued_command', prompt: 'queued: learn the TUI later', humanTurn: true } },
  // Other attachments are bookkeeping.
  { type: 'attachment', uuid: '77777777-0000-0000-0000-000000000009', attachment: { type: 'hook_success', content: 'learn the TUI hook' } },
]
const texts = lines.map(o => JSON.stringify(o))

// What `grep -bnF <pattern> file` would print: line, byte offset of the line, the line.
function grepOutput(pattern: string): string {
  const out: string[] = []
  let offset = 0
  texts.forEach((t, i) => {
    if (t.includes(pattern)) out.push(`${i + 1}:${offset}:${t}`)
    offset += utf8ByteLength(t) + 1
  })
  return out.join('\n') + '\n'
}

test('parseGrepLine splits line, offset and the JSON (which may itself contain colons)', () => {
  assert.deepEqual(parseGrepLine('12:345:{"a":"b:c"}'), { line: 12, byteStart: 345, json: '{"a":"b:c"}' })
  assert.equal(parseGrepLine('garbage'), undefined)
  // The engine's process runner hands back CRLF on Windows; the CR is not the line's.
  assert.deepEqual(parseGrepLine('12:345:{"a":1}\r'), { line: 12, byteStart: 345, json: '{"a":1}' })
})

test('byte ranges are exact despite CRLF from the process runner (the 1845 vs 1846 bug)', () => {
  const t = texts[0]!
  const rows = rowsFromGrep(`1:0:${t}\r\n`)
  assert.equal(rows[0]!.byteEnd, utf8ByteLength(t))
})

test('messageTextOf keeps user and assistant text, drops bookkeeping', () => {
  assert.deepEqual(messageTextOf(lines[0]), { role: 'user', text: 'Hey Claude, let us learn the TUI' })
  assert.deepEqual(messageTextOf(lines[1]), { role: 'assistant', text: 'Sure. The TUI has panes ⚓ and a band.' })
  assert.equal(messageTextOf(lines[2]), undefined, 'last-prompt')
  assert.equal(messageTextOf(lines[3]), undefined, 'meta')
  assert.equal(messageTextOf(lines[4]), undefined, 'tool result alone')
  assert.equal(messageTextOf(lines[6]), undefined, 'system')
  assert.deepEqual(messageTextOf(lines[7]), { role: 'user', text: 'mid-turn: also learn the TUI' }, 'text beside a tool result')
  assert.deepEqual(messageTextOf(lines[8]), { role: 'user', text: 'queued: learn the TUI later' }, 'a queued_command attachment is the person\'s message')
  assert.equal(messageTextOf(lines[9]), undefined, 'other attachments are bookkeeping')
})

test('rowsFromGrep: only message rows, with byte ranges that tile the file', () => {
  const rows = rowsFromGrep(grepOutput('learn the TUI'))
  assert.deepEqual(rows.map(r => r.line), [1, 6, 8, 9])
  assert.equal(rows[0]!.byteStart, 0)
  assert.equal(rows[0]!.byteEnd, utf8ByteLength(texts[0]!))
  // Line 6 starts after lines 1-5 and their newlines.
  const expectedStart = texts.slice(0, 5).reduce((n, t) => n + utf8ByteLength(t) + 1, 0)
  assert.equal(rows[1]!.byteStart, expectedStart)
  assert.equal(rows[1]!.byteEnd - rows[1]!.byteStart, utf8ByteLength(texts[5]!))
  assert.equal(rows[0]!.timestamp, 't1')
})

test('a fragment said once and quoted later resolves to the earliest row, with the quote as a candidate', () => {
  const rows = rowsFromGrep(grepOutput('learn the TUI'))
  const r = resolveRows(rows, { fragment: 'learn the TUI' })
  assert.equal(r.kind, 'many')
  if (r.kind === 'many') {
    assert.equal(r.earliest.uuid, 'aaaaaaaa-0000-0000-0000-000000000001')
    assert.deepEqual(r.rows.map(x => x.line), [1, 6, 8, 9])
  }
})

test('a fragment said once resolves to one row; an unknown one to none', () => {
  const one = resolveRows(rowsFromGrep(grepOutput('panes')), { fragment: 'panes ⚓' })
  assert.equal(one.kind, 'one')
  if (one.kind === 'one') assert.equal(one.row.role, 'assistant')
  assert.equal(resolveRows(rowsFromGrep(grepOutput('nowhere')), { fragment: 'nowhere' }).kind, 'none')
})

test('by uuid, full or prefix', () => {
  const rows = rowsFromGrep(grepOutput('"uuid":"bbbbbbbb'))
  assert.equal(resolveRows(rows, { uuid: 'bbbbbbbb-0000-0000-0000-000000000002' }).kind, 'one')
  assert.equal(resolveRows(rows, { uuid: 'bbbbbbbb' }).kind, 'one')
  assert.equal(resolveRows(rows, { uuid: 'bbbbbbb' }).kind, 'none', 'a prefix needs 8 characters')
})

test('patterns are what the JSON line contains', () => {
  assert.equal(jsonEscaped('say "hi"\nnow'), 'say \\"hi\\"\\nnow')
  assert.equal(uuidPattern('abc'), '"uuid":"abc')
  assert.equal(headOf('  one\n\n two   three '), 'one two three')
})

test('a line cut off at the output cap is skipped, not fatal', () => {
  const rows = rowsFromGrep(`1:0:${texts[0]}\n2:${utf8ByteLength(texts[0]!) + 1}:{"type":"assistant","uuid":"x`)
  assert.equal(rows.length, 1)
})
