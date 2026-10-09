// Bookmark anchors: the durable address of a place in a conversation.
//
// Pure: no engine, no I/O, so it runs under `node --test` and a real debugger. The mod
// imports it; csb or a script can too. Design: the anchors DWP of 2026-10-09
// (`2026-10-09__06-55-30__dev-workflow-process__claude-anchors-persistent-marks-and-click-to-jump.md`).
//
// Identity is (sessionId, uuid). The URL names the bookmark's own export file under the
// data root and carries the position in a QUERY string: Windows opens a `file:` URL with a
// query on ctrl-click and refuses one with a `#` fragment, raw or encoded (measured
// 2026-10-09). The line, bytes and words are hints that make the place quick to find and
// easy to verify by hand; the uuid is the truth.
//
//   file:///<dataRoot>/bookmarks/sessions/<sessionId>/<uuid8>.md?u=<uuid>&l=<line>&b=<start>-<end>&q=<words>&v=1

export const ANCHOR_VERSION = 1

export type AnchorBy = 'claude' | 'user' | 'prose'
export type AnchorSource = 'tool' | 'promote' | 'prose'
/** Whose list a bookmark is on: the person's, or Claude's own (two separate sets). */
export type AnchorOwner = 'user' | 'claude'

export type AnchorRecord = {
  sessionId: string
  uuid: string
  /** Whose list this is on. Absent on records from before 2026-10-09: read it as `by`. */
  owner?: AnchorOwner
  /** Set on a copy made from the other list (`share`). */
  sharedFrom?: AnchorOwner
  /** 1-based line of the message in the transcript, as `grep -n` counts it. */
  line?: number
  /** Byte offset of that line's first byte, and of the byte after its last (newline excluded). */
  bytes?: [number, number]
  /** The words to highlight on arrival; a verbatim piece of the message. */
  words?: string
  head: string
  label: string
  why?: string
  temporary?: boolean
  createdAt: number
  updatedAt?: number
  by: AnchorBy
  source: AnchorSource
  /** The transcript path as last seen. A hint: the file moves between project folders on /cd. */
  transcript?: string
  role?: 'user' | 'assistant'
  timestamp?: string
}

export type ParsedAnchor = {
  href: string
  /** From the path (`.../sessions/<sessionId>/<uuid8>.md`); absent when the path is not ours. */
  sessionId?: string
  /** The full uuid when the link carried one, else the 8-character prefix. */
  uuid: string
  uuid8: string
  line?: number
  bytes?: [number, number]
  words?: string
  version?: number
  /** True for links written before the query form (position after `#`). */
  legacyFragment: boolean
}

export const uuid8 = (uuid: string): string => uuid.slice(0, 8).toLowerCase()

/** The list a record is on; older records without `owner` belong to whoever minted them. */
export const ownerOf = (r: Pick<AnchorRecord, 'owner' | 'by'>): AnchorOwner => r.owner ?? (r.by === 'user' ? 'user' : 'claude')

const UUID_FULL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_PREFIX = /^[0-9a-f]{8}(-[0-9a-f-]{1,27})?$/i

