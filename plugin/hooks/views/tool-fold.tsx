// The plugin's tools' rows, folded (0.7.5; every tool of its own since 0.7.9): what a `ToolUse` row of the plugin's own tool draws
// for its place in the fold (core/bookmarks/tool-fold.ts). register.tsx's render hook reads the
// state, passes a row through under ctrl+o, and hands in Claude Code's own drawing of the row
// (`row`) only when this needs it.
import type { EngineInterface, RenderChildren } from 'claude-code'
import { foldLine, type FoldPlace } from '../core/bookmarks/tool-fold.ts'
import type { PaneStyles } from './prompts-pane.tsx'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

export type ToolFoldModel = {
  id: string
  place: FoldPlace
  turnOpen: boolean
  callOpen: boolean
  /** The call's compact line (core/bookmarks/tool-fold.ts callLine). */
  line: string
  /** How many calls of each of the plugin's tools the call's turn made (ToolFold.toolsIn). */
  tools?: Readonly<Record<string, number>>
}

export type ToolFoldActions = {
  toggleTurn: (turn: number) => Promise<unknown>
  toggleCall: (id: string) => Promise<unknown>
}

/** Whether the view will draw Claude Code's own row, so the hook asks for it only then. */
export const needsRow = (m: Pick<ToolFoldModel, 'place' | 'turnOpen' | 'callOpen'>): boolean =>
  m.callOpen && (m.place.turn === undefined || m.turnOpen)

export function toolFoldView(elements: Elements, m: ToolFoldModel, a: ToolFoldActions, row: RenderChildren | undefined, s: PaneStyles) {
  const { Box, Button } = elements
  const callLine = (
    <Button key={`bmfold-call-${m.id}`} label={`  ${m.line} ${m.callOpen ? '▾' : '▸'}`} plain {...s.button('legend')} onPress={() => a.toggleCall(m.id)} />
  )
  const callAndRow = (
    <Box flexDirection="column">
      {callLine}
      {m.callOpen && row}
    </Box>
  )
  // A call from before this load: no turn to fold into; its own line, opened alone.
  if (m.place.turn === undefined) return callAndRow
  const turn = m.place.turn
  const turnLine = (
    <Button key={`bmfold-turn-${turn}`} label={foldLine(m.place.count, m.turnOpen, m.tools)} plain {...s.button('legend')} onPress={() => a.toggleTurn(turn)} />
  )
  if (!m.turnOpen) return m.place.first ? turnLine : <Box />
  return (
    <Box flexDirection="column">
      {m.place.first && turnLine}
      {callAndRow}
    </Box>
  )
}
