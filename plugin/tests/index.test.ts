// The index of every conversation with bookmarks (unit 10 of the record-format goal,
// handlers/bookmarks.ts rebuildIndex and refreshIndex): built from every register at a
// session's start, the conversation's entry upserted after each save. Run: claude plugin test plugin
import { expect, test } from 'claude-code/testing'
import { addOrRelabel, emptyRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { DATA_ROOT, world } from './harness.ts'

type Engine = { session: { start: (i: object) => Promise<unknown> }; tool: { call: (i: never) => Promise<unknown> } }
const SID = '11111111-2222-4333-8444-555555555555'
const OTHER = '22222222-2222-4333-8444-555555555555'
const U = 'eeeeeeee-0000-4000-8000-000000000001'
const REGISTER = (sid: string) => `${DATA_ROOT}/sessions/${sid}.json`
const INDEX_JSON = `${DATA_ROOT}/sessions/index.json`
const INDEX_MD = `${DATA_ROOT}/sessions/INDEX.md`
const TRANSCRIPT = `C:/test-home/.claude/projects/C--test-project/${SID}.jsonl`
const ROW = JSON.stringify({ type: 'user', uuid: U, message: { role: 'user', content: 'the message the index lists' }, timestamp: '2026-10-17T00:00:00.000Z' })

function seeded(sid: string, label: string, title: string, at: number): string {
  const reg = { ...emptyRegister(sid, 'bookmarks test', at), title, project: 'test-project' }
  return serializeRegister(addOrRelabel(reg, { uuid: U, owner: 'user', label, head: label, by: 'user', source: 'promote' }, at + 1).register)
}
const start = ($: unknown) => ($ as Engine).session.start({ cwd: 'C:/test-project', surface: 'terminal', isInteractive: true })

test('a start rebuilds the index from every register: both files, newest conversation first, a link only where the note exists', async ($, on) => {
  const w = world(on, {
    session: SID,
    files: {
      [REGISTER(SID)]: seeded(SID, 'the first', 'the opened one', 1_000),
      [REGISTER(OTHER)]: seeded(OTHER, 'elsewhere', 'another conversation', 2_000),
      [`${DATA_ROOT}/sessions/${SID}/${U.slice(0, 8)}.md`]: '# a note\n',
    },
  })
  await start($)
  const idx = JSON.parse(w.file(INDEX_JSON) ?? '{}') as { version: number; sessions: { sessionId: string; title: string; records: { label: string; note: boolean }[] }[] }
  expect(idx.version).toBe(1)
  expect(idx.sessions.map(s => s.sessionId)).toEqual([OTHER, SID])
  expect(idx.sessions[1]!.records[0]!.note).toBe(true)
  expect(idx.sessions[0]!.records[0]!.note).toBe(false)
  const md = w.file(INDEX_MD) ?? ''
  expect(md).toContain('\n## another conversation -- test-project\n')
  expect(md).toContain(`- #1 [the first](${SID}/${U.slice(0, 8)}.md) · yours · bookmark\n`)
  expect(md).toContain('- #1 elsewhere · yours · bookmark\n')
  expect(md.indexOf('## another conversation')).toBeLessThan(md.indexOf('## the opened one'))
})

test('a save upserts the conversation\'s entry: the new label and rev in both files, the other conversation kept', async ($, on) => {
  const w = world(on, {
    session: SID,
    files: {
      [REGISTER(SID)]: seeded(SID, 'the first', 'the opened one', 1_000),
      [REGISTER(OTHER)]: seeded(OTHER, 'elsewhere', 'another conversation', 2_000),
      [TRANSCRIPT]: '',
    },
    process: () => ({ exitCode: 0, stdout: `1:0:${ROW}\n` }),
  })
  await start($)
  await ($ as Engine).tool.call({ tool: 'mcp__bookmarks__bookmark', tool_use_id: 'toolu_test', action: 'relabel', uuid: U.slice(0, 8), owner: 'user', label: 'renamed by the tool' } as never)
  const idx = JSON.parse(w.file(INDEX_JSON) ?? '{}') as { sessions: { sessionId: string; rev: number; records: { label: string; note: boolean }[] }[] }
  const mine = idx.sessions.find(s => s.sessionId === SID)!
  expect(mine.records[0]!.label).toBe('renamed by the tool')
  expect(mine.records[0]!.note).toBe(true)
  expect(mine.rev).toBe(JSON.parse(w.file(REGISTER(SID))!).rev)
  expect(idx.sessions.some(s => s.sessionId === OTHER)).toBe(true)
  expect(idx.sessions.map(s => s.sessionId)[0]).toBe(SID)
  expect(w.file(INDEX_MD)).toContain(`[renamed by the tool](${SID}/${U.slice(0, 8)}.md)`)
})
