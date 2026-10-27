// Lists (#45, the first slice: 2026-10-26__22-25-54__dev-workflow-process__lists-the-first-slice.md):
// named, ordered, owned lists of places, kept per project. One file per project under the data
// root, `lists/<project>.json`, and a generated `lists/<project>.md` beside it for the oracle and
// Obsidian (L-1, L-2). An item names its place directly (L-3): a row of any conversation, a link
// (a file or a URL), or neither (a line of text).
//
// Pure: the file's text in, the file's text out; handlers/lists.ts reads and writes it.
import type { AnchorOwner } from '../bookmarks/anchor.ts'
import { hrefOf, primaryLink, v1to2Item, type ItemLink } from './item-links.ts'

/** 2 (0.7.10): an item's typed `links` replace its one `place`/`link`; the file keeps keys it does not know. */
export const LISTS_VERSION = 2

type RawFile = Record<string, unknown> & { version: number; lists?: unknown; removed?: unknown }

const itemsTo2 = (l: unknown) => {
  const x = l as { items?: unknown }
  return Array.isArray(x?.items) ? { ...(l as object), items: x.items.map(i => (i && typeof i === 'object' ? v1to2Item(i as Record<string, unknown>) : i)) } : l
}

/**
 * The steps from each version to the next: index 0 takes a version 1 file to version 2. A step is
 * registered here a save before LISTS_VERSION moves (the house rule: plugin/ hot-reloads, and a
 * reader at the new version with no step would refuse every file), and keeps every key it does not
 * change (the add-only rule, the links-in-files design 2026-10-27).
 */
export const LISTS_MIGRATIONS: readonly ((f: RawFile) => RawFile)[] = [
  // 1 -> 2: an item's `place`/`words`/`link` become its typed `links` (core/lists/item-links.ts).
  f => ({ ...f, version: 2, lists: Array.isArray(f.lists) ? f.lists.map(itemsTo2) : f.lists, removed: Array.isArray(f.removed) ? f.removed.map(itemsTo2) : f.removed }),
]

/** A row of a conversation, as a record addresses it (core/places/place.ts PlaceAddress, with the id it is drawn under). */
export type ListPlace = { session: string; uuid: string; file?: string; part?: number; drawn?: string }

export type ListItem = {
  /** Unique within its list, never reused there: `i<n>`. */
  id: string
  label: string
  why?: string
  /** Version 2: the item's links, typed; the first is what a press opens (core/lists/item-links.ts). */
  links?: ItemLink[]
  /** Version 1: the item's one place (read through item-links.ts linksOf, never directly). */
  place?: ListPlace
  /** Version 1: a file path, a `file:` URL or an `https:` URL. */
  link?: string
  /** Version 1: the words to highlight on arrival at a message. */
  words?: string
  by: AnchorOwner
  addedAt: number
  done?: boolean
}

/** Reserved (L-9): a list whose items are read from a file. Never written by version 1. */
export type ListSource = { kind: 'file'; path: string; pick?: string }

export type List = {
  /** Unique within the file, never reused there: a slug of the name, then `-2`, `-3`. */
  id: string
  name: string
  owner: AnchorOwner
  createdAt: number
  updatedAt: number
  /** The next item number. */
  next: number
  items: ListItem[]
  source?: ListSource
  /** Set when shared from the other side: the list it was copied from. */
  sharedFrom?: { owner: AnchorOwner; id: string }
}

export type ListsFile = {
  version: number
  writer: string
  /** The working folder's name and its full path (L-1). */
  project: string
  cwd: string
  updatedAt: number
  lists: List[]
  /** Lists deleted, kept as they were (as the register's tombstones), newest last. */
  removed: (List & { removedAt: number })[]
}

export const emptyLists = (project: string, cwd: string, writer: string, now: number): ListsFile =>
  ({ version: LISTS_VERSION, writer, project, cwd, updatedAt: now, lists: [], removed: [] })

const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

/** The project's name: the working folder's last part (the register header's `project`). */
export function projectOf(cwd: string): string {
  const p = slash(cwd)
  return p.slice(p.lastIndexOf('/') + 1) || 'root'
}

/** A name safe as a file name on every system: letters, digits, `.`, `_`, `-`. */
export const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'project'

