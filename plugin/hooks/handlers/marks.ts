// The marks cluster (moved whole out of register.tsx under /move-code, 0.4.62, comments as
// they were; `ports.x()` where the code called `$`, read register.tsx's state, or called
// another cluster): the highlight, setting a mark, the reading position and jumping to a
// mark. Its state is core/mark-state.ts MarkState, reached through `ports.state`; the
// marks themselves are in the store, with core/marks.ts MarkCache as their in-memory copy.

import { sameMessage, findByMessage, short } from '../core/message-id.ts'
import { plainMarkdown, snippetOf } from '../core/highlight.ts'
import { headOf } from '../core/transcript-lines.ts'
import type { Mark } from '../core/marks.ts'
import type { SelectionLike } from '../core/mark-state.ts'
import type { MarksPorts } from '../engine/ports.ts'

// The highlight and the band text are temporary (djdarcy, 2026-10-03: "visible temporarily
// for maybe a minute or two or until the next action like another prompt is sent").
// Only the mark just set or jumped to is shown; it clears after HIGHLIGHT_MS or on the
// next prompt. Display only: nothing here touches what session.append stores.
export const HIGHLIGHT_MS = 120_000

export async function showMark(ports: MarksPorts, letter: string, text: string) {
  ports.expectRedraw('a highlight shown')
  await ports.setShown({ letter, text })
  ports.state.restartClear(() =>
    ports.after(HIGHLIGHT_MS, () => {
      void clearShown(ports)
    }),
  )
  ports.note(`show mark ${letter} for ${HIGHLIGHT_MS / 1000}s`)
}

export async function clearShown(ports: MarksPorts) {
  ports.state.stopClear()
  if (await ports.shown()) {
    ports.expectRedraw('a highlight cleared')
    await ports.setShown(null)
    ports.note('highlight cleared')
  }
}

// A drawn row id may be the zero-tailed form of the real uuid. Find the saved row it
// stands for, and say whether the selected text is really in that row.
async function resolveSelectionRow(ports: MarksPorts, id: string, text: string) {
  const list = await ports.allRows()
  const saved = findByMessage(list, id)
  const needle = text.trim().slice(0, 40)
  const check = !saved ? 'no saved row'
    : saved.text === undefined ? 'row saved before text capture'
    : saved.text.includes(needle) ? 'text verified' : 'TEXT NOT IN ROW'
  return { uuid: saved?.uuid ?? id, check }
}

export async function highlightInPlace(ports: MarksPorts, letter: string, text: string) {
  ports.noteRestore(ports.paneAnchor() ?? (await ports.topOnScreen()))
  await showMark(ports, letter, text)
}

// --- Fresh and stale selections ---------------------------------------------------------
// $.ui.selection() answers what the person LAST selected, even once its highlight is gone
// (the types' docs), so a mark with nothing selected used a quote selected minutes
// earlier (2026-10-07 07:13:10, 07:20:21). djdarcy: "if a user selects text we should be
// attempting to date-time it and if it's older than 1.25 minutes then we should mark the
// current top-left portion of the screen". No event says when a selection changes, so it
// is polled once a second and stamped when it does. Becomes a setting (#7).
const SELECTION_FRESH_SECONDS = 75
const selectionKey = (s: SelectionLike) => (s?.requestId && s.text.trim() ? `${s.requestId}|${s.text}` : '')

export async function pollSelection(ports: MarksPorts) {
  const key = selectionKey(await ports.selection())
  // The first look has no history: whatever is selected then counts as old.
  if (!ports.state.seen) ports.state.see(key, 0)
  else if (key !== ports.state.seen.key) ports.state.see(key, Date.now())
}

// The selection if it was made within SELECTION_FRESH_SECONDS, else undefined.
export async function freshSelection(ports: MarksPorts, sel: SelectionLike): Promise<SelectionLike> {
  const key = selectionKey(sel)
  if (!key) return undefined
  // Changed since the last poll: made within the last second.
  if (ports.state.seen && key !== ports.state.seen.key) ports.state.see(key, Date.now())
  const at = ports.state.seen?.key === key ? ports.state.seen.at : 0
  const age = at ? Math.round((Date.now() - at) / 1000) : undefined
  const fresh = age !== undefined && age <= SELECTION_FRESH_SECONDS
  ports.log(`[bm] selection "${ports.cut(sel!.text.trim(), 24)}" is ${age === undefined ? 'of unknown age' : `${age}s old`}: ${fresh ? 'used' : 'ignored (stale)'}`, true)
  return fresh ? sel : undefined
}

// The message at the top of the screen, as a mark: the fallback when no fresh selection
// says where (djdarcy: "the current 'screen' they are looking at from the top left").
// Message-level, like the reading position; its first line is the one highlighted.
async function screenTopMark(ports: MarksPorts, before?: string): Promise<Mark | undefined> {
  const id = before ?? (await ports.topOnScreen())
  if (!id) return undefined
  const list = await ports.allRows()
  const row = findByMessage(list, id)
  const text = row?.text ?? ports.drawnText(id) ?? row?.head ?? ''
  const first = snippetOf(plainMarkdown(text))
  return {
    uuid: row?.uuid ?? id,
    head: headOf(text) || '(message at the top of the screen)',
    markedAt: await ports.now(),
    source: 'screen',
    ...(first ? { snippet: first } : {}),
  }
}

