// Settings spike for claude-bookmarks (goal slice 1, 2026-10-11). A throwaway probe in a
// scratch plugin named bookmarks-spike, so it cannot disturb the live plugin or its store.
//
// It answers: does /config list this plugin's userConfig fields and draw the picker for
// a declared `options` list; do the values reach register(on, options); does a change in
// /config reload the module (LOADED_AT changes when it does); can $.config.set run from a
// typed command and from a pane button, and does that reload too.
//
//   /bm-spike            log the module's load time, the options it was given, and the
//                        plugin's /config rows
//   /bm-spike set followHere always    set a field from a typed command
//   /bm-spike pane       open a pane with two buttons that set fields
import type { Register } from 'claude-code'

const LOADED_AT = new Date().toISOString()
const PANE = 'bm-spike'
const PREFIX = 'bookmarks-spike.'

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'bm-spike', description: 'Settings spike: show options and config rows (set <field> <value> | pane)', immediate: true })
    $.ui.log(`[spike] module loaded ${LOADED_AT}; options = ${JSON.stringify(options ?? null)}`)
    return next(e)
  })

  on('command.run', { command: 'bm-spike' }, async ($, e) => {
    const arg = e.args.trim()
    const rows = (await $.config.list()).filter(r => r.key.startsWith(PREFIX))
    $.ui.log(`[spike] loaded ${LOADED_AT}; options = ${JSON.stringify(options ?? null)}; rows = ${JSON.stringify(rows)}`)
    if (arg.startsWith('set ')) {
      const [, field, raw] = arg.split(/\s+/)
      const value = raw === 'true' ? true : raw === 'false' ? false : raw ?? ''
      try {
        const r = await $.config.set({ key: PREFIX + field, value })
        $.ui.log(`[spike] set ${field}=${String(value)} from a command -> ${JSON.stringify(r)}`)
      } catch (err) {
        $.ui.log(`[spike] set ${field} from a command threw: ${String(err)}`)
      }
    }
    if (arg === 'pane') await $.ui.open({ id: PANE, title: 'settings spike', focus: true, closeOnEscape: true, columns: 16, rows: 4 })
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const press = (field: string, value: string | boolean) => async () => {
      try {
        const r = await $.config.set({ key: PREFIX + field, value })
        $.ui.log(`[spike] set ${field}=${String(value)} from a pane button -> ${JSON.stringify(r)}`)
      } catch (err) {
        $.ui.log(`[spike] set ${field} from a pane button threw: ${String(err)}`)
      }
    }
    return (
      <Box flexDirection="column">
        <Text dimColor>module loaded {LOADED_AT}</Text>
        <Text dimColor>options {JSON.stringify(options ?? null)}</Text>
        <Button key="a" label="followHere = always" onPress={press('followHere', 'always')} />
        <Button key="b" label="followHere = never" onPress={press('followHere', 'never')} />
        <Button key="c" label="paneAfterJump = true" onPress={press('paneAfterJump', true)} />
      </Box>
    )
  })
}