/** Forward slashes, no trailing slash. */
export function normalizeRoot(dataRoot: string): string {
  return dataRoot.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** The export file's path under the data root (forward slashes, not URL-encoded). */
export function anchorPath(dataRoot: string, sessionId: string, uuid: string): string {
  return `${normalizeRoot(dataRoot)}/bookmarks/sessions/${sessionId}/${uuid8(uuid)}.md`
}

/** A `file:` URL for a path: `C:/x y` -> `file:///C:/x%20y`; `/home/x` -> `file:///home/x`. */
export function fileUrl(path: string): string {
  const p = path.replace(/\\/g, '/')
  const abs = p.startsWith('/') ? p : `/${p}`
  // `encodeURI` leaves `( ) ? #` raw (so does `encodeURIComponent` for the parens): a `)`
  // ends the markdown link early (a data root under `Program Files (x86)`), and `?` or `#`
  // would split the path from the query (tester sweep, 2026-10-09). They are plain path
  // characters here, so they are percent-encoded by hand.
  return `file://${encodeURI(abs).replace(/[()?#]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}

/** The anchor URL of a record. */
export function anchorHref(record: Pick<AnchorRecord, 'sessionId' | 'uuid' | 'line' | 'bytes' | 'words'>, dataRoot: string): string {
  const params = [`u=${record.uuid}`]
  if (record.line !== undefined) params.push(`l=${record.line}`)
  if (record.bytes) params.push(`b=${record.bytes[0]}-${record.bytes[1]}`)
  if (record.words) params.push(`q=${encodeURIComponent(record.words)}`)
  params.push(`v=${ANCHOR_VERSION}`)
  return `${fileUrl(anchorPath(dataRoot, record.sessionId, record.uuid))}?${params.join('&')}`
}

/** The markdown link a reply writes for a record. */
export function anchorMarkdown(record: AnchorRecord, dataRoot: string, label = record.label): string {
  return `[${label.replace(/[[\]]/g, ' ')}](${anchorHref(record, dataRoot)})`
}

const PATH_RE = /\/bookmarks\/sessions\/([0-9a-f-]{36})\/([0-9a-f]{8})\.md$/i

/**
 * Reads an anchor URL. Undefined for anything that is not one: not `file:`, no `u`, a `u`
 * that is not a uuid or a uuid prefix, or a `u` that disagrees with the filename.
 */
export function parseAnchor(href: string): ParsedAnchor | undefined {
  if (!/^file:/i.test(href)) return undefined
  const q = href.indexOf('?')
  const hash = href.indexOf('#')
  const cut = q >= 0 ? q : hash
  if (cut < 0) return undefined
  const pathPart = safeDecode(href.slice(0, cut))
  // Parameters after `?`, and after a `#` too (the morning's legacy form, or both).
  const tail = href.slice(cut + 1).replace(/#/g, '&')
  let uuid: string | undefined
  let line: number | undefined
  let bytes: [number, number] | undefined
  let words: string | undefined
  let version: number | undefined
  for (const part of tail.split('&')) {
    if (!part) continue
    const eq = part.indexOf('=')
    const k = eq < 0 ? part : part.slice(0, eq)
    const v = eq < 0 ? '' : part.slice(eq + 1)
    switch (k) {
      case 'u':
        if (UUID_PREFIX.test(v)) uuid = v.toLowerCase()
        break
      case 'l':
        if (/^\d+$/.test(v)) line = Number(v)
        break
      case 'b': {
        const m = /^(\d+)-(\d+)$/.exec(v)
        if (m) bytes = [Number(m[1]), Number(m[2])]
        break
      }
      case 'q': {
        const w = safeDecode(v.replace(/\+/g, ' ')).trim()
        if (w) words = w
        break
      }
      case 'v':
        if (/^\d+$/.test(v)) version = Number(v)
        break
    }
  }
  if (!uuid) return undefined
  const m = PATH_RE.exec(pathPart)
  const sessionId = m?.[1]?.toLowerCase()
  const fileUuid8 = m?.[2]?.toLowerCase()
  if (fileUuid8 && fileUuid8 !== uuid8(uuid)) return undefined
  return { href, sessionId, uuid, uuid8: uuid8(uuid), line, bytes, words, version, legacyFragment: q < 0 }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export type LinkKind = 'anchor' | 'file' | 'web' | 'other'

export type MarkdownLink = {
  kind: LinkKind
  label: string
  href: string
  /** Index of `[` and of the character after `)` in the text. */
  start: number
  end: number
  anchor?: ParsedAnchor
}

const LINK_RE = /\[([^\]\n]*)\]\(([^)\s]+)\)/g

/**
 * The markdown links in a text, by kind, skipping fenced and inline code. A link whose
 * href is an anchor URL carries its parse.
 */
export function markdownLinks(text: string): MarkdownLink[] {
  const out: MarkdownLink[] = []
  let offset = 0
  let inFence = false
  for (const lineText of text.split('\n')) {
    const lineStart = offset
    offset += lineText.length + 1
    if (/^\s*(```|~~~)/.test(lineText)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    for (const m of lineText.matchAll(LINK_RE)) {
      if (insideInlineCode(lineText, m.index!)) continue
      const label = m[1]!
      const href = m[2]!
      const anchor = parseAnchor(href)
      const kind: LinkKind = anchor ? 'anchor' : /^file:/i.test(href) ? 'file' : /^https?:/i.test(href) ? 'web' : 'other'
      out.push({ kind, label, href, start: lineStart + m.index!, end: lineStart + m.index! + m[0].length, ...(anchor ? { anchor } : {}) })
    }
  }
  return out
}

function insideInlineCode(lineText: string, at: number): boolean {
  let ticks = 0
  for (let i = 0; i < at; i++) if (lineText[i] === '`') ticks++
  return ticks % 2 === 1
}

export const anchorLinks = (text: string): MarkdownLink[] => markdownLinks(text).filter(l => l.kind === 'anchor')

export type MarkerStyle = 'glyph' | 'text' | 'off'

export const MARKERS: Record<Exclude<MarkerStyle, 'off'>, Partial<Record<LinkKind, string>>> = {
  glyph: { anchor: '⚓ ', file: '▤ ' },
  text: { anchor: '[bm] ', file: '[file] ' },
}

/** The label with its kind marker in front, unless the style is off or the kind unmarked. */
export function markLabel(label: string, kind: LinkKind, style: MarkerStyle): string {
  if (style === 'off') return label
  const marker = MARKERS[style][kind]
  if (!marker || label.startsWith(marker)) return label
  return marker + label
}

/**
 * Rewrites a text's links so each label carries its kind marker. Only the drawn text
 * changes; hrefs are untouched (so `pressableLinks` still matches them).
 */
export function markLinks(text: string, style: MarkerStyle): string {
  if (style === 'off') return text
  let out = ''
  let last = 0
  for (const l of markdownLinks(text)) {
    const marked = markLabel(l.label, l.kind, style)
    if (marked === l.label) continue
    out += text.slice(last, l.start) + `[${marked}](${l.href})`
    last = l.end
  }
  return out + text.slice(last)
}

export type FilePosition = { path: string; line?: number; endLine?: number; column?: number }

/**
 * `path:801`, `path:801-822`, `path:801:5` (vim and VS Code spellings). A Windows drive
 * letter (`C:\x`) is not a line.
 */
export function parsePosition(ref: string): FilePosition | undefined {
  const s = ref.trim()
  if (!s) return undefined
  const m = /^(.+?):(\d+)(?:-(\d+)|:(\d+))?$/.exec(s)
  if (!m) return { path: s }
  const path = m[1]!
  if (/^[A-Za-z]$/.test(path)) return { path: s } // `C:801` is not a position
  const pos: FilePosition = { path, line: Number(m[2]) }
  if (m[3]) pos.endLine = Number(m[3])
  if (m[4]) pos.column = Number(m[4])
  return pos
}

/** UTF-8 byte length without Node's Buffer (the mod runtime has neither Node nor DOM). */
export function utf8ByteLength(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4
      i++ // the low surrogate
    } else n += 3
  }
  return n
}
