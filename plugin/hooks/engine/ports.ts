// Ports: the engine, as a sub-file may hold it (the 17-18-16 DWP, Q261012-11, option (d)).
//
// The validator lets `$` reach only functions declared in register.tsx, and every call
// there is spelled `$.noun.event(...)`; a closure that makes such a call may cross a file
// (measured 2026-10-12, tests/one-offs/thinking/ports-poc/). So register.tsx builds an
// object of such closures, one per engine primitive a handler needs, and hands it over:
// the handler calls `ports.toast(...)`, never `$`. The types live here so every handler
// names its needs the same way; register.tsx owns the one place each is built.
//
// Location provisional (Q261012-11, question 3): `hooks/engine/` beside `select.ts`.

/** A toast the person sees. */
export type ToastPorts = { toast: (text: string) => void }

/** A line to the plugin's log: drawn into the conversation when `always`, else only while debugging; `text` marks a line that quotes the conversation (kept per the debugText setting). */
export type LogPorts = { log: (line: string, always?: boolean, text?: boolean) => void }

/** What the diagnostic commands read: the lists and caches register.tsx owns, each behind a function so the handler sees the current value. */
export type DiagnosticsPorts = LogPorts & {
  prompts: () => Promise<{ uuid: string; head: string }[]>
  rows: () => Promise<{ uuid: string; door: 'prompt' | 'response'; head: string }[]>
  marks: () => Promise<Record<string, { uuid: string; head: string }>>
  rendered: () => ReadonlyMap<string, string>
  timeline: () => readonly { t: number; what: string }[]
  note: (what: string) => void
  selection: () => Promise<{ requestId?: string; text: string } | undefined>
  cut: (text: string, n: number) => string
  settings: () => { values: Record<string, unknown> & { debugText: 'off' | 'with-debug' | 'always' | 'auto' }; sources: Record<string, string>; rejected: string[]; unknown: string[] }
  folderBuild: boolean
  pluginName: string
  configKeys: () => Promise<string[]>
  claudeVersion: () => Promise<string>
  pluginVersion: () => Promise<string>
  sessionId: () => Promise<string>
  // One port per variable: the validator wants $.env.get's name literal, so the variables a
  // module reads can be listed; a port taking the name would hide them.
  dccPatcher: () => Promise<string | undefined>
  dccPatchH: () => Promise<string | undefined>
  dccPatches: () => Promise<string | undefined>
  echoState: () => Promise<string>
}

/** What `/bm-debug` needs: the debug channels this conversation has on and how to change them, the echo's choice and policy, and where the file log is. */
export type DebugPorts = ToastPorts &
  LogPorts & {
    channelsOn: () => ReadonlySet<string>
    setChannels: (next: Set<string>) => Promise<void>
    setSessionEcho: (choice: boolean | undefined) => Promise<void>
    setEchoPolicy: (policy: { default: boolean; forced: boolean }) => Promise<void>
    echoState: () => Promise<string>
    logPath: () => string | null | undefined
  }
