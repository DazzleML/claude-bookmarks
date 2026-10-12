// The prompt store's pure parts (the census's cluster 1, 2026-10-12__15-01-52; the third
// move of the register.tsx split, Q261012-06): the store keys, what a transcript read
// yields, how it merges with what the live capture already holds, and the list the pane
// draws. The engine calls (the store, the files, the program that reads the transcript)
// stay in register.tsx. Which rows are prompts: core/prompt-rows.ts.
import { footnoteOf, looksLikePrompt, promptTextOf, type FootnoteRef } from './prompt-rows.ts'
import { headOf } from './transcript-lines.ts'

/** A prompt as the list keeps it: its uuid and first line. */
export type PromptRef = { uuid: string; head: string }

/** How many prompts (and footnotes) a conversation keeps; the oldest go past it. */
export const PROMPTS_KEPT = 5000

export const promptsKey = (sessionId: string): string => `prompts:${sessionId}`
export const footnotesKey = (sessionId: string): string => `footnotes:${sessionId}`
/** The back-fill's done flag; its number marks what the back-fill knows (register.tsx says what each version learnt). */
export const backfilledKey = (version: number, sessionId: string): string => `backfilled${version}:${sessionId}`
/** The prompts' text for the filter: `<base>.json` holds the piece count, `<base>.<i>.json` the pieces. */
export const promptTextBase = (dataRoot: string, sessionId: string): string => `${dataRoot}/bookmarks/prompttext/${sessionId}`

/** The transcript's expected place: the project folder is the cwd with every non-alphanumeric character turned into `-`. */
export const projectFolder = (cwd: string): string => cwd.replace(/[^A-Za-z0-9]/g, '-')
export const transcriptGuess = (configDir: string, cwd: string, sessionId: string): string => `${configDir}/projects/${projectFolder(cwd)}/${sessionId}.jsonl`

/** `item` appended once (a uuid already kept is not kept twice), the oldest dropped past `cap`. */
export function appendOnce<T extends { uuid: string }>(kept: readonly T[], item: T, cap = PROMPTS_KEPT): T[] | undefined {
  if (kept.some(k => k.uuid === item.uuid)) return undefined
  return [...kept, item].slice(-cap)
}

/** What a transcript read yields: the prompts in file order with their text, and the footnotes, each after the prompt it follows (`null` before the first). A line cut off at the output limit, or one that is not a row, is skipped. */
export type Backfill = { found: PromptRef[]; texts: [string, string][]; footnotes: FootnoteRef[] }
export function parseBackfill(stdout: string): Backfill {
  const found: PromptRef[] = []
  const texts: [string, string][] = []
  const footnotes: FootnoteRef[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    let o: any
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof o.uuid !== 'string') continue
    const text = promptTextOf(o)
    if (text !== undefined) {
      found.push({ uuid: o.uuid, head: headOf(text) })
      texts.push([o.uuid, text])
      continue
    }
    const fn = footnoteOf(o)
    if (fn) footnotes.push({ ...fn, uuid: o.uuid, after: found.at(-1)?.uuid ?? null })
  }
  return { found, texts, footnotes }
}

/** Transcript order first, then anything the live capture holds that the file did not (prompts sent while the file was being read), minus rows that are not prompts; the oldest dropped past `cap`. */
export function mergeBackfill(found: readonly PromptRef[], kept: readonly PromptRef[], cap = PROMPTS_KEPT): PromptRef[] {
  const have = new Set(found.map(p => p.uuid))
  return [...found, ...kept.filter(p => !have.has(p.uuid) && looksLikePrompt(p.head))].slice(-cap)
}

/** The back-fill's log line. */
export function backfillLine(found: number, via: string, ms: number, chars: number, truncated: boolean, listed: number): string {
  return (
    `[bm] backfill: ${found} prompts from the transcript via ${via} in ${ms} ms ` +
    `(${chars} chars${truncated ? ', CUT OFF at 4 MiB: newest may be missing' : ''}); list now ${listed}`
  )
}

/** The list the pane draws (moved from register.tsx's prompts(), comments as they were). */
export function promptList(kept: readonly PromptRef[], live: readonly { uuid: string; door: string; head: string; text?: string }[]): PromptRef[] {
  // Rows kept before the list knew them for notices (a `[SYSTEM NOTIFICATION`, another
  // session's message) drop out here, so the numbers match the transcript's prompts.
  const prompts = kept.filter(p => looksLikePrompt(p.head))
  const seen = new Set(prompts.map(k => k.uuid))
  // Rows captured live this session that the stored list lacks, newest last. They pass the
  // same filter: a row kept before the filter knew its kind (a `<task-notification>`)
  // was dropped by the rebuild and came back here as the newest prompt, so the yellow
  // row jumped to the bottom of the list (djdarcy, 2026-10-11: scrolling up from #325
  // moved it to #342).
  const fresh = live.filter(r => r.door === 'prompt' && !seen.has(r.uuid) && looksLikePrompt(r.text ?? r.head))
  return [...prompts, ...fresh.map(r => ({ uuid: r.uuid, head: r.head }))]
}
