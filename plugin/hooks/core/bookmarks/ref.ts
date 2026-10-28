// One reference to a place, from any spelling the plugin has written or reads (the links-in-files
// design, 2026-10-27__06-11-58, build step B1; the grammar is the stable-links design's 4.1).
//
// Two spellings of one identity:
//   file:   what a person presses or ctrl-clicks (Claude Code draws only https/http/file links):
//           file:///<data root>/bookmarks/sessions/<session>/<uuid8>[.p<part>].md?u=<uuid>&...&v=1
//           and, as a list marker, the same link with `&list=<list>&id=<entry>&v=2`
//   bm:     text the plugin reads (commit messages, markers in files):
//           bm:<sid8>/<row>[.p<part>][@<file>][~w:<words>][?list=<list>&id=<entry>]
//           bm:<sid8>.<n>                       a record of that session, by its number
//           bm:list/<list>#<entry>              a list marker with no conversation place
//
// Every `file:` spelling ever written (v1, no `v`, the older `#` form) is read by parseAnchor; this
// adds the list marker's parameters and the `bm:` grammar, and formats both spellings. The session
// is a hint (a uuid survives forks, the stable-links design T8); the row's uuid is the identity.
//
// Pure.
import { anchorHref, encodePart, parseAnchor, uuid8 } from './anchor.ts'

export type Ref = {
  spelling: 'file' | 'bm'
  /** The session: its full id (a `file:` link's path) or a prefix of 8+ characters (`bm:`). */
  session?: string
  /** The row: a full uuid, or a prefix of 8+ characters. Absent for a record number or a bare list marker. */
  uuid?: string
  /** A record of the session, by its number (`bm:<sid8>.<n>`). */
  record?: number
  /**
   * A lookup's check: the first hex characters of the record's uuid (`bm:<sid8>.<n>~<check>`), so a
   * register re-created after a loss, which numbers from 1 again, reports a mismatch instead of
   * resolving to another record. Written as 8; read at any length as a prefix (`checkMatches`).
   */
  check?: string
  /** The row's file and block, for a row that is not a prompt or a reply. */
  file?: string
  part?: number
  /** The words to highlight on arrival. */
  words?: string
  /** Hints a `file:` link carries (where the row sat in the transcript when it was minted). */
  line?: number
  bytes?: [number, number]
  /** A list marker: the list and the entry this place (or line) belongs to. */
  list?: string
  entry?: string
  version?: number
  /** A `file:` link from before the query form (its position after `#`). */
  legacyFragment?: boolean
}

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const HEX_PREFIX = /^[0-9a-f]{8}(?:[0-9a-f-]{1,28})?$/i

function decode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** The `list` and `id` parameters of a query string, when both are well-formed ids. */
function markerParams(query: string): { list?: string; entry?: string } {
  let list: string | undefined
  let entry: string | undefined
  for (const kv of query.split('&')) {
    const eq = kv.indexOf('=')
    if (eq < 0) continue
    const k = kv.slice(0, eq)
    const v = decode(kv.slice(eq + 1))
    if (k === 'list' && ID.test(v)) list = v
    if (k === 'id' && ID.test(v)) entry = v
  }
  return list && entry ? { list, entry } : {}
}

