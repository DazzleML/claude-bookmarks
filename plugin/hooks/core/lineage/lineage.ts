// Session lineage: which earlier Claude Code sessions a transcript continues (the rule in
// tests/fixtures/session-lineage/README.md, with its cases; the U83 design, 2026-10-30__11-26-12). Rows copied
// into a new session keep the session they were born in as `session_id`; a fork names its parent in
// `forkedFrom`; an old transcript names its successor in a `continued-in` row. Claude-Session-Backup
// runs the same cases from Python, so a change here changes the cases first.
//
// Pure.

export type Ancestor = { sessionId: string; via: ('copied' | 'forked')[]; forkPoint?: string }
export type Lineage = { self: string; ancestors: Ancestor[]; continuedIn: string[] }

/**
 * The one pattern a large transcript is read with (`grep -o -E <pattern> | uniq`): each match is one
 * lineage field, in file order. A line of its output wrapped in braces is a row fragment
 * (`rowsOfScan`), so the scan and the parsed rows go through the same rule.
 */
export const LINEAGE_SCAN_PATTERN = '"session_id":"[0-9a-f-]+"|"forkedFrom":\\{[^}]*\\}|"continuedInSessionId":"[0-9a-f-]+"'

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

/** The lineage of the transcript whose rows (in file order) are given, for session `self`. */
export function lineageOf(rows: Iterable<unknown>, self: string): Lineage {
  const found = new Map<string, Ancestor>()
  const continuedIn: string[] = []
  const add = (sid: string, via: 'copied' | 'forked', forkPoint?: string) => {
    if (sid === self) return
    const a = found.get(sid) ?? { sessionId: sid, via: [] }
    if (!a.via.includes(via)) a.via = (['copied', 'forked'] as const).filter(v => v === via || a.via.includes(v))
    if (via === 'forked' && a.forkPoint === undefined && forkPoint) a.forkPoint = forkPoint
    found.set(sid, a)
  }
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    const born = str(r.session_id)
    if (born) add(born, 'copied')
    const fork = r.forkedFrom
    if (fork && typeof fork === 'object' && !Array.isArray(fork)) {
      const parent = str((fork as Record<string, unknown>).sessionId)
      if (parent) add(parent, 'forked', str((fork as Record<string, unknown>).messageUuid))
    }
    const next = str(r.continuedInSessionId)
    if (next && !continuedIn.includes(next)) continuedIn.push(next)
  }
  return { self, ancestors: [...found.values()].map(a => ({ sessionId: a.sessionId, via: a.via, ...(a.forkPoint ? { forkPoint: a.forkPoint } : {}) })), continuedIn }
}

/** A transcript's rows, parsed; a line that is not JSON reads as nothing. */
export function rowsOfJsonl(text: string): unknown[] {
  return text.split('\n').filter(l => l.trim()).map(l => {
    try {
      return JSON.parse(l) as unknown
    } catch {
      return undefined
    }
  })
}

/** The scan's output (one `"field":value` per line) as row fragments. */
export function rowsOfScan(text: string): unknown[] {
  return rowsOfJsonl(text.split('\n').filter(l => l.trim()).map(l => `{${l.trim()}}`).join('\n'))
}
