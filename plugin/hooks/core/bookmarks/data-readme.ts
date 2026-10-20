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
  { path: 'prompttext/', what: 'the text of your prompts the prompts list filters, in pieces; read again from the transcript when missing', kind: 'cache' },
  { path: 'debug/<session id>.log', what: 'the plugin\'s log, one file per conversation', kind: 'cache' },
  { path: 'README.md', what: 'this file', kind: 'generated' },
]

const KIND_WORDS: Record<(typeof DATA_LAYOUT)[number]['kind'], string> = {
  authored: 'authored -- yours; back it up',
  backup: 'backup -- a copy the plugin took; keep it until you no longer need to go back',
  cache: 'cache -- rebuilt when missing',
  generated: 'generated -- rewritten by the plugin; edits are overwritten',
}

/** The README's text for `writer` (the plugin's name and version). Deterministic for a writer. */
export function dataReadme(writer: string): string {
  const lines = [
    `${README_MARK}`,
    `<!-- writer: ${writer} -->`,
    '',
    '# Your bookmarks',
    '',
    'This folder is where the claude-bookmarks plugin for Claude Code keeps what you make in it: bookmarks, marks, pins and the notes that go with them. It is yours, in your own folder and never under Claude Code\'s own configuration folder, which Claude Code cleans. The plugin reads and writes here; nothing else is needed to read it -- the JSON is plain, the notes are Markdown, and `sessions/INDEX.md` is a map of all of it that opens in Obsidian or any Markdown viewer.',
    '',
    '## What is here',
    '',
    '| Path | What | Kind |',
    '|---|---|---|',
    ...DATA_LAYOUT.map(e => `| \`${e.path}\` | ${e.what} | ${KIND_WORDS[e.kind]} |`),
    '',
    '## What to back up',
    '',
    'Everything under `sessions/` is authored: the bookmark files and the notes are what you and Claude made, and nothing rebuilds them. `backups/` holds the plugin\'s own copies from format migrations; keep it as long as you might want to go back. `prompttext/` and `debug/` are caches: deleting them loses nothing you cannot get back. The index and this file are generated.',
    '',
    '## Formats',
    '',
    'Each bookmark file carries a `version`. A newer plugin migrates an older file at the start of a conversation, after copying the original into a run folder under `backups/`; an older plugin leaves a newer file read-only rather than write it. `/bm-check` inside Claude Code reports the state of every file here without changing anything.',
    '',
    'A reinstall of the plugin under another marketplace name starts Claude Code\'s plugin store afresh and resets the plugin\'s `/config` options; this folder is unaffected.',
    '',
    `Written by ${writer}. Documentation: https://github.com/DazzleML/claude-bookmarks/blob/main/docs/usage.md`,
    '',
  ]
  return lines.join('\n')
}

/** Whether a start should (re)write the README: missing, or written by another writer. */
export function readmeNeedsWrite(existing: string | undefined, writer: string): boolean {
  if (existing === undefined) return true
  if (!existing.startsWith(README_MARK)) return true
  return !existing.includes(`<!-- writer: ${writer} -->`)
}
