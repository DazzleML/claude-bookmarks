// The log cluster's pure parts (refactor-advisor 2026-10-12__15-06-26 row 3; the first move
// of the register.tsx split, Q261012-06): a bounded ring of lines, what a reload does with
// the lines a file already holds, and the echo policy -- whether a conversation's log
// lines are also drawn into its transcript, and how that state is said. The engine calls
// (the store key, the environment variable, the file writes) stay in register.tsx.

/** The newest `cap` items, oldest first. Full, the oldest go as new ones arrive. */
export class Ring<T> {
  readonly items: T[] = []
  readonly cap: number
  constructor(cap: number) {
    this.cap = cap
  }
  get length(): number {
    return this.items.length
  }
  push(item: T): void {
    this.items.push(item)
    this.trim()
  }
  /** A reload starts the module over: what the file already held goes in front of the lines since, and the oldest of all go. */
  prepend(earlier: readonly T[]): void {
    this.items.unshift(...earlier)
    this.trim()
  }
  /** A new conversation writes its own file: the ring starts empty (0.4.74). */
  clear(): void {
    this.items.length = 0
  }
  private trim(): void {
    if (this.items.length > this.cap) this.items.splice(0, this.items.length - this.cap)
  }
}

/** The machine-wide echo policy (one store key): the default every conversation without a choice follows, and whether a conversation may choose at all. */
export type EchoPolicy = { default: boolean; forced: boolean }

/** The policy as stored, with the `debugDefault` setting behind a missing or malformed default. A force is only a stored `true`. */
export function echoPolicyOf(stored: unknown, fallbackDefault: boolean): EchoPolicy {
  const v = stored as Partial<EchoPolicy> | undefined
  return { default: typeof v?.default === 'boolean' ? v.default : fallbackDefault, forced: v?.forced === true }
}

/** Whether this conversation echoes: a force wins; else its own choice; else the default. */
export function echoEnabled(policy: EchoPolicy, choice: boolean | undefined): boolean {
  if (policy.forced) return policy.default
  return choice ?? policy.default
}

/** The echo's state in one line, for `/bm-debug status` and `/bm-env`. */
export function describeEcho(policy: EchoPolicy, choice: boolean | undefined): string {
  const word = (b: boolean) => (b ? 'on' : 'off')
  if (policy.forced) {
    const asked = choice !== undefined && choice !== policy.default ? `; this conversation asked for ${word(choice)}, which applies once the force is lifted` : ''
    return `${word(policy.default)} everywhere, forced (/bm-debug default ${word(policy.default)} lifts it${asked})`
  }
  if (choice !== undefined) return `${word(choice)} here only (this conversation's choice; the default is ${word(policy.default)})`
  return `${word(policy.default)}, the default (every conversation without a choice of its own)`
}

/** A time of day to the millisecond, `HH:MM:SS.mmm`, for the screen log and the timeline. */
export const clock = (t: number): string => new Date(t).toISOString().slice(11, 23)

/** A log line as kept in the file: the full ISO time, a space, the line. */
export const stamped = (line: string, now: number): string => `${new Date(now).toISOString()} ${line}`

/** The debug log of a conversation under the data root, and the screen channel's file beside it. */
export const logFile = (root: string, sessionId: string): string => `${root}/bookmarks/debug/${sessionId}.log`
export const screenFile = (logPath: string): string => logPath.replace(/\.log$/, '.screen.log')
