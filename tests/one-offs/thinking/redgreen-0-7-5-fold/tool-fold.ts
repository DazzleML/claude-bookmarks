// The bookmark tool's calls folded away (0.7.5; djdarcy, 2026-10-26: "I want everything that's
// presented to be tucked away in a single "fold" that a user can expand to see the rows as normal",
// then "the subitems expandable in their own right"). Two levels:
//   closed     one line for a reply's bookmark calls, `⚓ 5 bookmark calls ▸`, drawn by its first
//              call's row; every other bookmark row and every result draws nothing
//   open       `⚓ 5 bookmark calls ▾`, then one compact line per call (`⚓ bookmark #95: <label> ▸`)
//   call open  that call's row and result, as Claude Code draws them
// ctrl+o (a row's `isExpanded`) shows everything as Claude Code draws it, whatever is open.
// Proved first by a probe (tests/one-offs/thinking/toolrow-fold/README.md, "survived").
//
// Pure: the state the render hooks read, and the compact line. Calls are grouped by the turn they
// were made in, as the tool's hook sees them arrive; a call from before this plugin loaded (a
// resumed conversation) belongs to no known turn and draws its compact line alone.

/** The bookmark tool's name as Claude Code draws its rows (the probe's `mcp__<plugin>__<tool>`). */
export const BOOKMARK_TOOL_NAME = 'mcp__bookmarks__bookmark'

/** Where a call's row sits in the fold. */
export type FoldPlace =
  /** A call of a known turn: the turn, whether it is that turn's first bookmark call, and how many it made. */
  | { turn: number; first: boolean; count: number }
  /** A call this load never saw made (from before it): no turn. */
  | { turn: undefined }

export class ToolFold {
  private turn = 0
  private readonly turnOf = new Map<string, number>()
  private readonly firstOf = new Map<number, string>()
  private readonly countOf = new Map<number, number>()
  private readonly openTurns = new Set<number>()
  private readonly openCalls = new Set<string>()

  /** A turn began: the calls made from now on are its. */
  newTurn(): void {
    this.turn += 1
  }

  /** A bookmark call arrived (the tool's hook): it joins the current turn. */
  noteCall(id: string): void {
    if (this.turnOf.has(id)) return
    this.turnOf.set(id, this.turn)
    if (!this.firstOf.has(this.turn)) this.firstOf.set(this.turn, id)
    this.countOf.set(this.turn, (this.countOf.get(this.turn) ?? 0) + 1)
  }

  placeOf(id: string): FoldPlace {
    const turn = this.turnOf.get(id)
    if (turn === undefined) return { turn: undefined }
    return { turn, first: this.firstOf.get(turn) === id, count: this.countOf.get(turn) ?? 1 }
  }

  turnOpen(turn: number): boolean {
    return this.openTurns.has(turn)
  }

  callOpen(id: string): boolean {
    return this.openCalls.has(id)
  }

  toggleTurn(turn: number): void {
    if (!this.openTurns.delete(turn)) this.openTurns.add(turn)
  }

  toggleCall(id: string): void {
    if (!this.openCalls.delete(id)) this.openCalls.add(id)
  }

  /**
   * Whether a call's result block is drawn: only once the call's own line is opened, and, for a
   * call of a known turn, while its turn is open too.
   */
  resultShown(id: string): boolean {
    const place = this.placeOf(id)
    if (!this.openCalls.has(id)) return false
    return place.turn === undefined || this.openTurns.has(place.turn)
  }

  /** A new conversation: nothing is known or open. */
  newConversation(): void {
    this.turn = 0
    this.turnOf.clear()
    this.firstOf.clear()
    this.countOf.clear()
    this.openTurns.clear()
    this.openCalls.clear()
  }
}

/** The tool's answer as an object: the JSON its result carries, wherever the stored output keeps it. */
export function resultObject(output: unknown): Record<string, unknown> | undefined {
  const parse = (s: string): Record<string, unknown> | undefined => {
    try {
      const v = JSON.parse(s)
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
    } catch {
      return undefined
    }
  }
  if (typeof output === 'string') return parse(output)
  if (Array.isArray(output)) {
    for (const b of output) {
      const t = b && typeof b === 'object' ? (b as { text?: unknown }).text : undefined
      if (typeof t === 'string') {
        const v = parse(t)
        if (v) return v
      }
    }
    return undefined
  }
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    if (typeof o.result === 'string') return parse(o.result)
    if (o.content !== undefined) return resultObject(o.content)
    if ('ok' in o || 'error' in o || 'ambiguous' in o) return o
  }
  return undefined
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** One call's line: what it did, from its input and its answer. */
export function compactLine(input: unknown, output: unknown, state: { running?: boolean; errored?: boolean } = {}): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const label = typeof i.label === 'string' ? i.label : undefined
  const action = typeof i.action === 'string' ? i.action : 'add'
  if (state.running) return `⚓ bookmark${label ? `: ${cut(label, 60)}` : ''} …`
  const r = resultObject(output)
  if (!r) return state.errored ? '⚓ bookmark: failed' : `⚓ bookmark${label ? `: ${cut(label, 60)}` : ''}`
  if (typeof r.error === 'string') return `⚓ bookmark: ${cut(r.error, 80)}`
  if (r.ambiguous === true) {
    const n = Array.isArray(r.candidates) ? r.candidates.length : 0
    return `⚓ bookmark: ${n || 'several'} places hold that fragment`
  }
  const n = typeof r.n === 'number' ? ` #${r.n}` : ''
  if (action === 'list') return `⚓ bookmark list`
  if (action !== 'add') return `⚓ bookmark ${action}${n}${label ? `: ${cut(label, 60)}` : ''}`
  return `⚓ bookmark${n}${label ? `: ${cut(label, 60)}` : ''}`
}

/** The fold's own line for a turn: how many calls, and whether it is open. */
export const foldLine = (count: number, open: boolean): string => `⚓ ${count} bookmark ${count === 1 ? 'call' : 'calls'} ${open ? '▾' : '▸'}`
