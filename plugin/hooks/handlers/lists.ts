// Lists (#45, the first slice: 2026-10-26__22-25-54__dev-workflow-process__lists-the-first-slice.md):
// the per-project lists file read, changed and written through ports; the pane's model and its
// actions; `/bm-lists`; an item's landing; the `lists` tool's call. The pure parts are
// core/lists/lists.ts and core/lists/lists-tool.ts; register.tsx keeps only the ports and the
// one-line hooks (refactor-advisor 2026-10-27, rows 1-5: the search pane's and the bookmark
// tool's pattern).
//
// It owns the file's cache, which list the pane shows, and which items are open (the one-owner
// principle; the ownership table in engine/ports.ts).
import {
  applyListOp, emptyLists, findItem, findList, linkOf, listsBaseName, listsPage, LISTS_PAGE_TEMPLATE, parseLists, projectOf, serializeLists,
  type List, type ListItem, type ListPlace, type ListsFile, type Op,
} from '../core/lists/lists.ts'
import { brief, describeItem, parseListsInput, type ListsToolInput } from '../core/lists/lists-tool.ts'
import { answer } from '../core/bookmarks/bookmark-tool.ts'
import { short } from '../core/kit/message-id.ts'
import type { ListsPorts } from '../engine/ports.ts'

const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

/** What the pane draws (views/lists-pane.tsx ListsPaneModel, less what register adds). */
export type ListsPaneState = { file?: ListsFile; shown?: List; error?: string; expanded: ReadonlySet<string> }

export class Lists {
  private cache: { path: string; file: ListsFile } | undefined
  /** The list the pane shows, by id; the first list when unset or gone. */
  private shown: string | undefined
  /** The items opened in place in the pane, as `<list id>/<item id>`. */
  private opened = new Set<string>()

  /** Where the project's lists file is: `<dataRoot>/bookmarks/lists/<project>.json`, or undefined with no data root. */
  async pathOf(ports: ListsPorts): Promise<string | undefined> {
    const root = await ports.dataRoot()
    if (!root) return undefined
    const cwd = await ports.cwd()
    const dir = `${slash(root)}/bookmarks/lists`
    // The plain name's file may hold another folder of the same name (L-1).
    const plain = `${dir}/${listsBaseName(cwd, undefined, ports.hash)}.json`
    let holder: string | undefined
    if (await ports.fsExists(plain)) {
      const r = parseLists(await ports.fsRead(plain))
      holder = r.kind === 'ok' ? r.file.cwd || undefined : undefined
    }
    return `${dir}/${listsBaseName(cwd, holder, ports.hash)}.json`
  }

  /** The project's lists, read fresh from disk (a second session may have changed them). */
  async load(ports: ListsPorts): Promise<{ path: string | undefined; file: ListsFile } | { error: string }> {
    const path = await this.pathOf(ports)
    const cwd = await ports.cwd()
    const writer = `${ports.pluginName} ${await ports.pluginVersion()}`
    const fresh = emptyLists(projectOf(cwd), slash(cwd), writer, await ports.now())
    if (!path) return { path: undefined, file: this.cache?.file ?? fresh }
    if (!(await ports.fsExists(path))) {
      this.cache = { path, file: fresh }
      return { path, file: fresh }
    }
    const r = parseLists(await ports.fsRead(path))
    if (r.kind === 'newer') return { error: `the lists file was written by a newer version of the plugin (format ${r.version}); update the plugin to change it` }
    if (r.kind === 'bad') return { error: `the lists file could not be read (${r.why}); it is left as it is: ${path}` }
    this.cache = { path, file: r.file }
    return { path, file: r.file }
  }

  /** The last file read or written, without touching the disk. */
  current(): ListsFile | undefined {
    return this.cache?.file
  }

