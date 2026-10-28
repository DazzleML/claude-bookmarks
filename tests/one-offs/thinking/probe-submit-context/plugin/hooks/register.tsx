// Throwaway probe for claude-bookmarks unit 0 (design 2026-10-27__14-00-02, the bm: short reference).
// prompt.submit attaches a marker as `context`; a prompt holding REWRITE-ME is also rewritten.
// session.append records every row's door, uuid, type, isMeta, name and parentUuid-free facts,
// and whether its text carries a marker. The log is written to OUT after every event.
import type { Register } from 'claude-code'

const OUT = 'C:/code/claude-projects/claude-bookmarks/tests/one-offs/thinking/probe-submit-context/out/probe-log.json'
const MARK = 'BMPROBE-20261027-CTX'
const events: unknown[] = []

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(b => (b && typeof b === 'object' && 'text' in b && typeof (b as { text: unknown }).text === 'string') ? (b as { text: string }).text : '').join('\n')
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    const rewrite = e.text.includes('REWRITE-ME')
    const out = { ...e, ...(rewrite ? { text: e.text.replace('REWRITE-ME', 'REWRITTEN-BY-HOOK') } : {}), context: [...(e.context ?? []), `${MARK} for: ${e.text.slice(0, 40)}`] }
    events.push({ at: 'prompt.submit', text: e.text.slice(0, 80), hasCommand: !!e.command, isMeta: !!e.isMeta, rewrite })
    await $.fs.write(OUT, JSON.stringify(events, null, 2))
    const result = await next(out)
    events.push({ at: 'prompt.submit:after-next', result: JSON.stringify(result ?? null).slice(0, 200) })
    await $.fs.write(OUT, JSON.stringify(events, null, 2))
    return result
  })
  on('session.append', async ($, e, next) => {
    const text = textOf(e.message.content)
    events.push({ at: 'session.append', door: e.door, origin: JSON.stringify(e.origin).slice(0, 80), uuid: e.uuid, type: e.message.type, role: e.message.role, isMeta: !!e.message.isMeta, name: e.message.name, hasMark: text.includes(MARK), hasRewrite: text.includes('REWRITTEN-BY-HOOK'), head: text.slice(0, 60) })
    await $.fs.write(OUT, JSON.stringify(events, null, 2))
    return next(e)
  })
}
