// Callback markers: the lines in a Markdown file that declare themselves entries of a list (the
// links-in-files design, 2026-10-27__06-11-58, step B3; djdarcy: "'callback' lines that work as
// anchors for our lists"). A marker names the list and the entry's id; the id is the line's
// identity, so the line is found again after it moves or its heading is renamed (the POC,
// tests/one-offs/thinking/poc-callback-markers/: every form survives `dz md-unwrap` on one line).
//
// Forms read:
//   file   a `file:` bookmark link carrying `list=` and `id=` (pressable; also names a place)
//   bm     a `bm:` reference link carrying `?list=&id=` (text the plugin reads)
//   comment  `<!-- bm list=<list> id=<entry> -->` (invisible when rendered; survives a wrap)
//   tag    `#list/<list>/<entry>` (read, never written)
//   block  an Obsidian block id `^<entry>` at the end of its line (read, never written; no list)
// A link marker whose URL was broken by a wrapped line (md-unwrap joins it with a space inside
// the URL, or it is still split across two lines) is reported `broken`, never dropped. Markers
// inside code (a fenced block or an inline span) are examples, not markers, and are skipped.
//
// Pure: a file's text in, its markers out.
import { parseRef, type Ref } from '../bookmarks/ref.ts'

export type MarkerForm = 'file' | 'bm' | 'comment' | 'tag' | 'block'

export type Marker = {
  /** The list the line belongs to; absent for a block id, which names only the entry. */
  list?: string
  /** The entry's id: the line's identity. */
  id: string
  /** The line the marker is on, 1 the first. */
  line: number
  form: MarkerForm
  /** For a link marker: the place it also names (a `file:` or `bm:` reference). */
  ref?: Ref
  /** A link marker whose URL was broken by a line wrap: found, but not usable until mended. */
  broken?: true
}

const ID = '[A-Za-z0-9][A-Za-z0-9._-]*'

/** The text with code (fenced blocks, inline spans) blanked out, keeping every line and column. */
function withoutCode(text: string): string {
  const lines = text.split('\n')
  let fence: string | undefined
  return lines
    .map(l => {
      const f = /^\s*(```+|~~~+)/.exec(l)
      if (fence !== undefined) {
        if (f && f[1]!.startsWith(fence)) fence = undefined
        return ' '.repeat(l.length)
      }
      if (f) {
        fence = f[1]!
        return ' '.repeat(l.length)
      }
      return l.replace(/`[^`\n]*`/g, s => ' '.repeat(s.length))
    })
    .join('\n')
}

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length

function loose(target: string): { list?: string; id?: string } {
  const list = new RegExp(`list=(${ID})`).exec(target)?.[1]
  const id = new RegExp(`[?&\\s]id=(${ID})`).exec(target)?.[1]
  return { ...(list ? { list } : {}), ...(id ? { id } : {}) }
}

/** Every marker in a Markdown file's text, in reading order. */
export function scanMarkers(text: string): Marker[] {
  const src = withoutCode(text.replace(/\r\n/g, '\n'))
  const found: { at: number; m: Marker }[] = []

  // Comments may span lines (a wrap inside one is harmless: the POC's arm A5).
  for (const c of src.matchAll(new RegExp(`<!--\\s*bm\\s+list=(${ID})\\s+id=(${ID})\\s*-->`, 'g'))) {
    found.push({ at: c.index!, m: { list: c[1]!, id: c[2]!, line: lineAt(src, c.index!), form: 'comment' } })
  }

  let offset = 0
  src.split('\n').forEach((l, k) => {
    const line = k + 1
    // Link markers: a Markdown link whose target carries `list=`.
    for (const a of l.matchAll(/\[[^\]\n]*\]\(([^)\n]*)\)/g)) {
      const target = a[1]!.trim()
      if (!/[?&\s]list=/.test(target) || !/^(file|bm):/i.test(target)) continue
      const form: MarkerForm = /^bm:/i.test(target) ? 'bm' : 'file'
      const ref = /\s/.test(target) ? undefined : parseRef(target)
      if (ref?.list && ref.entry) found.push({ at: offset + a.index!, m: { list: ref.list, id: ref.entry, line, form, ref } })
      else {
        const { list, id } = loose(target)
        if (id) found.push({ at: offset + a.index!, m: { ...(list ? { list } : {}), id, line, form, broken: true } })
      }
    }
    // A link marker still split across two lines: its target never closes on this line.
    const open = /\]\(((?:file|bm):[^)\n]*)$/i.exec(l)
    if (open && /[?&]list=/.test(open[1]!)) {
      const rest = src.slice(offset + l.length + 1).split('\n')[0] ?? ''
      const { list, id } = loose(`${open[1]} ${rest.split(')')[0]}`)
      if (id || list) found.push({ at: offset + open.index, m: { ...(list ? { list } : {}), id: id ?? '', line, form: /^bm:/i.test(open[1]!) ? 'bm' : 'file', broken: true } })
    }
    for (const t of l.matchAll(new RegExp(`(?<!\\S)#list/(${ID})/(${ID})`, 'g'))) {
      found.push({ at: offset + t.index!, m: { list: t[1]!, id: t[2]!, line, form: 'tag' } })
    }
    const b = new RegExp(`(?<=\\s)\\^(${ID})[ \\t]*$`).exec(l)
    if (b) found.push({ at: offset + b.index, m: { id: b[1]!, line, form: 'block' } })
    offset += l.length + 1
  })

  return found.sort((x, y) => x.at - y.at).map(f => f.m)
}

/** The markers of one list, by entry id; a second line claiming an id is the copy (the sources design's rule). */
export function markersOf(markers: readonly Marker[], list: string): { byId: Map<string, Marker>; copies: Marker[] } {
  const byId = new Map<string, Marker>()
  const copies: Marker[] = []
  for (const m of markers) {
    if (m.list !== list || m.broken) continue
    if (byId.has(m.id)) copies.push(m)
    else byId.set(m.id, m)
  }
  return { byId, copies }
}
