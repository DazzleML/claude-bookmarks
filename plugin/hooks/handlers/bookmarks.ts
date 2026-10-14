// The bookmarks cluster (moved whole out of register.tsx under /move-code, 0.4.64, comments
// as they were; `ports.x()` where the code called `$`, read register.tsx's state, or called
// another cluster): the register's I/O, minting and exports, prose anchors, the anchor
// press, a bookmark's arrival and highlight, promoting a mark, and the model's tool.
// The register cache and the prose queue are owned here.

import {
  anchorHref, anchorMarkdown, anchorPath, markdownLinks, ownerOf, parseAnchor,
  type AnchorOwner, type AnchorRecord,
} from '../core/anchor.ts'
import {
  addOrRelabel, claim, emptyRegister, exportMarkdown, exportNotesOf, findRecord, listOf, parseRegister, remove, serializeRegister, share,
  type Mint, type Register as BookmarkRegister,
} from '../core/register-file.ts'
import { headOf } from '../core/transcript-lines.ts'
import { short } from '../core/message-id.ts'
import { answer as toolAnswer, brief as briefRow, describe as describeRecord, listActedOn, listName, parseToolInput, tierFor } from '../core/bookmark-tool.ts'
import type { BookmarksPorts } from '../engine/ports.ts'

// --- Bookmark anchors (anchors DWP 2026-10-09) -----------------------------------------
// The URL format, its parser and the link finder live in hooks/core/anchor.ts (pure, with
// tests under `node --test`). This file holds what needs the engine: the press, the jump,
// the highlight, the tool and the register's I/O.

// The transient mark an anchor press shows: the words the anchor names, highlighted on
// the target row like a letter's selection, under a key no letter can take. Display
// only; never written to the store (djdarcy, 2026-10-09: "highlighted yellow like how we
// handle a mark when we do <leader>'<mark-key>").
export const ANCHOR_MARK = '@'

// --- The register: <dataRoot>/bookmarks/sessions/<sessionId>.json, and one export per
// bookmark beside it. The file is the source of truth (#6); this cache is a copy of what
// was last read or written. `.bak` is written before the file, since `$.fs.write` is not
// atomic; a main file that fails to parse falls back to it.
// Held for the conversation it was read or written in (`session`): the process outlives a
// conversation (/clear, /resume), and an unkeyed cache handed the next conversation the
// register of the one before (0.4.65; tool.test.ts, "a new conversation reads its own").
let registerCache: { session: string; register: BookmarkRegister } | undefined

export async function registerPath(ports: BookmarksPorts): Promise<string | undefined> {
  const root = await ports.dataRoot()
  return root ? `${root}/bookmarks/sessions/${await ports.sessionId()}.json` : undefined
}

export async function loadRegister(ports: BookmarksPorts): Promise<BookmarkRegister> {
  const session = await ports.sessionId()
  if (registerCache?.session === session) return registerCache.register
  const path = await registerPath(ports)
  let reg: BookmarkRegister | undefined
  if (path) {
    for (const p of [path, `${path}.bak`]) {
      if (!(await ports.fsExists(p))) continue
      reg = parseRegister(await ports.fsRead(p))
      if (reg) {
        if (p !== path) ports.log(`[bm] register: ${path} unreadable; loaded its .bak (rev ${reg.rev})`)
        break
      }
      ports.log(`[bm] register: ${p} is not a register file`)
    }
  }
  if (!reg) {
    const home = (await ports.userProfile()) ?? (await ports.home())
    const configDir = (await ports.claudeConfigDir()) ?? (home ? `${home.replace(/\\/g, '/')}/.claude` : undefined)
    reg = emptyRegister(await ports.sessionId(), `${ports.pluginName} ${await ports.pluginVersion()}`, await ports.now(), {
      ...(configDir ? { configDir } : {}),
      cwd: (await ports.cwd()).replace(/\\/g, '/'),
    })
  }
  registerCache = { session, register: reg }
  return reg
}

