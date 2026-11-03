// A bundle as a file of its own (0.8.x unit 3; the bundles design, 2026-11-02__12-19-55, section 4
// and its addenda, with the proof of concept's rules). Five regions, in order:
//   1. front matter -- the plugin's, except the write-back set (label, why, tags, started, touched),
//      which a person, a skill or Obsidian may edit and the next read takes;
//   2. a fenced `bm-links` block holding one line of JSON -- the plugin's source for the links;
//   3. `## Links`, the long form for people -- regenerated, never read back;
//   4. the notes marker, then the person's notes -- never rewritten;
//   5. the end line `<!-- bm end: <rev> -->` -- the plugin's, the last line it writes.
// The four rules for a read (the proof, 1,701 cuts per sweep): a read is whole only when an end
// line follows the marker; text a person adds after the end line is notes, and the next write puts
// the end line back at the bottom; a missing end line is accepted only on a stable read (the
// handler reads twice), and the next write restores it; a block that does not parse refuses every
// write. Obsidian keeps the file's line endings (its hand test, 2026-11-02), so this keeps them too.
// Pure: the handler reads and writes the files.
import type { ItemLink } from './item-links.ts'
import { parseFrontMatter } from '../bookmarks/register-file.ts'

export const BUNDLE_FILE_VERSION = 1
export const BUNDLE_TYPE = 'bookmarks-bundle'
export const NOTES_MARKER = '<!-- bm notes: everything below this line is yours; the plugin never rewrites it -->'
const FENCE = '```'
const END = /^<!-- bm end: (\d+) -->$/
const DERIVED_TAG = 'bm/bundle'

/** The bundle as a file holds it. Times in the block are epoch ms; in the front matter, ISO 8601 UTC. */
export type BundleFileData = {
  id: string
  label: string
  why?: string
  /** The bundle's own tags, without the `bm/` prefix and without the derived `bundle`. */
  tags: string[]
  by: string
  rev: number
  links: ItemLink[]
  created: number
  updated: number
  started: number
  touched?: number
}

/** The write-back fields as the plugin last wrote them: a field that differs from its base was edited by someone else. */
export type WriteBackBase = Pick<BundleFileData, 'label' | 'why' | 'tags' | 'started' | 'touched'>

export type ParsedBundleFile =
  | { kind: 'ok'; data: BundleFileData; notes: string; eol: string }
  /** No end line: a torn read, or a person deleted it. Accept only when a second read agrees. */
  | { kind: 'no-end'; data: BundleFileData; notes: string; eol: string }
  | { kind: 'newer'; version: number }
  | { kind: 'bad'; why: string }

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z')
const ms = (v: unknown): number | undefined => (typeof v === 'string' && v && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : undefined)
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

/** The file's text. `notes` is kept byte for byte; `linkLines` is the `## Links` list the handler formats (hrefs need the data root). */
export function renderBundleFile(d: BundleFileData, o: { notes: string; linkLines: readonly string[]; eol?: string }): string {
  const eol = o.eol ?? '\n'
  const front = [
    '---',
    `type: ${BUNDLE_TYPE}`,
    `version: ${BUNDLE_FILE_VERSION}`,
    `id: ${d.id}`,
    `label: ${d.label.replace(/[\r\n]+/g, ' ')}`,
    ...(d.why !== undefined ? [`why: ${d.why.replace(/[\r\n]+/g, ' ')}`] : []),
    'tags:',
    `  - ${DERIVED_TAG}`,
    ...d.tags.map(t => `  - bm/${t}`),
    `by: ${d.by}`,
    `created: ${iso(d.created)}`,
    `started: ${iso(d.started)}`,
    `updated: ${iso(d.updated)}`,
    ...(d.touched !== undefined ? [`touched: ${iso(d.touched)}`] : []),
    '---',
  ]
  const block = JSON.stringify({ rev: d.rev, links: d.links, created: d.created, updated: d.updated, started: d.started })
  const head = [...front, '', `${FENCE}bm-links`, block, FENCE, '', '## Links', '', ...o.linkLines, '', NOTES_MARKER].join(eol)
  const notes = o.notes === '' || o.notes.endsWith(eol) || o.notes.endsWith('\n') ? o.notes : o.notes + eol
  return `${head}${eol}${notes}<!-- bm end: ${d.rev} -->${eol}`
}

/**
 * The file read back. `ok` needs every region and an end line after the marker; `no-end` is the
 * same with no end line (the handler accepts it only on a stable read); anything else is `bad`.
 */
