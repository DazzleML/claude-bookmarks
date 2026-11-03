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
  applyListOp, emptyLists, findItem, findList, linkOf, listsBaseName, listsPage, LISTS_PAGE_TEMPLATE, LISTS_VERSION, parseLists, projectOf, serializeLists,
  type List, type ListItem, type ListsFile, type Op,
} from '../core/lists/lists.ts'
import { brief, describeItem, describeLink, linkWants, parseListsInput, type LinkWant, type ListsToolInput } from '../core/lists/lists-tool.ts'
import { hrefOf, linkFromText, linkKey, linksOf, primaryLink, sameLink, textOf, type ItemLink } from '../core/lists/item-links.ts'
import { parseRef } from '../core/bookmarks/ref.ts'
import { answer } from '../core/bookmarks/bookmark-tool.ts'
import { short } from '../core/kit/message-id.ts'
import { showAction } from '../core/band/pane-show.ts'
import { assemble, checkLayout, migrateFlat, readSet, resolveLayout, setMark, writeAll, type Resolved, type SetRead } from './lists-layout.ts'
import type { ListsPorts } from '../engine/ports.ts'

const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

/** What the pane draws (views/lists-pane.tsx ListsPaneModel, less what register adds). */
export type ListsPaneState = { file?: ListsFile; shown?: List; error?: string; expanded: ReadonlySet<string> }

export class Lists {
  /**
   * The file last read or written; `mark` is its size and last change when it was read (none after
   * a write of ours, so the next draw reads it once). At format 3 (0.8.x unit 5): `resolved` is
   * where it lives and `set` its project's bundle set as read, with its own per-draw mark.
   */
  private cache: { path: string; file: ListsFile; mark?: string; resolved?: Resolved; set?: SetRead } | undefined
  /** Bundle files named in a toast this session: a file that cannot be read is said once. */
  private toasted = new Set<string>()
  /** The list the pane shows, by id; the first list when unset or gone. */
  private shown: string | undefined
  /** The items opened in place in the pane, as `<list id>/<item id>`. */
  private opened = new Set<string>()

  /**
   * Where this folder's lists file is, or undefined with no data root. Format 3: under its project's
   * folder, `<dataRoot>/bookmarks/projects/<folder>/lists/<lists folder>/lists.json` (handlers/lists-layout.ts);
   * before: `<dataRoot>/bookmarks/lists/<project>.json`.
   */
  async pathOf(ports: ListsPorts): Promise<string | undefined> {
    if (LISTS_VERSION >= 3) return (await resolveLayout(ports))?.layout.listsPath
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
    if (LISTS_VERSION >= 3) return this.loadLayout(ports)
    const path = await this.pathOf(ports)
    const cwd = await ports.cwd()
    const writer = `${ports.pluginName} ${await ports.pluginVersion()}`
    const fresh = emptyLists(projectOf(cwd), slash(cwd), writer, await ports.now())
    if (!path) return { path: undefined, file: this.cache?.file ?? fresh }
    // Taken before the read: a write landing between the two makes the next draw read again, never miss it.
    const mark = await this.markOf(ports, path)
    if (!(await ports.fsExists(path))) {
      this.cache = { path, file: fresh, mark }
      return { path, file: fresh }
    }
    const r = parseLists(await ports.fsRead(path))
    if (r.kind === 'newer') return { error: `the lists file was written by a newer version of the plugin (format ${r.version}); update the plugin to change it` }
    if (r.kind === 'bad') return { error: `the lists file could not be read (${r.why}); it is left as it is: ${path}` }
    this.cache = { path, file: r.file, mark }
    return { path, file: r.file }
  }

