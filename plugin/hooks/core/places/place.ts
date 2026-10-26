// What a place in a conversation is (the 0.7 groundwork design, 2026-10-25, unit 2;
// private/claude/2026-10-25__09-42-49__dev-workflow-process__places-search-and-tabs-the-0-7-groundwork.md).
//
// A place is any row a person might search, star, link to or list: a prompt, a reply, a
// thinking block, a tool call, its output, another session's message, an agent's report,
// a notice, an event (a compaction, a slash command, a file Claude edited). Every one has an
// identity in the transcript (measured: 12,384 of 12,384 tool calls carry an id; every row
// carries a uuid), so one address names any of them:
//
//   { session, uuid }                 a row in the conversation's main transcript
//   { session, uuid, file }           a row in another file of the conversation
//                                     (`agent:<agentId>`, `tool-result:<name>`)
//   ... part                          which block, when one record holds several
//
// The main transcript is the default: a record minted before 0.7 carries `(session, uuid)`
// and means exactly what it meant (the design's P4: additive, no migration).
//
// The attributes a search scope filters on (kind, author, agent, tool, category, failed) are
// derived here from the row when it is read, never stored in a record: they are what the row
// IS, and a scope is how it is SHOWN (claude-session-logger's line, adopted by the scope
// design 2026-10-25__20-22-46). Bookkeeping records (about 70% of a transcript's lines:
// hook results, reminders, listings, request copies) are skipped with a named reason, so a
// reader can reconcile classified + skipped = every line; a message block of a kind this file
// does not know becomes `other`, never dropped.
//
// Pure: no engine, no state.
import { footnoteOf, promptTextOf } from '../prompts/prompt-rows.ts'

export type PlaceKind =
  | 'prompt' | 'reply' | 'thinking' | 'tool-call' | 'tool-result'
  | 'agent-message' | 'agent-report' | 'notice' | 'event' | 'other'

/** Who wrote the row: the scope toggles' "you, Claude, sessions, agents, tools, notices". */
export type Author = 'person' | 'claude' | 'agent' | 'session' | 'tool' | 'engine'

/** Which group a tool belongs to, so a scope can name tools by kind as well as by name. */
export type ToolCategory = 'shell' | 'files' | 'search' | 'web' | 'agents' | 'skills' | 'tasks' | 'mcp' | 'other'

export type PlaceAddress = {
  session: string
  uuid: string
  /** Absent for the main transcript; `agent:<agentId>` or `tool-result:<name>` otherwise. */
  file?: string
  /** The block's index among the places one record yields, when it yields more than one. */
  part?: number
}

export type Place = {
  at: PlaceAddress
  kind: PlaceKind
  author: Author
  text: string
  timestamp?: string
  /** Set on every place read from an agent's file, and on another session's or agent's message here. `call` is the id of the Agent call in the main transcript that started it (its meta.json's toolUseId). */
  agent?: { id: string; type?: string; call?: string }
  /** For a peer message: the sending session's or agent's name (`origin.name`). */
  from?: string
  tool?: string
  category?: ToolCategory
  /** A tool call's id, or the call a tool result answers: the join between the two. */
  toolUseId?: string
  failed?: boolean
  /** For a tool result too large for the transcript: the name of the file under `tool-results/` that holds it whole (the record's `toolUseResult.persistedOutputPath`). */
  stored?: string
  /** For an event: what happened (`compact_boundary`, `local_command`, `edited_text_file`, `command`, ...). */
  event?: string
}

/** Where a record was read from: the conversation, the file, and the agent when the file is an agent's. */
export type RowContext = { session: string; file?: string; agent?: { id: string; type?: string; call?: string } }

export type Classified = { places: Place[] } | { skipped: string }

