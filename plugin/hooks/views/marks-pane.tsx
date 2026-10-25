// The jump and mark panes, drawn (moved out of register.tsx's Pane render hook under
// /move-code, 0.4.69, comments as they were). register.tsx reads the marks and hands them
// in with the letters, the actions and the palette's lookups.
import type { EngineInterface } from 'claude-code'
import type { Mark } from '../core/marks/marks.ts'
import { fitLines } from '../core/bookmarks/transcript-lines.ts'
import type { PaneStyles } from './prompts-pane.tsx'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

export type MarksPaneModel = {
  mode: 'jump' | 'mark'
  marks: Readonly<Record<string, Mark | undefined>>
  letters: readonly string[]
  readingLetter: string
  /** The pane body's width in columns (the engine's `bodyColumns`); a jump row is cut to it. */
  columns: number
  /** How many lines a jump row may take (the `rowLines` setting, U70). */
  lines: number
}

export type MarksPaneActions = {
  /** A letter pressed: set it (mark) or go to it (jump), then settle and restore the view. */
  press: (letter: string) => Promise<unknown>
  goToReading: (reading: Mark) => Promise<unknown>
}

export function marksPaneView(elements: Elements, m: MarksPaneModel, a: MarksPaneActions, s: PaneStyles) {
  const { Box, Button, Text } = elements
  const style = s.text
  const buttonStyle = s.button
  const { mode, marks } = m
  const LETTERS = m.letters

  // mark / jump: the vim leg. One letter completes it.
  const used = LETTERS.filter(l => marks[l])
  const press = (l: string) => a.press(l)

  // Jump needs only the letters in use: one per line, `a: <text>`, so the pane can
  // stay narrow (djdarcy, 2026-10-04, "collapsed any smaller").
  if (mode === 'jump') {
    // The reading position (Ctrl+X Space) heads the list (djdarcy, 2026-10-04). A hotkey
    // must be a letter or digit, so it can't be pressed by ` or Space; instead the
    // pane's focus starts on it, and Ctrl+X ' then Enter goes there.
    const reading = marks[m.readingLetter]
    // A row carries as much of the head as the pane is wide (U64; djdarcy, 2026-10-15), cut
    // by the plugin to `columns` less the row's prefix (`a: ` for a hotkey row), since live a
    // long Button label wraps. Before 0.6.9 the rows were cut to 40 and 32 characters on top
    // of the head's own 60. A row may take `lines` lines (U70); a continuation line is indented
    // under the text: past the row's own label here, past the engine's `a: ` on a hotkey row.
    const readingText = reading ? fitLines(`␣ reading: ${reading.head}`, m.columns - 1, m.lines, '␣ reading: '.length) : ''
    return (
      <Box flexDirection="column">
        {used.length === 0 && !reading && <Text {...style('legend')}>No marks yet. Esc</Text>}
        {reading && <Button key="jump-reading" label={readingText} plain autoFocus onPress={() => a.goToReading(reading)} />}
        {used.map(l => (
          <Button key={`jump-${l}`} hotkey={l} label={fitLines(marks[l]?.head ?? '', m.columns - 1 - 3, m.lines, 3)} plain onPress={() => press(l)} />
        ))}
      </Box>
    )
  }

  // Mark: any letter. Letters in use are drawn at full strength and listed below with
  // their text, letter in bold (a Button has no bold), like vim's :marks; free
  // letters are dim.
  return (
    <Box flexDirection="column">
      <Text {...style('legend')}>Mark as: (Esc)</Text>
      <Box flexDirection="row" columnGap={1} flexWrap="wrap">
        {LETTERS.map(l => (
          // A Button takes no color (djdarcy asked for "slightly grayreddish"), and a
          // non-plain `primary` one draws as a wider `[ a ]` that breaks the grid
          // (screenshot, 2026-10-04). So a letter in use shows a dot, `a: ●`, at
          // full strength; a free one shows itself, dim. Same width either way.
          <Button key={`mark-${l}`} hotkey={l} label={marks[l] ? '●' : l} plain {...(marks[l] ? {} : buttonStyle('unused'))} onPress={() => press(l)} />
        ))}
      </Box>
      {used.length === 0 && <Text {...style('legend')}>No marks in this session yet.</Text>}
      {used.map(l => (
        <Text wrap="truncate-end">
          <Text {...style('emphasis')} {...style('used')}>{l}</Text> ▸ {marks[l]?.head}
        </Text>
      ))}
    </Box>
  )
}
