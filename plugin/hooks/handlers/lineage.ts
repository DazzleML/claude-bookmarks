// This conversation's lineage (U83, 2026-10-30__11-26-12): the earlier session ids it continues,
// read once from its own transcript with the rule's one-pattern scan (tests/fixtures/session-lineage) and kept
// in the store as `lineage:<sid>` -- a session's copied history is fixed when the id is minted, so
// the answer never changes. Run in the background (the scan is 1-4 s on a large transcript), never
// inside a hook's own time. No program to run it: no lineage, which is how the plugin behaved before.
//
// It owns the lineage in memory (the one-owner principle; engine/ports.ts).
import { lineageOf, rowsOfScan, type Lineage } from '../core/lineage/lineage.ts'
import { lineageKey } from '../core/store-keys.ts'
import { short } from '../core/kit/message-id.ts'
import type { LineagePorts } from '../engine/ports.ts'

let current: { session: string; lineage: Lineage } | undefined
let pending: { session: string; done: Promise<Lineage | undefined> } | undefined

const isLineage = (v: unknown): v is Lineage =>
  !!v && typeof v === 'object' && typeof (v as Lineage).self === 'string' && Array.isArray((v as Lineage).ancestors) && Array.isArray((v as Lineage).continuedIn)

/**
 * At a start: the lineage, then the earlier sessions' bookmarks, marks and pins copied in
 * (U83 unit 4), when the switch is on. Run in the background, never awaited by a hook.
 */
export async function lineageAtStart(ports: LineagePorts): Promise<void> {
  const lineage = await ensureLineage(ports)
  if (!lineage?.ancestors.length || !(await ports.adoptOn())) return
  await ports.adoptEarlier(lineage.ancestors.map(a => a.sessionId))
}

/** The lineage of `sessionId`, if it is known yet (read, never waited on). */
export function lineageNow(sessionId: string): Lineage | undefined {
  return current?.session === sessionId.toLowerCase() ? current.lineage : undefined
}

/**
 * This conversation's lineage: from memory, else the store, else one scan of its transcript (kept
 * in the store unless the scan was cut short or saw nothing, as an empty transcript does). Calls
 * made while a scan runs share it.
 */
export async function ensureLineage(ports: LineagePorts): Promise<Lineage | undefined> {
  const sid = (await ports.sessionId()).toLowerCase()
  if (current?.session === sid) return current.lineage
  if (pending?.session === sid) return pending.done
  const done = (async (): Promise<Lineage | undefined> => {
    const kept = await ports.storeGet(lineageKey(sid))
    if (isLineage(kept)) {
      current = { session: sid, lineage: kept }
      return kept
    }
    const path = await ports.transcriptPath()
    if (!path) return undefined
    const scan = await ports.scanLineage(path)
    if (!scan) {
      ports.log(`[bm] lineage: the transcript could not be scanned (no sh); this conversation's earlier sessions are not looked for`)
      return undefined
    }
    const lineage = lineageOf(rowsOfScan(scan.text), sid)
    current = { session: sid, lineage }
    if (!scan.truncated && scan.text.trim()) await ports.storeSet(lineageKey(sid), lineage)
    const named = lineage.ancestors.map(a => `${short(a.sessionId)} (${a.via.join('+')})`).join(', ')
    ports.logAlways(`[bm] lineage of ${short(sid)}: ${named || 'no earlier sessions'} (${scan.ms} ms${scan.truncated ? ', cut short, not kept' : ''})`)
    return lineage
  })()
  pending = { session: sid, done }
  try {
    return await done
  } finally {
    if (pending?.done === done) pending = undefined
  }
}
