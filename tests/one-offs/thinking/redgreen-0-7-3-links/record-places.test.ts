// node --test tests/core/record-places.test.ts
// A record keyed by its place (the search-pane-and-links design, 2026-10-26, unit U-L): a row
// that is not a prompt or a reply -- a tool call, its output, an agent's message -- has `file`
// and `part` beside its uuid, and `drawn`, the id Claude Code draws it under. A tool call and the
// reply text before it are blocks of one record (one uuid): two places, two records, two notes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anchorHref, anchorPath, exportName, parseAnchor, placeOfRecord } from './anchor.ts'
import { addOrRelabel, emptyRegister, findRecord, idOf, parseRegister, recordsOn, serializeRegister, type Mint, type Register } from './register-file.ts'
import { applyOp } from './register-ops.ts'

const SID = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const T0 = 1_760_000_000_000
const MSG = 'aaaaaaaa-1111-4000-8000-000000000001'
const ROOT = 'C:/data'
const reply: Mint = { uuid: MSG, owner: 'claude', label: 'the reply', head: 'I will run it', by: 'claude', source: 'tool' }
const toolCall: Mint = { uuid: MSG, part: 1, drawn: 'toolu_01AbC', owner: 'claude', label: 'the call', head: 'Bash: npm test', by: 'claude', source: 'tool' }
const agentRow: Mint = { uuid: 'bbbbbbbb-2222-4000-8000-000000000002', file: 'agent:a1', drawn: 'toolu_agent', owner: 'claude', label: 'what the agent found', head: 'loader.ts:51', by: 'claude', source: 'tool' }

function withBoth(): Register {
  let reg = emptyRegister(SID, 'w', T0)
  reg = addOrRelabel(reg, reply, T0 + 1).register
  reg = addOrRelabel(reg, toolCall, T0 + 2).register
  return reg
}

test('a tool call and the reply in the same record are two records; minting either again relabels only its own', () => {
  let reg = withBoth()
  assert.equal(reg.perma.length, 2)
  const r = addOrRelabel(reg, { ...toolCall, label: 'the call, renamed' }, T0 + 3)
  assert.equal(r.added, false)
  reg = r.register
  assert.deepEqual(reg.perma.map(x => [x.label, x.part]), [['the reply', undefined], ['the call, renamed', 1]])
  // The reply minted again (as every link to a reply is, with no part) finds the reply's record.
  assert.equal(addOrRelabel(reg, { ...reply, label: 'the reply, renamed' }, T0 + 4).register.perma[0]!.label, 'the reply, renamed')
})

test('the place and the drawn id are kept in the file, in their order after the uuid, and read back', () => {
  const reg = withBoth()
  const text = serializeRegister(reg)
  const rec = JSON.parse(text).perma[1]
  assert.deepEqual(Object.keys(rec).slice(0, 5), ['n', 'uuid', 'part', 'drawn', 'owner'])
  assert.deepEqual(parseRegister(text)!.perma[1], reg.perma[1])
  assert.equal(JSON.parse(text).perma[0].part, undefined, "a reply's record has no part")
})

test("each place has its own note: the reply's <uuid8>.md, the call's <uuid8>.p1.md, an agent's row <uuid8>.md", () => {
  assert.equal(exportName(MSG), 'aaaaaaaa.md')
  assert.equal(exportName(MSG, { part: 1 }), 'aaaaaaaa.p1.md')
  assert.equal(exportName(agentRow.uuid, { file: 'agent:a1' }), 'bbbbbbbb.md')
  assert.equal(anchorPath(ROOT, SID, MSG, { part: 1 }), `${ROOT}/bookmarks/sessions/${SID}/aaaaaaaa.p1.md`)
})

test("a link names the place: f and p in the URL, the call's note in the path; it reads back", () => {
  const reg = withBoth()
  const call = reg.perma[1]!
  const href = anchorHref(call, ROOT)
  assert.match(href, /\/aaaaaaaa\.p1\.md\?u=aaaaaaaa-1111-4000-8000-000000000001&p=1&/)
  const parsed = parseAnchor(href)!
  assert.deepEqual([parsed.uuid, parsed.part, parsed.file], [MSG, 1, undefined])
  const agentHref = anchorHref({ ...agentRow, sessionId: SID }, ROOT)
  assert.match(agentHref, /&f=agent%3Aa1&/)
  assert.equal(parseAnchor(agentHref)!.file, 'agent:a1')
  // A reply's link is as it always was: no f, no p.
  assert.doesNotMatch(anchorHref(reg.perma[0]!, ROOT), /[?&][fp]=/)
  // An f that names no known kind of file is ignored, not trusted.
  assert.equal(parseAnchor(`file:///C:/data/bookmarks/sessions/${SID}/aaaaaaaa.md?u=${MSG}&f=..%2Fetc&v=1`)!.file, undefined)
})

test('records on a place: the call alone, the reply alone, or every place on the message', () => {
  const reg = withBoth()
  assert.deepEqual(recordsOn(reg, MSG, { part: 1 }).map(r => r.label), ['the call'])
  assert.deepEqual(recordsOn(reg, MSG, {}).map(r => r.label), ['the reply'])
  assert.deepEqual(recordsOn(reg, MSG).map(r => r.label), ['the reply', 'the call'])
})

test("a uuid typed by hand finds the message's record before a tool row's on it; a place finds its own", () => {
  // The tool row first in the file, so the preference is the rule's doing, not the order's.
  let reg = emptyRegister(SID, 'w', T0)
  reg = addOrRelabel(reg, toolCall, T0 + 1).register
  reg = addOrRelabel(reg, reply, T0 + 2).register
  assert.equal(findRecord(reg, MSG)!.label, 'the reply')
  assert.equal(findRecord(reg, MSG.slice(0, 8))!.label, 'the reply')
  assert.equal(findRecord(reg, MSG, undefined, { part: 1 })!.label, 'the call')
})

test("remove, share and claim act on the record they name, never on the other place's", () => {
  const reg = withBoth()
  const call = reg.perma[1]!
  const removed = applyOp(reg, { op: 'remove', id: idOf(call), removedBy: 'test' }, T0 + 9)
  assert.ok(!('error' in removed))
  assert.deepEqual(removed.register.perma.map(r => r.label), ['the reply'])
  const shared = applyOp(reg, { op: 'share', id: idOf(call), to: 'user' }, T0 + 9)
  assert.ok(!('error' in shared))
  assert.deepEqual([shared.record!.owner, shared.record!.part, shared.record!.drawn], ['user', 1, 'toolu_01AbC'])
  const claimed = applyOp(reg, { op: 'claim', id: idOf(call) }, T0 + 9)
  assert.ok(!('error' in claimed))
  assert.deepEqual(claimed.register.perma.map(r => [r.label, r.owner]), [['the reply', 'claude'], ['the call', 'user']])
  assert.deepEqual(placeOfRecord(claimed.record!), { part: 1 })
})
