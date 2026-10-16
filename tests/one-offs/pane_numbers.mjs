import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
const { promptList } = await import('file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/prompts/prompt-store.ts')
const { looksLikePrompt } = await import('file:///C:/code/claude-projects/claude-bookmarks/plugin/hooks/core/prompts/prompt-rows.ts')
const store = JSON.parse(readFileSync(homedir() + '/.claude/plugins/store/bookmarks_inline-2b3395bbdcfb.json', 'utf8'))
const find = (o, k) => { if (o && typeof o === 'object') { for (const [kk, v] of Object.entries(o)) { if (kk === k) return v; const r = find(v, k); if (r) return r } } }
const kept = find(store, 'prompts:8f0f9b27-33fc-4054-806a-22a6d569dfb5')
const list = promptList(kept, [])
console.log('stored', kept.length, 'numbered by the pane', list.length)
for (const id of ['2f70cc65', '60721060', '4563ea40']) console.log(id, 'stored #' + (kept.findIndex(p => p.uuid.startsWith(id)) + 1), 'pane #' + (list.findIndex(p => p.uuid.startsWith(id)) + 1))
const dropped = kept.filter(p => !looksLikePrompt(p.head))
console.log('dropped', dropped.length); for (const p of dropped) console.log('  ', p.uuid.slice(0, 8), JSON.stringify(p.head.slice(0, 70)))
