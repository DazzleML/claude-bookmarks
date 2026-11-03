// Bundles (the bundles design, 2026-10-30__23-47-01, unit 2; djdarcy, 2026-10-30: "we could then
// reuse the bundle in different places but choose DIFFERENT items in that same bundle to present as
// the top-level item in different lists"). A bundle is a set of links kept once in the lists file
// (`bundles`); an item in any list points at one (`bundle`) and chooses its face (`face`, a link's
// identity, item-links.ts linkKey). The item's own `links` stay a copy of the bundle's with its face
// first, refreshed after every operation, so every press, the page and an older build read an item
// as they always have; the bundle is the one source.
//
// An item becomes a bundle when an operation leaves it with two or more links (djdarcy, 2026-10-31:
// "each item interior the list should be a bundle more often than not. That doesn't mean it has to
// be a bundle"); an item with one link or none is left exactly as it was. Only the item an operation
// touched is turned into a bundle, never every item in the file at once.
//
// `bundles` and the item fields are additive within lists format 2: parseLists keeps keys it does
// not know (lists.ts), so no version moves. Pure; lists.ts applyListOp calls it.
//
// An item's own links (0.8.x unit 5b; the bundles design's 00:32 addendum, djdarcy: "people should
// still be able to use the list to add other slightly disconnected entries as well that aren't a
// part of the bundle"): a bundled item may hold `own` links, this list's and not the bundle's. Its
// `links` copy is the bundle's links followed by its own, the face first among all of them; a link
// added to a bundled item joins the bundle unless the edit says `into: 'item'`; an attach never
// carries another list's own links; an own link the bundle also holds is dropped from `own`.
import type { AnchorOwner } from '../bookmarks/anchor.ts'
import { linkKey, linksOf, sameLink, type ItemLink } from './item-links.ts'
import type { List, ListItem, ListsFile } from './lists.ts'

export type Bundle = {
  /** Unique within the file, never reused there: `b<n>`. */
  id: string
  label: string
  why?: string
  links: ItemLink[]
  by: AnchorOwner
  createdAt: number
  updatedAt: number
}

/** The operations on bundles, beside lists.ts's own. */
export type BundleOp =
  /** `own`: the identities (linkKey) of the item's links that stay its own rather than join the bundle; on an item already a bundle, those links move out of the bundle to the item's own. */
  | { op: 'bundle'; list: string; item: string; own?: string[] }
  | { op: 'attach'; list: string; bundle: string; face?: string; label?: string; at?: number; by?: AnchorOwner }
  | { op: 'face'; list: string; item: string; face: string }
  | { op: 'bundle-link'; bundle: string; links: ItemLink[] }
  | { op: 'bundle-unlink'; bundle: string; link: string }

export const BUNDLE_OPS: ReadonlySet<string> = new Set(['bundle', 'attach', 'face', 'bundle-link', 'bundle-unlink'])

export type BundleResult = { ok: true; file: ListsFile; list?: List; item?: ListItem; bundle?: Bundle } | { ok: false; error: string }

export const bundlesOf = (f: ListsFile): Bundle[] => f.bundles ?? []
export const findBundle = (f: ListsFile, id: string): Bundle | undefined => bundlesOf(f).find(b => b.id === id)

function freshBundleId(f: ListsFile): string {
  const taken = new Set(bundlesOf(f).map(b => b.id))
  for (let n = bundlesOf(f).length + 1; ; n++) if (!taken.has(`b${n}`)) return `b${n}`
}

/** A bundle's links with `face` first, the rest in the bundle's order. */
export function faceFirst(links: readonly ItemLink[], face: string | undefined): ItemLink[] {
  const at = face === undefined ? -1 : links.findIndex(l => linkKey(l) === face)
  return at <= 0 ? [...links] : [links[at]!, ...links.slice(0, at), ...links.slice(at + 1)]
}

/** Links added once each, by identity, after those already there; a link given again with an `about` gains it. */
const union = (have: readonly ItemLink[], more: readonly ItemLink[]): ItemLink[] => {
  const out = [...have]
  for (const l of more) {
    const at = out.findIndex(h => sameLink(h, l))
    if (at < 0) out.push(l)
    else if (l.about && l.about !== out[at]!.about) out[at] = { ...out[at]!, about: l.about }
  }
  return out
}

const withBundle = (f: ListsFile, b: Bundle): ListsFile =>
  ({ ...f, bundles: bundlesOf(f).some(x => x.id === b.id) ? bundlesOf(f).map(x => (x.id === b.id ? b : x)) : [...bundlesOf(f), b] })

