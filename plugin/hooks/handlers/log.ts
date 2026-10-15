// The log cluster's handlers (moved out of register.tsx under /move-code, comments as they
// were; `ports.x()` where the code called `$`). First part, 0.4.85: the debug echo -- the
// machine-wide policy and this conversation's own choice. Then the debug channels (0.4.86),
// and the rings with the file log and the timeline (0.4.87). Then log() itself, as the
// Logger class (0.4.95); the engine's $.ui.log reaches it as the `uiLog` port.

import { Ring, clock, describeEcho, echoEnabled, echoPolicyOf, logFile, screenFile, stamped, type EchoPolicy } from '../core/log/log-ring.ts'
import { formatDebugEnv, parseDebugEnv, quotesText, screenMirror, type Channel } from '../core/log/debug.ts'
import { debugTextMode } from '../core/settings.ts'
import type { EchoPorts, LogFilesPorts, LoggerPorts } from '../engine/ports.ts'

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
// Debug channels (#35, core/log/debug.ts): this conversation's choice, read from its
// environment once and kept here so a check is synchronous (a render hook and note()
// cannot await). Until it is read, every channel is off, the safe side.
// (0.4.86: one owned class with named methods; register.tsx keeps the one instance.)
export class DebugChannels {
  readonly #on = new Set<Channel>()
  #read = false
  has(c: Channel): boolean {
    return this.#on.has(c)
  }
  get on(): ReadonlySet<Channel> {
    return this.#on
  }
  read(ports: Pick<EchoPorts, 'debugEnv'>) {
    if (this.#read) return
    this.#read = true
    void ports.debugEnv().then(v => {
      for (const c of parseDebugEnv(v).channels) this.#on.add(c)
    }).catch(() => {})
  }
  // The channels share CONVO_BOOKMARKS_DEBUG with the echo's choice, which is kept.
  async set(ports: EchoPorts, on: Set<Channel>) {
    this.#on.clear()
    for (const c of on) this.#on.add(c)
    const { echo } = parseDebugEnv(await ports.debugEnv())
    await ports.setDebugEnv(formatDebugEnv(echo, on))
  }
}
/** The state in one line, for `/bm-debug status` and `/bm-env`. */
export async function echoStateLine(ports: EchoPorts): Promise<string> {
  return describeEcho(await echoPolicy(ports), await sessionEchoChoice(ports))
}

// A timeline of what the mod saw and did, so a drawn-id mismatch can be lined up
// against the pane, store and toast activity just before it. Module-level: a reload
// starts it over, the same as `rendered`.
// (0.4.87: the ring is owned here, written only by note(); the instance is register.tsx's.)
export class Timeline {
  readonly #ring = new Ring<{ t: number; what: string }>(400)
  note(what: string) {
    this.#ring.push({ t: Date.now(), what })
  }
  get items(): readonly { t: number; what: string }[] {
    return this.#ring.items
  }
}

// The [bm] log lines, also written to <user dir>/bookmarks/debug/<session>.log:
// $.ui.log rows are only drawn, so a session that reads files (Claude, while
// developing this) cannot see them. Kept outside the plugin folder on purpose: a write
// inside it trips the folder watch and reloads the mod on every line. $.fs has no
// append, so the file is rewritten whole, last 400 lines, one write at a time.
// The `screen` debug channel (#35): every raw onScreen report, unfiltered, nulls and
// repeats included, to <debug>/<session>.screen.log, so the yellow row's moves can be
// lined up against what Claude Code actually sent (it found the 0.4.1 tool-row bug;
// tests/one-offs/thinking/screen-reports/analyse_screen_log.py reads it). Off unless
// `/bm-debug enable screen`.
// (0.4.87: both rings, the file's place and the one write chain are one owned class;
// whether the screen channel is on is the caller's to say, from DebugChannels.)
export class LogFiles {
  readonly #lines = new Ring<string>(400)
  readonly #screen = new Ring<string>(6000)
  #path: string | null | undefined // undefined: not looked up yet; null: no usable place
  #flushing: Promise<void> = Promise.resolve()
  #screenFlushPending = false
  #screenLoaded = false

  /** The file log's place: undefined until the first write looks it up, null when there is no usable place. */
  get path(): string | null | undefined {
    return this.#path
  }

