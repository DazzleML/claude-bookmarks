// The world beneath the plugin for kit tests (claude plugin test plugin).
//
// Every engine call the plugin makes is answered here from memory and recorded, so a
// test can never reach the real file system, a real process or a live session: the
// kit has no fs, network or process, and each stub below answers instead. A call no
// stub answers fails the test with "no implementation for <event>", which is how a new
// dependency shows up.
import { mock } from 'claude-code/testing'

export type Call = { event: string; input: unknown }

export type WorldOptions = {
  // What $.store holds at the start.
  store?: Record<string, unknown>
  // The environment the plugin reads ($.env.get).
  env?: Record<string, string>
  // Files the plugin may read, by path; writes land here too.
  files?: Record<string, string>
  // What the prompt box holds.
  prompt?: string
  // The session id $.session.id answers.
  session?: string
}

export type World = {
  calls: Call[]
  files: Record<string, string>
  // A file's text by path, whichever slash the test writes.
  file: (path: string) => string | undefined
  logs: () => string[]
  toasts: () => string[]
  opened: () => unknown[]
  clock: ReturnType<typeof mock.clock>
}

type On = (event: never, match: never, hook: never) => void

export const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 40 } }

export function world(on: unknown, options: WorldOptions = {}): World {
  const hook = on as On
  const calls: Call[] = []
  // The engine hands hooks the platform's own separators (backslashes on Windows), so
  // files are keyed with them whichever slash a test wrote.
  const norm = (p: unknown) => String(p).replace(/\//g, '\\')
  const files: Record<string, string> = Object.fromEntries(Object.entries(options.files ?? {}).map(([p, t]) => [norm(p), t]))
  const answer = (event: string, value: (input: Record<string, unknown>) => unknown) =>
    hook(event as never, {} as never, (async (_$: unknown, e: Record<string, unknown>) => {
      calls.push({ event, input: e })
      return { value: value(e) }
    }) as never)
  // Events whose result is the answer itself (`{}` or `{ deny }`), not `{ value }`.
  const answerRaw = (event: string, result: (input: Record<string, unknown>) => object) =>
    hook(event as never, {} as never, (async (_$: unknown, e: Record<string, unknown>) => {
      calls.push({ event, input: e })
      return result(e)
    }) as never)

  const clock = mock.clock(on as never, { now: Date.parse('2026-10-12T00:00:00Z') })
  mock.store(on as never, options.store ?? {})
  mock.env(on as never, { USERPROFILE: 'C:/test-home', ...(options.env ?? {}) })

  // The engine's own drawing beneath the plugin's render hooks: an empty box.
  hook('ui.render' as never, {} as never, (async (h: { ui: { resolve: (e: unknown) => { Box: (p: object) => unknown } } }, e: unknown) =>
    h.ui.resolve(e).Box({})) as never)

  answer('ui.log', () => undefined)
  answer('ui.toast', () => undefined)
  answer('ui.open', () => ({ isPlaced: true }))
  answer('ui.close', () => undefined)
  // A plugin's own $.ui.focus is not routed to test hooks (measured 2026-10-12, Claude
  // Code 2.1.296): the call throws "no implementation for ui.focus" whatever answers it
  // here. Tests let that throw after checking what happened before it.
  answerRaw('ui.focus', () => ({}))
  answerRaw('ui.scroll', () => ({}))
  answer('ui.panes', () => [])
  answer('ui.selection', () => undefined)
  answer('prompt.read', () => ({ text: options.prompt ?? '', cursor: (options.prompt ?? '').length }))
  answer('session.id', () => options.session ?? '00000000-0000-4000-8000-000000000000')
  answer('session.cwd', () => 'C:/test-project')
  answer('fs.exists', e => norm(e.path) in files)
  answer('fs.read', e => files[norm(e.path)] ?? '')
  answer('fs.write', e => {
    files[norm(e.path)] = String(e.text ?? '')
    return undefined
  })
  answer('process.run', () => ({ exitCode: 1, stdout: '', stderr: 'no process in tests', isStdoutTruncated: false }))

  const of = (event: string) => calls.filter(c => c.event === event).map(c => c.input as Record<string, unknown>)
  return {
    calls,
    files,
    file: (path: string) => files[norm(path)],
    logs: () => of('ui.log').map(e => String(e.text)),
    toasts: () => of('ui.toast').map(e => String(e.text ?? e.message ?? JSON.stringify(e))),
    opened: () => of('ui.open'),
    clock,
  }
}
