// The ownership scan (notes/meta/2026-10-12__22-48-40, "one owner, read-only ports";
// plugin/hooks/engine/ports.ts holds the table in prose). Each piece of shared state has
// named writers, and only the files listed here may call them. register.tsx is not
// scanned: it builds the ports, so every writer appears there by design. A handler or a
// view that starts writing state it does not own fails here, by file and line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// OWNERSHIP_HOOKS points the scan at a copy (its red-green proof edits a scratch copy, never
// plugin/, whose saves hot-reload a live session).
const HOOKS = process.env.OWNERSHIP_HOOKS ?? join(import.meta.dirname, '../../plugin/hooks')

type Owner = { state: string; receivers: readonly string[]; writers: readonly string[]; files: readonly string[] }

// The table, as data. `files` are relative to plugin/hooks.
const OWNERS: readonly Owner[] = [
  {
    state: 'BandState (core/band/band-state.ts)',
    receivers: ['ports.band'],
    writers: ['restartWait', 'stopWaiting', 'startWatch', 'stopWatching', 'ended', 'newConversation', 'ringMoved', 'drawn', 'oweReminder'],
    // The band cluster, its command line included.
    files: ['handlers/band.ts', 'handlers/command-line.ts'],
  },
  {
    state: 'MarkState (core/marks/mark-state.ts)',
    receivers: ['ports.state'],
    writers: ['restartClear', 'stopClear', 'setAtChord', 'takeAtChord', 'see', 'stopPoll', 'startPoll', 'newConversation'],
    files: ['handlers/marks.ts'],
  },
  {
    state: 'MarkCache (core/marks/marks.ts)',
    receivers: ['ports.markCache'],
    writers: ['replace', 'showTransient'],
    // replace: the marks; showTransient: a bookmark's highlight.
    files: ['handlers/marks.ts', 'handlers/bookmarks.ts'],
  },
]

/** Every `receiver.writer(` call in `source`, with its line number. */
export function writesIn(source: string, owner: Owner): { line: number; call: string }[] {
  const found: { line: number; call: string }[] = []
  const lines = source.split('\n')
  for (const r of owner.receivers) {
    const re = new RegExp(`\\b${r.replace(/\./g, '\\.')}\\.(${owner.writers.join('|')})\\(`, 'g')
    lines.forEach((text, i) => {
      for (const m of text.matchAll(re)) found.push({ line: i + 1, call: `${r}.${m[1]}` })
    })
  }
  return found
}

function scanned(): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = []
  for (const dir of ['handlers', 'views']) {
    for (const name of readdirSync(join(HOOKS, dir))) {
      if (/\.tsx?$/.test(name)) out.push({ file: `${dir}/${name}`, source: readFileSync(join(HOOKS, dir, name), 'utf8') })
    }
  }
  return out
}

test('the scanner finds a writer call by its receiver, and not a string method of the same name', () => {
  const cache = OWNERS[2]!
  const src = 'const a = s.replace(/x/, "")\nports.markCache.replace({})\nports.markCache.all()\n'
  assert.deepEqual(writesIn(src, cache), [{ line: 2, call: 'ports.markCache.replace' }])
})

test('each shared-state writer is called only from the files that own it', () => {
  const wrong: string[] = []
  for (const { file, source } of scanned()) {
    for (const owner of OWNERS) {
      if (owner.files.includes(file)) continue
      for (const w of writesIn(source, owner)) wrong.push(`${file}:${w.line} calls ${w.call} (${owner.state} is written only by ${owner.files.join(', ')})`)
    }
  }
  assert.deepEqual(wrong, [])
})

test('no handler or view imports register.tsx (state reaches them only through ports)', () => {
  const wrong = scanned().filter(({ source }) => /from '\.\.\/register(\.tsx)?'/.test(source)).map(f => f.file)
  assert.deepEqual(wrong, [])
})

test('every module-level variable in a handler is named in the ownership table', () => {
  const table = readFileSync(join(HOOKS, 'engine/ports.ts'), 'utf8')
  const missing: string[] = []
  for (const { file, source } of scanned()) {
    for (const m of source.matchAll(/^(?:let (\w+)|const (\w+) = new )/gm)) {
      const name = m[1] ?? m[2]!
      if (!table.includes(name)) missing.push(`${file}: ${name}`)
    }
  }
  assert.deepEqual(missing, [])
})
