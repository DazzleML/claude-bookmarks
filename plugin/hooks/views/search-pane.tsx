// The search pane, drawn (the search-pane-and-links design, 2026-10-26, unit U-S). register.tsx
// reads what it needs -- the search's view (handlers/search.ts), the band's number, the setting
// for the toggle row -- and hands it in with the actions; the rows are drawn here, in the
// prompts pane's shape (views/prompts-pane.tsx): a field, a legend, then the numbered rows.
//
// The field's whole text is the query, narrowed per keystroke; `#N` then Enter lands on result
// N and `*N` then Enter pins it (core/search/results.ts searchField). Enter with a query lands on
// the result under the ▶, or the newest.
import type { EngineInterface } from 'claude-code'
import { pinPlaceKey } from '../core/bookmarks/pins.ts'
import { fitLines, lineOf } from '../core/bookmarks/transcript-lines.ts'
import { numberWidth, pointerFor } from '../core/prompts/list-model.ts'
import { scopeLabel, type Preset } from '../core/search/query.ts'
import { labelImplied, searchField, shortLabel, TOGGLE_LABELS, TOGGLES, type SearchRow } from '../core/search/results.ts'
import type { PaneStyles } from './prompts-pane.tsx'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

/** In the stacked layout, a kind longer than this many characters (with its colon) takes a line of its own; a shorter one stays beside its text. */
export const STACK_AFTER = 12

export type SearchPaneModel = {
  query: string
  toggles: readonly Preset[]
  results: readonly SearchRow[]
  legend: string
  /** The place keys pinned in the search list (pins.ts pinPlaceKey). */
  pinned: ReadonlySet<string>
  /** The band's number while the band is in its search mode, else undefined. */
  fromBand: string | undefined
  /** The number typed after `#` or `*` in the pane's own field, not yet entered ('' for none). */
  pointing: string
  /** The row the person last went to from this list (its `i`): drawn in yellow. */
  current: number | undefined
  /** Draw the toggle row (the `searchToggles` setting). */
  togglesShown: boolean
  /** Short kinds on the result rows: how many letters each kind word keeps (the `searchLabels` setting is `short`, `searchShortLength` letters), or 0 for the words. The toggles always keep their words. */
  shortLetters: number
  /**
   * The `searchLayout` setting: `stacked` gives a row's number and kind a line of their own and
   * its text the lines below, indented a little, so a long kind (`mid-engineer · SubagentHandback`)
   * takes no room from the text; `inline` puts the text beside the kind. One line per row
   * (`lines` 1) is always inline.
   */
  layout: 'stacked' | 'inline'
  /** The `searchImplied` setting: `implied` leaves out a label that only repeats the one toggle on; `always` keeps every label. */
  implied: 'implied' | 'always'
  /** The pane body's width in columns; a row is cut to it. */
  columns: number
  /** How many lines a row may take (the rowLines setting). */
  lines: number
}

export type SearchPaneActions = {
  search: (query: string) => unknown
  /** The number typed after `#` or `*` so far ('' when the text is a query). */
  point: (typed: string) => unknown
  toggle: (preset: Preset) => unknown
  press: (row: SearchRow) => Promise<unknown>
  go: (typed: string) => Promise<unknown>
  pin: (typed: string) => Promise<unknown>
  close: () => Promise<unknown>
}