export async function saveRegister(ports: BookmarksPorts, reg: BookmarkRegister) {
  ports.expectRedraw('a bookmark saved')
  const path = await registerPath(ports)
  if (!path) return
  if (await ports.fsExists(path)) await ports.fsWrite(`${path}.bak`, await ports.fsRead(path))
  await ports.fsWrite(path, serializeRegister({ ...reg, writer: `${ports.pluginName} ${await ports.pluginVersion()}` }))
  registerCache = { session: await ports.sessionId(), register: reg }
}

// Mint a bookmark: add or relabel the record, save the register, write the export, and
// hand back the anchor URL and the markdown link a reply writes.
async function mintBookmark(ports: BookmarksPorts, mint: Mint, messageText: string) {
  const reg = await loadRegister(ports)
  const now = await ports.now()
  const { register, record, added } = addOrRelabel(reg, mint, now)
  await saveRegister(ports, register)
  const exportPath = await writeExport(ports, register, record, messageText, now)
  const root = await ports.dataRoot()
  const href = root ? anchorHref(record, root) : undefined
  const markdown = root ? anchorMarkdown(record, root) : undefined
  ports.log(`[bm] bookmark ${added ? 'added' : 'relabelled'}: ${short(record.uuid)} "${record.label}" (${ownerOf(record)}'s list; ${record.by}/${record.source}) rev ${register.rev}`, true)
  return { record, added, href, markdown, exportPath, rev: register.rev }
}

// One export per message, shared by both lists. A rewrite keeps whatever was written under
// the notes marker (a person's or Claude's notes, links, context: pillar 3, #11).
async function writeExport(ports: BookmarksPorts, register: BookmarkRegister, record: Mint | { uuid: string; sessionId: string }, messageText: string, now: number) {
  const root = await ports.dataRoot()
  if (!root) return undefined
  const sessionId = 'sessionId' in record ? record.sessionId : register.sessionId
  const exportPath = anchorPath(root, sessionId, record.uuid)
  const existing = (await ports.fsExists(exportPath)) ? await ports.fsRead(exportPath) : undefined
  // A relabel or share has no message text in hand: read it from the transcript again,
  // and if that fails leave the file as it is rather than write an empty message.
  if (!messageText) {
    const found = await ports.resolveTarget({ uuid: record.uuid })
    if (found.kind === 'one') messageText = found.row.text
    else if (existing) return exportPath
  }
  const owners = (['user', 'claude'] as AnchorOwner[]).filter(o => findRecord(register, record.uuid, o))
  // The record to describe: the person's copy first, since the file is theirs to read.
  const main = findRecord(register, record.uuid, 'user') ?? findRecord(register, record.uuid)
  if (!main) return exportPath
  const minted = `${new Date(now).toISOString()} by ${main.by} (${main.source})`
  await ports.fsWrite(exportPath, exportMarkdown(main, messageText, { minted, owners, notes: exportNotesOf(existing) }))
  return exportPath
}

