// claude-bookmarks POC -- a throwaway probe, not the product.
//
// It answers five questions before anything real is built (the DWP's B1-B5):
//   B1  is a UserMessage row's requestId the transcript uuid session.append reports?
//   B2  can $.ui.scroll reveal a row that has not been drawn since the mod loaded?
//   B3  does a typed command count as "the person's own input" for scroll?
//   B4  does a chord bound to a borrowed engine action press a mod Button?
//   B5  does a press in a mod pane count as the person's input for scroll?
//
// Every probe reports with $.ui.log (a dim transcript row Claude never reads) or a
// toast. No command answers with `text`, because that text becomes a row Claude reads.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { PaneMode, Row } from '../types'

const PANE = 'bm-poc'
const TESTED_ON = '2.1.288'

// Engine keybinding actions borrowed for the chord test (B4). Neither should have a
// handler mounted while the built-in diff mod is enabled; the version check in
// session.start is how we notice when a new build might have changed that.
const MARK_ACTION = 'app:toggleDiffNoiseFilter'
const JUMP_ACTION = 'app:toggleDiffPreSession'

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

const rows = atom({ plugin: 'convo-bookmarks', key: 'rows' } as const, [])
const paneMode = atom({ plugin: 'convo-bookmarks', key: 'paneMode' } as const, 'list')
const shown = atom({ plugin: 'convo-bookmarks', key: 'shown' } as const, null)

// The highlight and the band text are temporary (user, 2026-10-03: "visible temporarily
// for maybe a minute or two or until the next action like another prompt is sent").
// Only the mark just set or jumped to is shown; it clears after HIGHLIGHT_MS or on the
// next prompt. Display only: nothing here touches what session.append stores.
const HIGHLIGHT_MS = 120_000
let clearTimer: Timer | undefined

async function showMark($: EngineInterface, letter: string, text: string) {
  await update($, shown, () => ({ letter, text }))
  clearTimer?.cancel()
  clearTimer = $.clock.after(HIGHLIGHT_MS, () => {
    void clearShown($)
  })
  note(`show mark ${letter} for ${HIGHLIGHT_MS / 1000}s`)
}

async function clearShown($: EngineInterface) {
  clearTimer?.cancel()
  clearTimer = undefined
  if (await read($, shown)) {
    await update($, shown, () => null)
    note('highlight cleared')
  }
}

// The session's marks, kept in memory so render hooks can read them without a store
// call per row. Loaded at session.start and refreshed on every mark write.
let markCache: Record<string, Mark> = {}

// The first line of a selection, which is what a row redraw searches for: a match
// across lines would have to rewrite markdown structure, which this POC won't do.
const snippetOf = (text: string) => (text.split('\n').find(l => l.trim()) ?? '').trim().slice(0, 120)

// Round 4 colors (dark terminal; a light background would need a lighter LINE_BG).
// LINE_BG: darker than the selection blue #264F78 so it reads as a soft band.
const LINE_BG = '#1B3754'
const WORDS_FG = 'yellow'

