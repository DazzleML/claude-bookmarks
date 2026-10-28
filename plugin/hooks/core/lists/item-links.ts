// A list item's links (the links-in-files design, 2026-10-27__06-11-58, step B2; djdarcy: "multiple
// links in a single list item ... links from the real conversation, links to files, and links to
// github issues all in one item"). An item holds a typed list; the first is what a press opens.
//
//   place   a row of a conversation (the record address, and the words to highlight)
//   file    a file on this machine, by path
//   url     a web page
//   issue   a GitHub issue (or pull request), drawn `#45`
//   line    a callback line: the line in a Markdown file whose marker carries `id`
//   ref     a `bm:` reference kept as typed, because it did not resolve when it was added (the bm:
//           short-reference design, unit 6); read again on a press. Never stored as a file path.
//
// Version 1 items held one target, `place` (with `words`) or `link`; linksOf reads both shapes, so
// every reader works the same before and after the file is migrated (v1to2Item). An unknown kind
// from a newer writer is kept as it is.
//
// Pure.
import { anchorHref, fileUrl } from '../bookmarks/anchor.ts'
import { parseRef } from '../bookmarks/ref.ts'

export type PlaceLink = { kind: 'place'; session: string; uuid: string; file?: string; part?: number; drawn?: string; words?: string }
export type FileLink = { kind: 'file'; path: string }
export type UrlLink = { kind: 'url'; href: string }
export type IssueLink = { kind: 'issue'; repo: string; n: number }
export type LineLink = { kind: 'line'; path: string; id: string }
export type RefLink = { kind: 'ref'; text: string }
export type ItemLink = PlaceLink | FileLink | UrlLink | IssueLink | LineLink | RefLink

/** The fields an item's links come from: v2's `links`, or v1's single `place`/`link`/`words`. */
export type Linked = {
  links?: readonly ItemLink[]
  place?: { session: string; uuid: string; file?: string; part?: number; drawn?: string }
  link?: string
  words?: string
}

const ISSUE = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/(?:issues|pull)\/(\d+)\/?(?:[?#].*)?$/i

function decodePath(fileHref: string): string {
  const p = fileHref.replace(/^file:\/\/\/?/i, '')
  let d = p
  try {
    d = decodeURIComponent(p)
  } catch {
    /* keep it as written */
  }
  // `file:///C:/x` -> `C:/x`; `file:///home/x` -> `/home/x`.
  return /^[A-Za-z]:/.test(d) ? d : `/${d.replace(/^\/+/, '')}`
}

const FULL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A link typed in by a person or Claude, as the kind it is: a `bm:` reference (kept as typed; the
 * lists handler resolves it at add), a pasted bookmark link (its place), a GitHub issue, a web
 * page, or a file.
 */
export function linkFromText(text: string): ItemLink | undefined {
  const t = text.trim()
  if (!t) return undefined
  if (/^bm:/i.test(t)) return { kind: 'ref', text: t }
  const ref = /^<?file:/i.test(t) ? parseRef(t) : undefined
  if (ref?.session && ref.uuid && FULL_ID.test(ref.session) && FULL_ID.test(ref.uuid)) {
    return { kind: 'place', session: ref.session, uuid: ref.uuid, ...(ref.file !== undefined ? { file: ref.file } : {}), ...(ref.part !== undefined ? { part: ref.part } : {}), ...(ref.words ? { words: ref.words } : {}) }
  }
  const issue = ISSUE.exec(t)
  if (issue) return { kind: 'issue', repo: issue[1]!, n: Number(issue[2]) }
  if (/^https?:/i.test(t)) return { kind: 'url', href: t }
  if (/^file:/i.test(t)) return { kind: 'file', path: decodePath(t) }
  return { kind: 'file', path: t.replace(/\\/g, '/') }
}

const isLink = (l: unknown): l is ItemLink => !!l && typeof l === 'object' && typeof (l as { kind?: unknown }).kind === 'string'

/** An item's links, from either shape; a v2 item's own list as it is. */
export function linksOf(i: Linked): ItemLink[] {
  if (Array.isArray(i.links)) return i.links.filter(isLink)
  const out: ItemLink[] = []
  if (i.place) out.push({ kind: 'place', ...i.place, ...(i.words ? { words: i.words } : {}) })
  if (i.link) {
    const l = linkFromText(i.link)
    if (l) out.push(l)
  }
  return out
}

/** What a press opens: the item's first link. */
export const primaryLink = (i: Linked): ItemLink | undefined => linksOf(i)[0]

/** The item's first conversation place, if it has one (the landing reads it). */
export const placeLinkOf = (i: Linked): PlaceLink | undefined => linksOf(i).find((l): l is PlaceLink => l.kind === 'place')

export const issueUrl = (l: IssueLink): string => `https://github.com/${l.repo}/issues/${l.n}`

/** A link as a pressable URL: a place's anchor (needs the data root), a file's `file:` URL, the page, the issue. */
export function hrefOf(l: ItemLink, root: string | undefined): string | undefined {
  switch (l.kind) {
    case 'place':
      return root ? anchorHref({ sessionId: l.session, uuid: l.uuid, ...(l.file !== undefined ? { file: l.file } : {}), ...(l.part !== undefined ? { part: l.part } : {}), ...(l.words ? { words: l.words } : {}) }, root) : undefined
    case 'file':
    case 'line':
      return fileUrl(l.path)
    case 'url':
      return l.href
    case 'issue':
      return issueUrl(l)
    default:
      return undefined
  }
}

/** A link as text a person can paste: a file's path, a page's or an issue's URL, a reference as typed; a place has none. */
export function textOf(l: ItemLink): string | undefined {
  switch (l.kind) {
    case 'file':
    case 'line':
      return l.path
    case 'ref':
      return l.text
    case 'url':
      return l.href
    case 'issue':
      return issueUrl(l)
    default:
      return undefined
  }
}

/**
 * A version 1 item as a version 2 item: `place` (with `words`) and `link` become `links`, every
 * other key kept as it is (the add-only rule). A v2 item (it has `links`) is returned unchanged.
 */
export function v1to2Item<T extends Linked>(i: T): Omit<T, 'place' | 'link' | 'words'> & { links: ItemLink[] } {
  if (Array.isArray(i.links)) return i as unknown as Omit<T, 'place' | 'link' | 'words'> & { links: ItemLink[] }
  const { place: _place, link: _link, words: _words, ...rest } = i
  return { ...rest, links: linksOf(i) }
}