/**
 * The file's base name under `lists/`: `<project>`, or `<project>--<hash8>` when a file of that
 * name holds another folder's lists (`holder`, the `cwd` the plain name's file records).
 */
export function listsBaseName(cwd: string, holder: string | undefined, hash: (s: string) => string): string {
  const base = fileSafe(projectOf(cwd))
  if (holder === undefined || sameFolder(holder, cwd)) return base
  return `${base}--${hash(slash(cwd).toLowerCase()).slice(0, 8)}`
}

const sameFolder = (a: string, b: string) => slash(a).toLowerCase() === slash(b).toLowerCase()

export type ParsedLists = { kind: 'ok'; file: ListsFile } | { kind: 'newer'; version: number } | { kind: 'bad'; why: string }

/** Reads the file's text. A newer version is not read (and so never written over). */
export function parseLists(text: string): ParsedLists {
  let o: unknown
  try {
    o = JSON.parse(text)
  } catch (err) {
    return { kind: 'bad', why: `not JSON: ${String(err)}` }
  }
  if (!o || typeof o !== 'object') return { kind: 'bad', why: 'not an object' }
  let raw = o as RawFile
  if (typeof raw.version !== 'number') return { kind: 'bad', why: 'no version' }
  if (raw.version > LISTS_VERSION) return { kind: 'newer', version: raw.version }
  // Older files are brought up to this version one step at a time.
  for (let v = Math.max(1, Math.trunc(raw.version)); v < LISTS_VERSION; v++) {
    const step = LISTS_MIGRATIONS[v - 1]
    if (!step) return { kind: 'bad', why: `no step from version ${v} to ${v + 1}` }
    raw = step(raw)
  }
  const f = raw as Partial<ListsFile> & Record<string, unknown>
  if (!Array.isArray(f.lists)) return { kind: 'bad', why: 'no lists' }
  const lists = f.lists.filter(isList)
  return {
    kind: 'ok',
    file: {
      // Keys this version does not know are kept, so a newer writer's additions survive a rewrite (add-only).
      ...f,
      version: LISTS_VERSION,
      writer: typeof f.writer === 'string' ? f.writer : '',
      project: typeof f.project === 'string' ? f.project : '',
      cwd: typeof f.cwd === 'string' ? f.cwd : '',
      updatedAt: typeof f.updatedAt === 'number' ? f.updatedAt : 0,
      lists: lists.map(l => ({ ...l, items: l.items.filter(isItem) })),
      removed: Array.isArray(f.removed) ? (f.removed.filter(isList) as ListsFile['removed']) : [],
    },
  }
}

function isList(l: unknown): l is List {
  const x = l as Partial<List>
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && (x.owner === 'user' || x.owner === 'claude') && Array.isArray(x.items)
}
function isItem(i: unknown): i is ListItem {
  const x = i as Partial<ListItem>
  return !!x && typeof x.id === 'string' && typeof x.label === 'string'
}

export function serializeLists(f: ListsFile): string {
  return `${JSON.stringify(f, null, 2)}\n`
}

// --- Operations -------------------------------------------------------------------------
// Each returns a new file or an error; the file passed in is never changed.

export type Op =
  | { op: 'create'; name: string; owner: AnchorOwner }
  | { op: 'rename'; list: string; name: string }
  | { op: 'delete'; list: string }
  | { op: 'add'; list: string; item: Omit<ListItem, 'id' | 'addedAt'>; at?: number }
  | { op: 'move'; list: string; item: string; to: number }
  | { op: 'remove'; list: string; item: string }
  | { op: 'done'; list: string; item: string; done?: boolean }
  | { op: 'edit'; list: string; item: string; label?: string; why?: string; links?: ItemLink[] }
  | { op: 'share'; list: string }

export type OpResult = { ok: true; file: ListsFile; list?: List; item?: ListItem } | { ok: false; error: string }

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'list'

/**
 * A list by its number among `owner`'s lists (1 the first; among all lists, in the pane's tab
 * order, with no owner), its id, its name (any case), or, last, a part of its name. The one
 * finder for the tool and `/bm-lists` (refactor-advisor 2026-10-27, row 5: the command had its
 * own rule, so `/bm-lists 2` failed where the tool's `list: "2"` worked).
 */
