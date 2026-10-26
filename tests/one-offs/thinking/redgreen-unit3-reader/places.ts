// The place reader's pass (the 0.7 groundwork design, 2026-10-25, unit 3): one background read
// of every file of the conversation -- its transcript, each agent's file, the stored tool
// outputs, and any file it continues in -- into places, with the text written in pieces under
// the data root and the index saved so the next pass resumes. The pure parts are
// core/places/{place,reader}.ts; this drives them over ports, as handlers/transcript.ts drives
// the loader.
//
// Started on demand (a search, a view that lists more than prompts), not at every session
// start: until something reads the places, a pass would write about 50 MB per long
// conversation for nothing (measured 2026-10-25: 48.9 MB of text in one conversation).
//
// On disk, under `<dataRoot>/bookmarks/places/<session>/`:
//   text.<n>.jsonl   the places' text, one `{"k": key, "t": text}` per line, PIECE_BYTES each
//   index.json       the header (version, each file's watermark, how many row pieces)
//   index.<k>.jsonl  the rows, without their text
import {
  addToolResultFile, agentTypeOf, conversationFiles, feedFile, newCursor, newPlaceIndex, parsePlaceIndex, placesLine,
  seal, serializePlaceIndex, takeSealed, type FileCursor, type PlaceIndex,
} from './reader.ts'
import { agentFile } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/places/place.ts'
import { utf8Bytes } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/prompts/text-store.ts'
import type { PlacesPorts } from 'file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/engine/ports.ts'

/** Bytes asked of the program per chunk: under the engine's 4 MiB output cap (as the loader's pass). */
export const PLACES_CHUNK = 4_000_000
/** The index is saved every this many chunks, and at the end. */
export const PLACES_SAVE_EVERY = 8
/** A stored tool output larger than this is read in chunks rather than whole (`$.fs.read` takes at most 4 MiB). */
const WHOLE_READ_MAX = 3_900_000

type PlacesPass = {
  sid: string
  base: string | undefined
  idx: PlaceIndex
  cursors: FileCursor[]
  /** The cursor being read, by its position in `cursors`. */
  at: number
  /** Where the next chunk of the current file starts: past the carry, which the cursor holds. */
  offset: number
  chunks: number
  sinceSave: number
  startedAt: number
  /** When the pass finished, for the status line's elapsed time. */
  finishedAt: number | undefined
  running: boolean
  results: { name: string; path: string }[]
  projectDir: string
}
let placesPass: PlacesPass | undefined

/** What /bm-env says. */
export function placesStatus(): string {
  if (!placesPass) return 'places: not started'
  return placesLine(placesPass.idx, placesPass.cursors.length + placesPass.results.length, (placesPass.finishedAt ?? Date.now()) - placesPass.startedAt, placesPass.running)
}

/** The index of this conversation's places, once a pass has started; its rows grow while the pass runs. */
export function placesIndex(): PlaceIndex | undefined {
  return placesPass?.idx
}

/** Whether the pass for this conversation has finished. */
export function placesDone(): boolean {
  return placesPass !== undefined && !placesPass.running
}

export function newConversation(): void {
  placesPass = undefined
}

const slash = (p: string): string => p.replace(/\\/g, '/').replace(/\/$/, '')

async function readIfExists(ports: PlacesPorts, path: string): Promise<string | undefined> {
  return (await ports.fsExists(path)) ? ports.fsRead(path) : undefined
}

async function writePieces(ports: PlacesPorts, p: PlacesPass): Promise<void> {
  if (!p.base) return
  for (const piece of takeSealed(p.idx)) await ports.fsWrite(`${p.base}/text.${piece.n}.jsonl`, piece.text)
}

async function saveIndex(ports: PlacesPorts, p: PlacesPass): Promise<void> {
  p.sinceSave = 0
  if (!p.base) return
  await writePieces(ports, p)
  // The open piece too, so a resumed pass finds the text of every row the index names.
  if (p.idx.open.lines.length) await ports.fsWrite(`${p.base}/text.${p.idx.open.n}.jsonl`, p.idx.open.lines.join('\n'))
  const [header, ...rows] = serializePlaceIndex(p.idx, p.cursors)
  for (let i = 0; i < rows.length; i++) await ports.fsWrite(`${p.base}/index.${i}.jsonl`, rows[i]!)
  await ports.fsWrite(`${p.base}/index.json`, header!)
}

/** Every file of the conversation, as cursors in reading order: the transcript, then each agent's file. */
async function filesOf(ports: PlacesPorts, sid: string, transcript: string): Promise<{ cursors: FileCursor[]; results: { name: string; path: string }[] }> {
  const sessionDir = slash(transcript).replace(/\.jsonl$/, '')
  const list = async (dir: string) => ((await ports.fsExists(dir)) ? ports.fsList(dir) : [])
  const { agents, results } = conversationFiles(sessionDir, await list(`${sessionDir}/subagents`), await list(`${sessionDir}/tool-results`))
  const cursors: FileCursor[] = [newCursor('', transcript, { session: sid })]
  for (const a of agents) {
    const type = agentTypeOf(await readIfExists(ports, a.meta))
    cursors.push(newCursor(agentFile(a.id), a.path, { session: sid, file: agentFile(a.id), agent: { id: a.id, ...(type ? { type } : {}) } }))
  }
  return { cursors, results }
}