  /** Read fresh, apply `op`, write the file (its last version kept as `.bak`) and the page. */
  async change(ports: ListsPorts, op: Op): Promise<{ ok: true; file: ListsFile; list?: List; item?: ListItem } | { ok: false; error: string }> {
    const got = await this.load(ports)
    if ('error' in got) return { ok: false, error: got.error }
    const r = applyListOp(got.file, op, await ports.now())
    if (!r.ok) return r
    const writer = `${ports.pluginName} ${await ports.pluginVersion()}`
    const file: ListsFile = { ...r.file, writer }
    if (got.path) {
      if (await ports.fsExists(got.path)) await ports.fsWrite(`${got.path}.bak`, await ports.fsRead(got.path))
      await ports.fsWrite(got.path, serializeLists(file))
      await this.writePage(ports, got.path, file)
      this.cache = { path: got.path, file }
    } else {
      this.cache = { path: '', file }
    }
    if (r.list && op.op !== 'delete') this.shown = r.list.id
    ports.log(`[bm] lists: ${op.op} -> ${r.list ? `"${r.list.name}"` : ''}${r.item ? ` item ${r.item.id} "${ports.cut(r.item.label, 40)}"` : ''}`)
    await ports.redraw()
    return { ok: true, file, ...(r.list ? { list: r.list } : {}), ...(r.item ? { item: r.item } : {}) }
  }

  /** The Markdown page beside the file, from the plugin's template; a missing template is a packaging bug, logged, and no page is written. */
  private async writePage(ports: ListsPorts, path: string, file: ListsFile): Promise<void> {
    const template = await ports.pluginFile(LISTS_PAGE_TEMPLATE)
    if (template === undefined) return ports.log(`[bm] lists: the page's template (${LISTS_PAGE_TEMPLATE}) is missing; the page is not written`)
    const root = await ports.dataRoot()
    const page = listsPage(file, path.slice(path.lastIndexOf('/') + 1), i => linkOf(i, root), template)
    if ('missing' in page) return ports.log(`[bm] lists: the page's template lacks ${page.missing.join(', ')}; the page is not written`)
    await ports.fsWrite(path.replace(/\.json$/, '.md'), page.text)
  }

  /** The list the pane shows: `shown`, else the person's first, else any first. */
  shownList(f: ListsFile): List | undefined {
    return f.lists.find(l => l.id === this.shown) ?? f.lists.find(l => l.owner === 'user') ?? f.lists[0]
  }

  /** The ids of the items opened in `list`. */
  expanded(list: string): ReadonlySet<string> {
    const p = `${list}/`
    return new Set([...this.opened].filter(k => k.startsWith(p)).map(k => k.slice(p.length)))
  }

  // --- The pane (refactor-advisor 2026-10-27, row 1) -------------------------------------------

  /** What the pane draws: the file (read when nothing is cached), the shown list, its opened items. */
  async paneModel(ports: ListsPorts): Promise<ListsPaneState> {
    let file = this.current()
    let error: string | undefined
    if (!file) {
      const got = await this.load(ports)
      if ('error' in got) error = got.error
      else file = got.file
    }
    const shown = file ? this.shownList(file) : undefined
    return { ...(file ? { file } : {}), ...(shown ? { shown } : {}), ...(error ? { error } : {}), expanded: shown ? this.expanded(shown.id) : new Set() }
  }

  /** The shown list's id from what is cached; undefined when nothing is (a press after a reset is ignored, not a crash). */
  private shownId(): string | undefined {
    const f = this.current()
    return f ? this.shownList(f)?.id : undefined
  }

  async pick(ports: ListsPorts, listId: string): Promise<void> {
    this.shown = listId
    await ports.redraw()
  }

  async moveShown(ports: ListsPorts, itemId: string, to: number): Promise<void> {
    const list = this.shownId()
    if (list) await this.changeOrToast(ports, { op: 'move', list, item: itemId, to })
  }

  async doneShown(ports: ListsPorts, itemId: string): Promise<void> {
    const list = this.shownId()
    if (list) await this.changeOrToast(ports, { op: 'done', list, item: itemId })
  }

  async toggleShown(ports: ListsPorts, itemId: string): Promise<void> {
    const list = this.shownId()
    if (!list) return
    const k = `${list}/${itemId}`
    if (!this.opened.delete(k)) this.opened.add(k)
    await ports.redraw()
  }

  private async changeOrToast(ports: ListsPorts, op: Op): Promise<void> {
    const r = await this.change(ports, op)
    if (!r.ok) ports.toast(r.error)
  }

  /** Set the shown list (the tool's `show`, `/bm-lists <name>`). */
  show(listId: string): void {
    this.shown = listId
  }

  newConversation(): void {
    // The file is per project, not per conversation; only the cache is dropped, so a
    // conversation in another folder reads its own.
    this.cache = undefined
  }
}

