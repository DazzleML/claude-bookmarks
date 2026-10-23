// The loader's pass over the transcript (slice F, U65): one background read of the whole
// conversation in chunks, resumed from the index's watermark, kept current from the live
// capture, and published into the same store keys and pieces the grep back-fill filled.
// The pure parts are core/transcript/{loader,index}.ts; this drives them over ports, the
// way handlers/prompts.ts drives the back-fill. Design: 2026-10-22__21-35-40 (U65).
import { feed, append, loaderLine, newLoader, resolve, textsWithin, REPLY_TEXT_BUDGET, type LoaderState, type RowKind } from '../core/transcript/loader.ts'
import { indexBase, indexOf, parseIndex, seedLoader, serializeIndex } from '../core/transcript/index.ts'
import { headOf, type Resolution } from '../core/bookmarks/transcript-lines.ts'
import { shard } from '../core/prompts/text-store.ts'
import type { Backfill } from '../core/prompts/prompt-store.ts'
import type { TranscriptPorts } from '../engine/ports.ts'

/** Bytes asked of the program per chunk: under the engine's 4 MiB output cap, so a full chunk is never a truncated one. */
export const CHUNK_BYTES = 4_000_000
/** The index and the texts are saved every this many chunks, and at the end. */
export const SAVE_EVERY = 8
const REPLY_PIECE_BYTES = 3_500_000

type Pass = { sid: string; path: string; state: LoaderState; chunks: number; startedAt: number; running: boolean; size: number | undefined; sinceSave: number }
let pass: Pass | undefined

/** What `/bm-env` says. */
export function loaderStatus(): string {
  if (!pass) return 'loader: not started'
  return loaderLine(pass.state, pass.size, pass.chunks, (pass.running ? Date.now() : pass.startedAt + 0) - pass.startedAt, pass.running)
}

/** The row a request names, from the loader's rows; undefined while no pass has rows, so the caller falls back to the grep reader. A `none` while the pass is still running is also undefined: the row may not be read yet. */
export function resolveLoaded(want: { uuid?: string; fragment?: string }): Resolution | undefined {
  if (!pass || pass.state.rows.length === 0) return undefined
  const r = resolve(pass.state, want)
  return r.kind === 'none' && pass.running ? undefined : r
}

/** The live capture saw a message: the loader keeps it too (the pass fills its hints later). */
export function appendLive(row: { uuid: string; role: 'user' | 'assistant'; text: string; timestamp?: string }, kind?: RowKind): void {
  if (pass) append(pass.state, row, kind)
}

/** The prompts' uuids in file order (the read state's order, #34). */
export function loadedPromptUuids(): readonly string[] {
  return pass?.state.prompts ?? []
}

export function newConversation(): void {
  pass = undefined
}

/** What the loader's rows are to the prompts list: the same shape the grep back-fill produced. */
export function backfillOf(state: LoaderState): Backfill {
  const found = state.prompts.map(u => {
    const row = state.rows[state.byUuid.get(u)!]!
    return { uuid: u, head: headOf(row.text) }
  })
  const texts: [string, string][] = state.prompts.map(u => [u, state.rows[state.byUuid.get(u)!]!.text])
  return { found, texts, footnotes: state.footnotes }
}

async function readPieces(ports: TranscriptPorts, base: string): Promise<{ header: string | undefined; pieces: string[] }> {
  const read = async (p: string) => ((await ports.fsExists(p)) ? ports.fsRead(p) : undefined)
  const header = await read(`${base}.json`)
  const pieces: string[] = []
  if (header) {
    let count = 0
    try {
      count = Number(JSON.parse(header).pieces ?? 0)
    } catch {
      count = 0
    }
    for (let i = 0; i < count; i++) pieces.push((await read(`${base}.${i}.json`)) ?? '')
  }
  return { header, pieces }
}

async function saveIndex(ports: TranscriptPorts, p: Pass): Promise<void> {
  const root = await ports.dataRoot()
  if (!root) return
  const base = indexBase(root, p.sid)
  const pieces = serializeIndex(indexOf(p.state, p.sid, p.size ?? p.state.bytes))
  for (let i = 1; i < pieces.length; i++) await ports.fsWrite(`${base}.${i - 1}.json`, pieces[i]!)
  await ports.fsWrite(`${base}.json`, pieces[0]!)
  // The replies' text, newest first under the budget, beside the prompts' pieces (which applyBackfill writes).
  const replies = shard(textsWithin(p.state, 'reply', REPLY_TEXT_BUDGET), REPLY_PIECE_BYTES)
  const rbase = `${root.replace(/\\/g, '/').replace(/\/$/, '')}/bookmarks/replytext/${p.sid}`
  for (let i = 0; i < replies.length; i++) await ports.fsWrite(`${rbase}.${i}.json`, JSON.stringify(replies[i]))
  await ports.fsWrite(`${rbase}.json`, JSON.stringify({ pieces: replies.length }))
  p.sinceSave = 0
}

/**
 * Start (or resume) the pass for this conversation. Reads the index, seeds the loader, then
 * reads one chunk per clock tick from the watermark until a short chunk; saves every
 * SAVE_EVERY chunks and at the end; publishes the prompts and footnotes at the end through
 * `ports.publish` (handlers/prompts.ts applyBackfill). Never blocks the caller.
 */
export async function startPass(ports: TranscriptPorts): Promise<void> {
  const sid = await ports.sessionId()
  if (pass && pass.sid === sid) return
  const path = await ports.transcriptPath()
  if (!path) {
    ports.log('[bm] loader: transcript not found; the list starts when the plugin loaded')
    return
  }
  const size = await ports.fileSize(path)
  const root = await ports.dataRoot()
  let state = newLoader()
  if (root) {
    const { header, pieces } = await readPieces(ports, indexBase(root, sid))
    const read = parseIndex(header, pieces, sid, size ?? Number.MAX_SAFE_INTEGER)
    if (read.kind === 'ok') {
      state = seedLoader(read.index, await ports.promptTexts())
      ports.log(`[bm] loader: resuming at byte ${state.bytes} of ${size ?? '?'} (${state.rows.length} rows from the index)`)
    } else if (header !== undefined) {
      ports.log(`[bm] loader: index rebuilt: ${read.why}`)
    }
  }
  const p: Pass = { sid, path, state, chunks: 0, startedAt: Date.now(), running: true, size, sinceSave: 0 }
  pass = p
  const tick = async () => {
    if (pass !== p) return // another conversation took over
    try {
      const r = await ports.readChunk(p.path, p.state.bytes)
      if (!r) {
        p.running = false
        ports.log('[bm] loader: no program could read the transcript; the grep readers stand')
        return
      }
      p.chunks += 1
      p.sinceSave += 1
      const done = r.stdout.length === 0 || r.stdout.length < CHUNK_BYTES / 4
      feed(p.state, r.stdout, done)
      if (!done) {
        if (p.sinceSave >= SAVE_EVERY) await saveIndex(ports, p)
        ports.after(0, () => void tick())
        return
      }
      p.running = false
      p.size = (await ports.fileSize(p.path)) ?? p.state.bytes
      await saveIndex(ports, p)
      await ports.publish(backfillOf(p.state), false)
      ports.log(`[bm] ${loaderLine(p.state, p.size, p.chunks, Date.now() - p.startedAt, false)}`)
    } catch (err) {
      p.running = false
      ports.log(`[bm] loader: the pass stopped: ${String(err)}; it resumes at byte ${p.state.bytes} on the next start`)
    }
  }
  ports.after(0, () => void tick())
}