  /** Keeps one log line (and, with the screen channel on, its mirror in the screen file) and queues the write. */
  keep(ports: LogFilesPorts, line: string, screenOn: boolean) {
    this.#lines.push(stamped(line, Date.now()))
    const mirrored = screenOn ? screenMirror(line) : undefined
    if (mirrored) this.#screen.push(`${clock(Date.now())} >>> ${mirrored}`)
    this.#flushing = this.#flushing.then(() => this.#flushLog(ports)).catch(() => {})
  }

  /** One raw onScreen report for the screen channel; the caller has checked the channel is on. */
  screenReport(ports: LogFilesPorts, component: string, requestId: string, onScreen: { first: number; last: number; of: number } | null | undefined) {
    const range = onScreen ? `${onScreen.first}-${onScreen.last}/${onScreen.of}` : onScreen === null ? 'null' : 'absent'
    this.#screen.push(`${clock(Date.now())} ${component} ${requestId} ${range}`)
    if (this.#screenFlushPending) return
    this.#screenFlushPending = true
    ports.after(500, () => {
      this.#screenFlushPending = false
      this.#flushing = this.#flushing.then(() => this.#flushScreen(ports)).catch(() => {})
    })
  }

  // A new conversation writes its own log files (0.4.74; test-scenarios 2026-10-14__02-07-49,
  // S4): the path was looked up once per process, so after /clear or /resume the new
  // conversation's lines went on into the old one's file. The old conversation's pending
  // writes finish first, under its own path; then the path is looked up again at the next
  // write and the rings start empty (that file's own lines are read back on its first
  // write, as after a reload). A line logged during the wait can miss the new file.
  async newConversation() {
    await this.#flushing
    this.#path = undefined
    this.#lines.clear()
    this.#screen.clear()
    this.#screenLoaded = false
  }

  async #flushLog(ports: LogFilesPorts) {
    if (this.#path === undefined) {
      const root = await ports.dataRoot()
      this.#path = root ? logFile(root, await ports.sessionId()) : null
      // A reload starts the module over: keep what the file already holds.
      if (this.#path && (await ports.fsExists(this.#path))) this.#lines.prepend((await ports.fsRead(this.#path)).split('\n').filter(l => l.trim()))
    }
    if (this.#path) await ports.fsWrite(this.#path, this.#lines.items.join('\n') + '\n')
  }

  async #flushScreen(ports: LogFilesPorts) {
    if (this.#path === undefined) await this.#flushLog(ports)
    if (!this.#path) return
    const path = screenFile(this.#path)
    if (!this.#screenLoaded) {
      this.#screenLoaded = true
      if (await ports.fsExists(path)) this.#screen.prepend([...(await ports.fsRead(path)).split('\n').filter(l => l.trim()), '--- reload ---'])
    }
    await ports.fsWrite(path, this.#screen.items.join('\n') + '\n')
  }
}

// The logger: the debug channels, the file log and the timeline, and log() over them
// (0.4.95: moved from register.tsx under the move-code skill; register.tsx keeps the one
// instance and a one-line log(), and calls the engine's $.ui.log through `uiLog`).
export class Logger {
  readonly channels = new DebugChannels()
  readonly files = new LogFiles()
  readonly timeline = new Timeline()

  // `text`: the line quotes the conversation (a selection, a message's head, a label,
  // highlighted words, a tool's input). It is kept when the `text` channel is on, or the
  // `debugText` setting allows it: `auto` is always in a build loaded from a folder (a
  // developer's) and off in an installed one; `with-debug` follows this conversation's
  // debugging (djdarcy, 2026-10-12: the person decides, and nothing is lost while we debug).
  log(ports: LoggerPorts, line: string, opts?: { always?: boolean; text?: boolean }) {
    this.channels.read(ports)
    if (opts?.text) {
      const mode = debugTextMode(ports.settings().debugText, ports.folderBuild)
      void uiEchoEnabled(ports).then(debugging => {
        if (!quotesText(mode, this.channels.has('text'), debugging)) return
        if (opts.always || debugging) ports.uiLog(line)
        this.keepLine(ports, line)
      }).catch(() => {})
      return
    }
    if (opts?.always) ports.uiLog(line)
    else void uiEchoEnabled(ports).then(enabled => { if (enabled) ports.uiLog(line) }).catch(() => {})
    this.keepLine(ports, line)
  }

  keepLine(ports: LoggerPorts, line: string) {
    this.files.keep(ports, line, this.channels.has('screen'))
  }
}
