// The `bookmark` tool's pure layer (refactor-advisor 2026-10-12__15-06-26 row 4; the sixth
// move of the register.tsx split, Q261012-06): what the model is told the tool takes, how
// its call is read, and the shapes it is answered with. Moved from register.tsx under
// /move-code, comments as they were; the handler's flow (the register file, the transcript
// read, the mint) stays there with its engine calls.
import { anchorHref, anchorMarkdown, ownerOf, tierOf, type AnchorOwner, type AnchorRecord, type AnchorTier } from './anchor.ts'
import { headOf, type TranscriptRow } from './transcript-lines.ts'

// The model's tool (anchors DWP, 2026-10-09): mint a durable bookmark for a place in
// this conversation and get back the markdown link to cite it with. Kept in front
// (isDeferred: false) so citing is one call; the description stays short since it is
// sent every turn.
export const BOOKMARK_TOOL = {
  name: 'bookmark',
  description:
    'Bookmark a message: give a verbatim fragment (or uuid) and a label, get a markdown link to cite; a click jumps ' +
    'there. owner: your list or the person\'s. tier: perma (your default: a stable link, no bookmark glyph) or bookmark. ' +
    'Actions: add, relabel, remove, share, claim, list.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'A short verbatim fragment of the message to bookmark (the earliest message containing it)' },
      uuid: { type: 'string', description: 'The message uuid instead of a fragment (full, or its first 8+ characters)' },
      label: { type: 'string', description: 'What the bookmark is for: the link text, a few words' },
      why: { type: 'string', description: 'One or two sentences on why this place matters' },
      words: { type: 'string', description: 'The exact words to highlight on arrival; defaults to query' },
      temporary: { type: 'boolean', description: 'Prune after the retention period instead of keeping forever' },
      tier: { type: 'string', enum: ['perma', 'bookmark'], description: "perma (the default on your own list): a stable link to cite, drawn without the bookmark glyph; bookmark: a named place the person will want again (the default on the person's list)" },
      owner: { type: 'string', enum: ['claude', 'user'], description: "Whose list: your own (default) or the person's, when they asked you to bookmark it for them" },
      action: { type: 'string', enum: ['add', 'relabel', 'remove', 'share', 'claim', 'list'], description: 'add (default); relabel/remove act on `owner`\'s list; share copies from `owner`\'s list to the other; claim moves one of yours to the person\'s list (they asked for it); list shows both' },
    },
  },
  isDeferred: false,
} as const

export type ToolAction = 'add' | 'relabel' | 'remove' | 'share' | 'claim' | 'list'

/** The call as read: every field trimmed and typed, the defaults applied. */
export type ToolInput = {
  query: string
  uuid: string
  label: string | undefined
  action: ToolAction
  tierAsked: AnchorTier | undefined
  owner: AnchorOwner
  why: string | undefined
  words: string | undefined
  temporary: boolean
}

export function parseToolInput(input: Record<string, unknown>): ToolInput {
  const query = typeof input.query === 'string' ? input.query.trim() : ''
  const uuid = typeof input.uuid === 'string' ? input.uuid.trim() : ''
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim() : undefined
  const action: ToolAction =
    input.action === 'relabel' || input.action === 'remove' || input.action === 'share' || input.action === 'claim' || input.action === 'list' ? input.action : 'add'
  // Claude's own references are perma by default: a stable link without the bookmark
  // glyph (#21, djdarcy 2026-10-11: "That sounds reasonable"); the person's are bookmarks.
  const tierAsked = input.tier === 'perma' || input.tier === 'bookmark' ? (input.tier as AnchorTier) : undefined
  // Whose list: Claude's own by default; the person's when they asked for the bookmark.
  const owner: AnchorOwner = input.owner === 'user' ? 'user' : 'claude'
  const why = typeof input.why === 'string' ? input.why.trim() : undefined
  const words = typeof input.words === 'string' && input.words.trim() ? input.words.trim() : undefined
  return { query, uuid, label, action, tierAsked, owner, why, words, temporary: input.temporary === true }
}

/** The tier a new record gets: what was asked, else perma on Claude's list and bookmark on the person's. */
export const tierFor = (asked: AnchorTier | undefined, owner: AnchorOwner): AnchorTier => asked ?? (owner === 'claude' ? 'perma' : 'bookmark')

/** Whose list a relabel/remove/share acts on, and a claim (always Claude's). */
export const listActedOn = (action: ToolAction, owner: AnchorOwner): AnchorOwner => (action === 'claim' ? 'claude' : owner)

/** How a list is named in an answer. */
export const listName = (owner: AnchorOwner): string => (owner === 'user' ? "the person's" : "Claude's")

// The result the model reads is a string (or MCP content blocks), not an object:
// an object is refused as "does not match its output shape" (2.1.295, 2026-10-09).
export const answer = (o: unknown) => ({ result: JSON.stringify(o, null, 2) })

/** A record as the model sees it, with its link when the data root is known. */
export const describe = (r: AnchorRecord, root: string | undefined) => ({
  uuid: r.uuid, owner: ownerOf(r), tier: tierOf(r), label: r.label, why: r.why, words: r.words, line: r.line, sharedFrom: r.sharedFrom,
  ...(root ? { anchor: anchorHref(r, root), markdown: anchorMarkdown(r, root) } : {}),
})

/** A transcript row as the model sees it. */
export const brief = (r: TranscriptRow) => ({ uuid: r.uuid, role: r.role, line: r.line, bytes: [r.byteStart, r.byteEnd], head: headOf(r.text), timestamp: r.timestamp })