// A bookmark link written by hand (or by an older session) is a bookmark too: once drawn,
// any anchor the register does not know is resolved by uuid and recorded with
// `by: 'prose'`. Off the render path (a clock tick), one attempt per uuid per load.
const proseQueued = new Set<string>()
export function queueProseAnchors(ports: BookmarksPorts, anchors: ReturnType<typeof markdownLinks>) {
  for (const l of anchors) {
    const a = l.anchor
    if (!a || proseQueued.has(a.uuid8)) continue
    proseQueued.add(a.uuid8)
    ports.after(0, () => {
      void (async () => {
        const reg = await loadRegister(ports)
        if (findRecord(reg, a.uuid8)) return
        if (a.sessionId && a.sessionId !== (await ports.sessionId())) return // another conversation's bookmark
        const found = await ports.resolveTarget({ uuid: a.uuid })
        if (found.kind !== 'one') {
          ports.log(`[bm] prose bookmark ${a.uuid8} not recorded: ${found.kind === 'none' ? found.reason : 'ambiguous uuid'}`)
          return
        }
        const row = found.row
        await mintBookmark(
          ports,
          {
            uuid: row.uuid,
            label: l.label.replace(/^(⚓|▤|\[bm\]|\[file\])\s*/, '') || `bookmark ${a.uuid8}`,
            ...(a.words && row.text.includes(a.words) ? { words: a.words } : {}),
            line: row.line,
            bytes: [row.byteStart, row.byteEnd],
            head: headOf(row.text),
            owner: 'claude',
            by: 'prose',
            source: 'prose',
            transcript: (await ports.transcriptPath())?.replace(/\\/g, '/'),
            role: row.role,
            ...(row.timestamp ? { timestamp: row.timestamp } : {}),
          },
          row.text,
        )
      })().catch(err => ports.log(`[bm] prose bookmark ${a.uuid8} failed: ${String(err)}`))
    })
  }
}

// The press on an anchor link: resolve a uuid prefix against the rows this mod knows,
// then the same jump as a mark (with its refused-jump fallbacks).
export async function onAnchorPress(ports: BookmarksPorts, href: string) {
  const a = parseAnchor(href)
  ports.log(`[bm] anchor link pressed: ${ports.cut(href, 120)} -> ${a ? `uuid ${a.uuid}` : 'NOT an anchor'}`, true)
  if (!a) return
  let uuid = a.uuid
  if (uuid.length < 36) {
    const row = (await ports.allRows()).find(r => r.uuid.startsWith(uuid))
    if (row) uuid = row.uuid
    else ports.log(`[bm] anchor link: no known row starts with ${uuid}; trying it as written`)
  }
  // The jump records itself in the jumplist (jumpTo), so <leader> o comes back here. The
  // reading position is left alone: it is the person's (djdarcy, 2026-10-09).
  // The words to highlight (and, on a refused jump, the phrase the fallback copies): the
  // link's `q`, else the register's record.
  const words = a.words ?? (await loadRegister(ports)).perma.find(r => r.uuid === uuid)?.words
  const deny = await ports.jumpTo(uuid, 'anchor press', `anchor ${short(uuid)}${a.line ? ` (line ${a.line})` : ''}`, words)
  if (deny || !words) return
  await highlightWords(ports, uuid, words)
  ports.log(`[bm] anchor words highlighted on ${short(uuid)}: "${ports.cut(words, 60)}"`, true)
}

// --- Bookmarks in the pane and the band ---------------------------------------------------
// Numbered in the order minted (#1 the first), so a number read off the pane stays good.
export async function bookmarkList(ports: BookmarksPorts) {
  return [...(await loadRegister(ports)).perma].sort((a, b) => a.createdAt - b.createdAt)
}

// Highlight `words` on a message, as a letter's jump does, through a transient entry in
// the mark cache (reloaded from the store on the next mark write).
async function highlightWords(ports: BookmarksPorts, uuid: string, words: string) {
  ports.markCache.showTransient(ANCHOR_MARK, { uuid, head: words, markedAt: await ports.now(), source: 'selection', snippet: words })
  await ports.showMark(ANCHOR_MARK, words)
}

// Jump to a bookmark and highlight its words. Returns the scroll's refusal, if any.
export async function arriveAtBookmark(ports: BookmarksPorts, record: { uuid: string; words?: string; label: string }, via: string): Promise<string | undefined> {
  const deny = await ports.jumpTo(record.uuid, via, `bookmark ${short(record.uuid)}`, record.words)
  if (!deny && record.words) await highlightWords(ports, record.uuid, record.words)
  return deny
}