/**
 * `/bm-lists [name or number]` (refactor-advisor 2026-10-27, row 5): with a name, opens on that
 * list, found by the tool's own finder; with none, a second `/bm-lists` closes the pane.
 */
export async function listsCommand(ports: ListsPorts, lists: Lists, args: string): Promise<void> {
  const name = args.trim()
  if (!name && (await ports.paneOpen())) {
    await ports.closePane()
    return
  }
  if (name) {
    const got = await lists.load(ports)
    if ('error' in got) ports.toast(got.error)
    else {
      const l = findList(got.file, name)
      if (l) lists.show(l.id)
      else ports.toast(`No list named "${name}"; showing the lists.`)
    }
  }
  await ports.redraw()
  const opened = await ports.openPane()
  ports.log(`[bm] lists pane opened: ${JSON.stringify(opened)}`)
}

/**
 * Press an item (L-8): a place in this conversation is gone to (with the landing fallback); a
 * place in another conversation names it and copies the command that resumes it; a link is
 * copied. A note with no place or link opens in place instead (the pane does that).
 */
export async function landItem(ports: ListsPorts, item: ListItem): Promise<void> {
  const p = item.place
  if (p) {
    if (p.session === (await ports.sessionId())) {
      const target = {
        uuid: p.uuid, label: item.label,
        ...(item.words ? { words: item.words } : {}),
        ...(p.drawn !== undefined ? { drawn: p.drawn } : {}),
        ...(p.file !== undefined ? { file: p.file } : {}),
        ...(p.part !== undefined ? { part: p.part } : {}),
      }
      const deny = await ports.arrive(target, 'list item')
      if (deny) ports.log(`[bm] lists: item ${item.id} did not land: ${deny}`)
      return
    }
    const cmd = `claude --resume ${p.session}`
    const copied = (await ports.copy(cmd)).isCopied
    ports.toast(`"${ports.cut(item.label, 40)}" is in another conversation (${short(p.session)}). ${copied ? 'Copied' : 'Run'}: ${cmd}`, 10000)
    return
  }
  if (item.link) {
    const copied = (await ports.copy(item.link)).isCopied
    ports.toast(`${copied ? 'Copied' : 'The link'}: ${ports.cut(item.link, 80)}`, 8000)
    return
  }
  ports.toast(`"${ports.cut(item.label, 60)}" is a note: it has no place to go to.`)
}

// --- The `lists` tool (L-7) ---------------------------------------------------------------

/** The tool's call as the engine hands it (refactor-advisor 2026-10-27, row 2: as handlers/bookmarks.ts bookmarkTool). */
export async function listsToolCall(ports: ListsPorts, lists: Lists, e: unknown) {
  const { tool, tool_use_id, agentId, requestMeta, ...input } = e as Record<string, unknown>
  void tool
  void tool_use_id
  void agentId
  void requestMeta
  ports.log(`[bm] lists tool called with ${ports.cut(JSON.stringify(input), 160)}`)
  return answer(await listsTool(ports, lists, parseListsInput(input)))
}

/** A found row as a list item's place (refactor-advisor 2026-10-27, row 3: the port passes the outcome; the handler reads it). */
const placeOfRow = (session: string, row: { uuid: string; file?: string; part?: number; drawn?: string }): ListPlace => ({
  session,
  uuid: row.uuid,
  ...(row.file !== undefined ? { file: row.file } : {}),
  ...(row.part !== undefined ? { part: row.part } : {}),
  ...(row.drawn !== undefined ? { drawn: row.drawn } : {}),
})

