// The prompts pane, drawn (moved out of register.tsx's Pane render hook under /move-code,
// 0.4.69, comments as they were). register.tsx reads what the list needs -- the prompts,
// their footnotes, the pins, the texts the filter searches, the band's number, the prompt
// nearest the view -- and hands it in with the actions (closures over `$`) and the
// palette's two lookups; the numbering, filtering and rows are worked out here. Local
// names follow the hook's, so the JSX reads as it did there.
import type { EngineInterface } from 'claude-code'
import { filterPrompts, matchLegend } from '../core/prompts/filter.ts'
import { promptNumberComplete } from '../core/band/band-entry.ts'
import { fieldRest, route } from '../core/band/keys.ts'
import {
  footnoteDisplay, footnotesByPrompt, foldedLabel, numberLabel as numberLabelAt, numberNewestFirst, numberWidth,
  pinnedRowsOf, pointerFor, unreached, type FootnoteMode,
} from '../core/prompts/list-model.ts'
import type { FootnoteRef } from '../core/prompts/prompt-rows.ts'
import type { PromptRef } from '../core/prompts/prompt-store.ts'
import { fitLines, lineOf } from '../core/bookmarks/transcript-lines.ts'
import type { Role, Style } from '../core/palette.ts'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

export type PromptsPaneModel = {
  all: readonly PromptRef[]
  kept: readonly FootnoteRef[]
  footnoteMode: FootnoteMode
  /** The prompts whose footnotes the person unfolded, by number. */
  unfolded: ReadonlySet<number>
  /** The first four groups of the ids the render hooks have drawn since load (core/kit/drawn-messages.ts, kept as ids arrive). */
  drawnFour: ReadonlySet<string>
  pinIds: readonly string[]
  /** Each prompt's whole text, for the filter. */
  texts: ReadonlyMap<string, string>
  paneFilter: string
  /** The band's number while the band is in its list mode, else undefined. */
  fromBand: string | undefined
  /** The prompt nearest the view. */
  here: string | undefined
  /** The pane body's width in columns (the engine's `bodyColumns`); a row is cut to it. */
  columns: number
  /** How many lines a row may take (the `rowLines` setting, U70). */
  lines: number
}

// Each action returns its promise (see views/band.tsx); setFilter answers at once whether
// the typed text changed the filter, since it compares with the live value.
export type PromptsPaneActions = {
  unfold: (n: number) => Promise<unknown>
  refold: (n: number) => Promise<unknown>
  footnote: (uuid: string, label: string) => Promise<unknown>
  pressPrompt: (r: { uuid: string; n: number; head: string }) => Promise<unknown>
  go: (typed: string) => Promise<unknown>
  close: () => Promise<unknown>
  setFilter: (query: string) => boolean
}

export type PaneStyles = { text: (role: Role) => Style; button: (role: Role) => { dimColor?: boolean } }

