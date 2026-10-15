// The prompt store (moved whole out of register.tsx under /move-code, 0.4.84, comments as
// they were; `ports.x()` where the code called `$`): the session's prompts and footnotes in
// the plugin store, and the prompts' text for the filter in files under the data root.
// The prompt-text cache, its save timer and the one-time drop of old store keys are owned
// here. The back-fill that fills the store, and the only program runs, stay in register.tsx.

import { appendOnce, footnotesKey as footnotesKeyOf, promptTextBase as promptTextBaseOf, promptsKey as promptsKeyOf, type PromptRef } from '../core/prompts/prompt-store.ts'
import { shard, withinBudget, type PromptText } from '../core/prompts/text-store.ts'
import type { FootnoteRef } from '../core/prompts/prompt-rows.ts'
import type { PromptsPorts } from '../engine/ports.ts'

// The session's prompts in the order they were sent, #1 first. `rows` ($.state) starts
// empty when the session restarts, so every prompt is also kept in $.store under the
// session id (djdarcy, 2026-10-04: number prompts from the first message). Prompts sent
// before the mod was loaded are not known: reading them needs the transcript (#6).
// The keys, the merge and the list's filter: core/prompts/prompt-store.ts.
export async function promptsKey(ports: PromptsPorts): Promise<string> {
  return promptsKeyOf(await ports.sessionId())
}
export async function keptPrompts(ports: PromptsPorts): Promise<PromptRef[]> {
  return ((await ports.storeGet(await promptsKey(ports))) as PromptRef[] | undefined) ?? []
}
// Footnotes (#33): the person's slash commands, `!` shell commands and interruptions,
// each kept with the prompt it follows (core/prompts/prompt-rows.ts footnoteOf); numbered N.k at
// draw time from the prompts' order.
export async function footnotesKey(ports: PromptsPorts): Promise<string> {
  return footnotesKeyOf(await ports.sessionId())
}
export async function keptFootnotes(ports: PromptsPorts): Promise<FootnoteRef[]> {
  return ((await ports.storeGet(await footnotesKey(ports))) as FootnoteRef[] | undefined) ?? []
}

// The prompts' text for the filter (#28): held in memory while the plugin runs, kept as
// much as the `promptTextBudget` setting allows (0 = unlimited; core/prompts/text-store.ts) in
// files under the data root, <dataRoot>/bookmarks/prompttext/<sid>.json (the piece
// count) and <sid>.<i>.json (pieces under the 4 MiB that $.fs.read takes). Not in the
// plugin store: its 4 MiB is for the whole store, every conversation's marks and pins
// included, and a store over it refuses every write (typings, `store.set`; measured
// 2026-10-12: 620 KB live, 216 KB of it this text from one day's dev build).
// djdarcy, 2026-10-12: free memory where appropriate, keep a cache where there is room;
// search (#20) reuses it.
const TEXT_PIECE_BYTES = 3_500_000
// The cache carries its conversation: after /clear or /resume the plugin stays loaded,
// and a save from the old conversation's cache would overwrite the new one's pieces.
let promptTextCache: { sid: string; texts: Map<string, string> } | undefined
let promptTextSave: { cancel: () => void } | undefined
async function promptTextBase(ports: PromptsPorts, sid: string): Promise<string | undefined> {
  const root = await ports.dataRoot()
  return root ? promptTextBaseOf(root, sid) : undefined
}
async function readJson(ports: PromptsPorts, path: string): Promise<unknown> {
  try {
    return (await ports.fsExists(path)) ? JSON.parse(await ports.fsRead(path)) : undefined
  } catch {
    return undefined // a piece cut short by a write that did not finish: that text is lost, the rest stands
  }
}
export async function promptTexts(ports: PromptsPorts): Promise<Map<string, string>> {
  const sid = await ports.sessionId()
  if (promptTextCache?.sid === sid) return promptTextCache.texts
  await dropStoredPromptText(ports)
  const cache = new Map<string, string>()
  const base = await promptTextBase(ports, sid)
  const count = base ? Number(((await readJson(ports, `${base}.json`)) as { pieces?: number } | undefined)?.pieces ?? 0) : 0
  for (let i = 0; i < count; i++) {
    const piece = await readJson(ports, `${base}.${i}.json`)
    if (Array.isArray(piece)) for (const t of piece as PromptText[]) cache.set(t.uuid, t.text)
  }
  promptTextCache = { sid, texts: cache }
  return cache
}
export async function savePromptTexts(ports: PromptsPorts) {
  const sid = await ports.sessionId()
  const cache = await promptTexts(ports)
  const order = (await keptPrompts(ports)).map(p => p.uuid).reverse() // newest first
  const kept = withinBudget(order.filter(u => cache.has(u)).map(u => ({ uuid: u, text: cache.get(u)! })), ports.settings().promptTextBudget)
  // Drop what fell outside the budget from memory too.
  promptTextCache = { sid, texts: new Map(kept.map(t => [t.uuid, t.text])) }
  const base = await promptTextBase(ports, sid)
  if (!base) return // no data root: the text lives in memory until the plugin unloads
  const before = Number(((await readJson(ports, `${base}.json`)) as { pieces?: number } | undefined)?.pieces ?? 0)
  const pieces = shard(kept, TEXT_PIECE_BYTES)
  for (let i = 0; i < pieces.length; i++) await ports.fsWrite(`${base}.${i}.json`, JSON.stringify(pieces[i]))
  await ports.fsWrite(`${base}.json`, JSON.stringify({ pieces: pieces.length }))
  // $.fs has no delete: a piece no longer counted is emptied, so a smaller budget frees the disk too.
  for (let i = pieces.length; i < before; i++) await ports.fsWrite(`${base}.${i}.json`, '[]')
}
// 0.4.23 development builds kept this text in the plugin store as `prompttext:` keys;
// they are removed once per load. One machine ran that build (the maintainer's, never
// released; counted 2026-10-12); take this out at 0.5.0.
let storedPromptTextDropped = false
async function dropStoredPromptText(ports: PromptsPorts) {
  if (storedPromptTextDropped) return
  storedPromptTextDropped = true
  for (const key of await ports.storeKeys()) if (key.startsWith('prompttext:')) await ports.storeDelete(key)
}
// A prompt's text joins the cache; the files are written a moment later, once per burst.
export async function keepPromptText(ports: PromptsPorts, uuid: string, text: string) {
  ;(await promptTexts(ports)).set(uuid, text)
  promptTextSave?.cancel()
  promptTextSave = ports.after(2000, () => void savePromptTexts(ports))
}
export async function keepFootnote(ports: PromptsPorts, f: FootnoteRef) {
  const next = appendOnce(await keptFootnotes(ports), f)
  if (next) await ports.storeSet(await footnotesKey(ports), next)
}
export async function keepPrompt(ports: PromptsPorts, p: PromptRef) {
  const next = appendOnce(await keptPrompts(ports), p)
  if (next) await ports.storeSet(await promptsKey(ports), next)
}
