// node --test tests/core/places-reader.test.ts
// The place reader (the 0.7 groundwork design, 2026-10-25, unit 3): a conversation's files read
// in chunks into places, the rows in memory without their text, the text in pieces, a
// watermark per file, and an index that resumes. The pass that drives it over ports
// (handlers/places.ts) is tested at the end with fake ports over a small conversation:
// a transcript, two agents' files and one stored tool output.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addPlace, conversationFiles, feedFile, headOf, newCursor, newPlaceIndex, parsePlaceIndex, placeKey, seal, serializePlaceIndex, takeSealed, HEAD_CHARS, PIECE_BYTES,
} from './reader.ts'

test('a head is the text with its whitespace runs made one space, cut at HEAD_CHARS, however long the text and wherever the whitespace falls', () => {
  // The definition the head had before it was built from a prefix (0.7.0): normalise the whole, then cut.
  const whole = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, HEAD_CHARS)
  const texts = [
    '', '   ', 'short', '  lead and trail  ',
    'x'.repeat(HEAD_CHARS * 10),
    ' \n\t'.repeat(400) + 'words after a long run of whitespace',  // the first prefix holds no text
    'a b'.repeat(200) + ' '.repeat(2000) + 'tail',
    'y'.repeat(HEAD_CHARS - 1) + '\n\n\n' + 'z'.repeat(50),           // a run at the cut
    'é'.repeat(HEAD_CHARS * 3) + '  ' + '😀'.repeat(10),
  ]
  for (const t of texts) assert.equal(headOf(t), whole(t), JSON.stringify(t.slice(0, 40)))
})
import { startPlacesPass, placesIndex, placesDone, newConversation, PLACES_CHUNK } from './places.ts'
import type { PlacesPorts } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/engine/ports.ts'

const line = (o: unknown) => JSON.stringify(o)
const prompt = (uuid: string, text: string) => line({ type: 'user', uuid, origin: { kind: 'human' }, message: { role: 'user', content: text } })
const reply = (uuid: string, text: string) => line({ type: 'assistant', uuid, message: { role: 'assistant', content: [{ type: 'text', text }] } })
const call = (uuid: string, id: string, name: string) => line({ type: 'assistant', uuid, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input: { q: 1 } }] } })
const result = (uuid: string, id: string, text: string) => line({ type: 'user', uuid, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] } })
const noise = line({ type: 'attachment', uuid: 'n-1', attachment: { type: 'hook_success' } })

test('a file fed in chunks of any size yields the same places, a line split across chunks taken once', () => {
  const file = [prompt('p1', 'find the loader'), noise, reply('r1', 'here it is'), call('c1', 'toolu_1', 'Grep'), result('t1', 'toolu_1', 'loader.ts')].join('\n') + '\n'
  for (const size of [3, 17, 64, file.length]) {
    const idx = newPlaceIndex('s')
    const cur = newCursor('', 'main.jsonl', { session: 's' })
    for (let i = 0; i < file.length; i += size) feedFile(idx, cur, file.slice(i, i + size), i + size >= file.length)
    assert.deepEqual(idx.rows.map(r => r.kind), ['prompt', 'reply', 'tool-call', 'tool-result'], `chunk size ${size}`)
    assert.deepEqual(idx.skipped, { 'attachment:hook_success': 1 })
    assert.equal(cur.bytes, Buffer.byteLength(file), 'the watermark is the whole file')
    assert.equal(cur.done, true)
  }
})

test("a row holds the place's head, not its text; the text is in the piece the row names", () => {
  const idx = newPlaceIndex('s')
  const long = 'x'.repeat(500)
  addPlace(idx, { at: { session: 's', uuid: 'u' }, kind: 'reply', author: 'claude', text: long })
  const row = idx.rows[0]!
  assert.equal('text' in row, false)
  assert.equal(row.head.length, 160)
  assert.equal(row.bytes, 500)
  assert.equal(row.piece, 0)
  assert.deepEqual(JSON.parse(idx.open.lines[0]!), { k: placeKey(row.at), t: long })
})

test('the text is cut into pieces under the piece size; sealed pieces leave memory when taken', () => {
  const idx = newPlaceIndex('s')
  const big = 'y'.repeat(1_200_000)
  for (let i = 0; i < 4; i++) addPlace(idx, { at: { session: 's', uuid: `u${i}` }, kind: 'tool-result', author: 'tool', text: big })
  assert.deepEqual(idx.rows.map(r => r.piece), [0, 0, 1, 1], 'two 1.2 MB texts per 3.5 MB piece')
  const sealed = takeSealed(idx)
  assert.deepEqual(sealed.map(s => s.n), [0])
  assert.ok(Buffer.byteLength(sealed[0]!.text) <= PIECE_BYTES)
  assert.deepEqual(takeSealed(idx), [], 'taken once')
  seal(idx)
  assert.deepEqual(takeSealed(idx).map(s => s.n), [1])
})