const withItem = (f: ListsFile, list: string, item: ListItem): ListsFile =>
  ({ ...f, lists: f.lists.map(l => (l.id === list ? { ...l, items: l.items.map(i => (i.id === item.id ? item : i)) } : l)) })

/** A bundled item's own links, less any the bundle also holds (nothing doubles). */
export const ownOf = (b: Pick<Bundle, 'links'>, item: Pick<ListItem, 'own'>): ItemLink[] =>
  (item.own ?? []).filter(o => !b.links.some(x => sameLink(x, o)))

/** Every link a bundled item shows, before its face is put first: the bundle's, then its own. */
export const allLinksOf = (b: Pick<Bundle, 'links'>, item: Pick<ListItem, 'own'>): ItemLink[] => [...b.links, ...ownOf(b, item)]

/**
 * A bundle made from an item's links; the item now points at it, its face its first link. The
 * links named in `ownKeys` stay the item's own and the rest form the bundle (the reviewed pass:
 * a link that is not truly part of the bundle sits beside it).
 */
function bundleItem(f: ListsFile, list: List, item: ListItem, now: number, ownKeys: ReadonlySet<string> = new Set()): { file: ListsFile; item: ListItem; bundle: Bundle } {
  const all = linksOf(item)
  const own = all.filter(l => ownKeys.has(linkKey(l)))
  const links = all.filter(l => !ownKeys.has(linkKey(l)))
  const bundle: Bundle = { id: freshBundleId(f), label: item.label, ...(item.why ? { why: item.why } : {}), links, by: item.by, createdAt: now, updatedAt: now }
  const changed: ListItem = { ...item, bundle: bundle.id, ...(all[0] ? { face: linkKey(all[0]) } : {}), links: all, ...(own.length ? { own } : {}) }
  return { file: withBundle(withItem(f, list.id, changed), bundle), item: changed, bundle }
}

/** The bundle ops. */
export function applyBundleOp(f: ListsFile, op: BundleOp, now: number, findItem: (l: List, ref: string) => ListItem | undefined): BundleResult {
  if (op.op === 'bundle-link' || op.op === 'bundle-unlink') {
    const b = findBundle(f, op.bundle)
    if (!b) return { ok: false, error: `no bundle "${op.bundle}"` }
    const links = op.op === 'bundle-link' ? union(b.links, op.links) : b.links.filter(l => linkKey(l) !== op.link)
    if (op.op === 'bundle-unlink' && links.length === b.links.length) return { ok: false, error: `that link is not in bundle "${b.id}"` }
    const bundle = { ...b, links, updatedAt: now }
    return { ok: true, file: { ...withBundle(f, bundle), updatedAt: now }, bundle }
  }
  const list = f.lists.find(l => l.id === op.list)
  if (!list) return { ok: false, error: `no list "${op.list}"` }
  if (op.op === 'attach') {
    const b = findBundle(f, op.bundle)
    if (!b) return { ok: false, error: `no bundle "${op.bundle}"` }
    if (op.face !== undefined && !b.links.some(l => linkKey(l) === op.face)) return { ok: false, error: `that face is not one of bundle "${b.id}"'s links` }
    const face = op.face ?? (b.links[0] ? linkKey(b.links[0]) : undefined)
    const item: ListItem = { id: `i${list.next}`, label: op.label?.trim() || b.label, ...(b.why ? { why: b.why } : {}), links: faceFirst(b.links, face), bundle: b.id, ...(face ? { face } : {}), by: op.by ?? b.by, addedAt: now }
    const at = op.at === undefined ? list.items.length : Math.max(0, Math.min(list.items.length, op.at - 1))
    const l: List = { ...list, next: list.next + 1, items: [...list.items.slice(0, at), item, ...list.items.slice(at)], updatedAt: now }
    return { ok: true, file: { ...f, updatedAt: now, lists: f.lists.map(x => (x.id === l.id ? l : x)) }, list: l, item }
  }
  const item = findItem(list, op.item)
  if (!item) return { ok: false, error: `no item "${op.item}" in "${list.name}"` }
  if (op.op === 'bundle') {
    const ownKeys = new Set(op.own ?? [])
    const have = linksOf(item)
    if ([...ownKeys].some(k => !have.some(l => linkKey(l) === k))) return { ok: false, error: 'a link named to stay the item\'s own is not one of its links' }
    if (item.bundle) {
      if (!ownKeys.size) return { ok: false, error: `item "${item.label}" is already bundle "${item.bundle}"` }
      // An item already a bundle: the named links leave the bundle and become this item's own.
      const b = findBundle(f, item.bundle)
      if (!b) return { ok: false, error: `no bundle "${item.bundle}"` }
      const stays = b.links.filter(l => !ownKeys.has(linkKey(l)))
      if (!stays.length) return { ok: false, error: 'a bundle keeps at least one link' }
      const changed: ListItem = { ...item, own: [...ownOf(b, item), ...b.links.filter(l => ownKeys.has(linkKey(l)))] }
      const bundle = { ...b, links: stays, updatedAt: now }
      return { ok: true, file: { ...withBundle(withItem(f, list.id, changed), bundle), updatedAt: now }, item: changed, bundle }
    }
    if (ownKeys.size >= have.length) return { ok: false, error: 'a bundle keeps at least one link' }
    const r = bundleItem(f, list, item, now, ownKeys)
    return { ok: true, file: { ...r.file, updatedAt: now }, item: r.item, bundle: r.bundle }
  }
  // face: any of the item's links, the bundle's or its own.
  const b = item.bundle ? findBundle(f, item.bundle) : undefined
  const links = b ? allLinksOf(b, item) : linksOf(item)
  if (!links.some(l => linkKey(l) === op.face)) return { ok: false, error: `that face is not one of the item's links` }
  const changed: ListItem = { ...item, face: op.face, links: faceFirst(links, op.face) }
  const l: List = { ...list, items: list.items.map(i => (i.id === item.id ? changed : i)), updatedAt: now }
  return { ok: true, file: { ...f, updatedAt: now, lists: f.lists.map(x => (x.id === l.id ? l : x)) }, list: l, item: changed }
}

