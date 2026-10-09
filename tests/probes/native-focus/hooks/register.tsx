// focus-probe: a probe, not the product (djdarcy, 2026-10-07: "let's disable how all
// input works and then I'd like to see what native ctrl-] looks like with a simple
// band, and a simple panel, with nothing fancy").
//
// The band draws four Buttons, mark / jump / prompts / read, with hotkeys m j p r. Each
// opens one pane, `probe`, with a few Buttons that do nothing but toast and close it.
// Nothing redirects focus: the ui.focus, ui.press and ui.close hooks only watch and pass
// every event on unchanged. What convo-bookmarks layers on top can be switched back on
// one piece at a time with /probe-set (all off but openFocus and readout by default):
//
//   bandField   an Input in the band before the Buttons; typing m j p r opens the pane
//   bandButtons the four Buttons (on); off with bandField on leaves the band one stop
//   autoFocus   autoFocus on the band's first element (the field, if drawn)
//   paneField   an autoFocus Input at the top of the pane
//   openFocus   band presses open the pane with `focus: true` (a request Claude Code
//               refuses while the band holds the keys; kept to watch it be refused)
//   readout     the band's second row shows the last focus moves as they happen
//   vanish      after an action the band draws nothing focusable for a few seconds:
//               does the keyboard fall into the pane, or back to the input box?
//
// Every event goes to <CLAUDE_USER_DIR or ~/claude>/bookmarks/debug/focus-probe-<session>.log
// (outside the plugin folder: a write inside it reloads the mod).
//
// Run it alone, without convo-bookmarks: claude --plugin-dir <this folder>

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Flags, Mode } from '../types'

const PANE = 'probe'
const BAND: [Mode, string, string][] = [
  ['mark', 'mark', 'm'],
  ['jump', 'jump', 'j'],
  ['prompts', 'prompts', 'p'],
  ['read', 'read', 'r'],
]
const DEFAULT_FLAGS: Flags = {
  bandField: false,
  bandButtons: true,
  autoFocus: false,
  paneField: false,
  openFocus: true,
  readout: true,
  vanish: false,
}
// How long the band stays empty after an action under `vanish`, unless the pane closes first.
const VANISH_MS = 4000

const mode = atom({ plugin: 'focus-probe', key: 'mode' } as const, 'prompts')
const flags = atom({ plugin: 'focus-probe', key: 'flags' } as const, DEFAULT_FLAGS)
const readout = atom({ plugin: 'focus-probe', key: 'readout' } as const, [])
const fieldRev = atom({ plugin: 'focus-probe', key: 'fieldRev' } as const, 0)
const vanished = atom({ plugin: 'focus-probe', key: 'vanished' } as const, false)

let busy = false
let vanishTimer: Timer | undefined

// The log file, rewritten whole ($.fs has no append), last LOG_LINES lines.
const LOG_LINES = 600
const logLines: string[] = []
let logPath: string | null | undefined
let flushing: Promise<void> = Promise.resolve()

function log($: EngineInterface, line: string) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  if (logLines.length > LOG_LINES) logLines.splice(0, logLines.length - LOG_LINES)
  flushing = flushing.then(() => flushLog($)).catch(() => {})
}

async function flushLog($: EngineInterface) {
  if (logPath === undefined) {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    const root = (await $.env.get('CLAUDE_USER_DIR')) ?? (home ? `${home}/claude` : undefined)
    logPath = root ? `${root}/bookmarks/debug/focus-probe-${await $.session.id()}.log` : null
  }
  if (logPath) await $.fs.write(logPath, logLines.join('\n') + '\n')
}

// One event: to the log with the draft's length and whether a turn runs, and to the
// band's readout row.
async function event($: EngineInterface, what: string) {
  const draft = (await $.prompt.read()).text.length
  log($, `${what}  [draft=${draft}${busy ? ' busy' : ''}]`)
  const stamp = new Date().toISOString().slice(14, 19)
  await update($, readout, list => [...list, `${stamp} ${what}`].slice(-3))
}

