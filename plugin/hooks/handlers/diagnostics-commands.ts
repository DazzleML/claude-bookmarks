// The diagnostic commands, whole, out of register.tsx through ports (the 17-18-16 DWP's
// option (b); refactor-advisor 2026-10-12 row 2's "one // Diagnostics block"): /bm-ids,
// /bm-marks, /bm-sel, /bm-timeline, /bm-config, /bm-env. Moved under /move-code, comments
// as they were; `ports.x(...)` where a handler called `$` or a register.tsx function. Their
// decisions and formats are core/log/diagnostics.ts. Location provisional (Q261012-11);
// settled here by the layout pass (0.4.77).
import { configListedLine, dccLine, idsReport, jumpTarget, notAppliedLine, selectionKind, settingsRows } from '../core/log/diagnostics.ts'
import { clock } from '../core/log/log-ring.ts'
import { short } from '../core/kit/message-id.ts'
import { debugTextMode } from '../core/settings.ts'
import type { DiagnosticsPorts } from '../engine/ports.ts'

// The verified builds live beside the chord actions they vouch for (core/band/keys.ts
// VERIFIED_CLIENTS, since U60); /bm-env names them.
import { VERIFIED_CLIENTS } from '../core/band/keys.ts'

export async function idsCommand(ports: DiagnosticsPorts): Promise<void> {
  const report = idsReport(await ports.prompts(), ports.rendered())
  ports.log(report.summary)
  for (const line of [...report.rows, ...report.strays]) ports.log(line, undefined, true)
}

export async function marksCommand(ports: DiagnosticsPorts): Promise<void> {
  const marks = await ports.marks()
  const entries = Object.entries(marks).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) ports.log('[bm] no marks in this session')
  for (const [l, m] of entries) ports.log(`[bm]  ${l}  ${short(m.uuid)}  ${m.head}`, undefined, true)
}

// /bm-sel: exactly what $.ui.selection() answers, and whether its row
// id is one the mod already knows (a saved uuid, or an id seen at draw time).
export async function selCommand(ports: DiagnosticsPorts): Promise<void> {
  const sel = await ports.selection()
  if (!sel) {
    ports.log('[bm] SEL: no selection (nothing selected, fullscreen off, or cleared by a prompt)')
    return
  }
  const id = sel.requestId
  const saved = id ? (await ports.rows()).find(r => r.uuid === id) : undefined
  const known = selectionKind(id, saved?.door, !!id && ports.rendered().has(id))
  ports.log(`[bm] SEL: row ${id ?? '(none)'} -> ${known}; ${sel.text.length} chars`)
  ports.log(`[bm] SEL text: ${JSON.stringify(ports.cut(sel.text, 300))}`, undefined, true)
  ports.note(`bm-sel row ${id ?? '(none)'} ${known}`)
}

export function timelineCommand(args: string, ports: DiagnosticsPorts): void {
  const n = Number(args.trim()) || 40
  const timeline = ports.timeline()
  const recent = timeline.slice(-n)
  ports.log(`[bm] timeline: last ${recent.length} of ${timeline.length} events since load`)
  for (const { t, what } of recent) ports.log(`[bm]  ${clock(t)} ${what}`, undefined, true)
}

// Every setting, its value and where it came from (default, the machine's /config, this
// conversation), plus any value that was given but did not fit (core/settings.ts).
export async function configCommand(ports: DiagnosticsPorts): Promise<void> {
  const r = ports.settings()
  ports.log(`[bm] settings: ${settingsRows(r.values, r.sources).join('; ')}`, true)
  const folder = ports.folderBuild
  ports.log(`[bm] this build is ${folder ? 'loaded from a folder' : 'installed'}, so debugText=${JSON.stringify(r.values.debugText)} means ${debugTextMode(r.values.debugText, folder)}; change any of these in /config`, true)
  // Whether Claude Code's /config actually lists the fields (djdarcy, 2026-10-12: "I tried
  // /config and I'm not seeing the mod/plugin"): its own rows, as $.config.list sees them.
  const listed = (await ports.configKeys()).filter(key => key.startsWith(`${ports.pluginName}.`))
  ports.log(configListedLine(listed, Object.keys(r.values).length), true)
  const notApplied = notAppliedLine(r.rejected, r.unknown)
  if (notApplied) ports.log(notApplied, true)
}

export async function envCommand(ports: DiagnosticsPorts): Promise<void> {
  const v = await ports.claudeVersion()
  const list = await ports.rows()
  const promptCount = list.filter(r => r.door === 'prompt').length
  // A command's answer is always drawn, whatever the echo setting.
  ports.log(
    `[bm] ${ports.pluginName} ${await ports.pluginVersion()} on Claude Code ${v} ` +
      `(chords verified on ${VERIFIED_CLIENTS.join(', ')}); session ${await ports.sessionId()}; ` +
      `captured ${promptCount} prompts, ${list.length - promptCount} replies; ${ports.rendered().size} drawn ids; ` +
      ports.capabilityPaths(),
    true,
  )
  // dcc-patcher's build signal (core/log/diagnostics.ts, dccLine).
  ports.log(dccLine(await ports.dccPatcher(), await ports.dccPatchH(), await ports.dccPatches(), await ports.echoState()), true)
  // The loader's pass (slice F): what it has read, and whether it is still running.
  ports.log(`[bm] ${ports.loaderStatus()}`, true)
}

// /bm-jump first | last | N | r<N> | uuid (moved from register.tsx's registration, 0.4.94).
export async function jumpCommand(ports: DiagnosticsPorts, args: string) {
  const arg = args.trim()
  const target = jumpTarget(arg, await ports.rows())
  if (target.kind === 'row') await ports.jumpTo(target.uuid, '/bm-jump', target.label)
  else if (target.kind === 'raw') await ports.jumpTo(target.uuid, '/bm-jump (raw uuid)', 'raw')
  else ports.log(`[bm] nothing captured for "${arg}" (${target.prompts} prompts captured since load)`)
}