  /**
   * Format 3 (0.8.x unit 5): the lists under the project folder, with the project's bundle set read
   * beside them; a format-2 flat file is split into the folder on the first load that finds no
   * `lists.json` there. The dangling check runs first: a folder that is not there is fine for a
   * read (it is made on the first write); a broken or redirected link, or a folder that is not this
   * project's, refuses the read and says why.
   */
  private async loadLayout(ports: ListsPorts): Promise<{ path: string | undefined; file: ListsFile } | { error: string }> {
    const cwd = await ports.cwd()
    const writer = `${ports.pluginName} ${await ports.pluginVersion()}`
    const fresh = emptyLists(projectOf(cwd), slash(cwd), writer, await ports.now())
    const r = await resolveLayout(ports)
    if (!r) return { path: undefined, file: this.cache?.file ?? fresh }
    const path = r.layout.listsPath
    const chk = await checkLayout(ports, r)
    const readable = chk.link === 'ok' ? chk.check === 'ok' || chk.check === 'missing' : chk.link === 'removed' && !r.linked
    if (!readable) return { error: `the lists are not read: ${chk.verdict.why} (${r.folderPath})` }
    if (!(await ports.fsExists(path)) && (await ports.fsExists(r.flatPath))) {
      const m = await migrateFlat(ports, r, await ports.fsRead(r.flatPath))
      if (!m.ok) return { error: m.error }
      ports.toast(`The lists for this folder moved into their project folder: ${r.folderPath}`, 8000)
    }
    // Taken before the read: a write landing between the two makes the next draw read again, never miss it.
    const mark = await this.markOf(ports, path)
    if (!(await ports.fsExists(path))) {
      const set = await readSet(ports, r, this.toasted)
      this.cache = { path, file: assemble(fresh, set), mark, resolved: r, set }
      return { path, file: this.cache.file }
    }
    const p = parseLists(await ports.fsRead(path))
    if (p.kind === 'newer') return { error: `the lists file was written by a newer version of the plugin (format ${p.version}); update the plugin to change it` }
    if (p.kind === 'bad') return { error: `the lists file could not be read (${p.why}); it is left as it is: ${path}` }
    const set = await readSet(ports, r, this.toasted)
    const file = assemble(p.file, set)
    this.cache = { path, file, mark, resolved: r, set }
    // The split leaves no page beside the new file until the first change; write it now, once.
    if (!(await ports.fsExists(path.replace(/\.json$/, '.md')))) await this.writePage(ports, path, file)
    return { path, file }
  }

  /** The file's size and last change as one string, `absent` when it is not there; undefined without the stat port. */
  private async markOf(ports: ListsPorts, path: string): Promise<string | undefined> {
    if (!ports.fsStat) return undefined
    const s = await ports.fsStat(path)
    return s ? `${s.size}:${s.mtimeMs}` : 'absent'
  }

