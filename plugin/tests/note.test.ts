// The Markdown note read back before it is regenerated (unit 9 of the record-format goal,
// handlers/bookmarks.ts writeExport): a label or tags edited in Obsidian become the record's;
// a note from a build below the floor is regenerated and never adopted. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { applyOp } from '../hooks/core/bookmarks/register-ops.ts'
import { NOTE_WRITER_FLOOR } from '../hooks/core/bookmarks/note.ts'
import { DATA_ROOT, world } from './harness.ts'

const SID = '11111111-2222-4333-8444-555555555555'
const U = 'eeeeeeee-0000-4000-8000-000000000001'
const REGISTER = `${DATA_ROOT}/sessions/${SID}.json`
const NOTE = `${DATA_ROOT}/sessions/${SID}/${U.slice(0, 8)}.md`
const TRANSCRIPT = `C:/test-home/.claude/projects/C--test-project/${SID}.jsonl`
const ROW = JSON.stringify({ type: 'user', uuid: U, message: { role: 'user', content: 'the message the note is about' }, timestamp: '2026-10-17T00:00:00.000Z' })

/** The person's bookmark with its base already set, as the first write by a floor build leaves it. */
function seeded(): string {
  const r = addOrRelabel(emptyRegister(SID, 'bookmarks test', 1), { uuid: U, owner: 'user', label: 'the first label', head: 'the message', by: 'user', source: 'promote', tags: ['a'] }, 2)
  const b = applyOp(r.register, { op: 'noteBase', id: { uuid: U, owner: 'user', n: r.record.n }, base: { label: 'the first label', tags: ['a'] } }, 3)
  if ('error' in b) throw new Error(b.error)
  return serializeRegister(b.register)
}

const note = (writer: string) => [
  '---', 'kind: bookmark-anchor', 'version: 2', `bm-writer: ${writer}`, `session: ${SID}`, `uuid: ${U}`, 'n: 1', 'owners: user', 'tier: bookmark',
  'label: edited in Obsidian', 'tags:', '  - design/records', '  - bm/tier/bookmark', '  - bm/owner/user', '---', '', '# the first label', '',
].join('\n')

async function call($: { tool: { call: (i: never) => Promise<unknown> } }, input: Record<string, unknown>) {
  const out = (await $.tool.call({ tool: 'mcp__bookmarks__bookmark', tool_use_id: 'toolu_test', ...input } as never)) as { result?: string }
  return JSON.parse(out.result ?? '{}') as Record<string, unknown>
}

test('a note edited in Obsidian is read back before the rewrite: the label and tags become the record\'s, the note is regenerated from them, the base follows', async ($, on) => {
  const w = world(on, { session: SID, files: { [REGISTER]: seeded(), [NOTE]: note(`claude-bookmarks ${NOTE_WRITER_FLOOR}`), [TRANSCRIPT]: '' }, process: () => ({ exitCode: 0, stdout: `1:0:${ROW}\n` }) })
  // A relabel that changes only `x` still writes the note (unit 7), which is when the note is read back.
  const out = await call($ as never, { action: 'relabel', uuid: U.slice(0, 8), owner: 'user', meta: { x: { claude: { seen: true } } } })
  expect(out.ok).toBe(true)
  const reg = w.file(REGISTER) ?? ''
  expect(reg).toContain('"label": "edited in Obsidian"')
  expect(reg).toContain('"design/records"')
  expect(reg).not.toContain('"bm/tier/bookmark"')
  expect(reg).toMatch(/"base": \{\s*"label": "edited in Obsidian",\s*"tags": \[\s*"design\/records"\s*\]\s*\}/)
  const md = w.file(NOTE) ?? ''
  expect(md).toContain('\nlabel: edited in Obsidian\n')
  expect(md).toContain('\ntags:\n  - design/records\n  - bm/tier/bookmark\n  - bm/owner/user\n')
  expect(md).toContain('# edited in Obsidian')
  // The tool's answer describes the record as it is after the read-back.
  expect((out.relabelled as { label: string; tags: string[] }).label).toBe('edited in Obsidian')
  expect((out.relabelled as { tags: string[] }).tags).toEqual(['design/records'])
})

test('a note from a build below the floor is regenerated, its edit not adopted', async ($, on) => {
  const w = world(on, { session: SID, files: { [REGISTER]: seeded(), [NOTE]: note('claude-bookmarks 0.5.8'), [TRANSCRIPT]: '' }, process: () => ({ exitCode: 0, stdout: `1:0:${ROW}\n` }) })
  await call($ as never, { action: 'relabel', uuid: U.slice(0, 8), owner: 'user', meta: { x: { claude: { seen: true } } } })
  const reg = w.file(REGISTER) ?? ''
  expect(reg).toContain('"label": "the first label"')
  expect(reg).not.toContain('design/records')
  const md = w.file(NOTE) ?? ''
  expect(md).toContain('\nlabel: the first label\n')
  expect(md).toContain('\ntags:\n  - a\n  - bm/tier/bookmark\n  - bm/owner/user\n')
  expect(md).toContain(`\nbm-writer: `)
  expect(md).not.toContain('edited in Obsidian')
})
