// node --test tests/core/data-readme.test.ts
// The README the plugin writes into its data folder (unit 12 of the record-format goal):
// one table of what lives there and which of it is authored, cache, backup or generated;
// rewritten only when the writer changed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DATA_LAYOUT, dataReadme, README_MARK, readmeNeedsWrite } from '../../plugin/hooks/core/bookmarks/data-readme.ts'

test('the README names every path of the layout with its kind, says what to back up, and is deterministic for a writer', () => {
  const md = dataReadme('claude-bookmarks 0.5.12')
  assert.ok(md.startsWith(`${README_MARK}\n<!-- writer: claude-bookmarks 0.5.12 -->\n`))
  for (const e of DATA_LAYOUT) assert.ok(md.includes(`| \`${e.path}\` |`), e.path)
  assert.ok(md.includes('`sessions/<session id>.json` | the bookmark file of one conversation') && md.includes('| authored -- yours; back it up |'))
  assert.ok(md.includes('`prompttext/` |') && md.includes('| cache -- rebuilt when missing |'))
  assert.ok(md.includes('`backups/<stamp>__pre-0.5__snapshot/`'))
  assert.ok(md.includes('## What to back up'))
  assert.ok(md.includes('this folder is unaffected'), 'the reinstall sentence')
  assert.ok(md.includes('/bm-check'))
  assert.equal(dataReadme('claude-bookmarks 0.5.12'), md)
  assert.notEqual(dataReadme('claude-bookmarks 0.6.0'), md)
  // Every layout entry has a kind the table can word.
  assert.ok(DATA_LAYOUT.every(e => ['authored', 'cache', 'backup', 'generated'].includes(e.kind)))
  assert.ok(DATA_LAYOUT.some(e => e.path === 'README.md'))
})

test('a start rewrites the README when it is missing, foreign, or from another writer, and leaves this writer\'s alone', () => {
  const w = 'claude-bookmarks 0.5.12'
  assert.equal(readmeNeedsWrite(undefined, w), true)
  assert.equal(readmeNeedsWrite('# my own notes about this folder\n', w), true, 'a file that is not ours is replaced: the mark says so in its first line')
  assert.equal(readmeNeedsWrite(dataReadme('claude-bookmarks 0.5.11'), w), true)
  assert.equal(readmeNeedsWrite(dataReadme(w), w), false)
  assert.equal(readmeNeedsWrite(dataReadme(w) + '\nedited below\n', w), false, 'an edit below does not trigger a rewrite until the writer changes')
})
