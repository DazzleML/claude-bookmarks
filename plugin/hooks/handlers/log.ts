// The log cluster's handlers (moved out of register.tsx under /move-code, comments as they
// were; `ports.x()` where the code called `$`). First part, 0.4.85: the debug echo -- the
// machine-wide policy and this conversation's own choice. The rings, the file log and the
// debug channels follow (open loop, "what is still in register.tsx").

import { describeEcho, echoEnabled, echoPolicyOf, type EchoPolicy } from '../core/log/log-ring.ts'
import { formatDebugEnv, parseDebugEnv } from '../core/log/debug.ts'
import type { EchoPorts } from '../engine/ports.ts'

// Whether log lines are also echoed into the transcript as dim rows. Off by default: the
// file log is always written; the echo is for the person debugging one conversation, and
// a single global switch was spamming every session the plugin loads in (djdarcy,
// 2026-10-09). Two things are kept, one volatile and one persisted (the 14-17-44 DWP):
// - this conversation's choice lives in its own process environment, CONVO_BOOKMARKS_DEBUG.
//   `/bm-debug on|off` sets it with $.env.set, so it survives a hot reload, reaches the
//   processes this session starts, and dies with the session: a resumed session forgets.
//   `CONVO_BOOKMARKS_DEBUG=1 claude` is the same signal given from the shell.
// - the machine-wide policy, one store key: the default every conversation without a
//   choice follows, and whether a conversation may choose at all (`forced`), so "on
//   everywhere" and "off everywhere" can be guaranteed from any one session (djdarcy's
//   six states: forced on, forced off, and a session's on/off/unset over an overridable
//   default). Nothing is cached: a force typed in one session must reach the others on
//   their very next log line.
const ECHO_POLICY_ENTRY = 'debug:echo'
export async function echoPolicy(ports: EchoPorts): Promise<EchoPolicy> {
  // A default typed with `/bm-debug default` wins; without one, the `debugDefault` setting.
  return echoPolicyOf(await ports.storeGet(ECHO_POLICY_ENTRY), ports.settings().debugDefault === 'on')
}
export async function setEchoPolicy(ports: EchoPorts, policy: EchoPolicy) {
  await ports.storeSet(ECHO_POLICY_ENTRY, policy)
}
/** This conversation's own choice, from its environment; undefined when it made none. */
export async function sessionEchoChoice(ports: EchoPorts): Promise<boolean | undefined> {
  return parseDebugEnv(await ports.debugEnv()).echo
}
/** Sets this conversation's choice; `undefined` drops it, so the default applies again. The debug channels sharing the variable are kept. */
export async function setSessionEcho(ports: EchoPorts, enabled: boolean | undefined) {
  // Not named `on`: the directory's reader treats that name as the hook registrar everywhere in the file.
  const { channels } = parseDebugEnv(await ports.debugEnv())
  await ports.setDebugEnv(formatDebugEnv(enabled, channels))
}
export async function uiEchoEnabled(ports: EchoPorts): Promise<boolean> {
  return echoEnabled(await echoPolicy(ports), await sessionEchoChoice(ports))
}
/** The state in one line, for `/bm-debug status` and `/bm-env`. */
export async function echoStateLine(ports: EchoPorts): Promise<string> {
  return describeEcho(await echoPolicy(ports), await sessionEchoChoice(ports))
}
