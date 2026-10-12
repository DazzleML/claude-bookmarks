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

/** A line to the plugin's log, drawn into the conversation when `always`, else only while debugging. */
export type LogPorts = { log: (line: string, always?: boolean) => void }

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