export async function setMark(ports: MarksPorts, letter: string) {
  // A fresh mouse selection says where; otherwise the top of the screen.
  const sel = await freshSelection(ports, ports.state.takeAtChord() ?? (await ports.selection()))
  ports.note(`selection at mark: ${sel ? `row ${sel.requestId ?? '(none)'} text ${JSON.stringify(sel.text.slice(0, 80))}` : 'none'}`)
  if (sel?.requestId) {
    const { uuid, check } = await resolveSelectionRow(ports, sel.requestId, sel.text)
    const fresh = await ports.loadMarks()
    const mark: Mark = {
      uuid,
      head: headOf(sel.text),
      markedAt: await ports.now(),
      source: 'selection',
      snippet: snippetOf(sel.text),
    }
    ports.note(`store.set mark ${letter} -> ${uuid} (selection, drawn ${sel.requestId}, ${check})`)
    await ports.saveMarks({ ...fresh, [letter]: mark })
    ports.markCache.replace({ ...fresh, [letter]: mark })
    // Writing `shown` redraws the rows and the band that read it.
    await highlightInPlace(ports, letter, snippetOf(sel.text))
    ports.log(`[bm] SEL: mark ${letter} -> ${uuid} (drawn as ${sel.requestId}; ${check}) | "${headOf(sel.text)}"`, true)
    ports.toast(`mark ${letter} [selection] -> ${headOf(sel.text).slice(0, 40)}`)
    return
  }

  // No fresh selection: the message at the top of the screen, as it was BEFORE the pane
  // opened and shifted it (paneAnchor). (The "latest prompt" fallback is gone: prompts
  // have the prompts pane and pins. djdarcy, 2026-10-07.)
  const mark = await screenTopMark(ports, ports.paneAnchor())
  if (!mark) {
    ports.toast('Nothing on screen to mark yet: scroll a little, or select some text')
    return
  }
  // Read again right before the write: the store is shared and not atomic.
  const fresh = await ports.loadMarks()
  ports.note(`store.set mark ${letter} -> ${mark.uuid} (top of screen)`)
  await ports.saveMarks({ ...fresh, [letter]: mark })
  ports.markCache.replace({ ...fresh, [letter]: mark })
  if (mark.snippet) await highlightInPlace(ports, letter, mark.snippet)
  ports.log(`[bm] mark ${letter} -> ${short(mark.uuid)} (top of screen) | "${mark.head}"`, true)
  ports.toast(`mark ${letter} [top of screen] -> ${mark.head.slice(0, 40)}`)
}

// --- Reading position: Ctrl+X Space ------------------------------------------------
// One key, no letter (djdarcy, 2026-10-04): with text selected it sets the reading
// position there; with nothing selected (or the same selection still up) it jumps to
// it, and pressed again while it is on screen it swaps back to where the person was,
// like vim's ``. "On screen" comes from what the render hooks report, not from the
// last press, so scrolling by hand in between does not confuse it.
// The toggle's state, kept explicitly rather than read off the screen (whose reports go
// stale after a jump, see onScreenNow): `at` true right after going to the reading
// position, so the next press goes `back`; false otherwise, so the next press goes there.
// `backBlock`: which edge of the window `back` was anchored to (viewAnchor).
type ReadingState = { at: boolean; back: string | null; backBlock?: 'start' | 'end' }
async function readingStateKey(ports: MarksPorts): Promise<string> {
  return `readingState:${await ports.sessionId()}`
}
async function readingState(ports: MarksPorts): Promise<ReadingState> {
  return ((await ports.storeGet(await readingStateKey(ports))) as ReadingState | undefined) ?? { at: false, back: null }
}
async function setReadingState(ports: MarksPorts, state: ReadingState) {
  await ports.storeSet(await readingStateKey(ports), state)
}

// Where "back" goes when you left from the bottom of the conversation (a setting, #7):
//   'where-it-was': the same text you were reading, even if new replies arrived since
//                   (djdarcy's choice: "I'd rather have it always go to the exact same
//                   location where the screen was so I'm reading exactly what I was
//                   reading before");
//   'newest':       the bottom as it is now, Ctrl+End, new replies included.
const READING_BACK_FROM_BOTTOM: 'where-it-was' | 'newest' = 'where-it-was'

// Go to the reading position, noting where we were so the next Ctrl+X Space swaps back.
// Shared by the chord and the jump pane's `␣ reading` entry.
export async function goToReading(ports: MarksPorts, reading: Mark, via: string) {
  const here = await ports.topOnScreen()
  const anchor = await ports.viewAnchor()
  // Already at the reading position (the jump pane's entry used while there, log
  // 2026-10-05 00:06:17): keep the earlier spot to return to, or "back" would go to
  // the reading position itself.
  const atItAlready = !!here && sameMessage(here, reading.uuid)
  const previous = await readingState(ports)
  await setReadingState(
    ports,
    atItAlready
      ? { at: true, back: previous.back, ...(previous.backBlock ? { backBlock: previous.backBlock } : {}) }
      : { at: true, back: anchor?.uuid ?? null, ...(anchor ? { backBlock: anchor.block } : {}) },
  )
  if (anchor) ports.log(`[bm] reading position: back will be ${short(anchor.uuid)} at the window's ${anchor.block}`)
  await ports.jumpTo(reading.uuid, via, `from ${here ? short(here) : '(unknown)'}`)
  await showMark(ports, ports.readingLetter, reading.snippet ?? reading.head)
}