/**
 * Start (or resume) the pass for this conversation. Resumes from a saved index whose files
 * are all still at least as long as their watermarks; otherwise reads from the start. Reads
 * one chunk per clock tick until every file is done, then the stored tool outputs, then any
 * file the conversation continues in. Never blocks the caller.
 */
export async function startPlacesPass(ports: PlacesPorts): Promise<void> {
  const sid = await ports.sessionId()
  if (placesPass && placesPass.sid === sid) return
  const transcript = await ports.transcriptPath()
  if (!transcript) {
    ports.log('[bm] places: transcript not found; nothing to read')
    return
  }
  const root = await ports.dataRoot()
  const base = root ? `${slash(root)}/bookmarks/places/${sid}` : undefined
  const { cursors, results } = await filesOf(ports, sid, transcript)
  let idx = newPlaceIndex(sid)
  if (base) {
    const header = await readIfExists(ports, `${base}/index.json`)
    if (header !== undefined) {
      let want: { rowPieces?: number; open?: { n: number } } = {}
      try { want = JSON.parse(header) } catch { /* parsePlaceIndex says why */ }
      const rowPieces: (string | undefined)[] = []
      for (let i = 0; i < (want.rowPieces ?? 0); i++) rowPieces.push(await readIfExists(ports, `${base}/index.${i}.jsonl`))
      const openText = want.open ? await readIfExists(ports, `${base}/text.${want.open.n}.jsonl`) : undefined
      const read = parsePlaceIndex(header, rowPieces, openText, sid)
      let usable = read.kind === 'ok'
      if (read.kind === 'ok') {
        for (const c of cursors) {
          const saved = read.saved.files[c.key]
          if (!saved) continue
          const size = await ports.fileSize(c.path)
          if (size === undefined || size < saved.bytes) { usable = false; break }
          c.bytes = saved.bytes
          c.line = saved.line
        }
      }
      if (usable && read.kind === 'ok') {
        idx = read.idx
        ports.log(`[bm] places: resuming with ${idx.rows.length} places from the index`)
      } else {
        for (const c of cursors) { c.bytes = 0; c.line = 0 }
        ports.log(`[bm] places: index rebuilt: ${read.kind === 'rebuild' ? read.why : 'a file is shorter than its watermark'}`)
      }
    }
  }
  const p: PlacesPass = { sid, base, idx, cursors, at: 0, offset: cursors[0]!.bytes, chunks: 0, sinceSave: 0, startedAt: Date.now(), finishedAt: undefined, running: true, results, projectDir: slash(transcript).replace(/\/[^/]+$/, '') }
  placesPass = p

  const finish = async () => {
    // The stored outputs: each one place, read whole when it fits one read.
    for (const r of p.results) {
      if (p.idx.byKey.has(`tool-result:${r.name}|${r.name}|0`)) continue
      const size = (await ports.fileSize(r.path)) ?? 0
      let text = ''
      if (size <= WHOLE_READ_MAX) text = (await readIfExists(ports, r.path)) ?? ''
      else for (let off = 0; off < size;) {
        const c = await ports.readChunk(r.path, off)
        if (!c || !c.stdout) break
        text += c.stdout
        off += utf8Bytes(c.stdout)
      }
      addToolResultFile(p.idx, r.name, text)
    }
    seal(p.idx)
    p.running = false
    p.finishedAt = Date.now()
    await saveIndex(ports, p)
    ports.log(`[bm] ${placesStatus()}`)
  }

  const tick = async () => {
    if (placesPass !== p) return // another conversation took over
    try {
      const cur = p.cursors[p.at]
      if (!cur) return void (await finish())
      if (cur.done) {
        p.at += 1
        const next = p.cursors[p.at]
        if (next) p.offset = next.bytes
        else {
          // A conversation that continues in another session's file: read that one too.
          for (const id of p.idx.continuedIn) {
            const path = `${p.projectDir}/${id}.jsonl`
            if (p.cursors.some(c => c.path === path) || !(await ports.fsExists(path))) continue
            const c = newCursor(`continued:${id}`, path, { session: id })
            p.cursors.push(c)
            p.offset = 0
            break
          }
        }
        ports.after(0, () => void tick())
        return
      }
      const r = await ports.readChunk(cur.path, p.offset)
      if (!r) {
        p.running = false
        ports.log('[bm] places: no program could read the conversation; nothing indexed')
        return
      }
      p.chunks += 1
      p.sinceSave += 1
      const got = utf8Bytes(r.stdout)
      p.offset += got
      const done = got === 0 || got < PLACES_CHUNK - 4
      feedFile(p.idx, cur, r.stdout, done)
      await writePieces(ports, p)
      if (p.sinceSave >= PLACES_SAVE_EVERY) await saveIndex(ports, p)
      ports.after(0, () => void tick())
    } catch (err) {
      p.running = false
      ports.log(`[bm] places: the pass stopped: ${String(err)}; it resumes from the last saved index`)
    }
  }
  ports.after(0, () => void tick())
}