const CATEGORY: Readonly<Record<string, ToolCategory>> = {
  Bash: 'shell', PowerShell: 'shell', BashOutput: 'shell', KillShell: 'shell', Monitor: 'shell',
  Read: 'files', Write: 'files', Edit: 'files', MultiEdit: 'files', NotebookEdit: 'files',
  Glob: 'search', Grep: 'search', ToolSearch: 'search',
  WebFetch: 'web', WebSearch: 'web',
  Agent: 'agents', Task: 'agents', SendMessage: 'agents', SubagentHandback: 'agents', ListAgents: 'agents',
  Skill: 'skills',
  TodoWrite: 'tasks', TaskCreate: 'tasks', TaskUpdate: 'tasks', TaskList: 'tasks', TaskGet: 'tasks', TaskOutput: 'tasks', TaskStop: 'tasks',
}

/** A tool's group: `mcp__...` tools are MCP; a name this table does not know is `other`. */
export function categoryOf(tool: string): ToolCategory {
  if (tool.startsWith('mcp__')) return 'mcp'
  return CATEGORY[tool] ?? 'other'
}

/** System rows that are events a person can see and might look for; the rest are bookkeeping. */
const SYSTEM_EVENTS = new Set(['compact_boundary', 'local_command', 'away_summary', 'turn_duration'])
/** Attachments that are events; `queued_command` is handled as a prompt or a notice. */
const ATTACHMENT_EVENTS = new Set(['edited_text_file', 'goal_status'])

const NOTICE = /^\s*(<task-notification>|\[SYSTEM NOTIFICATION)/
/** The output of the person's own `!` shell command or slash command: the event after the footnote it answers (37 in one conversation, 2026-10-25). */
const COMMAND_OUTPUT = /^\s*<(bash-stdout|bash-stderr|local-command-stdout|local-command-stderr)>/

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? '')).join('\n')
  return ''
}

