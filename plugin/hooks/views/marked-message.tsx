// The marked line and the column it sits in, drawn on a prompt or a reply (the first view
// out of register.tsx: Q261012-11 answered "hybrid", 2026-10-12 ~20:20; the 15-06-26 poc's
// spike (b): JSX in a sub-file taking the resolved elements passes the validator). Moved
// verbatim under /move-code; the palette styles are passed in, since the palette is
// register.tsx's. Location provisional (Q261012-11, question 3).
import type { ElementConstructor, EngineInterface, RenderChildren, TextProps } from 'claude-code'
import type { ColorSplit } from '../core/marks/highlight.ts'
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

// A reply with its marked line drawn by the plugin: the part before it still goes to the
// engine (keeps the reply's bullet and formatting); the part after is drawn with the
// Markdown element. With no engine part:
// The marked line is the message's first. Handing the rest to the engine put the
// blank row it draws at the top of a message BELOW our line, so the line ran into
// the message above (2026-10-04). So: that blank row first, then the line, then
// the rest drawn here, as the branch above draws its part after the line. The
// message's bullet is not drawn while its first line is highlighted.
export function markedReply(elements: Pick<Elements, 'Box' | 'Text' | 'Markdown'>, c: ColorSplit, engine: RenderChildren | null, styles: MarkStyles) {
  const { Box, Text, Markdown } = elements
  const line = markedLine(Text, c, styles)
  if (engine) {
    return (
      <Box flexDirection="column">
        {engine}
        {c.gapAbove && <Text> </Text>}
        {line}
        {c.gapBelow && <Text> </Text>}
        {c.after && <Markdown text={c.after} />}
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      <Text> </Text>
      {line}
      {c.gapBelow && <Text> </Text>}
      {c.after && <Markdown text={c.after} />}
    </Box>
  )
}

/** What an anchored reply draws besides its text: the link legend's two markers, and whether a file link is present. */
export type AnchoredLegend = { glyph: boolean; hasFile: boolean } | null

export type AnchoredReplyModel = {
  /** The reply's requestId, for the Markdown keys. */
  keyBase: string
  /** The text with kind markers on the drawn labels (the hrefs as written, so `pressable` matches them). */
  markText: (text: string) => string
  pressable: readonly string[]
  /** The marked line, when one of this reply's marks sits on one line. */
  colored: ColorSplit | undefined
  /** Otherwise the text with the bold «a» form already applied. */
  boldText: string
  legend: AnchoredLegend
}

// Bookmark links (anchors DWP, 2026-10-09): a reply carrying bookmark-anchor links is
// drawn as the mod's own Markdown, so a plain click on such a link reaches the mod
// (onLinkPress) and tries the jump; the log says what the engine answered. A ctrl-click
// stays the terminal's own open.
// Kind markers go on the drawn labels only (the transcript is untouched); the hrefs
// stay as written so `pressableLinks` matches them. A one-line legend teaches the
// two clicks (a setting later, #7). A mark on this reply keeps its highlight: the
// bold «a» form, since this branch draws markdown and can't colour a line.
export function anchoredReply(elements: Pick<Elements, 'Box' | 'Text' | 'Markdown'>, m: AnchoredReplyModel, onLinkPress: (href: string) => unknown, styles: MarkStyles & { legend: Style }) {
  const { Box, Markdown, Text } = elements
  const md = (t: string, k: string) => (
    <Markdown key={k} text={m.markText(t)} pressableLinks={m.pressable} onLinkPress={link => onLinkPress(link.href)} />
  )
  const legend = m.legend ? (
    <Text {...styles.legend}>
      {m.legend.glyph ? '⚓' : '[bm]'} click: jump there · ctrl-click: open the bookmark's file
      {m.legend.hasFile ? `  ${m.legend.glyph ? '▤' : '[file]'} ctrl-click: open the file` : ''}
    </Text>
  ) : null
  // A mark on this reply gets the same coloured line as any other message: the text
  // before and after the marked line are drawn as markdown (links clickable), the
  // line itself as coloured Text. If the marked line carries a link, that link is
  // plain text for as long as the highlight shows.
  if (m.colored) {
    const { before, after, gapAbove, gapBelow } = m.colored
    return (
      <Box flexDirection="column">
        {before && md(before, `anchors-${m.keyBase}-a`)}
        {gapAbove && <Text> </Text>}
        {markedLine(Text, m.colored, styles)}
        {gapBelow && <Text> </Text>}
        {after && md(after, `anchors-${m.keyBase}-b`)}
        {legend}
      </Box>
    )
  }
  // A mark whose words don't sit on one line: the bold «a» form.
  return (
    <Box flexDirection="column">
      {md(m.boldText, `anchors-${m.keyBase}`)}
      {legend}
    </Box>
  )
}
