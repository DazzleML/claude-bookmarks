// node --test hooks/core/bookmarks/transcript-lines.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { utf8ByteLength } from '../../plugin/hooks/core/bookmarks/anchor.ts'
import {
  fitLine,
  fitLines,
  headOf,
  jsonEscaped,
  lineOf,
  messageTextOf,
  parseGrepLine,
  resolveRows,
  rowPlace,
  rowsFromGrep,
  targetPattern,
  uuidPattern,
} from '../../plugin/hooks/core/bookmarks/transcript-lines.ts'

test("a bookmark's place from its transcript row: line, bytes, head, path with forward slashes, role, timestamp when known", () => {
  const row = { line: 7, byteStart: 100, byteEnd: 180, uuid: 'u1', role: 'assistant' as const, text: 'the   answer\nin two lines', timestamp: '2026-10-15T20:00:00Z' }
  assert.deepEqual(rowPlace(row, 'C:\\Users\\x\\.claude\\projects\\p\\s.jsonl'), {
    uuid: 'u1', line: 7, bytes: [100, 180], head: 'the answer in two lines',
    transcript: 'C:/Users/x/.claude/projects/p/s.jsonl', role: 'assistant', timestamp: '2026-10-15T20:00:00Z',
  })
  const { timestamp: _t, ...untimed } = row
  assert.equal('timestamp' in rowPlace(untimed, undefined), false)
  assert.equal(rowPlace(untimed, undefined).transcript, undefined)
})

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
  // A request names a message by uuid first, else by a fragment, else by nothing (U60).
  assert.equal(targetPattern({ uuid: 'abc', fragment: 'ignored' }), '"uuid":"abc')
  assert.equal(targetPattern({ fragment: 'say "hi"' }), 'say \\"hi\\"')
  assert.equal(targetPattern({}), undefined)
})

// A pane row draws the whole prompt as one line and lets the terminal cut it at the pane's
// edge (U64, djdarcy 2026-10-15: fill a widened pane); the 60-character head stays the
// fallback when no text is kept, and is the same line cut, so the two cannot drift.
test('lineOf is the whole text on one line; headOf is that line cut to 60', () => {
  const long = `first line of a prompt\n\n   second   line, past sixty characters by a fair margin\tand a tab`
  assert.equal(lineOf(long), 'first line of a prompt second line, past sixty characters by a fair margin and a tab')
  assert.equal(lineOf(long).length > 60, true)
  assert.equal(headOf(long), lineOf(long).slice(0, 60))
  assert.equal(headOf(long).length, 60)
  assert.equal(lineOf('   '), '')
})

// A row is cut to the pane's width by the plugin (live, a long Button label wraps): whole
// when it fits, else width-1 characters and an ellipsis, so the row never exceeds `width`.
test('fitLine: whole when it fits, cut with an ellipsis to exactly the width otherwise', () => {
  assert.equal(fitLine('short', 10), 'short')
  assert.equal(fitLine('exactly ten', 11), 'exactly ten')
  assert.equal(fitLine('twelve chars', 11), 'twelve cha…')
  assert.equal(fitLine('twelve chars', 11).length, 11)
  assert.equal(fitLine('abc', 1), '…')
  assert.equal(fitLine('abc', 0), '')
})

// U70: a row may take `lines` lines. The label carries hard lines of at most `width`
// characters each, so the terminal's word wrap can never add a row; the ellipsis ends the
// last line when the text is cut; continuation lines carry the indent that puts them under
// the text (a plain prompts row's prefix, the engine's `a: ` on a hotkey row).
test('fitLines: whole across the lines when it fits, the last line cut hard with the ellipsis otherwise', () => {
  assert.equal(fitLines('short', 10, 2), 'short')
  assert.equal(fitLines('twelve chars', 10, 2), 'twelve\nchars')
  assert.equal(fitLines('twenty-one characters', 10, 2), 'twenty-one\ncharacters')
  assert.equal(fitLines('the quick brown fox jumps', 10, 2), 'the quick\nbrown fox…')
  const cut = fitLines('a'.repeat(100), 10, 3)
  assert.deepEqual(cut.split('\n').map(l => l.length), [10, 10, 10])
  assert.equal(cut.endsWith('…'), true)
})

// djdarcy, 2026-10-22 (reading the first two-line rows): "Feel fre / e to do that commit" is
// hard to read when "free" fits the next line; a path or a slug that no line could hold is
// still cut where the line ends ("SIMPLE-AI-TAG-TOOL__20 / 26-10-1__...").
test('fitLines: a line breaks at a space when the straddling word fits a line, and cuts a word that never would', () => {
  assert.equal(fitLines('Feel free to do that', 10, 2), 'Feel free\nto do that')
  assert.equal(fitLines('the fix Feel free to', 10, 2), 'the fix\nFeel free…')
  assert.equal(fitLines('see SIMPLE-AI-TAG-TOOL__2026 now', 10, 3), 'see SIMPLE\n-AI-TAG-TO\nOL__2026 …')
  assert.equal(fitLines('x SIMPLE-AI-TAG-TOOL__2026-10-1', 10, 2), 'x SIMPLE-A\nI-TAG-TOO…', 'a token longer than a line is cut at the edge, not moved')
  assert.equal(fitLines('ab cd ef', 5, 2), 'ab cd\nef', 'a space at the edge: whole words, the space dropped')
  // djdarcy, 2026-10-22: "if you would too / so we have" kept the space, so "so" sat one column
  // in; and "a bit to / morrow" should fold "tomorrow" over whole.
  assert.equal(fitLines('if you would too so we have', 16, 2), 'if you would too\nso we have')
  assert.equal(fitLines('the project a bit tomorrow or', 20, 2), 'the project a bit\ntomorrow or')
  for (const t of ['if you would too so we have', 'the project a bit tomorrow or', 'see SIMPLE-AI-TAG-TOOL__2026 now']) {
    for (const line of fitLines(t, 16, 3).split('\n')) assert.equal(line.startsWith(' '), false, `${t}: "${line}"`)
  }
})

test('fitLines: continuation lines carry the indent, the first does not; one line is fitLine', () => {
  assert.equal(fitLines('twelve chars', 10, 2, 4), 'twelve\n    chars')
  assert.equal(fitLines('the quick brown fox jumps', 10, 2, 2), 'the quick\n  brown fox…')
  for (const t of ['short', 'twelve chars', 'a'.repeat(30), 'the quick brown fox']) assert.equal(fitLines(t, 10, 1, 4), fitLine(t, 10), t)
  assert.equal(fitLines('abc', 0, 2), '')
  assert.equal(fitLines('abc', 10, 0), '')
})

test('a line cut off at the output cap is skipped, not fatal', () => {
  const rows = rowsFromGrep(`1:0:${texts[0]}\n2:${utf8ByteLength(texts[0]!) + 1}:{"type":"assistant","uuid":"x`)
  assert.equal(rows.length, 1)
})