// Promote one of the person's marks (a letter, or ` for the reading position) into a
// bookmark: same message, the mark's words, `by: 'user'`. The letter is left as it is.
// The markdown link goes to the clipboard, ready to paste into a note.
export async function promoteLetter(ports: BookmarksPorts, letter: string) {
  const mark = (await ports.loadMarks())[letter]
  if (!mark) return void ports.toast(`mark ${letter} is not set`)
  const found = await ports.resolveTarget({ uuid: mark.uuid })
  if (found.kind !== 'one') {
    ports.toast(`Can't promote ${letter}: ${found.kind === 'none' ? found.reason : 'the message is ambiguous in the transcript'}`)
    return
  }
  const row = found.row
  const words = mark.snippet && row.text.includes(mark.snippet) ? mark.snippet : undefined
  const minted = await mintBookmark(
    ports,
    {
      uuid: row.uuid,
      label: (words ?? mark.head).slice(0, 80),
      ...(words ? { words } : {}),
      line: row.line,
      bytes: [row.byteStart, row.byteEnd],
      head: headOf(row.text),
      owner: 'user',
      by: 'user',
      source: 'promote',
      transcript: (await ports.transcriptPath())?.replace(/\\/g, '/'),
      role: row.role,
      ...(row.timestamp ? { timestamp: row.timestamp } : {}),
    },
    row.text,
  )
  const copied = minted.markdown ? (await ports.copy(minted.markdown)).isCopied : false
  ports.toast(`${minted.added ? 'bookmarked' : 'already a bookmark, relabelled'}: ${minted.record.label.slice(0, 40)}${copied ? ' (link copied)' : ''}`, 6000)
}