test('a place already kept is not kept twice; the same uuid in another file is another place', () => {
  const idx = newPlaceIndex('s')
  assert.equal(addPlace(idx, { at: { session: 's', uuid: 'u' }, kind: 'reply', author: 'claude', text: 'a' }), true)
  assert.equal(addPlace(idx, { at: { session: 's', uuid: 'u' }, kind: 'reply', author: 'claude', text: 'a' }), false)
  assert.equal(addPlace(idx, { at: { session: 's', uuid: 'u', file: 'agent:x' }, kind: 'reply', author: 'agent', text: 'a' }), true)
  assert.equal(idx.rows.length, 2)
})

test("a continued-in row names the session the conversation goes on in", () => {
  const idx = newPlaceIndex('s')
  feedFile(idx, newCursor('', 'm', { session: 's' }), line({ type: 'continued-in', continuedInSessionId: 's2', sessionId: 's' }) + '\n', true)
  assert.deepEqual(idx.continuedIn, ['s2'])
})

test("a conversation's other files: agents' transcripts with their meta, and stored outputs", () => {
  const f = conversationFiles('C:\\p\\s1', [
    { name: 'agent-b2.jsonl', kind: 'file' }, { name: 'agent-b2.meta.json', kind: 'file' }, { name: 'agent-a1.jsonl', kind: 'file' }, { name: 'notes', kind: 'dir' },
  ], [{ name: 'x9.txt', kind: 'file' }, { name: 'archive', kind: 'dir' }])
  assert.deepEqual(f.agents, [
    { id: 'a1', path: 'C:/p/s1/subagents/agent-a1.jsonl', meta: 'C:/p/s1/subagents/agent-a1.meta.json' },
    { id: 'b2', path: 'C:/p/s1/subagents/agent-b2.jsonl', meta: 'C:/p/s1/subagents/agent-b2.meta.json' },
  ])
  assert.deepEqual(f.results, [{ name: 'x9.txt', path: 'C:/p/s1/tool-results/x9.txt' }])
})

// From the unit 3 mutation sweep (tests/mutation/v0.7.0__sweep__unit3-reader.md).
test('a line longer than the carry cap is dropped and counted; the watermark still covers it, and the next line is read', () => {
  const idx = newPlaceIndex('s')
  const cur = newCursor('', 'm', { session: 's' })
  const long = prompt('big', 'z'.repeat(200))
  const after = reply('r9', 'after the long line')
  const file = `${long}\n${after}\n`
  // Chunks of 50 bytes with a cap of 150: the long line (about 280 bytes) is carried past the
  // cap mid-way; the line after it (about 115 bytes) fits under the cap.
  assert.ok(long.length > 150 && after.length < 150)
  for (let i = 0; i < file.length; i += 50) feedFile(idx, cur, file.slice(i, i + 50), i + 50 >= file.length, 150)
  assert.equal(idx.dropped, 1)
  assert.equal(idx.unparsed, 0, "the dropped line's tail is swallowed, not read as a broken line")
  assert.deepEqual(idx.rows.map(r => r.at.uuid), ['r9'], 'the line after the dropped one is a place')
  assert.equal(cur.bytes, Buffer.byteLength(file))
  assert.equal(cur.line, 2)
})

test('a partial line exactly at the carry cap is carried, not dropped', () => {
  const idx = newPlaceIndex('s')
  const cur = newCursor('', 'm', { session: 's' })
  const line = prompt('p5', 'fits')
  feedFile(idx, cur, line, false, line.length)
  feedFile(idx, cur, '\n', true, line.length)
  assert.equal(idx.dropped, 0)
  assert.deepEqual(idx.rows.map(r => r.at.uuid), ['p5'])
})

test("a row's head is the text on one line: runs of whitespace and newlines become one space, the ends trimmed", () => {
  const idx = newPlaceIndex('s')
  addPlace(idx, { at: { session: 's', uuid: 'h' }, kind: 'reply', author: 'claude', text: '  first line\n\n\tsecond   line  ' })
  assert.equal(idx.rows[0]!.head, 'first line second line')
})

test('the rows are saved in pieces no larger than the piece size', () => {
  const idx = newPlaceIndex('s')
  for (let i = 0; i < 16_000; i++) addPlace(idx, { at: { session: 's', uuid: `u-${i}` }, kind: 'reply', author: 'claude', text: 'w'.repeat(200) })
  const [, ...rows] = serializePlaceIndex(idx, [])
  assert.ok(rows.length >= 2, `${rows.length} piece(s)`)
  for (const r of rows) assert.ok(Buffer.byteLength(r) <= PIECE_BYTES, `a piece of ${Buffer.byteLength(r)} bytes`)
  assert.equal(rows.reduce((n, r) => n + r.split('\n').length, 0), 16_000)
})

