// Debug channels (#35): heavier diagnostics a person turns on by name, off by default.
//
// The debug log is always written. A channel adds a diagnostic that is too heavy or too
// narrow to run for everyone: the person enables it for one conversation
// (`/bm-debug enable screen,held`), and it is gone when the session ends. The choice
// lives in the plugin's own process environment, `CONVO_BOOKMARKS_DEBUG_CHANNELS`, the
// same way `/bm-debug on` keeps the echo's (2026-10-09__14-17-44 DWP), so
// `CONVO_BOOKMARKS_DEBUG_CHANNELS=screen claude` works from a shell too.

export const CHANNELS = {
  screen: 'every on-screen report Claude Code sends, to <session>.screen.log (heavy: rewritten every half second while the screen redraws)',
  held: 'a log line naming the rule that kept the prompts pane\'s yellow row where it was',
} as const

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

/** The value stored in the environment: known channels in table order, comma-separated; '' when none. */
export function formatChannels(on: Iterable<Channel>): string {
  const set = new Set(on)
  return (Object.keys(CHANNELS) as Channel[]).filter(c => set.has(c)).join(',')
}