// The model's tool call (`mcp__bookmarks__bookmark`): what it takes and how it answers is
// core/bookmark-tool.ts; register.tsx's tool.call hook hands the event here.
export async function bookmarkTool(ports: BookmarksPorts, e: unknown) {
    const { tool, tool_use_id, agentId, requestMeta, ...input } = e as unknown as Record<string, unknown>
    void agentId
    void requestMeta
    ports.log(`[bm] ${String(tool)} called (${String(tool_use_id).slice(0, 12)}) with ${ports.cut(JSON.stringify(input), 160)}`, true)
    const answer = toolAnswer
    const { query, uuid, label, action, tierAsked, owner, why, words: wordsAsked, temporary } = parseToolInput(input)
    if (action !== 'list' && !query && !uuid) return answer({ error: 'give `query` (a short verbatim fragment of the message) or `uuid`' })
    const root = await ports.dataRoot()
    const describe = (r: AnchorRecord) => describeRecord(r, root)
    const brief = briefRow

    if (action === 'list') {
      const reg = await loadRegister(ports)
      return answer({ yours: listOf(reg, 'user').map(describe), claudes: listOf(reg, 'claude').map(describe), tombstones: reg.tombstones.length })
    }

    if (action === 'relabel' || action === 'remove' || action === 'share' || action === 'claim') {
      // These act on a record that exists: by uuid (full or 8+ prefix) on `owner`'s list
      // (Claude's, for a claim).
      const from: AnchorOwner = listActedOn(action, owner)
      const reg = await loadRegister(ports)
      let target = uuid ? findRecord(reg, uuid, from) : undefined
      if (!target && query) {
        const found = await ports.resolveTarget({ fragment: query })
        if (found.kind === 'one') target = findRecord(reg, found.row.uuid, from)
        else if (found.kind === 'many') target = found.rows.map(r => findRecord(reg, r.uuid, from)).find(Boolean)
      }
      if (!target) return answer({ error: `no bookmark for that on ${listName(from)} list`, hint: 'action: "list" shows both lists with their uuids' })
      const now = await ports.now()
      if (action === 'claim') {
        const r = claim(reg, target.uuid, now)
        if ('error' in r) return answer(r)
        await saveRegister(ports, r.register)
        ports.log(`[bm] bookmark claimed by the person: ${short(target.uuid)} "${r.record.label}"`, true)
        return answer({ ok: true, claimed: describe(r.record), note: "now on the person's list; same message, id and link" })
      }
      if (action === 'remove') {
        const r = remove(reg, target.uuid, owner, `claude${owner === 'user' ? ' (on the person\'s behalf)' : ''}`, now)
        if ('error' in r) return answer(r)
        await saveRegister(ports, r.register)
        ports.log(`[bm] bookmark removed from ${owner}'s list: ${short(target.uuid)} "${target.label}" (tombstoned)`, true)
        return answer({ ok: true, removed: describe(r.removed), note: 'archived as a tombstone in the register, not deleted' })
      }
      if (action === 'share') {
        const to: AnchorOwner = owner === 'claude' ? 'user' : 'claude'
        const r = share(reg, target.uuid, owner, to, now)
        if ('error' in r) return answer(r)
        await saveRegister(ports, r.register)
        await writeExport(ports, r.register, { uuid: target.uuid, sessionId: r.register.sessionId }, '', now)
        ports.log(`[bm] bookmark shared ${owner} -> ${to}: ${short(target.uuid)} "${r.record.label}"`, true)
        return answer({ ok: true, added: r.added, shared: describe(r.record), note: `now on ${listName(to)} list too; the original stays` })
      }
      // relabel
      if (!label && why === undefined && typeof input.words !== 'string') return answer({ error: 'relabel needs `label`, `why` or `words`' })
      const minted = await mintBookmark(
        ports,
        {
          uuid: target.uuid,
          owner,
          label: label ?? target.label,
          ...(why !== undefined ? { why } : {}),
          ...(wordsAsked ? { words: wordsAsked } : {}),
          ...(temporary ? { temporary: true } : {}),
          ...(tierAsked ? { tier: tierAsked } : {}),
          head: target.head,
          by: 'claude',
          source: target.source,
        },
        '',
      )
      return answer({ ok: true, relabelled: describe(minted.record) })
    }

    if (!label) return answer({ error: 'give `label`: what the bookmark is for, a few words' })
    const found = await ports.resolveTarget(uuid ? { uuid } : { fragment: query })
    ports.log(`[bm] bookmark: ${found.kind}${'via' in found && found.via ? ` via ${found.via} in ${found.ms} ms` : ''}${found.kind === 'none' ? `: ${found.reason}` : ''}`)
    if (found.kind === 'none') return answer({ error: found.reason, hint: 'use a verbatim fragment that appears in the message itself, or its uuid' })
    if (found.kind === 'many') {
      return answer({
        ambiguous: true,
        note: 'several messages contain that fragment; the earliest is where it was first said. Call again with `uuid` to choose, or a longer fragment.',
        earliest: brief(found.earliest),
        candidates: found.rows.slice(0, 12).map(brief),
      })
    }
    const row = found.row
    const words = wordsAsked ?? (query || undefined)
    const minted = await mintBookmark(
      ports,
      {
        uuid: row.uuid,
        owner,
        label,
        ...(why ? { why } : {}),
        ...(words && row.text.includes(words) ? { words } : {}),
        ...(temporary ? { temporary: true } : {}),
        tier: tierFor(tierAsked, owner),
        line: row.line,
        bytes: [row.byteStart, row.byteEnd],
        head: headOf(row.text),
        by: 'claude',
        source: 'tool',
        transcript: (await ports.transcriptPath())?.replace(/\\/g, '/'),
        role: row.role,
        ...(row.timestamp ? { timestamp: row.timestamp } : {}),
      },
      row.text,
    )
    return answer({
      ok: true,
      added: minted.added,
      owner,
      anchor: minted.href,
      markdown: minted.markdown,
      ...brief(row),
      words: minted.record.words,
      export: minted.exportPath,
      note: `on ${listName(owner)} list. Write \`markdown\` in your reply as the citation; a plain click jumps there, a ctrl-click opens the export`,
    })
}
