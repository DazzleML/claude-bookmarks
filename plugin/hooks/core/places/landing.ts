// Where a jump to a place lands (the 0.7 groundwork design, 2026-10-25, unit 5).
//
// A link always names the exact row (the address). Where the view goes is a separate question,
// answered through the capability table (engine/select.ts `jump.toolRow`, `jump.agentRow`):
// Claude Code scrolls to a prompt or a reply, but whether it can scroll to a tool call, its
// output or a thinking block -- rows it draws under other ids -- or into an agent's own
// conversation is not measured yet. So by default a jump lands on the message the row belongs
// to:
//   - a row of the main transcript that is not a message: the last prompt or reply before it;
//   - a row of an agent's conversation: the message before the Agent call that started it
//     (its meta.json's toolUseId), else the agent's report in the main transcript;
//   - a stored tool output: the message before the tool result that names its file.
// When nothing in the main transcript can be found, the landing says so and the caller opens
// the place's export instead.
//
// Pure: it reads the place reader's rows (core/places/reader.ts).
import type { IndexedPlace } from './reader.ts'

export type Landing =
  /** Scroll to this row itself: it is a message, or the build can scroll to rows of its kind. */
  | { on: 'row'; uuid: string }
  /** Scroll to this message, which the row belongs to; `why` says what the row is, for a toast. */
  | { on: 'message'; uuid: string; why: string }
  /** Nothing in the main transcript to land on: open the place's export instead. */
  | { on: 'outside'; why: string }

/** Which routes this build has (from the capability table's chosen paths). */
export type LandingRoutes = { toolRow: boolean; agentRow: boolean }
export const STOCK_ROUTES: LandingRoutes = { toolRow: false, agentRow: false }

const MESSAGE_KINDS = new Set(['prompt', 'reply'])
const isMain = (r: IndexedPlace) => r.at.file === undefined
// A reply that is one block of several in its record (thinking, then text) is still a message:
// Claude Code scrolls to the record's uuid, which the blocks share (found by the unit's red-green
// audit, 2026-10-25: the part was excluded at first, sending such a reply to the message before it).
const isMessage = (r: IndexedPlace) => isMain(r) && MESSAGE_KINDS.has(r.kind)

/** The last message of the main transcript at or before row `i` (rows are in file order within the main file). */
function messageBefore(rows: readonly IndexedPlace[], i: number): IndexedPlace | undefined {
  for (let j = i; j >= 0; j--) {
    const r = rows[j]!
    if (isMessage(r)) return r
  }
  return undefined
}

function describe(r: IndexedPlace): string {
  if (r.kind === 'tool-call') return r.tool ? `the ${r.tool} call` : 'a tool call'
  if (r.kind === 'tool-result') return 'the output of a tool call'
  if (r.kind === 'thinking') return 'a thinking block'
  return `${/^[aeiou]/.test(r.kind) ? 'an' : 'a'} ${r.kind}`
}

/** Where a jump to `rows[i]` lands. */
export function landingFor(rows: readonly IndexedPlace[], i: number, routes: LandingRoutes = STOCK_ROUTES): Landing {
  const target = rows[i]
  if (!target) return { on: 'outside', why: 'no such place' }
  if (isMessage(target)) return { on: 'row', uuid: target.at.uuid }

  if (isMain(target)) {
    if (routes.toolRow) return { on: 'row', uuid: target.at.uuid }
    const m = messageBefore(rows, i)
    return m ? { on: 'message', uuid: m.at.uuid, why: `${describe(target)}, in this turn` } : { on: 'outside', why: `${describe(target)} before the first message` }
  }

  const file = target.at.file!
  if (file.startsWith('agent:')) {
    if (routes.agentRow) return { on: 'row', uuid: target.at.uuid }
    const agent = target.agent
    const name = agent?.type ? `the ${agent.type} agent's conversation` : "an agent's conversation"
    const call = agent?.call ? rows.findIndex(r => isMain(r) && r.kind === 'tool-call' && r.toolUseId === agent.call) : -1
    if (call >= 0) {
      const m = messageBefore(rows, call)
      if (m) return { on: 'message', uuid: m.at.uuid, why: `inside ${name}, started here` }
    }
    const report = agent ? rows.findIndex(r => isMain(r) && r.kind === 'agent-report' && r.agent?.id === agent.id) : -1
    if (report >= 0) return { on: 'row', uuid: rows[report]!.at.uuid }
    return { on: 'outside', why: `inside ${name}, which has no message here to land on` }
  }

  if (file.startsWith('tool-result:')) {
    // The tool result that refers to the stored file, in any file of the conversation (an
    // agent's outputs are stored the same way: 28 of 33 in one conversation, 2026-10-25), and
    // the landing that row would have.
    const name = file.slice('tool-result:'.length)
    const named = rows.findIndex(r => r.kind === 'tool-result' && r.stored === name && !r.at.file?.startsWith('tool-result:'))
    if (named >= 0) {
      const l = landingFor(rows, named, routes)
      if (l.on !== 'outside') return l.on === 'message' ? { ...l, why: `a stored tool output: ${l.why}` } : l
    }
    return { on: 'outside', why: 'a stored tool output no row refers to' }
  }

  return { on: 'outside', why: `a place in ${file}` }
}
