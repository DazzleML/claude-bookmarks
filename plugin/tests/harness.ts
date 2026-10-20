// The world beneath the plugin for kit tests (claude plugin test plugin).
//
// Every engine call the plugin makes is answered here from memory and recorded, so a
// test can never reach the real file system, a real process or a live session: the
// kit has no fs, network or process, and each stub below answers instead. A call no
// stub answers fails the test with "no implementation for <event>", which is how a new
// dependency shows up.
import { mock } from 'claude-code/testing'
import { emptyRegister, serializeRegister } from '../hooks/core/bookmarks/register-file.ts'
import { applyOp } from '../hooks/core/bookmarks/register-ops.ts'

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
  // The working directory $.session.cwd answers (C:/test-project by default).
  cwd?: string
  // The plugin's open panes $.ui.panes answers (none by default), e.g. [{ id: 'bm-pane' }].
  panes?: { id: string; isFocused?: boolean }[]
  // What $.process.run answers, by argv; by default no program runs in tests.
  process?: (argv: readonly string[]) => { exitCode: number; stdout: string; stderr?: string; isStdoutTruncated?: boolean }
  // What $.ui.selection answers, read at each call (so a test can change it mid-test).
  selection?: () => { requestId: string; text: string } | undefined
}

export type World = {
  calls: Call[]
  files: Record<string, string>
  // A file's text by path, whichever slash the test writes.
  file: (path: string) => string | undefined
  logs: () => string[]
  toasts: () => string[]
  opened: () => unknown[]
  /** The text of each $.ui.copy, in order. */
  copied: () => string[]
  clock: ReturnType<typeof mock.clock>
}

type On = (event: never, match: never, hook: never) => void

export const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 40 } }

/** The data root the plugin derives from this world's USERPROFILE. */
export const DATA_ROOT = 'C:/test-home/claude/bookmarks'

/**
 * A register file (format v3) holding these letters, as `files` for `world`: since 0.5.5 the
 * marks live in the register's slots, so a test that used to seed `marks:<sid>` in the store
 * seeds the file instead. Each mark becomes a record of tier `mark` and a slot pointing at it.
 */
export function registerWithMarks(sid: string, marks: Record<string, { uuid: string; head: string; markedAt: number; snippet?: string }>): Record<string, string> {
  let reg = emptyRegister(sid, 'bookmarks test', 0)
  for (const [letter, m] of Object.entries(marks)) {
    const r = applyOp(reg, { op: 'setMark', owner: 'user', letter, place: { uuid: m.uuid, head: m.head, ...(m.snippet ? { words: m.snippet } : {}) }, at: m.markedAt }, m.markedAt)
    if ('error' in r) throw new Error(r.error)
    reg = r.register
  }
  return { [`${DATA_ROOT}/sessions/${sid}.json`]: serializeRegister(reg) }
}

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
  // The environment, readable and writable: $.env.set (the debug echo's choice and the
  // channels) lands here, so a later $.env.get sees it, as in a real session.
  const env: Record<string, string | undefined> = { USERPROFILE: 'C:/test-home', ...(options.env ?? {}) }
  answer('env.get', e => env[String(e.name)])
  answer('env.set', e => {
    env[String(e.name)] = typeof e.value === 'string' ? e.value : undefined
    return undefined
  })

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
  answer('ui.panes', () => (options.panes ?? []).map(p => ({ id: p.id, title: p.id, isShown: true, isFocused: !!p.isFocused, isPlaced: true })))
  answer('ui.selection', () => options.selection?.())
  answer('prompt.read', () => ({ text: options.prompt ?? '', cursor: (options.prompt ?? '').length }))
  answer('session.id', () => options.session ?? '00000000-0000-4000-8000-000000000000')
  answer('session.cwd', () => options.cwd ?? 'C:/test-project')
  // A file by its key, or a folder: anything in the map lies under it.
  answer('fs.exists', e => {
    const p = norm(e.path).replace(/\\+$/, '')
    return p in files || Object.keys(files).some(k => k.startsWith(p + '\\'))
  })
  answer('fs.read', e => files[norm(e.path)] ?? '')
  answer('fs.write', e => {
    files[norm(e.path)] = String(e.text ?? '')
    return undefined
  })
  answer('process.run', e => ({ stderr: '', isStdoutTruncated: false, ...(options.process?.(e.argv as readonly string[]) ?? { exitCode: 1, stdout: '', stderr: 'no process in tests' }) }))
  // A folder's entries from the files map: the names one level below `path`, files and folders.
  answer('fs.list', e => {
    const dir = norm(e.path).replace(/\\+$/, '') + '\\'
    const seen = new Map<string, { name: string; kind: 'file' | 'dir'; size: number; mtimeMs: number; isLink: boolean }>()
    for (const [p, text] of Object.entries(files)) {
      if (!p.startsWith(dir)) continue
      const rest = p.slice(dir.length)
      const slash = rest.indexOf('\\')
      const name = slash < 0 ? rest : rest.slice(0, slash)
      if (!seen.has(name)) seen.set(name, { name, kind: slash < 0 ? 'file' : 'dir', size: slash < 0 ? text.length : 0, mtimeMs: 0, isLink: false })
    }
    return [...seen.values()]
  })
  // The start path (a test's $.session.start, measured 2026-10-12): the base event passes
  // through with its fields, and the calls the plugin's start hook makes are answered.
  answerRaw('session.start', e => e)
  // A conversation's end (a test's $.session.end): the engine's end step answers
  // `{ sessionId }` (SessionEndResult); /clear and a resume come only this way (Q261014-01).
  answerRaw('session.end', e => ({ sessionId: String((e as { sessionId?: unknown }).sessionId ?? '') }))
  answer('session.version', () => ({ version: '2.1.296', base: '2.1.296' }))
  answer('config.list', () => [])
  answer('command.register', () => undefined)
  answer('tool.register', e => ({ tool: `mcp__bookmarks__${String(e.name ?? 'bookmark')}` }))
  // The clipboard (test-scenarios 2026-10-14__02-07-49, S5): copied, and recorded in `calls`.
  answer('ui.copy', () => ({ isCopied: true }))

  const of =(event: string) => calls.filter(c => c.event === event).map(c => c.input as Record<string, unknown>)
  return {
    calls,
    files,
    file: (path: string) => files[norm(path)],
    logs: () => of('ui.log').map(e => String(e.text)),
    toasts: () => of('ui.toast').map(e => String(e.text ?? e.message ?? JSON.stringify(e))),
    opened: () => of('ui.open'),
    copied: () => of('ui.copy').map(e => String(e.text)),
    clock,
  }
}