/** The `lists` tool's call: answers with a JSON-ready object. */
export async function listsTool(ports: ListsPorts, lists: Lists, input: ListsToolInput): Promise<Record<string, unknown>> {
  const root = await ports.dataRoot()
  const got = await lists.load(ports)
  if ('error' in got) return { error: got.error }
  const f = got.file
  const where = got.path ? { file: got.path } : { note: 'no data folder: the lists are kept for this session only' }

  if (input.action === 'lists') {
    return { yours: f.lists.filter(l => l.owner === 'user').map(brief), claudes: f.lists.filter(l => l.owner === 'claude').map(brief), ...where }
  }
  if (input.action === 'create') {
    const name = input.name ?? input.list
    if (!name) return { error: 'create needs `name`' }
    const r = await lists.change(ports, { op: 'create', name, owner: input.owner })
    return r.ok ? { ok: true, created: brief(r.list!), ...where } : { error: r.error }
  }

  const list = input.list ? findList(f, input.list, input.owner) : undefined
  if (!list) return { error: input.list ? `no list "${input.list}"` : 'give `list` (its id, name, or number)', hint: 'action "lists" names every list' }

  if (input.action === 'show') {
    lists.show(list.id)
    await ports.redraw()
    const opened = await ports.openPane()
    return { list: brief(list), items: list.items.map((i, n) => describeItem(i, n + 1, root)), pane: opened }
  }
  if (input.action === 'rename') {
    if (!input.name) return { error: 'rename needs `name`' }
    const r = await lists.change(ports, { op: 'rename', list: list.id, name: input.name })
    return r.ok ? { ok: true, renamed: brief(r.list!) } : { error: r.error }
  }
  if (input.action === 'delete') {
    const r = await lists.change(ports, { op: 'delete', list: list.id })
    return r.ok ? { ok: true, deleted: brief(list), note: 'kept among the removed lists in the file, not erased' } : { error: r.error }
  }
  if (input.action === 'share') {
    const r = await lists.change(ports, { op: 'share', list: list.id })
    return r.ok ? { ok: true, shared: brief(r.list!), note: `a copy on ${r.list!.owner === 'user' ? "the person's" : 'your'} side; the original stays` } : { error: r.error }
  }
  if (input.action === 'add') {
    let place: ListPlace | undefined
    let words = input.words
    if (input.query || input.uuid) {
      const found = await ports.resolveTarget({ ...(input.query ? { fragment: input.query } : {}), ...(input.uuid ? { uuid: input.uuid } : {}) })
      if (found.kind === 'none') return { error: found.reason }
      place = placeOfRow(await ports.sessionId(), found.kind === 'one' ? found.row : found.earliest)
      words ??= input.query
    }
    const label = input.label ?? (place && words ? words.slice(0, 60) : undefined)
    if (!label) return { error: 'add needs `label` (and `query`/`uuid` for a place in this conversation, or `link` for a file or URL)' }
    const r = await lists.change(ports, {
      op: 'add', list: list.id,
      item: { label, by: 'claude', ...(input.why ? { why: input.why } : {}), ...(place ? { place } : {}), ...(input.link ? { link: input.link } : {}), ...(words && place ? { words } : {}) },
      ...(input.at !== undefined ? { at: input.at } : {}),
    })
    if (!r.ok) return { error: r.error }
    const n = r.list!.items.findIndex(i => i.id === r.item!.id) + 1
    return { ok: true, added: describeItem(r.item!, n, root), list: brief(r.list!) }
  }

  const item = input.item ? findItem(list, input.item) : undefined
  if (!item) return { error: input.item ? `no item "${input.item}" in "${list.name}"` : 'give `item` (its number in the list, or its id)' }
  if (input.action === 'move') {
    if (input.to === undefined) return { error: 'move needs `to` (the position, 1 the top)' }
    const r = await lists.change(ports, { op: 'move', list: list.id, item: item.id, to: input.to })
    return r.ok ? { ok: true, order: r.list!.items.map((i, n) => `${n + 1}. ${i.label}`) } : { error: r.error }
  }
  if (input.action === 'remove') {
    const r = await lists.change(ports, { op: 'remove', list: list.id, item: item.id })
    return r.ok ? { ok: true, removed: describeItem(item, 0, root) } : { error: r.error }
  }
  if (input.action === 'done') {
    const r = await lists.change(ports, { op: 'done', list: list.id, item: item.id, ...(input.done !== undefined ? { done: input.done } : {}) })
    return r.ok ? { ok: true, item: describeItem(r.item!, list.items.findIndex(i => i.id === item.id) + 1, root) } : { error: r.error }
  }
  if (input.action === 'edit') {
    const r = await lists.change(ports, { op: 'edit', list: list.id, item: item.id, ...(input.label ? { label: input.label } : {}), ...(input.why !== undefined ? { why: input.why } : {}) })
    return r.ok ? { ok: true, item: describeItem(r.item!, list.items.findIndex(i => i.id === item.id) + 1, root) } : { error: r.error }
  }
  return { error: `unknown action "${input.action}"` }
}
