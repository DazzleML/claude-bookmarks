// node tests/one-offs/thinking/lists-seed/seed.ts [--write]
// Seeds the first list, "What's left", on djdarcy's side, through the same core code the
// `lists` tool uses (core/lists/lists.ts): the tool registers at the plugin's next load, not at
// the hot reload that brought it in, so this session cannot call it (lists first-slice design,
// section 5's third fallback). Prints the file and page; writes them only with --write, and
// refuses to overwrite a lists file that already exists.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { applyListOp, emptyLists, listsBaseName, listsPage, serializeLists, type ListItem, type ListsFile } from '../../../../plugin/hooks/core/lists/lists.ts'
import { fnv1a64 } from '../../../../plugin/hooks/core/bookmarks/migrations.ts'
import { linkOf } from '../../../../plugin/hooks/handlers/lists.ts'

const SESSION = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
// The session's working folder: the pane in this session reads this project's lists.
const CWD = 'C:/code/claude-projects/dazzle-claude-plugins'
const ROOT = `${homedir().replace(/\\/g, '/')}/claude`
const PRIV = 'C:/code/claude-projects/claude-bookmarks/private/claude'
const NOW = Date.now()

const RECAP = { session: SESSION, uuid: 'c4c4cd98-5e27-44b2-9a84-ebe1dbe3180b' }
// The AskUserQuestion row whose link was refused (it draws under no id of its own): the landing fix's case.
const QUESTION_ROW = { session: SESSION, uuid: 'e92204f6-8a30-4c71-a595-0382a659fe39', part: 0, drawn: 'toolu_01KfMw78gwNy6HPRGBURwyhP' }
// djdarcy's closing answers (push: his; release: after the landing fix; repokit next), another AskUserQuestion row.
const ANSWERS = { session: SESSION, uuid: 'f1c069db-67bc-42e3-b6d6-cf200b57d957', part: 0, drawn: 'toolu_018mEs8Cw6HWZKenQS1A87z9' }

const items: Omit<ListItem, 'id' | 'addedAt'>[] = [
  { label: 'Push 0.7.5 to dev, then check CI', why: 'committed fd21704 and signed; yours to push (git -C C:/code/claude-projects/claude-bookmarks push)', place: ANSWERS, by: 'claude' },
  { label: 'Commit the landing fix', why: 'a link to a row Claude Code draws no id for lands on its message; built, core 591 / kit 181, red-green 6 of 6; uncommitted', place: QUESTION_ROW, by: 'claude' },
  { label: 'The release (0.7.0 to 0.7.5 and the fix)', why: 'dev to main in a worktree, a signed tag, notes on places, links to any row, search, the fold; #37 closes', place: ANSWERS, by: 'claude' },
  { label: 'Pull git-repokit-common 0.4.2', why: 'a subtree pull makes signed commits, so when you can sign; then --where and the private-file block', link: 'https://github.com/DazzleTools/git-repokit-common/issues/16', by: 'claude' },
  { label: "The prompts pane's views (#40)", why: 'with views per tab and finer tool tabs (shell, search, files)', link: 'https://github.com/DazzleML/claude-bookmarks/issues/40', by: 'claude' },
  { label: 'One pane for prompts and search', why: 'a design, after the views have been used a while', link: `${PRIV}/notes/ideas/2026-10-26__17-41-28__both_one-pane-for-prompts-and-search-keeping-what-each-is-good-at.md`, by: 'claude' },
  { label: 'Lists (#45): review this first slice', why: 'this pane; the design is lists-the-first-slice', link: `${PRIV}/2026-10-26__22-25-54__dev-workflow-process__lists-the-first-slice.md`, by: 'claude' },
  { label: "The docs unit's leftovers", why: "the README's settings to their own page; /bmlinks into the plugin, its name settled first", link: `${PRIV}/notes/ideas/2026-10-26__17-41-30__both_bmlinks-ships-in-the-plugin-and-its-name.md`, by: 'claude' },
  { label: 'The smaller open items', why: "a colour per highlight, reveal thinking from search, #20's remainder, the history-patch question", place: RECAP, words: "What's left, in order", by: 'claude' },
]

let f: ListsFile = emptyLists('dazzle-claude-plugins', CWD, 'bookmarks 0.7.5 (seed)', NOW)
const step = (r: ReturnType<typeof applyListOp>) => {
  if (!r.ok) throw new Error(r.error)
  f = r.file
  return r
}
const list = step(applyListOp(f, { op: 'create', name: "What's left", owner: 'user' }, NOW)).list!
for (const item of items) step(applyListOp(f, { op: 'add', list: list.id, item }, NOW))

const dir = `${ROOT}/bookmarks/lists`
const base = listsBaseName(CWD, undefined, fnv1a64)
const json = `${dir}/${base}.json`
const page = listsPage(f, `${base}.json`, i => linkOf(i, ROOT))
console.log(json)
console.log(page)
if (process.argv.includes('--write')) {
  if (existsSync(json)) throw new Error(`${json} exists; not overwritten (${readFileSync(json, 'utf8').length} bytes)`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(json, serializeLists(f))
  writeFileSync(`${dir}/${base}.md`, page)
  console.log('written')
}