// Split a reply's markdown around the line holding `snippet`, for drawing that line
// ourselves. Undefined (caller falls back to bold) when the split is risky: no match,
// the line is inside a fenced code block, or the remainder is too long for Markdown.
function colorSplit(text: string, letter: string, snippet: string | undefined) {
  if (!snippet) return undefined
  const lines = text.split('\n')
  const idx = lines.findIndex(l => l.includes(snippet))
  if (idx < 0) return undefined
  const fences = lines.slice(0, idx).filter(l => l.trimStart().startsWith('```')).length
  if (fences % 2 === 1) return undefined
  const before = lines.slice(0, idx).join('\n').trimEnd()
  const after = lines.slice(idx + 1).join('\n').trim()
  if (after.length > 9000) return undefined
  // The line is drawn as plain Text: drop the commonest inline markdown so it reads clean.
  const plain = (s: string) => s.replace(/\*\*|`/g, '')
  const line = lines[idx] ?? ''
  const at = line.indexOf(snippet)
  return {
    before,
    pre: plain(line.slice(0, at)),
    snippet: plain(snippet),
    post: plain(line.slice(at + snippet.length)),
    after,
    letter,
  }
}

// The shown mark, if it is on this row: by real uuid, or a drawn id sharing its first
// four groups. Only the one mark currently shown is ever highlighted.
function marksOnRow(requestId: string, showing: string | undefined): [string, Mark][] {
  if (!showing) return []
  return Object.entries(markCache).filter(
    ([letter, m]) =>
      letter === showing &&
      m.source === 'selection' &&
      (m.uuid === requestId || firstFour(m.uuid) === firstFour(requestId)),
  )
}

// Ids seen at UserMessage render time since this module loaded. A module variable on
// purpose: a render hook may not write $.state, and a reload SHOULD forget these,
// which is what makes the B2 test ("never drawn since load") possible.
const rendered = new Map<string, string>()

// A timeline of what the mod saw and did, so a drawn-id mismatch can be lined up
// against the pane, store and toast activity just before it. Module-level: a reload
// starts it over, the same as `rendered`.
const timeline: { t: number; what: string }[] = []
function note(what: string) {
  timeline.push({ t: Date.now(), what })
  if (timeline.length > 400) timeline.shift()
}
const clock = (t: number) => new Date(t).toISOString().slice(11, 23)
const firstFour = (uuid: string) => uuid.split('-').slice(0, 4).join('-')

// `snippet`: the selection's first line exactly as selected, for highlighting.
type Mark = { uuid: string; head: string; markedAt: number; source?: 'selection' | 'latest'; snippet?: string }
type Marks = Record<string, Mark>

const short = (uuid: string) => uuid.slice(0, 8)
const head = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 60)

async function allRows($: EngineInterface): Promise<Row[]> {
  return (await read($, rows)) as Row[]
}

async function prompts($: EngineInterface): Promise<Row[]> {
  return (await allRows($)).filter(r => r.door === 'prompt')
}

async function marksKey($: EngineInterface): Promise<string> {
  return `marks:${await $.session.id()}`
}

async function loadMarks($: EngineInterface): Promise<Marks> {
  return ((await $.store.get(await marksKey($))) as Marks | undefined) ?? {}
}

// B2/B3/B5 share this: scroll, then report exactly what the engine answered.
async function jumpTo($: EngineInterface, uuid: string, via: string, label: string) {
  const result = await $.ui.scroll({ to: { requestId: uuid }, block: 'start' })
  const verdict = result.deny ? `DENY: ${result.deny}` : 'ok'
  note(`scroll ${uuid} via ${via} -> ${verdict}`)
  $.ui.log(
    `[bm-poc] ${via} scroll -> ${verdict} | target ${label} ${short(uuid)} | ` +
      `drawn since load: ${rendered.has(uuid) ? 'yes' : 'NO'}`,
  )
}

// The selection as it stood when the mark chord fired, read BEFORE the pane opens:
// round 1 read it after, and the mark landed one row too high (the inline pane shifts
// the transcript; hypothesis: the engine maps the selection to a row by screen position).
let selectionAtChord: Awaited<ReturnType<EngineInterface['ui']['selection']>> | undefined

// A drawn row id may be the zero-tailed form of the real uuid. Find the saved row it
// stands for, and say whether the selected text is really in that row.
async function resolveSelectionRow($: EngineInterface, id: string, text: string) {
  const list = await allRows($)
  const saved = list.find(r => r.uuid === id) ?? list.find(r => firstFour(r.uuid) === firstFour(id))
  const needle = text.trim().slice(0, 40)
  const check = !saved ? 'no saved row'
    : saved.text === undefined ? 'row saved before text capture'
    : saved.text.includes(needle) ? 'text verified' : 'TEXT NOT IN ROW'
  return { uuid: saved?.uuid ?? id, check }
}

async function setMark($: EngineInterface, letter: string) {
  // Selection POC: a mouse selection inside one transcript row wins over "latest prompt".
  const sel = selectionAtChord ?? (await $.ui.selection())
  selectionAtChord = undefined
  note(`selection at mark: ${sel ? `row ${sel.requestId ?? '(none)'} text ${JSON.stringify(sel.text.slice(0, 80))}` : 'none'}`)
  if (sel?.requestId) {
    const { uuid, check } = await resolveSelectionRow($, sel.requestId, sel.text)
    const fresh = await loadMarks($)
    const mark: Mark = {
      uuid,
      head: head(sel.text),
      markedAt: await $.clock.now(),
      source: 'selection',
      snippet: snippetOf(sel.text),
    }
    note(`store.set mark ${letter} -> ${uuid} (selection, drawn ${sel.requestId}, ${check})`)
    await $.store.set(await marksKey($), { ...fresh, [letter]: mark })
    markCache = { ...fresh, [letter]: mark }
    // Writing `shown` redraws the rows and the band that read it.
    await showMark($, letter, snippetOf(sel.text))
    $.ui.log(`[bm-poc] SEL: mark ${letter} -> ${uuid} (drawn as ${sel.requestId}; ${check}) | "${head(sel.text)}"`)
    $.ui.toast(`mark ${letter} [selection] -> ${head(sel.text).slice(0, 40)}`)
    return
  }

  const latest = (await prompts($)).at(-1)
  if (!latest) {
    note('toast: no prompt captured')
    $.ui.toast('No prompt captured since the mod loaded')
    return
  }
  // Read again right before the write: the store is shared and not atomic.
  const fresh = await loadMarks($)
  const mark: Mark = { uuid: latest.uuid, head: latest.head, markedAt: await $.clock.now(), source: 'latest' }
  note(`store.set mark ${letter} -> ${latest.uuid}`)
  await $.store.set(await marksKey($), { ...fresh, [letter]: mark })
  note(`toast: mark ${letter}`)
  $.ui.toast(`mark ${letter} [latest prompt] -> ${latest.head.slice(0, 40)}`)
}

async function jumpToMark($: EngineInterface, letter: string) {
  const mark = (await loadMarks($))[letter]
  if (mark) {
    await jumpTo($, mark.uuid, 'B4+B5 chord jump', `mark ${letter}`)
    await showMark($, letter, mark.snippet ?? mark.head)
  } else {
    $.ui.toast(`mark ${letter} is not set`)
  }
}

async function openFor($: EngineInterface, mode: PaneMode, action: string) {
  $.ui.log(`[bm-poc] B4: chord for ${action} pressed the band Button`)
  if (mode === 'mark') {
    selectionAtChord = await $.ui.selection()
    note(`selection at chord: ${selectionAtChord?.requestId ?? 'none'}`)
  }
  await update($, paneMode, () => mode)
  const title = mode === 'mark' ? 'mark: press a-z' : 'jump: press a-z'
  note(`pane open (${mode}, focus)`)
  await $.ui.open({ id: PANE, title, focus: true, closeOnEscape: true })
}

async function closePane($: EngineInterface) {
  note('pane close')
  await $.ui.close({ id: PANE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const commands: [string, string][] = [
      ['bm-ids', 'Probe B1: compare appended prompt uuids with rendered ids'],
      ['bm-jump', 'Probe B2/B3: scroll to a prompt (first | last | N | r<N> | uuid)'],
      ['bm-pane', 'Probe B5: open a pane of prompts; press 1-9 to jump'],
      ['bm-marks', 'List the marks set with the chord test'],
      ['bm-env', 'Show version, session id and what the probe has captured'],
      ['bm-timeline', 'Show the last N mod events (draws, appends, pane, store, toast, scroll)'],
      ['bm-sel', 'Selection POC: show what $.ui.selection() returns for your mouse selection'],
    ]
    for (const [name, description] of commands) {
      await $.command.register({ name, description, immediate: true })
    }

    markCache = await loadMarks($)

    // The tracking mechanism for the borrowed actions: say so whenever the build
    // differs from the one the chords were verified on.
    const v = await $.session.version()
    if ((v.base ?? v.version) !== TESTED_ON) {
      $.ui.toast(`convo-bookmarks: chords verified on ${TESTED_ON}, this is ${v.version}`)
    }
    return next(e)
  })

  // The next prompt ends the temporary highlight.
  on('prompt.submit', async ($, e, next) => {
    await clearShown($)
    return next(e)
  })

  // Every row stored in the main conversation passes here with its transcript uuid.
  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    const isWanted = e.door === 'prompt' || e.door === 'response'
    if (!e.agentId && isWanted && !e.message.isMeta) {
      const text = e.message.content.map(block => (block.type === 'text' ? block.text : '')).join(' ')
      if (text.trim()) {
        // `text` (first 4000 chars) lets a selection mark check it landed in the right row.
        const row: Row = { uuid: e.uuid, door: e.door as Row['door'], head: head(text), text: text.slice(0, 4000) }
        note(`append ${e.door} ${e.uuid} ${row.head.slice(0, 30)}`)
        await update($, rows, list => [...(list as Row[]), row].slice(-500))
      }
    }
    return stored
  })

  // Observe only: note the id, draw nothing different.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!rendered.has(e.requestId)) {
      const text = head(e.props.text ?? '')
      rendered.set(e.requestId, text)
      note(`draw UserMessage ${e.requestId} ${text.slice(0, 30)}`)
    }
    // Highlight POC: a prompt row is plain text, so the mark shows as a «a» tag
    // in front of the selected words. Display only -- the model never reads it.
    const text = e.props.text ?? ''
    let marked = text
    for (const [letter, m] of marksOnRow(e.requestId, (await read($, shown))?.letter)) {
      if (m.snippet && marked.includes(m.snippet)) marked = marked.replace(m.snippet, `«${letter}» ${m.snippet}`)
    }
    return marked === text ? next(e) : next({ ...e, props: { ...e.props, text: marked } })
  })

  // Highlight POC: a reply's text is markdown, so the marked words are drawn bold with
  // a «a» tag. When the selection (rendered text) doesn't match the markdown source
  // literally, the tag goes on a line of its own at the top of the block instead, which
  // is where a jump lands. Only rows carrying a mark are touched.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const marks = marksOnRow(e.requestId, (await read($, shown))?.letter)
    if (marks.length === 0) return next(e)

    // Round 4: draw the marked LINE ourselves, so it can carry a background and the
    // selected words a color (markdown has neither). The part before it still goes to
    // the engine (keeps the reply's bullet and formatting); the part after is drawn
    // with the Markdown element. Any case this split could mangle falls through to
    // the round-3 bold rewrite below.
    const [first] = marks
    const colored = first && colorSplit(e.props.text, first[0], first[1].snippet)
    if (colored) {
      const { Box, Text, Markdown } = $.ui.resolve(e)
      const { before, pre, snippet, post, after, letter } = colored
      const line = (
        <Text backgroundColor={LINE_BG}>
          {pre}
          <Text color={WORDS_FG} bold>
            «{letter}» {snippet}
          </Text>
          {post}
        </Text>
      )
      if (before) {
        const engine = await next({ ...e, props: { ...e.props, text: before } })
        return (
          <Box flexDirection="column">
            {engine}
            {line}
            {after && <Markdown text={after} />}
          </Box>
        )
      }
      const engine = after ? await next({ ...e, props: { ...e.props, text: after } }) : null
      return (
        <Box flexDirection="column">
          {line}
          {engine}
        </Box>
      )
    }

    let text = e.props.text
    const unmatched: string[] = []
    for (const [letter, m] of marks) {
      const s = m.snippet
      if (s && !/[*`_]/.test(s) && text.includes(s)) text = text.replace(s, `**«${letter}» ${s}**`)
      else unmatched.push(`«${letter}» ${s ?? m.head}`)
    }
    if (unmatched.length > 0) text = `> **${unmatched.join('  ')}**\n\n${text}`
    return next({ ...e, props: { ...e.props, text } })
  })

  on('command.run', { command: 'bm-ids' }, async $ => {
    const list = await prompts($)
    const appended = new Set(list.map(r => r.uuid))
    const matched = list.filter(r => rendered.has(r.uuid)).length
    const strays = [...rendered.keys()].filter(id => !appended.has(id))
    $.ui.log(
      `[bm-poc] B1: ${matched} of ${list.length} appended prompt uuids were seen as ` +
        `UserMessage requestIds; ${rendered.size} UserMessage ids drawn since load; ` +
        `${strays.length} drawn ids not among appended prompts`,
    )
    // How each appended prompt was drawn: under its real uuid, under an id sharing
    // the uuid's first four groups (zero-tailed), under some id with the same text,
    // or not seen at all.
    const drawnAs = (r: Row) => {
      if (rendered.has(r.uuid)) return 'exact'
      const ids = [...rendered.keys()]
      if (ids.some(id => id !== r.uuid && firstFour(id) === firstFour(r.uuid))) return 'pfx  '
      if (ids.some(id => rendered.get(id) === r.head)) return 'text '
      return '-----'
    }
    const shown = list.slice(-12)
    shown.forEach((r, i) => {
      const n = list.length - shown.length + i + 1
      $.ui.log(`[bm-poc]   #${n} ${short(r.uuid)} ${drawnAs(r)} ${r.head}`)
    })
    strays.slice(0, 20).forEach(id => $.ui.log(`[bm-poc]   drawn, not appended: ${id} ${rendered.get(id)}`))
    return {}
  })

  on('command.run', { command: 'bm-jump' }, async ($, e) => {
    const arg = e.args.trim()
    const list = await allRows($)
    const onlyPrompts = list.filter(r => r.door === 'prompt')
    let target: Row | undefined
    let label = arg
    if (arg === '' || arg === 'last') {
      target = onlyPrompts.at(-1)
      label = 'last prompt'
    } else if (arg === 'first') {
      target = onlyPrompts[0]
      label = 'first prompt'
    } else if (/^\d+$/.test(arg)) {
      target = onlyPrompts[Number(arg) - 1]
      label = `prompt #${arg}`
    } else if (/^r\d+$/.test(arg)) {
      target = list.filter(r => r.door === 'response')[Number(arg.slice(1)) - 1]
      label = `reply #${arg.slice(1)}`
    } else {
      target = list.find(r => r.uuid.startsWith(arg))
    }

    if (target) {
      await jumpTo($, target.uuid, 'B3 command', label)
    } else if (/^[0-9a-f-]{36}$/.test(arg)) {
      // Not a captured row: try the raw id anyway, which tests B2 for ids known only
      // from the transcript file (paste a uuid from jq).
      await jumpTo($, arg, 'B3/B2 command (raw uuid)', 'raw')
    } else {
      $.ui.log(`[bm-poc] nothing captured for "${arg}" (${onlyPrompts.length} prompts captured since load)`)
    }
    return {}
  })

  on('command.run', { command: 'bm-pane' }, async $ => {
    await update($, paneMode, () => 'list')
    await $.ui.open({ id: PANE, title: 'bm-poc', focus: true, closeOnEscape: true })
    return {}
  })

  on('command.run', { command: 'bm-marks' }, async $ => {
    const marks = await loadMarks($)
    const entries = Object.entries(marks).sort(([a], [b]) => a.localeCompare(b))
    if (entries.length === 0) $.ui.log('[bm-poc] no marks in this session')
    for (const [l, m] of entries) $.ui.log(`[bm-poc]   ${l}  ${short(m.uuid)}  ${m.head}`)
    return {}
  })

  // Selection POC arm D: exactly what $.ui.selection() answers, and whether its row
  // id is one the mod already knows (a saved uuid, or an id seen at draw time).
  on('command.run', { command: 'bm-sel' }, async $ => {
    const sel = await $.ui.selection()
    if (!sel) {
      $.ui.log('[bm-poc] SEL: no selection (nothing selected, fullscreen off, or cleared by a prompt)')
      return {}
    }
    const id = sel.requestId
    const saved = id ? (await allRows($)).find(r => r.uuid === id) : undefined
    const known = !id ? 'no row (spans rows / outside transcript)'
      : saved ? `saved ${saved.door} row`
      : rendered.has(id) ? 'drawn id only (not a saved uuid)'
      : 'unknown id (maybe a tool_use_id or a reply)'
    $.ui.log(`[bm-poc] SEL: row ${id ?? '(none)'} -> ${known}; ${sel.text.length} chars`)
    $.ui.log(`[bm-poc] SEL text: ${JSON.stringify(sel.text.slice(0, 300))}`)
    note(`bm-sel row ${id ?? '(none)'} ${known}`)
    return {}
  })

  on('command.run', { command: 'bm-timeline' }, async ($, e) => {
    const n = Number(e.args.trim()) || 40
    const recent = timeline.slice(-n)
    $.ui.log(`[bm-poc] timeline: last ${recent.length} of ${timeline.length} events since load`)
    for (const { t, what } of recent) $.ui.log(`[bm-poc]   ${clock(t)} ${what}`)
    return {}
  })

  on('command.run', { command: 'bm-env' }, async $ => {
    const v = await $.session.version()
    const list = await allRows($)
    const promptCount = list.filter(r => r.door === 'prompt').length
    $.ui.log(
      `[bm-poc] version ${v.version} (chords verified on ${TESTED_ON}); session ${await $.session.id()}; ` +
        `captured ${promptCount} prompts, ${list.length - promptCount} replies; ${rendered.size} drawn ids`,
    )
    return {}
  })

  // B4: the band carries two Buttons named after borrowed engine actions. Bound to
  // chords in keybindings.json, the chords should press them from the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const theirs = await next(e)
    const last = await read($, shown)
    return (
      <Box flexDirection="column">
        {theirs}
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor>bm-poc:</Text>
          <Button key="chord-mark" label="mark" plain dimColor action={MARK_ACTION} onPress={() => openFor($, 'mark', MARK_ACTION)} />
          <Button key="chord-jump" label="jump" plain dimColor action={JUMP_ACTION} onPress={() => openFor($, 'jump', JUMP_ACTION)} />
          {last && (
            <Text wrap="truncate-end">
              | <Text bold>{last.letter}</Text> ▸ {last.text}
            </Text>
          )}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const mode = (await read($, paneMode)) as PaneMode

    if (mode === 'list') {
      // B5: digits 1-9 jump to the nine most recent captured prompts.
      const recent = (await prompts($)).slice(-9).reverse()
      return (
        <Box flexDirection="column">
          {recent.length === 0 && <Text dimColor>No prompts captured since the mod loaded.</Text>}
          {recent.map((r, i) => (
            <Button
              key={`p-${r.uuid}`}
              hotkey={String(i + 1)}
              label={`${rendered.has(r.uuid) ? '' : '(never drawn) '}${r.head}`}
              plain
              onPress={async () => {
                await jumpTo($, r.uuid, 'B5 pane press', `recent #${i + 1}`)
                await closePane($)
              }}
            />
          ))}
        </Box>
      )
    }

    // mark / jump: the vim leg. One letter completes it.
    const marks = await loadMarks($)
    return (
      <Box flexDirection="column">
        <Text dimColor>{mode === 'mark' ? 'Mark the latest prompt as:' : 'Jump to mark:'} (Esc cancels)</Text>
        <Box flexDirection="row" columnGap={1} flexWrap="wrap">
          {LETTERS.map(l => (
            <Button
              key={`${mode}-${l}`}
              hotkey={l}
              label={l}
              plain
              dimColor={mode === 'jump' && !marks[l]}
              onPress={async () => {
                if (mode === 'mark') await setMark($, l)
                else await jumpToMark($, l)
                await closePane($)
              }}
            />
          ))}
        </Box>
      </Box>
    )
  })
}