/** What one transcript record is: its places, or why it is skipped. */
export function classifyRecord(o: any, ctx: RowContext): Classified {
  const t = o?.type
  if (typeof o?.uuid !== 'string') return { skipped: `type:${t ?? 'none'}` }
  const at = (part?: number): PlaceAddress => ({ session: ctx.session, uuid: o.uuid, ...(ctx.file ? { file: ctx.file } : {}), ...(part !== undefined ? { part } : {}) })
  const base = { ...(typeof o.timestamp === 'string' ? { timestamp: o.timestamp } : {}), ...(ctx.agent ? { agent: ctx.agent } : {}) }
  const one = (p: Omit<Place, 'at'>): Classified => ({ places: [{ at: at(), ...base, ...p }] })

  if (t === 'system') {
    const sub = String(o.subtype ?? '')
    if (!SYSTEM_EVENTS.has(sub)) return { skipped: `system:${sub || 'none'}` }
    return one({ kind: 'event', author: 'engine', event: sub, text: typeof o.content === 'string' ? o.content : '' })
  }

  if (t === 'attachment') {
    const a = o.attachment ?? {}
    if (a.type === 'queued_command') {
      const prompt = promptTextOf(o)
      if (prompt !== undefined) return one({ kind: 'prompt', author: 'person', text: prompt })
      if (typeof a.prompt === 'string' && NOTICE.test(a.prompt)) return one({ kind: 'notice', author: 'engine', text: a.prompt })
      return { skipped: 'attachment:queued_command' }
    }
    if (ATTACHMENT_EVENTS.has(a.type)) {
      const text = a.type === 'edited_text_file' ? String(a.filename ?? '') : String(a.condition ?? '')
      return one({ kind: 'event', author: 'engine', event: a.type, text })
    }
    return { skipped: `attachment:${a.type ?? 'none'}` }
  }

  if (t === 'user') {
    const content = o.message?.content
    if (o.isCompactSummary) return one({ kind: 'event', author: 'engine', event: 'compaction', text: textOf(content) })
    if (Array.isArray(content) && content.some((b: any) => b?.type === 'tool_result')) {
      const results = content.filter((b: any) => b?.type === 'tool_result')
      // A result too large for the transcript is kept whole in a file beside it; the record says
      // which (measured 2026-10-25: the inline text names it only after a long path).
      // An older form names the file only in the text ("Full output saved to: <path>").
      const persisted = o.toolUseResult?.persistedOutputPath
      const storedOf = (text: string): { stored?: string } => {
        const path = typeof persisted === 'string' && persisted ? persisted : /Full output saved to: ([^\r\n]+)/.exec(text)?.[1]?.trim()
        return path ? { stored: path.split(/[\\/]/).pop()! } : {}
      }
      return {
        places: results.map((b: any, i: number) => ({
          at: at(results.length > 1 ? i : undefined), ...base,
          kind: 'tool-result' as const, author: 'tool' as const, text: textOf(b.content),
          ...(typeof b.tool_use_id === 'string' ? { toolUseId: b.tool_use_id } : {}),
          ...(b.is_error === true ? { failed: true } : {}),
          ...storedOf(textOf(b.content)),
        })),
      }
    }
    const text = textOf(content)
    if (o.origin?.kind === 'peer') {
      const from = typeof o.origin.name === 'string' ? { from: o.origin.name } : {}
      const sender = typeof o.origin.from === 'string' ? o.origin.from : undefined
      if (o.origin.handback === true) return one({ kind: 'agent-report', author: 'agent', text, ...from, ...(sender ? { agent: { id: sender } } : {}) })
      return one({ kind: 'agent-message', author: 'session', text, ...from })
    }
    const prompt = promptTextOf(o)
    if (prompt !== undefined) return one({ kind: 'prompt', author: 'person', text: prompt })
    if (NOTICE.test(text)) return one({ kind: 'notice', author: 'engine', text })
    const footnote = footnoteOf(o)
    if (footnote) return one({ kind: 'event', author: 'person', event: footnote.kind, text: footnote.label })
    const output = COMMAND_OUTPUT.exec(text)
    if (output) return one({ kind: 'event', author: 'engine', event: output[1]!.startsWith('bash') ? 'shell-output' : 'command-output', text })
    // In an agent's file the opening user row is the dispatch: the main conversation's Claude
    // wrote it to the agent. promptTextOf refuses it (a sidechain row is never the person's).
    if (ctx.agent && !o.isMeta && text.trim() !== '') return one({ kind: 'prompt', author: 'claude', text })
    if (o.isMeta) return { skipped: 'user:meta' }
    return text.trim() === '' ? { skipped: 'user:empty' } : one({ kind: 'other', author: 'person', text })
  }

  if (t === 'assistant') {
    const blocks: any[] = Array.isArray(o.message?.content) ? o.message.content : []
    const author: Author = ctx.agent ? 'agent' : 'claude'
    const found: Omit<Place, 'at'>[] = []
    for (const b of blocks) {
      if (b?.type === 'text') { if (String(b.text ?? '').trim() !== '') found.push({ kind: 'reply', author, text: String(b.text) }) }
      else if (b?.type === 'thinking') { if (String(b.thinking ?? '').trim() !== '') found.push({ kind: 'thinking', author, text: String(b.thinking) }) }
      else if (b?.type === 'tool_use') {
        const tool = String(b.name ?? '')
        found.push({ kind: 'tool-call', author, tool, category: categoryOf(tool), text: JSON.stringify(b.input ?? {}), ...(typeof b.id === 'string' ? { toolUseId: b.id } : {}) })
      } else if (b?.type !== 'redacted_thinking') found.push({ kind: 'other', author, text: textOf([b]) })
    }
    if (found.length === 0) return { skipped: 'assistant:empty' }
    return { places: found.map((p, i) => ({ at: at(found.length > 1 ? i : undefined), ...base, ...p })) }
  }

  return { skipped: `type:${t ?? 'none'}` }
}

/** Two addresses name the same place: same conversation, same file (absent = main), same uuid, same part. */
export function samePlace(a: PlaceAddress, b: PlaceAddress): boolean {
  return a.session === b.session && a.uuid === b.uuid && (a.file ?? '') === (b.file ?? '') && (a.part ?? 0) === (b.part ?? 0)
}

/** The file part of an address, for a place in an agent's conversation: `agent:<id>` names it. */
export const agentFile = (agentId: string): string => `agent:${agentId}`
