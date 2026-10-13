// The marked line and the column it sits in, drawn on a prompt or a reply (the first view
// out of register.tsx: Q261012-11 answered "hybrid", 2026-10-12 ~20:20; the 15-06-26 poc's
// spike (b): JSX in a sub-file taking the resolved elements passes the validator). Moved
// verbatim under /move-code; the palette styles are passed in, since the palette is
// register.tsx's. Location provisional (Q261012-11, question 3).
import type { ElementConstructor, EngineInterface, RenderChildren, TextProps } from 'claude-code'
import type { ColorSplit } from '../core/highlight.ts'
import type { Style } from '../core/palette.ts'

/** The two roles a marked line draws with: the soft band, and the letter and words. */
export type MarkStyles = { band: Style; mark: Style }

type Elements = ReturnType<EngineInterface['ui']['resolve']>

// The marked line as drawn on a prompt or a reply: the soft band, then the mark's letter
// and words bold in WORDS_FG.
export function markedLine(Text: ElementConstructor<TextProps>, c: ColorSplit, styles: MarkStyles) {
  return (
    <Text {...styles.band}>
      {c.pre}
      <Text {...styles.mark}>
        «{c.letter}» {c.snippet}
      </Text>
      {c.post}
    </Text>
  )
}

/**
 * A message with its marked line drawn by the plugin: what the engine drew for the text
 * before the line (or nothing), the paragraph gap if there was one, the line, the gap
 * below, then the rest as the caller draws it (plain Text on a prompt, Markdown on a
 * reply).
 */
export function markedColumn(elements: Pick<Elements, 'Box' | 'Text'>, c: ColorSplit, engine: RenderChildren, after: RenderChildren, styles: MarkStyles) {
  const { Box, Text } = elements
  return (
    <Box flexDirection="column">
      {engine}
      {c.gapAbove && <Text> </Text>}
      {markedLine(Text, c, styles)}
      {c.gapBelow && <Text> </Text>}
      {after}
    </Box>
  )
}
