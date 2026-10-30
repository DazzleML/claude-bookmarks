// Every key family the plugin keeps in Claude Code's plugin store, named in one place.
// The store is one JSON file for every conversation (docs/engine-quirks.md: refused past
// 4 MiB in all), so what lives in it, per conversation or once, is listed here; each
// owner builds its keys from these.
//
//   marks:<sid>          the marks (handlers/marks.ts, through register.tsx's marksPorts)
//   pins:<sid>           pinned prompts (register.tsx togglePin)
//   jumplist:<sid>       the jumplist (handlers/navigation.ts)
//   readingState:<sid>   the reading position's way back (handlers/marks.ts)
//   prompts:<sid>, footnotes:<sid>, backfilled<N>:<sid>
//                        the prompt store and its back-fill flag
//                        (core/prompts/prompt-store.ts; rebuilt from the transcript, so
//                        pruned when a conversation goes unopened: core/store-prune.ts)
//   lineage:<sid>        the earlier sessions this one continues (handlers/lineage.ts, U83):
//                        a few hundred bytes, read once from the transcript and never changing
//   seen                 when each conversation was last opened (core/store-prune.ts)
//   debug:echo           the machine-wide debug echo policy (handlers/log.ts)
//
// Seen in the author's store and written by no code since (2026-10-15): readingBack,
// directScroll, draftAside (54 bytes in all), left from early builds.

const perConversation = (family: string) => (sessionId: string): string => `${family}:${sessionId}`

export const marksKey = perConversation('marks')
export const pinsKey = perConversation('pins')
export const jumplistKey = perConversation('jumplist')
export const readingStateKey = perConversation('readingState')
export const lineageKey = perConversation('lineage')
export const SEEN_KEY = 'seen'
export const ECHO_POLICY_KEY = 'debug:echo'
