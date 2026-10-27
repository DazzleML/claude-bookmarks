// The `lists` tool (#45, L-7): what the model is told it takes, how its call is read, and the
// shapes it is answered with (as core/bookmarks/bookmark-tool.ts for the bookmark tool; moved
// here from the handler, refactor-advisor 2026-10-27 row 6). Deferred (found through tool search
// when needed), since it is used far less often than `bookmark` and every non-deferred tool's
// schema is sent every turn. The handler is handlers/lists.ts listsTool.
import { linkOf, type List, type ListItem } from './lists.ts'
import { short } from '../kit/message-id.ts'
import type { AnchorOwner } from '../bookmarks/anchor.ts'

export type ListsToolInput = {
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
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v.trim()) : undefined)

/** The call as read: every field trimmed and typed, the defaults applied (action `lists`, owner `claude`). */
export function parseListsInput(input: Record<string, unknown>): ListsToolInput {
  const owner: AnchorOwner = input.owner === 'user' ? 'user' : 'claude'
  const o: ListsToolInput = { action: str(input.action) ?? 'lists', owner }
  for (const k of ['list', 'name', 'label', 'why', 'query', 'uuid', 'link', 'words'] as const) {
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
  return o
}

/** A list as the model sees it. */
export const brief = (l: List) => ({ id: l.id, name: l.name, owner: l.owner, items: l.items.length, done: l.items.filter(i => i.done).length })

/** An item as the model sees it: its number, its place in short, and its link as markdown. */
export function describeItem(i: ListItem, n: number, root: string | undefined) {
  const link = linkOf(i, root)
  return {
    n, id: i.id, label: i.label,
    ...(i.why ? { why: i.why } : {}),
    ...(i.done ? { done: true } : {}),
    ...(i.place ? { place: `${short(i.place.session)}/${short(i.place.uuid)}${i.place.file ? ` in ${i.place.file}` : ''}` } : {}),
    ...(link ? { markdown: `[${i.label.replace(/[[\]]/g, ' ')}](${link})` } : {}),
  }
}
export const LISTS_TOOL = {
  name: 'lists',
  description:
    'Keep ordered lists for this project (they span conversations), shown in the person\'s Lists pane: what is left to do, ' +
    'tests to run, ideas. An item can be a place in this conversation (query/uuid, as the bookmark tool takes), a link ' +
    '(file or URL), or plain text. owner: your lists (default) or the person\'s, when they asked. ' +
    'Actions: lists, show (opens the pane), create, rename, delete, add, move, remove, done, edit, share.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['lists', 'show', 'create', 'rename', 'delete', 'add', 'move', 'remove', 'done', 'edit', 'share'],
        description: 'lists (default): every list; show: one list\'s items, and opens the pane on it; create: a new list (`name`); add: an item (`label`, and `query`/`uuid` or `link`); move: an item to position `to`; done: tick or untick an item; share: copy the list to the other side',
      },
      list: { type: 'string', description: 'The list: its id, its name, or its number among `owner`\'s lists (1 the first)' },
      name: { type: 'string', description: 'create, rename: the list\'s name' },
      owner: { type: 'string', enum: ['claude', 'user'], description: "Whose list: yours (default) or the person's" },
      item: { type: 'string', description: 'move, remove, done, edit: the item\'s number in the list (1 the top) or its id' },
      label: { type: 'string', description: 'add, edit: what the item says, a few words' },
      why: { type: 'string', description: 'add, edit: a line under it: why it matters, or its state' },
      query: { type: 'string', description: 'add: a short verbatim fragment of the place in this conversation (any row: a prompt, a reply, a tool call, an output)' },
      uuid: { type: 'string', description: 'add: the place\'s uuid (or a tool_use id) instead of a fragment' },
      link: { type: 'string', description: 'add: a file path or URL instead of a place' },
      words: { type: 'string', description: 'add: the words to highlight on arrival; defaults to query' },
      to: { type: 'number', description: 'move: the new position, 1 the top' },
      at: { type: 'number', description: 'add: the position to insert at, 1 the top; the end by default' },
      done: { type: 'boolean', description: 'done: true to tick, false to untick; toggles when left out' },
    },
  },
  isDeferred: true,
} as const