  /** Whether the cached file, or its project's bundle set, has changed on disk since it was read: one stat and one listing, no read. */
  private async moved(ports: ListsPorts): Promise<boolean> {
    const c = this.cache
    if (!ports.fsStat || !c?.path) return false
    if (c.mark === undefined || (await this.markOf(ports, c.path)) !== c.mark) return true
    if (!c.resolved || !c.set) return false
    return setMark(await ports.fsList(c.resolved.layout.bundlesDir).catch(() => [])) !== c.set.mark
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
    const at = this.cache
    if (got.path && LISTS_VERSION >= 3 && at?.resolved && at.set) {
      // Format 3: the bundle files and the set's index before lists.json (handlers/lists-layout.ts).
      const w = await writeAll(ports, at.resolved, file, at.set)
      if (!w.ok) return { ok: false, error: w.error }
      await this.writePage(ports, got.path, file)
      this.cache = { path: got.path, file, resolved: at.resolved, set: { ...at.set, index: w.index, mark: '' } }
    } else if (got.path) {
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
    const page = listsPage(file, path.slice(path.lastIndexOf('/') + 1), i => linkOf(i, root), template, i =>
      linksOf(i).slice(1).flatMap(l => {
        const href = hrefOf(l, root)
        return href ? [{ label: describeLink(l, 0, root).what, href }] : []
      }))
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

  /** What the pane draws: the file (read when nothing is cached, or when it changed on disk since), the shown list, its opened items. */
  async paneModel(ports: ListsPorts): Promise<ListsPaneState> {
    let file = this.current()
    let error: string | undefined
    if (!file || (await this.moved(ports))) {
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

  /** A bundled item's face in the shown list (the bundles design, unit 6): the ○ on a link row. */
  async faceShown(ports: ListsPorts, itemId: string, face: string): Promise<void> {
    const list = this.shownId()
    if (list) await this.changeOrToast(ports, { op: 'face', list, item: itemId, face })
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
 * list, found by the tool's own finder. With none, the three rules (core/band/pane-show.ts):
 * open it; open but behind another pane, bring it to the front; open and in front, close it.
 * The same for `<leader> l` and the bar's button, which come here too.
 */
export async function listsCommand(ports: ListsPorts, lists: Lists, args: string): Promise<void> {
  const name = args.trim()
  const panes = ports.panes && ports.paneId ? await ports.panes() : undefined
  const action = panes ? showAction(panes, ports.paneId!) : (await ports.paneOpen()) ? 'close' : 'open'
  if (!name && action === 'close') {
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
  const opened = await (ports.openInFront ?? ports.openPane)()
  ports.log(`[bm] lists pane opened (${action}): ${JSON.stringify(opened)}`)
}

/**
 * Press an item (L-8): a place in this conversation is gone to (with the landing fallback); a
 * place in another conversation names it and copies the command that resumes it; a link is
 * copied. A note with no place or link opens in place instead (the pane does that).
 */
/**
 * The ⧉ on a link row (the listLinkClick setting's `nothing`): the link copied -- a file's path, a
 * page's or an issue's URL, a reference as typed, a place's bookmark link.
 */
export async function copyLink(ports: ListsPorts, link: ItemLink): Promise<void> {
  const text = textOf(link) ?? hrefOf(link, await ports.dataRoot())
  if (!text) return
  const copied = (await ports.copy(text)).isCopied
  ports.toast(`${copied ? 'Copied' : 'The link'}: ${ports.cut(text, 80)}`, 8000)
}

export async function landItem(ports: ListsPorts, item: ListItem, link?: ItemLink): Promise<void> {
  // `link`: one of the item's links pressed in its opened view (the bundles design, unit 6); else its first.
  let first = link ?? primaryLink(item)
  // A reference kept as typed is read again: it may resolve now (its register came back, or its
  // conversation is on this machine now); if not, it is copied as typed.
  if (first?.kind === 'ref') first = (await ports.resolveRef(first.text)) ?? first
  if (first?.kind === 'place') {
    const p = first
    // A conversation continued under a new session id keeps its messages' ids (the CK3 report,
    // 2026-10-28: fe8a1041 -> 432b5fd1), so a place naming another id is looked for in this
    // transcript first: prompts and replies only (quick), never the place reader's wait in a press.
    const here = p.session === (await ports.sessionId())
      || (p.file === undefined && (await ports.resolveTarget({ uuid: p.uuid, quick: true })).kind === 'one')
    if (here) {
      const target = {
        uuid: p.uuid, label: item.label,
        ...(p.words ? { words: p.words } : {}),
        ...(p.drawn !== undefined ? { drawn: p.drawn } : {}),
        ...(p.file !== undefined ? { file: p.file } : {}),
        ...(p.part !== undefined ? { part: p.part } : {}),
      }
      const deny = await ports.arrive(target, 'list item')
      if (deny) ports.log(`[bm] lists: item ${item.id} did not land: ${deny}`)
      return
    }
    // Another conversation: named when its transcript is on this machine, its resume command
    // copied; otherwise said so, and nothing copied (the links-in-files design, B5).
    const where = await ports.findConversation(p.session)
    if (!where.found) {
      ports.toast(`"${ports.cut(item.label, 40)}" is in a conversation that is not on this machine (${short(p.session)}).`, 10000)
      return
    }
    const name = where.title ? `"${ports.cut(where.title, 40)}" (${short(p.session)})` : short(p.session)
    const cmd = `claude --resume ${p.session}`
    // The listLinkClick setting: with `nothing` a click leaves the clipboard alone (djdarcy, 2026-10-31).
    const copies = ports.clickCopies?.() ?? true
    const copied = copies && (await ports.copy(cmd)).isCopied
    ports.toast(`"${ports.cut(item.label, 40)}" is in another conversation, ${name}. ${copied ? 'Copied' : 'Run'}: ${cmd}`, 10000)
    return
  }
  const text = first ? textOf(first) : undefined
  if (text) {
    // With `nothing`, a click on a file, page or issue does nothing; ctrl-click opens it, the row's ⧉ copies it.
    if (!(ports.clickCopies?.() ?? true)) return
    const copied = (await ports.copy(text)).isCopied
    ports.toast(`${copied ? 'Copied' : 'The link'}: ${ports.cut(text, 80)}`, 8000)
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

/**
 * The links a call asks for, typed (core/lists/item-links.ts), in order. A place of this
 * conversation is minted as Claude's perma record through the bookmark tool (ports.mintPlace), so
 * its note exists and the item's link opens it (the links-in-files design, B4: the census found
 * list items handing out links to notes nobody wrote); the place is read back from the record's
 * own link (core/bookmarks/ref.ts), so the item's link and the note agree by construction.
 */
async function linksFor(ports: ListsPorts, wants: readonly LinkWant[], label: string): Promise<{ links: ItemLink[] } | { error: string }> {
  const links: ItemLink[] = []
  for (const w of wants) {
    // A link's one sentence of what it is (the bundles design, addendum 2026-10-31).
    const about = w.about ? { about: w.about } : {}
    if (w.query || w.uuid) {
      const minted = await ports.mintPlace({ ...(w.query ? { query: w.query } : {}), ...(w.uuid ? { uuid: w.uuid } : {}), label, ...(w.words ?? w.query ? { words: (w.words ?? w.query)! } : {}) })
      if ('error' in minted) return { error: minted.error }
      const ref = parseRef(minted.anchor)
      if (!ref?.session || !ref.uuid) return { error: `the place was bookmarked but its link could not be read: ${minted.anchor}` }
      links.push({ kind: 'place', session: ref.session, uuid: ref.uuid, ...(ref.file !== undefined ? { file: ref.file } : {}), ...(ref.part !== undefined ? { part: ref.part } : {}), ...(ref.words ? { words: ref.words } : {}), ...about })
    } else if (w.link) {
      const typed = linkFromText(w.link)
      // A `bm:` reference is stored as the exact place it names, or kept as typed when it names
      // none here (the bm: short-reference design, unit 6); never as a file path.
      if (typed?.kind === 'ref') links.push({ ...((await ports.resolveRef(typed.text)) ?? typed), ...about })
      else if (typed) links.push({ ...typed, ...about })
    }
  }
  return { links }
}

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
    const wants = linkWants(input)
    const first = wants.find(w => w.query || w.uuid)
    const label = input.label ?? (first ? (first.words ?? first.query)?.slice(0, 60) : undefined)
    if (!label) return { error: 'add needs `label` (and `query`/`uuid` for a place in this conversation, or `link` for a file or URL)' }
    const got = await linksFor(ports, wants, label)
    if ('error' in got) return { error: got.error }
    const links = got.links
    const r = await lists.change(ports, {
      op: 'add', list: list.id,
      item: { label, by: 'claude', ...(input.why ? { why: input.why } : {}), links },
      ...(input.at !== undefined ? { at: input.at } : {}),
    })
    if (!r.ok) return { error: r.error }
    const n = r.list!.items.findIndex(i => i.id === r.item!.id) + 1
    return { ok: true, added: describeItem(r.item!, n, root), list: brief(r.list!) }
  }
  // Bundles (the bundles design, unit 7): a bundle shown in another list.
  if (input.action === 'attach') {
    if (!input.bundle) return { error: 'attach needs `bundle` (its id, as an item\'s answer gives it, e.g. "b1")' }
    const r = await lists.change(ports, { op: 'attach', list: list.id, bundle: input.bundle, by: 'claude', ...(input.label ? { label: input.label } : {}), ...(input.at !== undefined ? { at: input.at } : {}) })
    if (!r.ok) return { error: r.error }
    const n = r.list!.items.findIndex(i => i.id === r.item!.id) + 1
    return { ok: true, item: describeItem(r.item!, n, root), list: brief(r.list!) }
  }

  const item = input.item ? findItem(list, input.item) : undefined
  if (!item) return { error: input.item ? `no item "${input.item}" in "${list.name}"` : 'give `item` (its number in the list, or its id)' }
  const at = list.items.findIndex(i => i.id === item.id) + 1
  if (input.action === 'bundle') {
    const r = await lists.change(ports, { op: 'bundle', list: list.id, item: item.id })
    return r.ok ? { ok: true, item: describeItem(r.item!, at, root) } : { error: r.error }
  }
  if (input.action === 'face') {
    const have = linksOf(item)
    if (input.at === undefined || input.at < 1 || input.at > have.length) return { error: `face needs \`at\`, the number of the link to lead with (1 to ${have.length})` }
    const r = await lists.change(ports, { op: 'face', list: list.id, item: item.id, face: linkKey(have[input.at - 1]!) })
    return r.ok ? { ok: true, item: describeItem(r.item!, at, root) } : { error: r.error }
  }
  if (input.action === 'about') {
    const have = linksOf(item)
    if (input.at === undefined || input.at < 1 || input.at > have.length) return { error: `about needs \`at\`, the number of the link (1 to ${have.length}), and \`about\`` }
    if (!input.about) return { error: 'about needs `about`: one sentence of what the link is' }
    const links = have.map((l, k) => (k === input.at! - 1 ? { ...l, about: input.about! } : l))
    const r = await lists.change(ports, { op: 'edit', list: list.id, item: item.id, links })
    return r.ok ? { ok: true, item: describeItem(r.item!, at, root) } : { error: r.error }
  }
  if (input.action === 'link') {
    const wants = linkWants(input)
    if (!wants.length) return { error: 'link needs `query`/`uuid` (a place in this conversation), `link` (a file or URL), or `links`' }
    const got = await linksFor(ports, wants, item.label)
    if ('error' in got) return { error: got.error }
    // A link the item already has is not added twice (seen live: re-linking a place doubled it).
    // A link given again with an `about` gains it (the bundles design, addendum 2026-10-31).
    const have = linksOf(item).map(h => {
      const again = got.links.find(l => sameLink(h, l) && l.about)
      return again ? { ...h, about: again.about } : h
    })
    // By identity (the bundles design, unit 1): what a link points at, not how it was stored.
    const fresh = got.links.filter((l, k) => !have.some(h => sameLink(h, l)) && got.links.findIndex(x => sameLink(x, l)) === k)
    const r = await lists.change(ports, { op: 'edit', list: list.id, item: item.id, links: [...have, ...fresh] })
    return r.ok ? { ok: true, item: describeItem(r.item!, at, root) } : { error: r.error }
  }
  if (input.action === 'unlink') {
    const have = linksOf(item)
    if (input.at === undefined || input.at < 1 || input.at > have.length) return { error: `unlink needs \`at\`, the link's number (1 to ${have.length})` }
    const r = await lists.change(ports, { op: 'edit', list: list.id, item: item.id, links: have.filter((_, k) => k !== input.at! - 1) })
    return r.ok ? { ok: true, item: describeItem(r.item!, at, root) } : { error: r.error }
  }
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