/**
 * An `edit` that gives a bundled item a new set of links changes its bundle and its own links: a
 * link it leaves out leaves wherever it was, the bundle or the item's own; a link it adds joins the
 * bundle (after those there), or the item's own with `into: 'item'`. So the `link` and `unlink` a
 * person already uses work on a bundled item, and a change to the bundle reaches every list that
 * shows it, while the item's own links stay this list's.
 */
export function editBundled(f: ListsFile, list: string, item: ListItem, links: readonly ItemLink[], now: number, into: 'bundle' | 'item' = 'bundle'): ListsFile {
  const b = item.bundle ? findBundle(f, item.bundle) : undefined
  if (!b) return f
  const own = ownOf(b, item)
  const has = (set: readonly ItemLink[]) => (l: ItemLink) => set.some(x => sameLink(x, l))
  const kept = b.links.filter(has(links))
  const keptOwn = own.filter(has(links))
  const added = links.filter(l => !has(b.links)(l) && !has(own)(l))
  // union carries a changed `about` onto the kept link, in the bundle and in the item's own alike.
  const bundleLinks = union(kept, [...links.filter(has(kept)), ...(into === 'bundle' ? added : [])])
  const ownLinks = union(keptOwn, [...links.filter(has(keptOwn)), ...(into === 'item' ? added : [])])
  const changed: ListItem = { ...item }
  if (ownLinks.length) changed.own = ownLinks
  else delete changed.own
  return withBundle(withItem(f, list, changed), { ...b, links: bundleLinks, updatedAt: now })
}

/**
 * After every operation: the item it touched becomes a bundle when it holds two or more links; every
 * bundled item's copy is its bundle's links with its face first (a face no longer in the bundle falls
 * to its first link). Plain items are returned as the same objects.
 */
export function settle(f: ListsFile, now: number, touched?: { list: string; item: string }): ListsFile {
  let file = f
  if (touched) {
    const list = file.lists.find(l => l.id === touched.list)
    const item = list?.items.find(i => i.id === touched.item)
    if (list && item && !item.bundle && linksOf(item).length >= 2) file = bundleItem(file, list, item, now).file
  }
  if (!bundlesOf(file).length) return file
  const byId = new Map(bundlesOf(file).map(b => [b.id, b]))
  let changed = false
  const lists = file.lists.map(l => {
    let touchedList = false
    const items = l.items.map(i => {
      const b = i.bundle ? byId.get(i.bundle) : undefined
      if (!b) return i
      // The bundle's links, then this item's own (less any the bundle now holds), the face first.
      const own = ownOf(b, i)
      const all = [...b.links, ...own]
      const face = i.face !== undefined && all.some(x => linkKey(x) === i.face) ? i.face : all[0] ? linkKey(all[0]) : undefined
      const links = faceFirst(all, face)
      if (face === i.face && JSON.stringify(own) === JSON.stringify(i.own ?? []) && JSON.stringify(links) === JSON.stringify(i.links ?? [])) return i
      touchedList = true
      const next: ListItem = { ...i, links }
      if (face !== undefined) next.face = face
      else delete next.face
      if (own.length) next.own = own
      else delete next.own
      return next
    })
    if (!touchedList) return l
    changed = true
    return { ...l, items }
  })
  return changed ? { ...file, lists } : file
}
