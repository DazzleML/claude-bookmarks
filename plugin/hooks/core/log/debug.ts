// Debug channels (#35): heavier diagnostics a person turns on by name, off by default.
//
// The debug log is always written. A channel adds a diagnostic that is too heavy or too
// narrow to run for everyone: the person enables it for one conversation
// (`/bm-debug enable screen,held`), and it is gone when the session ends. The choice
// lives in the one variable PRIVACY.md names, `CONVO_BOOKMARKS_DEBUG`, beside the echo's
// on/off (2026-10-09__14-17-44 DWP): `1,screen` is the echo on and the screen channel,
// `screen` the channel alone. djdarcy, 2026-10-12: PRIVACY.md is not edited; the code
// fits inside it. `CONVO_BOOKMARKS_DEBUG=screen claude` works from a shell too.

export const CHANNELS = {
  screen: 'every on-screen report Claude Code sends, to <session>.screen.log (heavy: rewritten every half second while the screen redraws)',
  held: 'a log line naming the rule that kept the prompts pane\'s yellow row where it was',
  text: 'log lines quote the conversation (the selected words, a message\'s first line, a bookmark\'s label) in this conversation, whatever the debugText setting says',
} as const

/** Whether log lines quote the conversation now: the `text` channel, or the setting (already read for this build by `debugTextMode`) and whether debugging is on. */
export function quotesText(mode: 'off' | 'with-debug' | 'always', textChannel: boolean, debugging: boolean): boolean {
  return textChannel || mode === 'always' || (mode === 'with-debug' && debugging)
}

/** A quoted excerpt: `reference` keeps the first `n` characters, `full` the whole text. */
export function excerpt(text: string, n: number, length: 'reference' | 'full'): string {
  return length === 'full' ? text : text.slice(0, n)
}

export type Channel = keyof typeof CHANNELS

export const isChannel = (name: string): name is Channel => Object.prototype.hasOwnProperty.call(CHANNELS, name)

/** Channel names from a comma- or space-separated list; names it does not know are returned apart, not dropped silently. */
export function parseChannels(list: string | undefined): { known: Channel[]; unknown: string[] } {
  const known: Channel[] = []
  const unknown: string[] = []
  for (const raw of (list ?? '').split(/[\s,]+/)) {
    const name = raw.trim().toLowerCase()
    if (!name) continue
    if (isChannel(name)) {
      if (!known.includes(name)) known.push(name)
    } else if (!unknown.includes(name)) unknown.push(name)
  }
  return { known, unknown }
}

// The log lines the screen channel copies into its own file, so the yellow row's moves
// line up with the reports that caused them. Matched without the `[bm] ` prefix and cut
// to 110 characters.
const MIRRORED = /^\[bm\] ((nearest prompt moved|redraw ignored|pane follow|held by).*)$/

/** The part of a log line the screen log mirrors, or undefined for a line it does not. */
export function screenMirror(line: string): string | undefined {
  const m = MIRRORED.exec(line)
  return m ? m[1]!.slice(0, 110) : undefined
}

/** Known channels in table order, comma-separated; '' when none. */
export function formatChannels(on: Iterable<Channel>): string {
  const set = new Set(on)
  return (Object.keys(CHANNELS) as Channel[]).filter(c => set.has(c)).join(',')
}

const ECHO_ON = new Set(['1', 'on', 'true'])
const ECHO_OFF = new Set(['0', 'off', 'false'])

/**
 * `CONVO_BOOKMARKS_DEBUG` read whole: the echo choice (undefined when the value makes
 * none) and the channels. A value from before channels (`1`, `0`, `off`) reads as it did.
 */
export function parseDebugEnv(value: string | undefined): { echo: boolean | undefined; channels: Channel[]; unknown: string[] } {
  let echo: boolean | undefined
  const rest: string[] = []
  for (const raw of (value ?? '').split(/[\s,]+/)) {
    const t = raw.trim().toLowerCase()
    if (!t) continue
    if (ECHO_ON.has(t)) echo = true
    else if (ECHO_OFF.has(t)) echo = false
    else rest.push(t)
  }
  const { known, unknown } = parseChannels(rest.join(','))
  return { echo, channels: known, unknown }
}

/** The value to store: the echo choice first (when made), then the channels; undefined when nothing is left. */
export function formatDebugEnv(echo: boolean | undefined, channels: Iterable<Channel>): string | undefined {
  const parts = [...(echo === undefined ? [] : [echo ? '1' : '0']), formatChannels(channels)].filter(Boolean)
  return parts.length ? parts.join(',') : undefined
}
