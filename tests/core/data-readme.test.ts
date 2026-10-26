// node --test tests/core/data-readme.test.ts
// The README the plugin writes into its data folder (unit 12 of the record-format goal):
// one table of what lives there and which of it is authored, cache, backup or generated;
// rewritten only when the writer changed. Since slice C (2026-10-21) the prose is the
// plugin's template file, plugin/templates/data-readme.md, and the render is pure over
// (writer, template); the fixture is the text the code used to produce, byte for byte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DATA_LAYOUT, dataReadme, layoutTable, README_MARK, README_TEMPLATE, readmeNeedsWrite } from '../../plugin/hooks/core/bookmarks/data-readme.ts'

const lf = (s: string) => s.replace(/\r\n/g, '\n')
const TEMPLATE = readFileSync(new URL(`../../plugin/${README_TEMPLATE}`, import.meta.url), 'utf8')
const FIXTURE = readFileSync(new URL('./fixtures/data-readme__writer-0.6.5.md', import.meta.url), 'utf8')

test('the real template renders exactly the README the code used to produce (the fixture, 0.6.5)', () => {
  assert.equal(lf(dataReadme('claude-bookmarks 0.6.5', TEMPLATE)), lf(FIXTURE))
  // The prose is the template's, not the code's.
  const source = readFileSync(new URL('../../plugin/hooks/core/bookmarks/data-readme.ts', import.meta.url), 'utf8')
  assert.ok(!source.includes('What to back up'), 'the README prose has left the TypeScript file')
})

test('the README names every path of the layout with its kind, says what to back up, and is deterministic for a writer', () => {
  const md = lf(dataReadme('claude-bookmarks 0.5.12', TEMPLATE))
  assert.ok(md.startsWith(`${README_MARK}\n<!-- writer: claude-bookmarks 0.5.12 -->\n`))
  for (const e of DATA_LAYOUT) assert.ok(md.includes(`| \`${e.path}\` |`), e.path)
  assert.ok(md.includes('`sessions/<session id>.json` | the bookmark file of one conversation') && md.includes('| authored -- yours; back it up |'))
  assert.ok(md.includes('`prompttext/` |') && md.includes('| cache -- rebuilt when missing |'))
  assert.ok(md.includes('`backups/<stamp>__pre-0.5__snapshot/`'))
  assert.ok(md.includes('## What to back up'))
  assert.ok(md.includes('this folder is unaffected'), 'the reinstall sentence')
  assert.ok(md.includes('/bm-check'))
  assert.equal(dataReadme('claude-bookmarks 0.5.12', TEMPLATE), dataReadme('claude-bookmarks 0.5.12', TEMPLATE))
  assert.notEqual(dataReadme('claude-bookmarks 0.6.0', TEMPLATE), dataReadme('claude-bookmarks 0.5.12', TEMPLATE))
  // Every layout entry has a kind the table can word.
  assert.ok(DATA_LAYOUT.every(e => ['authored', 'cache', 'backup', 'generated'].includes(e.kind)))
  assert.ok(DATA_LAYOUT.some(e => e.path === 'README.md'))
})

test('the layout names every folder the plugin writes under its data root', () => {
  // The whole-conversation loader (0.6.18) writes replytext/ and transcript/; 0.6.18 to 0.6.28
  // shipped a data README that did not list them. The place reader (0.7.3) writes places/.
  for (const folder of ['sessions/', 'backups/', 'prompttext/', 'replytext/', 'transcript/', 'places/', 'debug/']) {
    assert.ok(DATA_LAYOUT.some(e => e.path.startsWith(folder)), folder)
  }
})

test('the render substitutes the three placeholders and nothing else; the table takes the template\'s own newline', () => {
  assert.equal(dataReadme('w 1', 'a {{writer}} b {{writer}}'), 'a w 1 b w 1')
  assert.equal(dataReadme('w', '{{mark}}'), README_MARK)
  assert.equal(dataReadme('w', '{{mark}}|{{mark}}'), `${README_MARK}|${README_MARK}`, 'every occurrence, like the writer')
  assert.equal(dataReadme('w', 'plain text, no placeholders $& {{other}}'), 'plain text, no placeholders $& {{other}}')
  assert.equal(dataReadme('a $& b', '{{writer}}'), 'a $& b', 'a replacement is never a pattern')
  // A CRLF template: the rows are separated by CRLF too (the literal, not the function under test).
  const crlf = dataReadme('w', 'x\r\n{{layout_table}}\r\ny')
  assert.ok(crlf.startsWith('x\r\n| ') && crlf.endsWith(' |\r\ny'))
  assert.equal(crlf.split(' |\r\n| ').length, DATA_LAYOUT.length, 'every row boundary is CRLF')
  assert.ok(!crlf.includes(' |\n| '), 'no bare LF between rows')
  assert.equal(layoutTable().split('\n').length, DATA_LAYOUT.length)
})

test('a start rewrites the README when it is missing, foreign, or from another writer, and leaves this writer\'s alone', () => {
  const w = 'claude-bookmarks 0.5.12'
  assert.equal(readmeNeedsWrite(undefined, w), true)
  assert.equal(readmeNeedsWrite('# my own notes about this folder\n', w), true, 'a file that is not ours is replaced: the mark says so in its first line')
  assert.equal(readmeNeedsWrite(dataReadme('claude-bookmarks 0.5.11', TEMPLATE), w), true)
  assert.equal(readmeNeedsWrite(dataReadme(w, TEMPLATE), w), false)
  assert.equal(readmeNeedsWrite(dataReadme(w, TEMPLATE) + '\nedited below\n', w), false, 'an edit below does not trigger a rewrite until the writer changes')
})
