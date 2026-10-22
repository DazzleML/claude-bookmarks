// The jump and mark panes, drawn (moved out of register.tsx's Pane render hook under
// /move-code, 0.4.69, comments as they were). register.tsx reads the marks and hands them
// in with the letters, the actions and the palette's lookups.
import type { EngineInterface } from 'claude-code'
import type { Mark } from '../core/marks/marks.ts'
import type { PaneStyles } from './prompts-pane.tsx'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

export type MarksPaneModel = {
  mode: 'jump' | 'mark'
  marks: Readonly<Record<string, Mark | undefined>>
  letters: readonly string[]
  readingLetter: string
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
    // A row carries the whole head and truncates at the pane's edge (a Text child of the
    // Button draws it; the label names the control), so a widened pane shows more of the
    // line and a narrow one still cuts cleanly (U64; djdarcy, 2026-10-15). Before 0.6.9 the
    // rows were cut to 40 and 32 characters on top of the head's own 60.
    const readingText = reading ? `␣ reading: ${reading.head}` : ''
    return (
      <Box flexDirection="column">
        {used.length === 0 && !reading && <Text {...style('legend')}>No marks yet. Esc</Text>}
        {reading && (
          <Button key="jump-reading" label={readingText} plain autoFocus onPress={() => a.goToReading(reading)}>
            <Text wrap="truncate-end">{readingText}</Text>
          </Button>
        )}
        {used.map(l => (
          <Button key={`jump-${l}`} hotkey={l} label={marks[l]?.head ?? ''} plain onPress={() => press(l)}>
            <Text wrap="truncate-end">{marks[l]?.head ?? ''}</Text>
          </Button>
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
