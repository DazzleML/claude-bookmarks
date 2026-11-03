// The `lists` tool (#45, L-7): what the model is told it takes, how its call is read, and the
// shapes it is answered with (as core/bookmarks/bookmark-tool.ts for the bookmark tool; moved
// here from the handler, refactor-advisor 2026-10-27 row 6). Deferred (found through tool search
// when needed), since it is used far less often than `bookmark` and every non-deferred tool's
// schema is sent every turn. The handler is handlers/lists.ts listsTool.
import { linkOf, type List, type ListItem } from './lists.ts'
import { hrefOf, linksOf, placeLinkOf, sameLink, type ItemLink } from './item-links.ts'
import { short } from '../kit/message-id.ts'
import type { AnchorOwner } from '../bookmarks/anchor.ts'

/** One link the tool is asked to add: a place of this conversation (`query`/`uuid`), or a file path or URL (`link`). */
export type LinkWant = { query?: string; uuid?: string; link?: string; words?: string; about?: string }

export type ListsToolInput = {
  /** add, link: more links for the item, after the one given by the top-level fields. */
  links?: LinkWant[]
  action: string
  list?: string
  name?: string
  owner: AnchorOwner
  item?: string
  label?: string
  why?: string
  query?: string
  uuid?: string
  link?: string
  words?: string
  to?: number
  at?: number
  done?: boolean
  /** attach: the bundle's id (`b1`), as an item's answer names it. */
  bundle?: string
  /** add, link: one sentence of what the top-level link is; about: the text set on link `at`. */
  about?: string
  /** link, on a bundled item: where the new links go -- the bundle (the default) or the item's own. */
  into?: 'bundle' | 'item'
  /** bundle: the numbers of the item's links (1 the first) that stay its own, beside the bundle. */
  own?: number[]
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : undefined)

/** The call as read: every field trimmed and typed, the defaults applied (action `lists`, owner `claude`). */
export function parseListsInput(input: Record<string, unknown>): ListsToolInput {
  const owner: AnchorOwner = input.owner === 'user' ? 'user' : 'claude'
  const o: ListsToolInput = { action: str(input.action) ?? 'lists', owner }
  for (const k of ['list', 'name', 'label', 'why', 'query', 'uuid', 'link', 'words', 'bundle', 'about'] as const) {
    const v = str(input[k])
    if (v !== undefined) o[k] = v
  }
  const item = typeof input.item === 'number' ? String(input.item) : str(input.item)
  if (item !== undefined) o.item = item
  for (const k of ['to', 'at'] as const) {
    const v = num(input[k])
    if (v !== undefined) o[k] = v
  }
  if (typeof input.done === 'boolean') o.done = input.done
  const into = str(input.into)
  if (into === 'item' || into === 'bundle') o.into = into
  // `own` as numbers, a JSON string of them, or "1, 3" -- whichever form the call arrives in.
  let rawOwn: unknown = input.own
  if (typeof rawOwn === 'string') {
    try {
      rawOwn = JSON.parse(rawOwn.trim().startsWith('[') ? rawOwn : `[${rawOwn}]`)
    } catch {
      rawOwn = undefined
    }
  }
  if (Array.isArray(rawOwn)) {
    const own = rawOwn.map(num).filter((n): n is number => n !== undefined)
    if (own.length) o.own = own
  } else if (num(rawOwn) !== undefined) o.own = [num(rawOwn)!]
  // Claude Code delivers an array parameter as a JSON string (seen live, 2026-10-27): read either.
  let rawLinks: unknown = input.links
  if (typeof rawLinks === 'string') {
    try {
      rawLinks = JSON.parse(rawLinks)
    } catch {
      rawLinks = undefined
    }
  }
  if (Array.isArray(rawLinks)) {
    const wants: LinkWant[] = []
    for (const w of rawLinks) {
      const x = (typeof w === 'string' ? { link: w } : w) as Record<string, unknown>
      if (!x || typeof x !== 'object') continue
      const want: LinkWant = {}
      for (const k of ['query', 'uuid', 'link', 'words', 'about'] as const) {
        const v = str(x[k])
        if (v !== undefined) want[k] = v
      }
      if (want.query || want.uuid || want.link) wants.push(want)
    }
    if (wants.length) o.links = wants
  }
  return o
}