export function promptsPaneView(elements: Elements, m: PromptsPaneModel, a: PromptsPaneActions, s: PaneStyles) {
  const { Box, Button, Text } = elements
  // Every surface draws an Input except the mobile app (no fields yet).
  const Input = 'Input' in elements ? elements.Input : undefined
  const style = s.text
  const buttonStyle = s.button
  const { all, kept, footnoteMode, pinIds, texts, paneFilter, fromBand, here } = m
  const unfoldedFootnotes = m.unfolded

  // Every prompt the mod knows, numbered in the order sent (#1 the first), listed
  // newest first (djdarcy, 2026-10-04). The number is typed into a focused Input
  // (djdarcy: "Ctrl-X p 21 <enter>"): it jumps on Enter, or at once when the digits
  // typed can't become a larger prompt number (with 25 prompts, `3` jumps, `2`
  // waits for 2x or Enter). A hotkey is one character, so it can't do this.
  const numbered = numberNewestFirst(all)
  // The list's model (numbering, footnotes under their prompt, the pinned group, the
  // pointer, the dim rule): core/prompts/list-model.ts. The rows are drawn here.
  const byPrompt = footnotesByPrompt(all.map(p => p.uuid), kept)
  const footnoteRows = (n: number) => {
    const list = byPrompt.get(n)
    const display = footnoteDisplay(footnoteMode, !!list, unfoldedFootnotes.has(n))
    if (!list || display === 'none') return []
    if (display === 'folded') {
      return [
        <Button key={`fn-fold-${n}`} label={foldedLabel(list.length)} plain {...buttonStyle('footnote')}
          onPress={() => a.unfold(n)} />,
      ]
    }
    const rows = list.map(({ f, k }) => (
      <Button key={`fn-${f.uuid}`} label={`   ${n}.${k} ${f.label}`} plain {...buttonStyle('footnote')}
        onPress={() => a.footnote(f.uuid, `footnote ${n}.${k}`)} />
    ))
    // Folded by default and opened by hand: a row to fold them again (djdarcy,
    // 2026-10-12: "a way to "recollapse" our "footnotes" ... after we open them").
    if (display === 'open') return rows
    return [
      ...rows,
      <Button key={`fn-refold-${n}`} label="      ▴ fold" plain {...buttonStyle('footnote')}
        onPress={() => a.refold(n)} />,
    ]
  }
  const width = numberWidth(all.length)
  const numberLabel = (n: number) => numberLabelAt(n, width)
  const go = (typed: string) => a.go(typed)
  const drawnFour = m.drawnFour
  const byUuid = new Map(numbered.map(r => [r.uuid, r]))
  // The filter (#28): only the prompts matching `/words` in the field; numbers kept.
  const filtered = filterPrompts(numbered, paneFilter, r => texts.get(r.uuid) ?? r.head)
  const listed = new Set(filtered.shown.map(r => r.uuid))
  const matchLine = matchLegend(filtered.shown.length, filtered.of, paneFilter)
  const pinnedRows = pinnedRowsOf(pinIds, byUuid, listed)
  const pinSet = new Set(pinIds)
  type NumberedPrompt = (typeof numbered)[number]
  const targetN = fromBand ? Number(fromBand) : undefined
  const pointer = pointerFor(fromBand, targetN)
  // A row's text is the prompt's whole text on one line when it is kept (the filter's
  // text), else its 60-character head, cut to the pane's width less the number column,
  // so a widened pane fills with more of the prompt and a narrow one never wraps (U64;
  // djdarcy, 2026-10-15). The cut is the plugin's, by `columns`: live, a long Button label
  // wraps, and a Text's truncate-end inside a Button is not honoured (2026-10-22).
  // A row may take `lines` lines (the rowLines setting, U70): the label carries hard lines, each
  // cut to the width, so the terminal's word wrap never adds one. A plain row indents its
  // continuation lines by the prefix's width so they sit under the text; a Box row's Button
  // already sits beside its prefix, so its continuation lines need none.
  const rowText = (r: NumberedPrompt, prefixWidth: number, indent: number) =>
    fitLines(lineOf(texts.get(r.uuid) ?? r.head), m.columns - 1 - prefixWidth, m.lines, indent)
  const promptRow = (r: NumberedPrompt, group: string) => {
    const isHere = r.uuid === here
    const dim = unreached(drawnFour, r.uuid) && !isHere
    const press = () => a.pressPrompt(r)
    if (!pinSet.has(r.uuid) && !isHere) {
      const prefix = `${pointer(r.n)}${numberLabel(r.n)}`
      return <Button key={`${group}-${r.uuid}`} label={`${prefix}${rowText(r, prefix.length, prefix.length)}`} plain {...(dim && r.n !== targetN ? buttonStyle('unreached') : {})} onPress={press} />
    }
    // `245★) `: a gold star inside the number, so it reads as the row's marker, not
    // part of the prompt (djdarcy, 2026-10-05, over a background band and a star
    // before the number). A Button's label takes no colour at rest (2.1.289), so the
    // number and star are Text beside the Button; flexShrink 0 keeps them from being
    // squeezed to nothing next to a long label that wraps (seen in the look test).
    // The nearest-to-view row uses the same shape with its number in yellow.
    return (
      <Box key={`${group}-row-${r.uuid}`} flexDirection="row">
        <Box flexShrink={0}>
          <Text {...(dim ? style('unreached') : {})} {...(isHere ? style('here') : {})}>{`${pointer(r.n)}${String(r.n).padStart(width)}`}</Text>
          {pinSet.has(r.uuid) && <Text {...style('pinned')}>★</Text>}
          <Text {...(dim ? style('unreached') : {})} {...(isHere ? style('here') : {})}>{') '}</Text>
        </Box>
        <Button key={`${group}-${r.uuid}`} label={rowText(r, pointer(r.n).length + width + (pinSet.has(r.uuid) ? 1 : 0) + 2, 0)} plain {...(dim ? buttonStyle('unreached') : {})} onPress={press} />
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      {numbered.length === 0 && <Text {...style('legend')}>No prompts yet.</Text>}
      {numbered.length > 0 && Input && (
        <Input
          key="prompt-number"
          label="#"
          placeholder={`1-${all.length}, or /words to filter`}
          submitLabel="jump"
          {...(fromBand !== undefined ? { value: fromBand } : {})}
          autoFocus
          onInput={(typed: string) => {
            // One key is read through the key table (core/band/keys.ts): `q` closes the pane,
            // as in the band (Q261012-09), whatever key a keymap gives it.
            if (typed.length === 1 && route(typed, { pane: 'list' }).operation.op === 'close') return void a.close()
            // `/words` filters the list (#28), `/` being the field's filter key in the table;
            // anything else clears the filter.
            const query = fieldRest(typed, 'list', 'filter') ?? ''
            if (a.setFilter(query)) return
            if (promptNumberComplete(typed, all.length)) void go(typed)
          }}
          onSubmit={(typed: string) => void go(typed)}
        />
      )}
      {/* One by one through this list (djdarcy, 2026-10-04): the pane keeps the arrows
          for scrolling, but Tab walks the focus ring down the Buttons below from the
          newest, Shift+Tab back up, Enter jumps. A Select was tried: on the terminal
          its arrows open a pop-up list of its own instead (screenshot, 2026-10-04). */}
      {numbered.length > 0 && <Text {...style('legend')}>or Tab / Shift+Tab, Enter; *N pins</Text>}
      {here && (
        <Text {...style('legend')}>
          <Text {...style('here')}>#N</Text> = nearest to your view
        </Text>
      )}
      {matchLine && <Text {...style('legend')}>{`/${paneFilter}: ${matchLine}`}</Text>}
      {pinnedRows.length > 0 && <Text {...style('legend')}>★ pinned</Text>}
      {pinnedRows.map(r => promptRow(r, 'pin'))}
      {pinnedRows.length > 0 && <Text {...style('legend')}>all prompts</Text>}
      {numbered.filter(r => listed.has(r.uuid)).flatMap(r => [promptRow(r, 'p'), ...footnoteRows(r.n)])}
      {footnoteRows(0)}
    </Box>
  )
}
