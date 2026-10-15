// Pruning the plugin store (#15; refactor-advisor 2026-10-12 row 22). The store is one
// JSON file for every conversation, refused past 4 MiB in all (docs/engine-quirks.md),
// and per-conversation keys were never deleted. Only what the transcript rebuilds is
// pruned -- a conversation's prompt list, its footnotes, its back-fill flag -- and only for
// a conversation not opened for `maxAgeMs`; reopening it reads the transcript again.
// Marks, pins, the reading position and the jumplist are the person's and stay.

// Key families a back-fill rebuilds, by prefix (`<family>:<sessionId>`).
export const REBUILT = ['prompts', 'footnotes'] as const
// The back-fill's done flag: `backfilled<N>:<sessionId>`, N the current version.
export const BACKFILL_FLAG = /^backfilled(\d*):(.+)$/

export type Seen = Record<string, number>

export type Prune = { drop: string[]; seen: Seen }

// Which keys to delete, and the `seen` record to keep. `current` is the open conversation;
// a conversation in the store with no `seen` time gets `now` (so nothing already there is
// pruned until it has gone unopened for `maxAgeMs` from today); a back-fill flag of an
// older version is dropped whatever its age.
export function pruneStore(keys: readonly string[], seen: Seen, now: number, maxAgeMs: number, current: string, backfillVersion: number): Prune {
  const next: Seen = { ...seen, [current]: now }
  const drop: string[] = []
  const sessions = new Set<string>()
  for (const key of keys) {
    const flag = BACKFILL_FLAG.exec(key)
    if (flag) {
      if (Number(flag[1] || 1) !== backfillVersion) drop.push(key)
      else sessions.add(flag[2]!)
      continue
    }
    const colon = key.indexOf(':')
    if (colon > 0 && (REBUILT as readonly string[]).includes(key.slice(0, colon))) sessions.add(key.slice(colon + 1))
  }
  for (const sid of sessions) if (next[sid] === undefined) next[sid] = now
  for (const [sid, at] of Object.entries(next)) {
    if (sid === current || now - at <= maxAgeMs) continue
    drop.push(...REBUILT.map(f => `${f}:${sid}`).filter(k => keys.includes(k)))
    const flag = `backfilled${backfillVersion}:${sid}`
    if (keys.includes(flag)) drop.push(flag)
    delete next[sid]
  }
  return { drop, seen: next }
}