export function findList(f: ListsFile, ref: string, owner?: AnchorOwner): List | undefined {
  const r = ref.trim()
  if (!r) return undefined
  const mine = owner ? f.lists.filter(l => l.owner === owner) : f.lists
  if (/^\d+$/.test(r)) return mine[Number(r) - 1]
  const lower = r.toLowerCase()
  const named = (ls: readonly List[], match: (name: string) => boolean) => ls.find(l => match(l.name.toLowerCase()))
  return f.lists.find(l => l.id === r)
    ?? named(mine, n => n === lower) ?? named(f.lists, n => n === lower)
    ?? named(mine, n => n.includes(lower)) ?? named(f.lists, n => n.includes(lower))
}

/** An item by its id, or its number in the list (1 the first). */
export function findItem(l: List, ref: string): ListItem | undefined {
  const r = ref.trim()
  if (/^\d+$/.test(r)) return l.items[Number(r) - 1]
  return l.items.find(i => i.id === r)
}

function freshId(f: ListsFile, name: string): string {
  const taken = new Set([...f.lists, ...f.removed].map(l => l.id))
  const base = slug(name)
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

const withList = (f: ListsFile, l: List, now: number): ListsFile => ({ ...f, updatedAt: now, lists: f.lists.map(x => (x.id === l.id ? l : x)) })

export function applyListOp(f: ListsFile, op: Op, now: number): OpResult {
  if (op.op === 'create') {
    const name = op.name.trim()
    if (!name) return { ok: false, error: 'a list needs a name' }
    if (f.lists.some(l => l.owner === op.owner && l.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: `there is already a list named "${name}" on that side` }
    const list: List = { id: freshId(f, name), name, owner: op.owner, createdAt: now, updatedAt: now, next: 1, items: [] }
    return { ok: true, file: { ...f, updatedAt: now, lists: [...f.lists, list] }, list }
  }
  const list = f.lists.find(l => l.id === op.list)
  if (!list) return { ok: false, error: `no list "${op.list}"` }
  if (op.op === 'rename') {
    const name = op.name.trim()
    if (!name) return { ok: false, error: 'a list needs a name' }
    const l = { ...list, name, updatedAt: now }
    return { ok: true, file: withList(f, l, now), list: l }
  }
  if (op.op === 'delete') {
    return { ok: true, file: { ...f, updatedAt: now, lists: f.lists.filter(l => l.id !== list.id), removed: [...f.removed, { ...list, removedAt: now }] }, list }
  }
  if (op.op === 'share') {
    const to: AnchorOwner = list.owner === 'user' ? 'claude' : 'user'
    const name = f.lists.some(l => l.owner === to && l.name.toLowerCase() === list.name.toLowerCase()) ? `${list.name} (shared)` : list.name
    const copy: List = { ...list, id: freshId(f, name), name, owner: to, createdAt: now, updatedAt: now, items: list.items.map(i => ({ ...i })), sharedFrom: { owner: list.owner, id: list.id } }
    return { ok: true, file: { ...f, updatedAt: now, lists: [...f.lists, copy] }, list: copy }
  }
  if (op.op === 'add') {
    const label = op.item.label.trim()
    if (!label) return { ok: false, error: 'an item needs a label' }
    const item: ListItem = { ...op.item, label, id: `i${list.next}`, addedAt: now }
    const at = op.at === undefined ? list.items.length : clamp(op.at - 1, 0, list.items.length)
    const items = [...list.items.slice(0, at), item, ...list.items.slice(at)]
    const l = { ...list, next: list.next + 1, items, updatedAt: now }
    return { ok: true, file: withList(f, l, now), list: l, item }
  }
  const item = findItem(list, op.item)
  if (!item) return { ok: false, error: `no item "${op.item}" in "${list.name}"` }
  const rest = list.items.filter(i => i.id !== item.id)
  if (op.op === 'move') {
    const to = clamp(op.to - 1, 0, rest.length)
    const l = { ...list, items: [...rest.slice(0, to), item, ...rest.slice(to)], updatedAt: now }
    return { ok: true, file: withList(f, l, now), list: l, item }
  }
  if (op.op === 'remove') {
    const l = { ...list, items: rest, updatedAt: now }
    return { ok: true, file: withList(f, l, now), list: l, item }
  }
  if (op.op === 'done') {
    const done = op.done ?? !item.done
    const changed: ListItem = { ...item }
    if (done) changed.done = true
    else delete changed.done
    const l = { ...list, items: list.items.map(i => (i.id === item.id ? changed : i)), updatedAt: now }
    return { ok: true, file: withList(f, l, now), list: l, item: changed }
  }
  // edit
  const changed: ListItem = { ...item, ...(op.label?.trim() ? { label: op.label.trim() } : {}), ...(op.why !== undefined ? { why: op.why } : {}), ...(op.links ? { links: op.links } : {}) }
  const l = { ...list, items: list.items.map(i => (i.id === item.id ? changed : i)), updatedAt: now }
  return { ok: true, file: withList(f, l, now), list: l, item: changed }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** An item's link in the page, in an answer and in the pane: its first link as a URL (core/lists/item-links.ts). */
export function linkOf(i: ListItem, root: string | undefined): string | undefined {
  const first = primaryLink(i)
  return first ? hrefOf(first, root) : undefined
}

// --- The Markdown page (L-2) ------------------------------------------------------------
// Its wording is the plugin's own file, plugin/templates/lists-page.md (the house rule: text the
// plugin writes to disk lives in a template a person can edit; refactor-advisor 2026-10-27).
// The template is named parts, each after a `<!-- part: <name> -->` line: `page` (with
// `{{project}}`, `{{mark}}`, `{{json}}`, `{{lists}}`), `yours`, `claudes`, `empty-list`, `no-lists`.

export const LISTS_PAGE_MARK = '<!-- generated by the bookmarks plugin from'
export const LISTS_PAGE_TEMPLATE = 'templates/lists-page.md'
const PAGE_PARTS = ['page', 'yours', 'claudes', 'empty-list', 'no-lists'] as const

/** The template's parts by name, each without its trailing newline. */
export function templateParts(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const t = text.replace(/\r\n/g, '\n')
  const re = /^<!-- part: ([a-z-]+) -->\n/gm
  const marks = [...t.matchAll(re)]
  marks.forEach((m, k) => {
    const start = m.index! + m[0].length
    const end = k + 1 < marks.length ? marks[k + 1]!.index! : t.length
    out[m[1]!] = t.slice(start, end).replace(/\n+$/, '')
  })
  return out
}

/** What an item's link is in the page: its place's anchor URL, its own link, or none. */
export type LinkOf = (item: ListItem) => string | undefined

/**
 * The page for a project's lists, from the template's parts: yours first, then Claude's, each
 * item a link where it has one. `missing` names the parts the template lacks (a packaging bug the
 * caller reports; no wording is filled from code).
 */
export function listsPage(f: ListsFile, jsonName: string, linkOf: LinkOf, template: string): { text: string } | { missing: string[] } {
  const parts = templateParts(template)
  const missing = PAGE_PARTS.filter(p => parts[p] === undefined)
  if (missing.length) return { missing }
  const md = (s: string) => s.replace(/([[\]|*_`])/g, '\\$1')
  const body: string[] = []
  for (const owner of ['user', 'claude'] as const) {
    const mine = f.lists.filter(l => l.owner === owner)
    if (!mine.length) continue
    body.push(parts[owner === 'user' ? 'yours' : 'claudes']!, '')
    for (const l of mine) {
      body.push(`### ${md(l.name)}`, '')
      if (!l.items.length) body.push(parts['empty-list']!)
      l.items.forEach((i, n) => {
        const href = linkOf(i)
        const text = href ? `[${i.label.replace(/[[\]]/g, ' ')}](${href})` : md(i.label)
        body.push(`${n + 1}. ${i.done ? '~~' : ''}${text}${i.done ? '~~' : ''}${i.why ? ` -- ${md(i.why)}` : ''}`)
      })
      body.push('')
    }
  }
  if (!f.lists.length) body.push(parts['no-lists']!, '')
  const fill: Record<string, string> = { project: md(f.project), mark: LISTS_PAGE_MARK, json: jsonName, lists: body.join('\n') }
  return { text: `${parts.page!.replace(/\{\{(\w+)\}\}/g, (all, k: string) => fill[k] ?? all)}\n` }
}