export function parseBundleFile(text: string): ParsedBundleFile {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text)
  if (!fm) return { kind: 'bad', why: 'no front matter' }
  const f = parseFrontMatter(text)
  const version = Number(one(f.version))
  if (one(f.type) !== BUNDLE_TYPE) return { kind: 'bad', why: 'not a bundle file' }
  if (!Number.isFinite(version)) return { kind: 'bad', why: 'no version' }
  if (version > BUNDLE_FILE_VERSION) return { kind: 'newer', version }
  // The block: right after the front matter (blank lines only between), its opening fence, one
  // line of JSON, its closing fence. Anchored, so a fenced block a person typed in the notes is
  // never taken for the plugin's when the plugin's is damaged.
  const opening = new RegExp(`^(?:${eol})*${FENCE}bm-links${eol}`).exec(text.slice(fm[0].length))
  if (!opening) return { kind: 'bad', why: 'no links block after the front matter' }
  const jsonStart = fm[0].length + opening[0].length
  const jsonEnd = text.indexOf(eol, jsonStart)
  if (jsonEnd < 0 || !text.startsWith(`${eol}${FENCE}${eol}`, jsonEnd)) return { kind: 'bad', why: 'the links block is not closed' }
  let block: { rev?: unknown; links?: unknown; created?: unknown; updated?: unknown; started?: unknown }
  try {
    block = JSON.parse(text.slice(jsonStart, jsonEnd))
  } catch {
    return { kind: 'bad', why: 'the links block is not JSON' }
  }
  if (typeof block.rev !== 'number' || !Array.isArray(block.links)) return { kind: 'bad', why: 'the links block has no rev or links' }
  // The marker after the block: the first line equal to it, with only the `## Links` region
  // (blank lines, its heading, `- ` lines) between. Anything else there is a damaged region, so a
  // marker line a person typed in the notes is never taken for the plugin's.
  const markerAt = text.indexOf(`${eol}${NOTES_MARKER}${eol}`, jsonEnd)
  if (markerAt < 0) return { kind: 'bad', why: 'no notes marker' }
  const linksRegion = text.slice(jsonEnd + eol.length + FENCE.length + eol.length, markerAt).split(eol)
  if (!linksRegion.every(l => l === '' || l === '## Links' || l.startsWith('- '))) return { kind: 'bad', why: 'the Links region is damaged' }
  const notesStart = markerAt + eol.length + NOTES_MARKER.length + eol.length
  const tail = text.slice(notesStart)
  const id = one(f.id), label = one(f.label), by = one(f.by)
  if (!id || label === undefined || !by) return { kind: 'bad', why: 'id, label or by missing' }
  const tagsRaw = f.tags === undefined ? [] : Array.isArray(f.tags) ? f.tags : [f.tags]
  const created = ms(one(f.created)) ?? (block.created as number), updated = ms(one(f.updated)) ?? (block.updated as number)
  const data: BundleFileData = {
    id, label, ...(one(f.why) !== undefined ? { why: one(f.why) } : {}),
    tags: tagsRaw.filter(t => t !== DERIVED_TAG).map(t => t.replace(/^bm\//, '')),
    by, rev: block.rev, links: block.links as ItemLink[],
    created, updated,
    started: ms(one(f.started)) ?? (block.started as number) ?? created,
    ...(ms(one(f.touched)) !== undefined ? { touched: ms(one(f.touched)) } : {}),
  }
  // The end line: the last line of its form carrying the block's rev; text after it is notes too.
  const tailLines = tail.split(eol)
  let end = -1
  for (let i = tailLines.length - 1; i >= 0; i--) {
    const m = END.exec(tailLines[i]!)
    if (m && Number(m[1]) === block.rev) { end = i; break }
  }
  if (end < 0) return { kind: 'no-end', data, notes: tail, eol }
  const before = tailLines.slice(0, end).join(eol)
  const after = tailLines.slice(end + 1).join(eol)
  const notes = (before ? before + eol : '') + after
  return { kind: 'ok', data, notes, eol }
}

/**
 * What a person, a skill or Obsidian changed in the write-back set, against what the plugin last
 * wrote. A field absent from the file is never a deletion; the id and every other field are the
 * plugin's and are never taken.
 */
export function writeBack(read: BundleFileData, base: WriteBackBase): Partial<WriteBackBase> {
  const out: Partial<WriteBackBase> = {}
  if (read.label !== base.label) out.label = read.label
  if (read.why !== undefined && read.why !== base.why) out.why = read.why
  if (read.tags.join('\n') !== base.tags.join('\n')) out.tags = read.tags
  if (read.started !== base.started) out.started = read.started
  if (read.touched !== undefined && read.touched !== base.touched) out.touched = read.touched
  return out
}

/** `started` only moves earlier, and only when the plugin set it: a hand-set value is kept as it is. */
export const nextStarted = (current: number, base: number, earliest: number): number =>
  current !== base ? current : Math.min(current, earliest)