// Flag `vanish`: after an action the band draws nothing focusable for VANISH_MS, so the
// element holding the keyboard disappears. Where does Claude Code put the keyboard then:
// into the pane just opened (the hand-off we want), or back to the input box (the
// hand-back after a command)? `read` opens no pane under this flag, to see the second.
async function vanishBand($: EngineInterface, why: string) {
  await update($, vanished, () => true)
  await event($, `band emptied (${why})`)
  vanishTimer?.cancel()
  vanishTimer = $.clock.after(VANISH_MS, () => void restoreBand($, 'timer'))
}

async function restoreBand($: EngineInterface, why: string) {
  vanishTimer?.cancel()
  vanishTimer = undefined
  if (!(await read($, vanished))) return
  await update($, vanished, () => false)
  await event($, `band redrawn (${why})`)
}

async function act($: EngineInterface, m: Mode, via: string) {
  const f = await read($, flags)
  if (f.vanish && m === 'read') {
    $.ui.toast('probe: read (no pane)')
    await vanishBand($, 'read, no pane')
    return
  }
  await openPane($, m, via)
  if (f.vanish) await vanishBand($, `${m} opened`)
}

async function openPane($: EngineInterface, m: Mode, via: string) {
  await update($, mode, () => m)
  const f = await read($, flags)
  const r = await $.ui.open({ id: PANE, title: `probe: ${m}`, closeOnEscape: true, ...(f.openFocus ? { focus: true as const } : {}) })
  const p = (await $.ui.panes()).find(x => x.id === PANE)
  await event($, `open ${m} from ${via} (focus ${f.openFocus ? 'asked' : 'not asked'}) -> placed=${r.isPlaced} paneFocused=${p?.isFocused}`)
  $.clock.after(500, () => {
    void (async () => {
      const q = (await $.ui.panes()).find(x => x.id === PANE)
      log($, `  +500ms: pane ${q ? `open, focused=${q.isFocused}` : 'closed'}`)
    })()
  })
}

