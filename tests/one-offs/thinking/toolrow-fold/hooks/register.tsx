// Proof-of-concept for claude-bookmarks 0.7.5 (the bookmark-call fold): can a plugin's render
// hooks on ToolUse and ToolResult draw its own tool's rows as NOTHING, or as one pressable line
// that opens them, and pass them through under ctrl+o (isExpanded)?
//
// It registers one harmless tool, `pocecho` (it echoes its text and counts calls), and touches
// only that tool's rows; every other row passes through. `/tfpoc <mode>` picks the arm:
//   pass     Claude Code's own rows (the baseline)
//   hide     an empty Box for each pocecho row and its result
//   fold     the first pocecho row of the session draws `⚓ N pocecho calls ▸`; pressing it opens
//            them all as normal; the other rows and the results draw nothing while closed
//   control  hides rows of a tool named `nosuchtool` (never called): pocecho's rows must STAY
// Every pocecho ToolUse render logs its props once (tool name, isExpanded, ids), so the names
// and the ctrl+o flag are read from the log, not guessed.
// Throwaway: tests/one-offs/thinking/toolrow-fold; never part of the shipped plugin.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const mode = atom({ plugin: 'bmtoolfoldpoc', key: 'mode' } as const, 'pass')
const open = atom({ plugin: 'bmtoolfoldpoc', key: 'open' } as const, false)

const isPoc = (tool: unknown) => typeof tool === 'string' && /pocecho$/.test(tool)
let calls = 0
const seen: string[] = []
const logged = new Set<string>()

export const register: Register = on => {
  on('session.start', async $ => {
    await $.tool.register({
      name: 'pocecho',
      description: 'POC tool: echoes `text` back. Used only to test how its rows are drawn.',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    })
    await $.command.register({ name: 'tfpoc', description: 'Tool-row fold POC: /tfpoc pass | hide | fold | control', immediate: true })
  })

  on('tool.call', { tool: /pocecho$/ }, async (_$, e) => {
    calls += 1
    const text = String((e as unknown as { text?: unknown }).text ?? '')
    return { result: JSON.stringify({ ok: true, n: calls, echo: text, padding: 'x'.repeat(200) }, null, 2) }
  })

  on('command.run', { command: 'tfpoc' }, async ($, e) => {
    const m = e.args.trim() || 'pass'
    await update($, mode, () => m)
    await update($, open, () => false)
    $.ui.log(`tfpoc: mode=${m}; pocecho rows seen so far: ${seen.length}`)
    return {}
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { Box, Button } = $.ui.resolve(e)
    const m = await read($, mode)
    const tool = e.props.tool
    if (m === 'control') {
      // Designed to fail: hides only a tool nobody calls. pocecho's rows must stay drawn.
      if (tool === 'nosuchtool') return <Box />
      return next(e)
    }
    if (!isPoc(tool)) return next(e)
    // Once per call and per expanded state, so the ctrl+o draw logs its own line.
    const logKey = `${e.props.tool_use_id}|${String(e.props.isExpanded)}`
    if (!logged.has(logKey)) {
      logged.add(logKey)
      if (!seen.includes(e.props.tool_use_id)) seen.push(e.props.tool_use_id)
      $.ui.log(`tfpoc ToolUse: tool=${String(tool)} id=${e.props.tool_use_id} requestId=${e.requestId} isExpanded=${String(e.props.isExpanded)} running=${e.props.isRunning}`)
    }
    if (m === 'pass' || e.props.isExpanded) return next(e)
    if (m === 'hide') return <Box />
    // fold
    const isOpen = await read($, open)
    const first = seen[0] === e.props.tool_use_id
    if (isOpen) {
      if (!first) return next(e)
      return (
        <Box flexDirection="column">
          <Button key="tfpoc-fold" label={`⚓ ${seen.length} pocecho calls ▾`} plain onPress={() => update($, open, () => false)} />
          {await next(e)}
        </Box>
      )
    }
    if (!first) return <Box />
    return <Button key="tfpoc-fold" label={`⚓ ${seen.length} pocecho calls ▸`} plain onPress={() => update($, open, () => true)} />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { Box } = $.ui.resolve(e)
    const m = await read($, mode)
    if (m === 'control' || m === 'pass' || !isPoc(e.props.tool)) return next(e)
    if (m === 'hide') return <Box />
    // fold: the results show only while open
    return (await read($, open)) ? next(e) : <Box />
  })
}
