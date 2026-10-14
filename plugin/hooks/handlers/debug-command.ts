// /bm-debug, whole, out of register.tsx through ports (the 17-18-16 DWP's option (b); the
// first handler to leave; djdarcy's example, 2026-10-12: "WHy is it we can't put the
// entirety of something like this in a separate "debugging.ts*" file?"). Moved under
// /move-code, comments as they were; the only change is `ports.x(...)` where the handler
// called `$` or a register.tsx function. Location provisional (Q261012-11, question 3).
import { CHANNELS, formatChannels, parseChannels, type Channel } from '../core/log/debug.ts'
import { DEBUG_USAGE, parseDebugArgs } from '../core/log/diagnostics.ts'
import type { DebugPorts } from '../engine/ports.ts'

export async function debugCommand(args: string, ports: DebugPorts): Promise<void> {
  const op = parseDebugArgs(args)
  // Debug channels (#35): heavier diagnostics, off by default, this conversation only.
  if (op.kind === 'channels') {
    const channelsOn = ports.channelsOn()
    if (op.action !== 'channels') {
      const { known, unknown } = parseChannels(op.rest)
      if (!known.length && !unknown.length) {
        ports.log(`[bm] /bm-debug ${op.action} needs channel names: ${Object.keys(CHANNELS).join(', ')}`, true)
        return
      }
      const next = new Set(channelsOn)
      for (const c of known) op.action === 'enable' ? next.add(c) : next.delete(c)
      await ports.setChannels(next)
      if (unknown.length) ports.log(`[bm] no such debug channel: ${unknown.join(', ')} (known: ${Object.keys(CHANNELS).join(', ')})`, true)
      ports.toast(`bookmarks: debug channels ${formatChannels(ports.channelsOn() as Set<Channel>) || 'none'} on`)
    }
    for (const [c, what] of Object.entries(CHANNELS)) {
      ports.log(`[bm] debug channel ${c}: ${ports.channelsOn().has(c as Channel) ? 'ON' : 'off'} -- ${what}`, true)
    }
    return
  }
  if (op.kind === 'echo') {
    await ports.setSessionEcho(op.choice)
    const line = await ports.echoState()
    ports.toast(`bookmarks: log echo ${line}`)
    ports.log(`[bm] log echo ${line} (the file log is always written)`, true)
    return
  }
  if (op.kind === 'policy') {
    await ports.setEchoPolicy(op.policy)
    const line = await ports.echoState()
    ports.toast(`bookmarks: log echo ${line}`)
    ports.log(`[bm] log echo ${line}`, true)
    return
  }
  ports.log(`[bm] log echo ${await ports.echoState()}; channels on: ${formatChannels(ports.channelsOn() as Set<Channel>) || 'none'}; file log: ${ports.logPath() ?? '(not yet written)'}; ${DEBUG_USAGE}`, true)
}