test("an index of another version or another conversation is rebuilt, whatever its pieces hold", () => {
  const idx = newPlaceIndex('s')
  const cur = newCursor('', 'main.jsonl', { session: 's' })
  feedFile(idx, cur, prompt('p1', 'one') + '\n', true)
  const [header, ...rows] = serializePlaceIndex(idx, [cur])
  const open = idx.open.lines.join('\n')
  assert.deepEqual(parsePlaceIndex(header, rows, open, 'other'), { kind: 'rebuild', why: 'another conversation' })
  const v2 = JSON.stringify({ ...JSON.parse(header!), version: 2 })
  assert.equal(parsePlaceIndex(v2, rows, open, 's').kind, 'rebuild')
})

test('a conversation that continues in another session file is read on into it, once, and the pass finishes', async () => {
  const files = conversation()
  files.set('C:/proj/s1.jsonl', files.get('C:/proj/s1.jsonl')! + line({ type: 'continued-in', continuedInSessionId: 's2', sessionId: 's1' }) + '\n')
  files.set('C:/proj/s2.jsonl', prompt('q1', 'carried on here') + '\n')
  await runPass(files)
  assert.equal(placesDone(), true)
  const rows = placesIndex()!.rows.filter(r => r.at.uuid === 'q1')
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.at.session, 's2', "the continued file's places carry their own session")
})

test('the index saved and read back gives the same rows and the open piece to append to', () => {
  const idx = newPlaceIndex('s')
  const cur = newCursor('', 'main.jsonl', { session: 's' })
  feedFile(idx, cur, [prompt('p1', 'one'), reply('r1', 'two')].join('\n') + '\n', true)
  const [header, ...rows] = serializePlaceIndex(idx, [cur])
  const back = parsePlaceIndex(header, rows, idx.open.lines.join('\n'), 's')
  assert.equal(back.kind, 'ok')
  if (back.kind !== 'ok') return
  assert.deepEqual(back.idx.rows, idx.rows)
  assert.equal(back.saved.files['']!.bytes, cur.bytes)
  assert.deepEqual(back.idx.open.lines, idx.open.lines)
  assert.equal(parsePlaceIndex(header, rows, undefined, 'other').kind, 'rebuild', 'another conversation')
  assert.equal(parsePlaceIndex(header, [], undefined, 's').kind, 'rebuild', 'a missing piece')
})

// The pass, over fake ports: files in a map, a chunk reader that behaves as the real program
// does (up to PLACES_CHUNK bytes from an offset; a shorter read is the file's end, which is how
// the pass knows a file is done), and a clock that runs the next tick at once. Splitting a file
// across chunks is the reader's, tested above with chunks of every size.
function fakePorts(files: Map<string, string>, chunk = PLACES_CHUNK): { ports: PlacesPorts; logs: string[]; reads: string[] } {
  const logs: string[] = []
  const reads: string[] = []
  const queue: (() => void)[] = []
  const ports: PlacesPorts = {
    sessionId: async () => 's1',
    transcriptPath: async () => 'C:/proj/s1.jsonl',
    fileSize: async p => (files.has(p) ? Buffer.byteLength(files.get(p)!) : undefined),
    readChunk: async (p, offset) => {
      reads.push(`${p}@${offset}`)
      const bytes = Buffer.from(files.get(p) ?? '')
      const want = Math.max(0, Math.min(chunk, bytes.length - offset))
      return { stdout: bytes.subarray(offset, offset + want).toString(), via: 'sh' }
    },
    fsList: async dir => [...files.keys()].filter(k => k.startsWith(dir + '/') && !k.slice(dir.length + 1).includes('/')).map(k => ({ name: k.slice(dir.length + 1), kind: 'file' })),
    dataRoot: async () => 'C:/data',
    fsExists: async p => files.has(p) || [...files.keys()].some(k => k.startsWith(p + '/')),
    fsRead: async p => files.get(p) ?? '',
    fsWrite: async (p, t) => { files.set(p, t) },
    after: (_ms, fn) => { queue.push(fn); return { cancel: () => {} } },
    log: l => logs.push(l),
  }
  // Bounded: a pass that never finishes (a file queued again and again) fails here instead of hanging the run.
  const drain = async () => {
    for (let ticks = 0; queue.length; ticks++) {
      if (ticks > 500) throw new Error('the pass did not finish within 500 ticks')
      queue.shift()!()
      await new Promise(r => setTimeout(r, 0))
    }
  }
  return { ports: Object.assign(ports, { drain }), logs, reads }
}