function parseFile(href: string): Ref | undefined {
  const a = parseAnchor(href)
  if (!a) return undefined
  const cut = href.search(/[?#]/)
  const marker = markerParams(href.slice(cut + 1).replace(/#/g, '&'))
  return {
    spelling: 'file',
    ...(a.sessionId ? { session: a.sessionId } : {}),
    uuid: a.uuid,
    ...(a.file !== undefined ? { file: a.file } : {}),
    ...(a.part !== undefined ? { part: a.part } : {}),
    ...(a.words ? { words: a.words } : {}),
    ...(a.line !== undefined ? { line: a.line } : {}),
    ...(a.bytes ? { bytes: a.bytes } : {}),
    ...marker,
    ...(a.version !== undefined ? { version: a.version } : {}),
    ...(a.legacyFragment ? { legacyFragment: true } : {}),
  }
}

const BM_LIST = /^bm:list\/([^#\s]+)#(\S+)$/i
const BM_RECORD = /^bm:([0-9a-f][0-9a-f-]{7,35})\.(\d+)((?:~[^~?\s]+)*)(?:\?(\S*))?$/i
const BM_ROW = /^bm:([0-9a-f][0-9a-f-]{7,35})\/([0-9a-f][0-9a-f-]{7,35})(?:\.p(\d+))?(?:@([^~?\s]+))?((?:~[^~?\s]+)*)(?:\?(\S*))?$/i

/**
 * The tilde rule (the bm: short-reference design, unit 1b): every `~` segment is `<tag>:<value>`
 * -- `w:` the words, `c:` a character range (reserved, ignored until built), any other tag ignored
 * so a later build can add one -- except at most one bare hex segment, a lookup's check. Undefined
 * when there are two bare segments or a bare one that is not hex.
 */
function tildeSegments(tildes: string): { words?: string; check?: string } | undefined {
  let words: string | undefined
  let check: string | undefined
  for (const seg of tildes.split('~')) {
    if (!seg) continue
    const tagged = /^([a-z][a-z0-9]*):(.*)$/i.exec(seg)
    if (tagged) {
      if (tagged[1]!.toLowerCase() === 'w') words = decode(tagged[2]!).trim() || undefined
      continue
    }
    if (check !== undefined || !/^[0-9a-f]{1,32}$/i.test(seg)) return undefined
    check = seg.toLowerCase()
  }
  return { ...(words ? { words } : {}), ...(check ? { check } : {}) }
}

function parseBm(text: string): Ref | undefined {
  const l = BM_LIST.exec(text)
  if (l) {
    const list = decode(l[1]!)
    const entry = decode(l[2]!)
    return ID.test(list) && ID.test(entry) ? { spelling: 'bm', list, entry } : undefined
  }
  const r = BM_RECORD.exec(text)
  if (r) {
    const segs = tildeSegments(r[3] ?? '')
    if (!segs || !HEX_PREFIX.test(r[1]!)) return undefined
    return { spelling: 'bm', session: r[1]!.toLowerCase(), record: Number(r[2]), ...segs, ...markerParams(r[4] ?? '') }
  }
  const m = BM_ROW.exec(text)
  if (!m) return undefined
  const [, session, row, part, file, tildes, query] = m
  if (!HEX_PREFIX.test(session!) || !HEX_PREFIX.test(row!)) return undefined
  // The exact form names its row; a check belongs only to a lookup.
  const segs = tildeSegments(tildes ?? '')
  if (!segs || segs.check !== undefined) return undefined
  const f = file !== undefined ? decode(file) : undefined
  return {
    spelling: 'bm',
    session: session!.toLowerCase(),
    uuid: row!.toLowerCase(),
    ...(f !== undefined && /^(agent|tool-result|continued):/.test(f) ? { file: f } : {}),
    ...(part !== undefined ? { part: Number(part) } : {}),
    ...(segs.words ? { words: segs.words } : {}),
    ...markerParams(query ?? ''),
  }
}

/**
 * Reads any spelling of a reference: a `file:` link (every version the plugin has written) or a
 * `bm:` reference. Undefined for anything else, never a throw. Surrounding `<` `>` (a Markdown
 * autolink) are allowed.
 */
export function parseRef(text: string): Ref | undefined {
  const t = text.trim().replace(/^<(.*)>$/, '$1')
  if (/^file:/i.test(t)) return parseFile(t)
  if (/^bm:/i.test(t)) return parseBm(t)
  return undefined
}

/**
 * The `bm:` spelling. The session and the row are prefixes of their dashed ids: 8 characters
 * unless `sessionChars` / `rowChars` say more (`shortestUniquePrefix`), or the full row when asked.
 * A lookup (`record`) carries its words, then its check: `bm:<sid>.<n>[~w:<words>][~<check>]`.
 */
export function formatBm(ref: Ref, opts: { fullRow?: boolean; sessionChars?: number; rowChars?: number } = {}): string | undefined {
  const marker = ref.list && ref.entry ? `?list=${encodeURIComponent(ref.list)}&id=${encodeURIComponent(ref.entry)}` : ''
  if (!ref.uuid && ref.record === undefined) return ref.list && ref.entry ? `bm:list/${encodeURIComponent(ref.list)}#${encodeURIComponent(ref.entry)}` : undefined
  if (!ref.session) return undefined
  const sid = ref.session.toLowerCase().slice(0, Math.max(8, opts.sessionChars ?? 8))
  const words = ref.words ? `~w:${encodePart(ref.words)}` : ''
  if (!ref.uuid) return `bm:${sid}.${ref.record}${words}${ref.check ? `~${ref.check.toLowerCase()}` : ''}${marker}`
  const row = opts.fullRow ? ref.uuid.toLowerCase() : opts.rowChars !== undefined ? ref.uuid.toLowerCase().slice(0, Math.max(8, opts.rowChars)) : uuid8(ref.uuid)
  const part = ref.part !== undefined ? `.p${ref.part}` : ''
  const file = ref.file !== undefined ? `@${encodePart(ref.file)}` : ''
  return `bm:${sid}/${row}${part}${file}${words}${marker}`
}

/** True when a lookup's check names this uuid: a prefix of it, compared without dashes. */
export function checkMatches(check: string, uuid: string): boolean {
  const c = check.replace(/-/g, '').toLowerCase()
  return c.length > 0 && uuid.replace(/-/g, '').toLowerCase().startsWith(c)
}

/**
 * The shortest prefix of `id` (lower-case, dashes kept) of at least `min` characters that no other
 * id among `others` shares, never ending on a dash; the whole id when none is shorter. The rule a
 * reference's session and row prefixes are lengthened by at mint (the bm: design's D2, unit 1b).
 */
export function shortestUniquePrefix(id: string, others: Iterable<string>, min = 8): string {
  const me = id.toLowerCase()
  const rest = [...others].map(o => o.toLowerCase()).filter(o => o !== me)
  for (let n = min; n < me.length; n++) {
    if (me[n - 1] === '-') continue
    const p = me.slice(0, n)
    if (!rest.some(o => o.startsWith(p))) return p
  }
  return me
}

/** The lookup of a record: `bm:<sid>.<n>~<8 hex of its uuid>`, with its words when given. */
export function lookupRef(r: { sessionId: string; n: number; uuid: string; words?: string }, opts: { sessionChars?: number } = {}): string {
  const check = r.uuid.replace(/-/g, '').toLowerCase().slice(0, 8)
  return formatBm({ spelling: 'bm', session: r.sessionId, record: r.n, check, ...(r.words ? { words: r.words } : {}) }, opts)!
}

/** The exact piece: `bm:<sid>/<row>[.p<part>][@<file>][~w:<words>]`, the row at `rowChars` when lengthened. */
export function exactRef(r: { sessionId: string; uuid: string; part?: number; file?: string; words?: string }, opts: { sessionChars?: number; rowChars?: number } = {}): string {
  return formatBm({
    spelling: 'bm',
    session: r.sessionId,
    uuid: r.uuid,
    ...(r.part !== undefined ? { part: r.part } : {}),
    ...(r.file !== undefined ? { file: r.file } : {}),
    ...(r.words ? { words: r.words } : {}),
  }, opts)!
}

/**
 * The `file:` spelling: the record's anchor (anchor.ts anchorHref), with the list marker's
 * parameters and `v=2` when the reference is a marker. Needs the full session id and the full uuid.
 */
export function formatFile(ref: Ref, dataRoot: string): string | undefined {
  if (!ref.session || !ref.uuid || ref.session.length !== 36 || ref.uuid.length !== 36) return undefined
  const href = anchorHref({
    sessionId: ref.session,
    uuid: ref.uuid,
    ...(ref.file !== undefined ? { file: ref.file } : {}),
    ...(ref.part !== undefined ? { part: ref.part } : {}),
    ...(ref.line !== undefined ? { line: ref.line } : {}),
    ...(ref.bytes ? { bytes: ref.bytes } : {}),
    ...(ref.words ? { words: ref.words } : {}),
  }, dataRoot)
  if (!(ref.list && ref.entry)) return href
  return href.replace(/&v=\d+$/, `&list=${encodeURIComponent(ref.list)}&id=${encodeURIComponent(ref.entry)}&v=2`)
}