export function searchPaneView(elements: Elements, m: SearchPaneModel, a: SearchPaneActions, s: PaneStyles) {
  const { Box, Button, Text } = elements
  const Input = 'Input' in elements ? elements.Input : undefined
  const style = s.text
  const width = numberWidth(m.results.length)
  // The ▶: the band's number while the band holds the keyboard, else the number typed in this field.
  const pointed = m.fromBand || m.pointing || undefined
  const targetN = pointed ? Number(pointed) : undefined
  const pointer = pointerFor(pointed, targetN)
  // Each returns its promise, so a refusal surfaces at the keystroke that asked (views/band.tsx).
  const submit = (typed: string) => {
    const step = searchField(typed)
    if (step.op === 'pin') return a.pin(step.typed)
    if (step.op === 'number') return a.go(step.typed)
    return a.go(m.fromBand || m.pointing)
  }
  const resultRow = (r: SearchRow) => {
    // `12★) Bash: ` -- the star inside the number, gold, as the prompts pane draws a pin.
    const pinned = m.pinned.has(pinPlaceKey(r.place))
    // The result last gone to: its number and kind in yellow, as the prompts list draws the
    // prompt nearest the view (djdarcy, 2026-10-26).
    const here = r.i === m.current
    const number = `${pointer(r.n)}${String(r.n).padStart(width)}`
    const label = labelImplied(r, m.toggles, m.implied) ? '' : `${m.shortLetters > 0 ? shortLabel(r.label, m.shortLetters) : r.label}: `
    const prefixWidth = number.length + (pinned ? 1 : 0) + 2 + label.length
    // Stacked (djdarcy, 2026-10-26: "we instead give the "identifier" its whole entire own line.
    // And then the second line is just tabbed in slightly"): the number and kind, then the text
    // two columns in from where the kind starts, over the rest of the row's lines.
    // Only a long kind stacks (djdarcy: "the "stacked" or alternative view is only for "tabs" that
    // have VERY long lines. Our "claude", "you", and other more compact views can probably continue
    // to use the old viewport"): `you`, `claude`, `Bash`, `thinking` stay beside their text.
    if (m.layout === 'stacked' && m.lines > 1 && label.trimEnd().length > STACK_AFTER) {
      const indent = number.length + (pinned ? 1 : 0) + 2 + 2
      return (
        <Box key={`s-row-${r.i}`} flexDirection="column">
          <Box flexDirection="row">
            <Text {...(here ? style('here') : {})}>{number}</Text>
            {pinned && <Text {...style('pinned')}>★</Text>}
            <Text {...(here ? style('here') : {})}>{') '}</Text>
            <Text {...(here ? style('here') : style('legend'))} wrap="truncate-end">{label.trimEnd()}</Text>
          </Box>
          <Box flexDirection="row">
            <Box flexShrink={0}><Text>{' '.repeat(indent)}</Text></Box>
            <Button key={`s-${r.i}`} label={fitLines(lineOf(r.head), m.columns - 1 - indent, m.lines - 1, 0)} plain onPress={() => a.press(r)} />
          </Box>
        </Box>
      )
    }
    return (
      <Box key={`s-row-${r.i}`} flexDirection="row">
        <Box flexShrink={0}>
          <Text {...(here ? style('here') : {})}>{number}</Text>
          {pinned && <Text {...style('pinned')}>★</Text>}
          <Text {...(here ? style('here') : {})}>{') '}</Text>
          <Text {...(here ? style('here') : style('legend'))}>{label}</Text>
        </Box>
        <Button key={`s-${r.i}`} label={fitLines(lineOf(r.head), m.columns - 1 - prefixWidth, m.lines, 0)} plain onPress={() => a.press(r)} />
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      {Input && (
        <Input
          key="search-query"
          label="/"
          placeholder='words, "a phrase", m/pattern/, in:tools; #N Enter goes, *N Enter pins'
          submitLabel="go"
          autoFocus
          onInput={(typed: string) => {
            const step = searchField(typed)
            if (step.op === 'query') {
              a.point('')
              a.search(step.text)
            } else a.point(step.typed)
          }}
          onSubmit={(typed: string) => submit(typed)}

        />
      )}
      {m.togglesShown && (
        <Box flexDirection="row" columnGap={1} flexWrap="wrap">
          {TOGGLES.map(p => (
            <Button key={`s-toggle-${p}`} label={`${m.toggles.includes(p) ? '●' : '·'}${TOGGLE_LABELS[p]}`} plain
              {...(m.toggles.includes(p) ? {} : s.button('unused'))} onPress={() => a.toggle(p)} />
          ))}
        </Box>
      )}
      <Text {...style('legend')} wrap="truncate-end">{`${scopeLabel({ include: [], exclude: [] }, m.toggles)}: ${m.legend}`}</Text>
      {m.current !== undefined && m.results.some(r => r.i === m.current) && (
        <Text {...style('legend')}>
          <Text {...style('here')}>#N</Text> = the result you last went to
        </Text>
      )}
      {m.results.map(resultRow)}
    </Box>
  )
}