function conversation(): Map<string, string> {
  return new Map([
    ['C:/proj/s1.jsonl', [prompt('p1', 'search the agents'), call('c1', 'toolu_a', 'Agent'), result('t1', 'toolu_a', 'Output too large, see tool-results/big1.txt'), reply('r1', 'the oracle found it')].join('\n') + '\n'],
    ['C:/proj/s1/subagents/agent-a1.jsonl', [line({ type: 'user', uuid: 'd1', isSidechain: true, message: { role: 'user', content: 'trace the loader' } }), line({ type: 'assistant', uuid: 'e1', isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: 'loader.ts:51' }] } })].join('\n') + '\n'],
    ['C:/proj/s1/subagents/agent-a1.meta.json', JSON.stringify({ agentType: 'oracle', toolUseId: 'toolu_a' })],
    ['C:/proj/s1/subagents/agent-b2.jsonl', line({ type: 'assistant', uuid: 'f1', isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: 'no meta here' }] } }) + '\n'],
    ['C:/proj/s1/tool-results/big1.txt', 'the whole large output'],
  ])
}

async function runPass(files: Map<string, string>) {
  newConversation()
  const f = fakePorts(files)
  await startPlacesPass(f.ports)
  await (f.ports as unknown as { drain: () => Promise<void> }).drain()
  return f
}

test('the pass reads the transcript, every agent file and the stored outputs, each place under its own address', async () => {
  const files = conversation()
  await runPass(files)
  assert.equal(placesDone(), true)
  const idx = placesIndex()!
  const by = (uuid: string) => idx.rows.find(r => r.at.uuid === uuid)!
  assert.deepEqual(by('p1').at, { session: 's1', uuid: 'p1' })
  assert.deepEqual([by('d1').kind, by('d1').author, by('d1').at.file, by('d1').agent], ['prompt', 'claude', 'agent:a1', { id: 'a1', type: 'oracle', call: 'toolu_a' }], "the agent's meta names its type and the Agent call that started it")
  assert.deepEqual([by('e1').author, by('e1').agent?.type], ['agent', 'oracle'])
  assert.deepEqual(by('f1').agent, { id: 'b2' }, 'an agent with no meta file still has its id')
  assert.deepEqual([by('big1.txt').kind, by('big1.txt').at.file], ['tool-result', 'tool-result:big1.txt'])
  assert.equal(idx.rows.length, 8)
  // The text is on disk, under the data root, findable by the row's key.
  const text = [...files.entries()].filter(([k]) => k.startsWith('C:/data/bookmarks/places/s1/text.')).map(([, v]) => v).join('\n')
  assert.ok(text.includes('"t":"the whole large output"'))
  assert.ok(files.has('C:/data/bookmarks/places/s1/index.json'))
})

test("the status line counts a finished pass's time, not zero", async () => {
  const files = conversation()
  const before = Date.now
  let now = 1_000
  Date.now = () => now
  try {
    newConversation()
    const f = fakePorts(files)
    await startPlacesPass(f.ports)
    now += 2_500
    await (f.ports as unknown as { drain: () => Promise<void> }).drain()
    now += 60_000
    const { placesStatus } = await import('./places.ts')
    assert.match(placesStatus(), /, 2500 ms, done/)
  } finally {
    Date.now = before
  }
})

test('a second pass resumes from the saved watermarks: it reads only what was added since', async () => {
  const files = conversation()
  await runPass(files)
  files.set('C:/proj/s1.jsonl', files.get('C:/proj/s1.jsonl')! + prompt('p2', 'one more') + '\n')
  const second = await runPass(files)
  assert.ok(second.logs.some(l => l.includes('resuming with 8 places')), second.logs.join('\n'))
  const mainReads = second.reads.filter(r => r.startsWith('C:/proj/s1.jsonl@')).map(r => Number(r.split('@')[1]))
  assert.ok(mainReads[0]! > 0, `the transcript is read from its watermark, not from byte 0 (${mainReads})`)
  assert.ok(placesIndex()!.rows.some(r => r.at.uuid === 'p2'))
  assert.equal(placesIndex()!.rows.length, 9)
})

test('a file shorter than its watermark (rewritten) means the index is rebuilt from the start', async () => {
  const files = conversation()
  await runPass(files)
  files.set('C:/proj/s1.jsonl', prompt('p9', 'a new start') + '\n')
  const again = await runPass(files)
  assert.ok(again.logs.some(l => l.includes('index rebuilt')), again.logs.join('\n'))
  assert.ok(placesIndex()!.rows.some(r => r.at.uuid === 'p9'))
  assert.equal(placesIndex()!.rows.some(r => r.at.uuid === 'p1'), false)
})