/** The links a call asks for, in order: the top-level `query`/`uuid`/`link` first, then `links`. */
export function linkWants(input: ListsToolInput): LinkWant[] {
  const out: LinkWant[] = []
  // `about` belongs to the top-level link when there is one (the `about` action uses it alone).
  const about = input.about ? { about: input.about } : {}
  if (input.query || input.uuid) out.push({ ...(input.query ? { query: input.query } : {}), ...(input.uuid ? { uuid: input.uuid } : {}), ...(input.words ? { words: input.words } : {}), ...about })
  if (input.link) out.push({ link: input.link, ...(input.query || input.uuid ? {} : about) })
  return [...out, ...(input.links ?? [])]
}

/** A link as the model sees it: its kind and what it names, in short. */
export function describeLink(l: ItemLink, n: number, root: string | undefined) {
  const what =
    l.kind === 'place' ? `${short(l.session)}/${short(l.uuid)}${l.file ? ` in ${l.file}` : ''}${l.part !== undefined ? ` (block ${l.part})` : ''}`
    : l.kind === 'file' ? l.path
    : l.kind === 'url' ? l.href
    : l.kind === 'issue' ? `${l.repo}#${l.n}`
    : l.kind === 'line' ? `${l.path} (line ${l.id})`
    : l.kind === 'ref' ? `${l.text} (not resolved here)`
    : 'a link this version cannot read'
  const href = hrefOf(l, root)
  return { n, kind: l.kind, what, ...(l.about ? { about: l.about } : {}), ...(href ? { href } : {}) }
}

/** A list as the model sees it. */
export const brief = (l: List) => ({ id: l.id, name: l.name, owner: l.owner, items: l.items.length, done: l.items.filter(i => i.done).length })

/** An item as the model sees it: its number, its place in short, and its link as markdown. */
export function describeItem(i: ListItem, n: number, root: string | undefined) {
  const link = linkOf(i, root)
  const p = placeLinkOf(i)
  return {
    n, id: i.id, label: i.label,
    ...(i.why ? { why: i.why } : {}),
    ...(i.done ? { done: true } : {}),
    ...(i.bundle ? { bundle: i.bundle } : {}),
    ...(p ? { place: `${short(p.session)}/${short(p.uuid)}${p.file ? ` in ${p.file}` : ''}` } : {}),
    ...(link ? { markdown: `[${i.label.replace(/[[\]]/g, ' ')}](${link})` } : {}),
    // A bundled item's own links are flagged: this list's, not the bundle's (0.8.x unit 5b).
    links: linksOf(i).map((l, k) => ({ ...describeLink(l, k + 1, root), ...(isOwnLink(i, l) ? { own: true } : {}) })),
  }
}

