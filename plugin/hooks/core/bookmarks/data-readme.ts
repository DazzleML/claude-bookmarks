// The README the plugin leaves in its own data folder (unit 12 of the record-format goal;
// the data design's "one sentence of where things live"): a person who finds
// `~/claude/bookmarks/` in a file manager, a backup, or a vault should know what each
// folder holds, which of it is theirs (authored, to keep and back up) and which the plugin
// rebuilds (cache), without opening the plugin's docs. The text is generated from one place
// so it never drifts from the folders the code writes; a start rewrites it when the writer
// changed, and leaves it alone otherwise.
//
// Pure: the handler (handlers/bookmarks.ts ensureReadme) decides whether to write.

/** The first line of the file; the writer's name and version sit in it, so a start can tell whether to rewrite. */
export const README_MARK = '<!-- claude-bookmarks data folder; this file is written by the plugin and rewritten when it changes; edits here are overwritten -->'

/** What lives under the data root, in one table: path, who writes it, authored or cache, what happens without it. */
export const DATA_LAYOUT: readonly { path: string; what: string; kind: 'authored' | 'cache' | 'backup' | 'generated' }[] = [
  { path: 'sessions/<session id>.json', what: 'the bookmark file of one conversation: its bookmarks, marks and pins, a readable JSON register', kind: 'authored' },
  { path: 'sessions/<session id>.json.bak', what: 'the same file as it was before the last change', kind: 'backup' },
  { path: 'sessions/<session id>/<uuid8>.md', what: 'one note per bookmarked message: the text, every field in its front matter, your Notes section; an Obsidian note', kind: 'authored' },
  { path: 'sessions/<session id>.state.json', what: 'where each reader stands with each prompt (a feature to come; the shape is fixed)', kind: 'authored' },
  { path: 'sessions/index.json, sessions/INDEX.md', what: 'every conversation with bookmarks, as data and as a page; rebuilt from the bookmark files', kind: 'generated' },
  { path: 'backups/<stamp>__v<from>-to-v<to>__<writer>__<sid8>/', what: 'the originals of one format migration, with a manifest.json listing them with hashes; kept', kind: 'backup' },
  { path: 'backups/<stamp>__pre-0.5__snapshot/', what: 'a plain copy of sessions/ taken once before the first migration on this machine', kind: 'backup' },
  { path: 'lists/<project>.json', what: 'the lists of one project (the folder Claude Code runs in): named, ordered lists of places, yours and Claude\'s, across its conversations', kind: 'authored' },
  { path: 'lists/<project>.json.bak', what: 'the same file as it was before the last change', kind: 'backup' },
  { path: 'lists/<project>.md', what: 'the same lists as a page, each item a link; rebuilt from the lists file', kind: 'generated' },
  { path: 'prompttext/', what: 'the text of your prompts the prompts list filters, in pieces; read again from the transcript when missing', kind: 'cache' },
  { path: 'replytext/', what: 'the text of Claude\'s replies, newest first and up to 4 MB, for finding the message a link names; read again from the transcript when missing', kind: 'cache' },
  { path: 'transcript/', what: 'where each message sits in the conversation file, so the plugin\'s read of it resumes instead of starting over; rebuilt when missing', kind: 'cache' },
  { path: 'places/<session id>/', what: 'every row of one conversation (prompts, replies, tool calls and their output, agents\' messages) and its text, for search and for links to any row; written the first time you search or link to such a row; rebuilt when missing', kind: 'cache' },
  { path: 'debug/<session id>.log', what: 'the plugin\'s log, one file per conversation', kind: 'cache' },
  { path: 'README.md', what: 'this file', kind: 'generated' },
]

const KIND_WORDS: Record<(typeof DATA_LAYOUT)[number]['kind'], string> = {
  authored: 'authored -- yours; back it up',
  backup: 'backup -- a copy the plugin took; keep it until you no longer need to go back',
  cache: 'cache -- rebuilt when missing',
  generated: 'generated -- rewritten by the plugin; edits are overwritten',
}

/**
 * The README's prose lives in the plugin's own folder, not here (djdarcy, 2026-10-20: text the
 * plugin writes to disk is a file a person can edit; a missing file is a bug, never filled from
 * code). The template's three placeholders: `{{mark}}` (README_MARK, kept in code because
 * readmeNeedsWrite matches on it), `{{writer}}`, `{{layout_table}}` (the rows of DATA_LAYOUT).
 */
export const README_TEMPLATE = 'templates/data-readme.md'

/** The layout as table rows, joined with the template's own newline (a CRLF checkout keeps its endings). */
export function layoutTable(newline = '\n'): string {
  return DATA_LAYOUT.map(e => `| \`${e.path}\` | ${e.what} | ${KIND_WORDS[e.kind]} |`).join(newline)
}

/** The README's text for `writer` (the plugin's name and version), rendered from `template` (the file README_TEMPLATE names). Deterministic for a writer and a template; a replacement is a function, so a `$` in a value is never special. */
export function dataReadme(writer: string, template: string): string {
  const newline = template.includes('\r\n') ? '\r\n' : '\n'
  return template
    .replace(/\{\{mark\}\}/g, () => README_MARK)
    .replace(/\{\{writer\}\}/g, () => writer)
    .replace(/\{\{layout_table\}\}/g, () => layoutTable(newline))
}

/** Whether a start should (re)write the README: missing, or written by another writer. */
export function readmeNeedsWrite(existing: string | undefined, writer: string): boolean {
  if (existing === undefined) return true
  if (!existing.startsWith(README_MARK)) return true
  return !existing.includes(`<!-- writer: ${writer} -->`)
}
