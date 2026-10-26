// Unit 1 of the 0.7 groundwork (2026-10-25): do other sessions' and agents' messages reach
// the prompts list? Runs the plugin's own promptTextOf (the loader's door, core/transcript/
// loader.ts:52) over every user row of a real transcript whose text carries another session's
// or agent's wrapper, and prints which ones it would list as prompts, with their first words.
//
// Usage: node --experimental-strip-types probe_agent_messages_vs_prompt_filter.ts <session.jsonl>
// Read only.
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { promptTextOf } from '../../../plugin/hooks/core/prompts/prompt-rows.ts'

const WRAPPERS = ['<agent-message', '<cross-session-message', '<teammate-message', 'Another Claude session sent a message', '<task-notification', '[SYSTEM NOTIFICATION']
const rl = createInterface({ input: createReadStream(process.argv[2]), crlfDelay: Infinity })
const seen: Record<string, { rows: number; listed: number; heads: string[] }> = {}
const guards: Record<string, number> = {}
for await (const raw of rl) {
  let o: any
  try { o = JSON.parse(raw) } catch { continue }
  if (o?.type !== 'user') continue
  const c = o.message?.content
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('\n') : ''
  const w = WRAPPERS.find(x => text.includes(x))
  if (!w) continue
  const s = (seen[w] ??= { rows: 0, listed: 0, heads: [] })
  s.rows++
  // Which guard keeps the row out: the row flags, or the text.
  const flags = [o.isMeta && 'isMeta', o.isSidechain && 'isSidechain', o.isCompactSummary && 'compact', o.origin?.kind && `origin=${o.origin.kind}`].filter(Boolean).join(',') || 'no flags'
  const start = JSON.stringify(text.trimStart().slice(0, 40))
  const key = `${w} | ${flags} | starts ${start.slice(0, 30)}`
  guards[key] = (guards[key] ?? 0) + 1
  const listed = promptTextOf(o)
  if (listed !== undefined) {
    s.listed++
    if (s.heads.length < 4) s.heads.push(JSON.stringify(listed.slice(0, 110)))
  }
}
console.log('what keeps each out (wrapper | row flags | how the text starts): count')
for (const [k, n] of Object.entries(guards).sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${k}`)
for (const [w, s] of Object.entries(seen)) {
  console.log(`${w}: ${s.rows} rows, ${s.listed} listed as prompts`)
  for (const h of s.heads) console.log(`    ${h}`)
}