/** Whether a link of a bundled item is the item's own rather than its bundle's. */
export const isOwnLink = (i: Pick<ListItem, 'bundle' | 'own'>, l: ItemLink): boolean => !!i.bundle && !!i.own?.some(o => sameLink(o, l))
export const LISTS_TOOL = {
  name: 'lists',
  description:
    'Keep ordered lists for this project (they span conversations), shown in the person\'s Lists pane: what is left to do, ' +
    'tests to run, ideas. An item can be a place in this conversation (query/uuid, as the bookmark tool takes), a link ' +
    '(file or URL), or plain text, and it can hold several links at once (a place, a file, a GitHub issue): the first is what a ' +
    'press opens. owner: your lists (default) or the person\'s, when they asked. ' +
    'An item with two or more links is a bundle: its links kept once, so the same bundle can be shown in another list ' +
    '(attach) leading with a different link (face). A bundled item may also hold links of its own beside the bundle, ' +
    'this list\'s and not the bundle\'s (link with into "item"; bundle with own); an attach never carries them. ' +
    'Actions: lists, show (opens the pane), create, rename, delete, add, link, unlink, move, remove, done, edit, share, bundle, attach, face.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['lists', 'show', 'create', 'rename', 'delete', 'add', 'link', 'unlink', 'move', 'remove', 'done', 'edit', 'share', 'bundle', 'attach', 'face', 'about'],
        description: 'lists (default): every list; show: one list\'s items, and opens the pane on it; create: a new list (`name`); add: an item (`label`, and `query`/`uuid` or `link`, and more in `links`); link: add links to an `item` (`query`/`uuid`/`link`/`links`; on a bundled item they join the bundle, or with `into` "item" stay the item\'s own); unlink: remove an `item`\'s link number `at` (1 the first); move: an item to position `to`; done: tick or untick an item; share: copy the list to the other side; bundle: make an `item` a bundle (one with two or more links already is), `own` naming the numbers of its links that stay its own beside the bundle; on an item already a bundle, `own` moves those links out of the bundle to the item\'s own; attach: show `bundle` (its id, as an item\'s answer gives it) in `list` as a new item, at position `at`; face: lead an `item` with its link number `at`; about: set the one-sentence `about` of an `item`\'s link number `at`',
      },
      list: { type: 'string', description: 'The list: its id, its name, or its number among `owner`\'s lists (1 the first)' },
      name: { type: 'string', description: 'create, rename: the list\'s name' },
      owner: { type: 'string', enum: ['claude', 'user'], description: "Whose list: yours (default) or the person's" },
      item: { type: 'string', description: 'link, unlink, move, remove, done, edit: the item\'s number in the list (1 the top) or its id' },
      label: { type: 'string', description: 'add, edit: what the item says, a few words' },
      why: { type: 'string', description: 'add, edit: a line under it: why it matters, or its state' },
      query: { type: 'string', description: 'add: a short verbatim fragment of the place in this conversation (any row: a prompt, a reply, a tool call, an output)' },
      uuid: { type: 'string', description: 'add: the place\'s uuid (or a tool_use id) instead of a fragment' },
      link: { type: 'string', description: 'add: a file path, a URL, or a bm: reference (either form; stored as the place it names) instead of a place' },
      words: { type: 'string', description: 'add: the words to highlight on arrival; defaults to query' },
      links: {
        type: 'array',
        description: 'add, link: more links for the item, after `query`/`uuid`/`link`: each a place of this conversation (`query` or `uuid`, with `words`) or a `link` (a file path, a URL, a GitHub issue URL), each with an optional `about`: one sentence of what it is (a file\'s purpose, an issue\'s title)',
        items: { type: 'object', properties: { query: { type: 'string' }, uuid: { type: 'string' }, link: { type: 'string' }, words: { type: 'string' }, about: { type: 'string' } } },
      },
      to: { type: 'number', description: 'move: the new position, 1 the top' },
      at: { type: 'number', description: 'add: the position to insert at, 1 the top; the end by default. unlink: the number of the link to remove, 1 the first' },
      done: { type: 'boolean', description: 'done: true to tick, false to untick; toggles when left out' },
      bundle: { type: 'string', description: 'attach: the bundle to show, by its id (`b1`)' },
      about: { type: 'string', description: 'add, link: one sentence of what the `query`/`uuid`/`link` link is (shown after it in the pane); about: the text for link `at`' },
      into: { type: 'string', enum: ['bundle', 'item'], description: 'link, on a bundled item: where the new links go -- the bundle (default, so every list showing it gains them) or the item\'s own (this list only)' },
      own: { type: 'array', items: { type: 'number' }, description: 'bundle: the numbers of the item\'s links (1 the first) that stay its own, beside the bundle; the rest form the bundle' },
    },
  },
  isDeferred: true,
} as const
