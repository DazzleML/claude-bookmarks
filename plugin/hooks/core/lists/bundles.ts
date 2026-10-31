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
  | { op: 'bundle'; list: string; item: string }
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

/** A bundle made from an item's own links; the item now points at it, its face its first link. */
function bundleItem(f: ListsFile, list: List, item: ListItem, now: number): { file: ListsFile; item: ListItem; bundle: Bundle } {
  const links = linksOf(item)
  const bundle: Bundle = { id: freshBundleId(f), label: item.label, ...(item.why ? { why: item.why } : {}), links, by: item.by, createdAt: now, updatedAt: now }
  const changed: ListItem = { ...item, bundle: bundle.id, ...(links[0] ? { face: linkKey(links[0]) } : {}), links }
  const file = withBundle({ ...f, lists: f.lists.map(l => (l.id === list.id ? { ...l, items: l.items.map(i => (i.id === item.id ? changed : i)) } : l)) }, bundle)
  return { file, item: changed, bundle }
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
    if (item.bundle) return { ok: false, error: `item "${item.label}" is already bundle "${item.bundle}"` }
    const r = bundleItem(f, list, item, now)
    return { ok: true, file: { ...r.file, updatedAt: now }, item: r.item, bundle: r.bundle }
  }
  // face
  const b = item.bundle ? findBundle(f, item.bundle) : undefined
  const links = b ? b.links : linksOf(item)
  if (!links.some(l => linkKey(l) === op.face)) return { ok: false, error: `that face is not one of the item's links` }
  const changed: ListItem = { ...item, face: op.face, links: faceFirst(links, op.face) }
  const l: List = { ...list, items: list.items.map(i => (i.id === item.id ? changed : i)), updatedAt: now }
  return { ok: true, file: { ...f, updatedAt: now, lists: f.lists.map(x => (x.id === l.id ? l : x)) }, list: l, item: changed }
}

/**
 * An `edit` that gives a bundled item a new set of links changes its bundle: links it adds join
 * the bundle (after those there), links it leaves out leave it. So the `link` and `unlink` a person
 * already uses work on a bundled item, and reach every list that shows the bundle.
 */
export function editBundled(f: ListsFile, item: ListItem, links: readonly ItemLink[], now: number): ListsFile {
  const b = item.bundle ? findBundle(f, item.bundle) : undefined
  if (!b) return f
  // union carries a changed `about` onto the kept link.
  const kept = b.links.filter(l => links.some(x => sameLink(x, l)))
  return withBundle(f, { ...b, links: union(kept, links), updatedAt: now })
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
      const face = i.face !== undefined && b.links.some(x => linkKey(x) === i.face) ? i.face : b.links[0] ? linkKey(b.links[0]) : undefined
      const links = faceFirst(b.links, face)
      if (face === i.face && JSON.stringify(links) === JSON.stringify(i.links ?? [])) return i
      touchedList = true
      const next: ListItem = { ...i, links }
      if (face !== undefined) next.face = face
      else delete next.face
      return next
    })
    if (!touchedList) return l
    changed = true
    return { ...l, items }
  })
  return changed ? { ...file, lists } : file
}