export async function readingToggle(ports: MarksPorts) {
  // Only a fresh selection moves the reading position (a stale one did, 2026-10-07 07:20:21).
  const sel = await freshSelection(ports, await ports.selection())
  const marks = await ports.loadMarks()
  const reading = marks[ports.readingLetter]
  const picked = sel?.requestId && sel.text.trim() ? snippetOf(sel.text) : undefined

  // A selection in a different message: set the reading position there. One inside the
  // message that already holds it counts as "go there", not "move": terminal
  // selections appear and linger easily (a click, a drag), and twice a press meant as a
  // jump re-set it instead, to a stray mid-word selection in the same message (log,
  // 2026-10-04 23:53:58 and 23:55:09).
  const inReadingMessage =
    !!reading && !!sel?.requestId && sameMessage(sel.requestId, reading.uuid)
  if (sel?.requestId && picked && !inReadingMessage) {
    const { uuid, check } = await resolveSelectionRow(ports, sel.requestId, sel.text)
    const mark: Mark = { uuid, head: headOf(sel.text), markedAt: await ports.now(), source: 'selection', snippet: picked }
    await ports.saveMarks({ ...marks, [ports.readingLetter]: mark })
    ports.markCache.replace({ ...marks, [ports.readingLetter]: mark })
    // Next press goes there (from wherever the person has scrolled to by then).
    await setReadingState(ports, { at: false, back: null })
    await highlightInPlace(ports, ports.readingLetter, picked)
    await ports.restoreView()
    ports.log(`[bm] reading position set -> ${short(uuid)} (${check}) | "${headOf(sel.text)}"`, true)
    ports.toast(`reading position set: ${headOf(sel.text).slice(0, 40)}`)
    return
  }

  if (!reading) {
    ports.toast('Select some text, then Ctrl+X Space, to set a reading position')
    return
  }

  const state = await readingState(ports)
  // Go back only while the reading position is actually on screen, judged by the
  // latest burst of on-screen reports. The there/back state alone was wrong once the
  // person scrolled elsewhere by hand: the next press "went back" to the old spot
  // instead of to the mark (djdarcy, 2026-10-04). Old reports alone were wrong after
  // Ctrl+End (the message left behind still looked visible); the freshness filter
  // handles that.
  const onScreenNowFresh = ports.freshOnScreen().some(
    id => sameMessage(id, reading.uuid),
  )
  if (state.at && state.back && onScreenNowFresh) {
    await setReadingState(ports, { at: false, back: null })
    // Left from the bottom, and the setting says "the bottom as it is now": the newest
    // captured message's end instead of the one that was last then.
    const newest = state.backBlock === 'end' && READING_BACK_FROM_BOTTOM === 'newest' ? (await ports.allRows()).at(-1)?.uuid : undefined
    const target = newest ?? state.back
    await ports.jumpTo(target, 'reading position (back)', `to ${short(target)} (${state.backBlock ?? 'start'}${newest ? ', newest' : ''})`, undefined, false, state.backBlock ?? 'start')
    await clearShown(ports)
    return
  }
  // Already looking at it, with nowhere real to go back to: stay put. Jumping here
  // recorded the message just above the mark as "where you were", so the next press
  // swapped between two spots a few lines apart; and pressing at the mark re-jumped
  // to it over and over (log, 2026-10-05 00:39-00:42 UTC).
  if (onScreenNowFresh) {
    await showMark(ports, ports.readingLetter, reading.snippet ?? reading.head)
    ports.toast("You're at the reading position. Scroll away and press again to come back here.")
    const seen = ports.screenEntries().find(([id]) => sameMessage(id, reading.uuid))?.[1]
    ports.log(`[bm] reading position: already on screen, stayed put` +
      (seen ? ` (reported lines ${seen.first}-${seen.last} of ${seen.of}, ${Date.now() - seen.at} ms ago)` : ''))
    return
  }
  // Otherwise: note where we are, then go there.
  await goToReading(ports, reading, 'reading position')
}

// Returns the scroll's refusal, if any ('unset' when there is no such mark).
export async function jumpToMark(ports: MarksPorts, letter: string, probe = false): Promise<string | undefined> {
  const mark = (await ports.loadMarks())[letter]
  if (!mark) {
    ports.toast(`mark ${letter} is not set`)
    return 'unset'
  }
  const deny = await ports.jumpTo(mark.uuid, 'chord jump', `mark ${letter}`, undefined, probe)
  if (!deny) await showMark(ports, letter, mark.snippet ?? mark.head)
  return deny
}