async function picked($: EngineInterface, what: string) {
  await event($, `picked ${what}`)
  $.ui.toast(`probe: ${what}`)
  await $.ui.close({ id: PANE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const commands: [string, string][] = [
      ['probe-open', 'Open the probe pane from the input box: mark | jump | prompts | read'],
      ['probe-set', 'Switch a layer on or off: bandField | bandButtons | autoFocus | paneField | openFocus | readout | vanish [on|off]'],
      ['probe-log', 'Show where the focus log is written'],
    ]
    for (const [name, description] of commands) {
      await $.command.register({ name, description, immediate: true })
    }
    const v = await $.session.version()
    log($, `--- focus-probe loaded on Claude Code ${v.version}; flags ${JSON.stringify(await read($, flags))}`)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    busy = true
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    busy = false
    return next(e)
  })

  // Watch only: every focus move in the band or the pane, passed on unchanged.
  on('ui.focus', async ($, e, next) => {
    const r = await next(e)
    const deny = r && typeof r === 'object' && 'deny' in r && r.deny ? ` DENY ${String(r.deny)}` : ''
    const site = e.component === 'Pane' ? 'pane' : 'band'
    await event($, `focus ${site}:${e.element ?? '(engine stop)'} by ${e.origin.kind}${deny}`)
    return r
  })

  on('ui.press', { plugin: 'focus-probe' }, async ($, e, next) => {
    await event($, `press ${e.element}`)
    return next(e)
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await event($, `close pane by ${e.origin.kind}`)
    await restoreBand($, 'pane closed')
    return next(e)
  })

  on('command.run', { command: 'probe-open' }, async ($, e) => {
    const m = e.args.trim() as Mode
    await openPane($, BAND.some(([x]) => x === m) ? m : 'prompts', '/probe-open')
    return {}
  })

  on('command.run', { command: 'probe-set' }, async ($, e) => {
    const [name, value] = e.args.trim().split(/\s+/)
    const f = await read($, flags)
    if (!name || !(name in f)) {
      $.ui.toast(`probe flags: ${Object.entries(f).map(([k, v]) => `${k}=${v ? 'on' : 'off'}`).join(' ')}`)
      return {}
    }
    const key = name as keyof Flags
    const on_ = value === 'on' ? true : value === 'off' ? false : !f[key]
    await update($, flags, old => ({ ...old, [key]: on_ }))
    log($, `--- flag ${key} ${on_ ? 'on' : 'off'}`)
    $.ui.toast(`probe: ${key} ${on_ ? 'on' : 'off'}`)
    return {}
  })

  on('command.run', { command: 'probe-log' }, async $ => {
    await flushLog($)
    $.ui.toast(`probe log: ${logPath ?? '(no place to write it)'}`)
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const Input = 'Input' in elements ? elements.Input : undefined
    const theirs = await next(e)
    const f = await read($, flags)
    const lines = f.readout ? await read($, readout) : []
    const empty = await read($, vanished)
    let drawn = 0
    const first = () => (f.autoFocus && drawn++ === 0 ? { autoFocus: true as const } : {})
    const items: any[] = []
    if (f.bandField && Input && !empty) {
      items.push(
        <Input key={`band-field-${await read($, fieldRev)}`} label="probe:" placeholder="m j p r" {...first()}
          onInput={(typed: string) => {
            const m = BAND.find(([, , k]) => k === typed.slice(-1))?.[0]
            if (!m) return
            void (async () => {
              await update($, fieldRev, n => n + 1) // drawn under a new key, so it starts empty
              await act($, m, 'band field')
            })()
          }}
          onSubmit={(typed: string) => void event($, `band field Enter "${typed}"`)} />,
      )
    }
    // Off (with bandField on): the band has one stop, so each focus-key press can only
    // leave the site; does the leader then rotate input -> band -> pane -> input?
    for (const [m, label, hotkey] of f.bandButtons && !empty ? BAND : []) {
      items.push(<Button key={`band-${m}`} label={label} hotkey={hotkey} plain {...first()} onPress={() => act($, m, 'band')} />)
    }
    return (
      <Box flexDirection="column">
        {theirs}
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor>probe</Text>
          {empty ? <Text dimColor>(nothing focusable for a moment)</Text> : items}
        </Box>
        {lines.length > 0 && <Text dimColor wrap="truncate-end">{lines.join('  ·  ')}</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const Input = 'Input' in elements ? elements.Input : undefined
    const m = await read($, mode)
    const f = await read($, flags)
    const status = <Text dimColor>{e.props.isFocused ? 'this pane HAS the keyboard' : 'this pane does NOT have the keyboard'}</Text>
    const field = f.paneField && Input
      ? [<Input key="pane-field" label="#" placeholder="type, Enter" autoFocus onSubmit={(t: string) => void picked($, `field "${t}"`)} />]
      : []

    let body: any
    if (m === 'mark') {
      body = (
        <Box flexDirection="row" columnGap={1} flexWrap="wrap">
          <Text dimColor>mark as:</Text>
          {'abcdef'.split('').map(l => <Button key={`mark-${l}`} hotkey={l} label="·" plain onPress={() => picked($, `mark ${l}`)} />)}
        </Box>
      )
    } else if (m === 'jump') {
      body = [
        ['a', 'a heading near the top'],
        ['b', 'some code further down'],
        ['c', 'a long answer'],
      ].map(([l, text]) => <Button key={`jump-${l}`} hotkey={l} label={text ?? ''} plain onPress={() => picked($, `jump ${l}`)} />)
    } else if (m === 'read') {
      body = [
        <Button key="read-there" hotkey="t" label="there (the reading position)" plain onPress={() => picked($, 'read there')} />,
        <Button key="read-back" hotkey="b" label="back (where you were)" plain onPress={() => picked($, 'read back')} />,
      ]
    } else {
      // Thirty rows and no hotkeys: enough to see whether the arrows scroll or move the ring.
      body = Array.from({ length: 30 }, (_, k) => 30 - k).map(n => (
        <Button key={`prompt-${n}`} label={`${String(n).padStart(2)}) a pretend prompt, number ${n}`} plain onPress={() => picked($, `prompt ${n}`)} />
      ))
    }
    return (
      <Box flexDirection="column">
        {status}
        {field}
        {body}
      </Box>
    )
  })
}
