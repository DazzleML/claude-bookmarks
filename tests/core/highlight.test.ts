import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colorSplit, firstColorSplit, markedLineMarkdown, plainMarkdown, snippetOf, tagMarksMarkdown, tagMarksPlain } from '../../plugin/hooks/core/marks/highlight.ts'

// The render hooks ask for the first mark's split (U60): none on the row, or a mark with no
// snippet, draws nothing special; otherwise the first mark's words decide the line.
test('firstColorSplit: the first mark on the row, or nothing', () => {
  assert.equal(firstColorSplit('a line\nmarked words here\nmore', []), undefined)
  assert.equal(firstColorSplit('a line\nmarked words here\nmore', [['a', {}]]), undefined)
  const c = firstColorSplit('a line\nmarked words here\nmore', [['a', { snippet: 'marked words' }], ['b', { snippet: 'more' }]])!
  assert.equal(c.letter, 'a')
  assert.equal(c.snippet, 'marked words')
})

test('snippetOf: the first non-blank line, trimmed, at most 120 characters', () => {
  assert.equal(snippetOf('\n\n  the words  \nmore'), 'the words')
  assert.equal(snippetOf('x'.repeat(200)).length, 120)
  assert.equal(snippetOf('   \n  '), '')
})

test('plainMarkdown strips bold, code and link markup the rendered reply has lost', () => {
  assert.equal(plainMarkdown('see **this** and `that` and [a link](http://x)'), 'see this and that and a link')
  assert.equal(plainMarkdown('__under__'), 'under')
})

// A reading mark set on "fixed what those files contain: one register" (the rendered
// text) found no line in a reply whose source read `files *contain*: one register`, so the
// mark was drawn as the quoted line at the top of the reply instead of on its paragraph
// (djdarcy, 2026-10-20). Italics are stripped like bold; a lone `*` or an `_` inside a
// word is not emphasis and stays.
test('plainMarkdown strips *italics* and _italics_, not a lone * or an underscore inside a word', () => {
  assert.equal(plainMarkdown('fixed what those files *contain*: one register'), 'fixed what those files contain: one register')
  assert.equal(plainMarkdown('_italic_ at the start, and _this_ too'), 'italic at the start, and this too')
  assert.equal(plainMarkdown('a *b* c **d** e'), 'a b c d e')
  assert.equal(plainMarkdown('2 * 3 * 4'), '2 * 3 * 4')
  assert.equal(plainMarkdown('a_001 and snake_case_name stay'), 'a_001 and snake_case_name stay')
  assert.equal(plainMarkdown('`*21` then Enter'), '*21 then Enter')
})

test('colorSplit finds a line whose only markup is italics', () => {
  const text = 'intro\n\nThe 0.5.x line (twelve commits on `dev`) fixed what those files *contain*: one register per conversation\n\nafter'
  const c = colorSplit(text, '`', 'fixed what those files contain: one register')!
  assert.notEqual(c, undefined)
  assert.equal(c.pre, 'The 0.5.x line (twelve commits on dev) ')
  assert.equal(c.post, ' per conversation')
  assert.equal(c.after, 'after')
})

test('colorSplit finds the line, splits around it and keeps the paragraph gaps', () => {
  const text = 'intro line\n\nthe **marked** words here\n\nafter one\nafter two'
  const c = colorSplit(text, 'a', 'marked words')!
  assert.equal(c.before, 'intro line')
  assert.equal(c.pre, 'the ')
  assert.equal(c.snippet, 'marked words')
  assert.equal(c.post, ' here')
  assert.equal(c.after, 'after one\nafter two')
  assert.equal(c.letter, 'a')
  assert.equal(c.gapAbove, true)
  assert.equal(c.gapBelow, true)
})

test('colorSplit: no gaps when the neighbours are text, none above the first line', () => {
  const c = colorSplit('marked first\nnext', 'b', 'marked')!
  assert.equal(c.before, '')
  assert.equal(c.gapAbove, false)
  assert.equal(c.gapBelow, false)
  assert.equal(c.after, 'next')
})

test('colorSplit declines: no snippet, no match, inside a code fence, remainder too long', () => {
  assert.equal(colorSplit('a\nb', 'a', undefined), undefined)
  assert.equal(colorSplit('a\nb', 'a', 'zzz'), undefined)
  assert.equal(colorSplit('```\ncode line\n```\nout', 'a', 'code line'), undefined)
  assert.notEqual(colorSplit('```\ncode\n```\nout line', 'a', 'out line'), undefined)
  assert.equal(colorSplit(`marked\n${'x'.repeat(9001)}`, 'a', 'marked'), undefined)
})

// A table row split out on its own leaves the rows after it without their header, so they
// draw as raw `| ... |` text (djdarcy, 2026-10-15, a mark on row 2 of a reply's table).
// The row is declined, as a fenced line is: the reply falls back to the bold «a» form.
test('colorSplit declines a table row; a line after the table still splits', () => {
  const table = 'Intro\n\n| # | Criterion |\n|---|---|\n| 1 | core has no $ |\n| 2 | a fake $ drives the flows |\n\nAfter the table'
  assert.equal(colorSplit(table, 'g', 'a fake $ drives the flows'), undefined)
  assert.equal(colorSplit(table, 'g', 'Criterion'), undefined)
  assert.notEqual(colorSplit(table, 'g', 'After the table'), undefined)
  assert.notEqual(colorSplit(table, 'g', 'Intro'), undefined)
})

test('a prompt row: the «a» tag in front of the words; untouched when nothing matches', () => {
  const marks = [['a', { snippet: 'two', head: 'h' }], ['b', { snippet: 'nine', head: 'h' }]] as const
  assert.equal(tagMarksPlain('one two three', marks), 'one «a» two three')
  assert.equal(tagMarksPlain('one three', marks), 'one three')
})

test('a reply: bold «a» words, else a quoted line on top collecting the unmatched marks', () => {
  const marks = [['a', { snippet: 'two', head: 'h' }], ['b', { snippet: 'bold *x*', head: 'head b' }], ['c', { head: 'head c' }]] as const
  assert.equal(tagMarksMarkdown('one two three', marks), '> **«b» bold *x*  «c» head c**\n\none **«a» two** three')
  assert.equal(tagMarksMarkdown('one two', [['a', { snippet: 'two', head: 'h' }]]), 'one **«a» two**')
  // Words that carry markup characters are never bolded in place, even when present: the
  // quoted line instead (mutation sweep 2026-10-12: the earlier case never had them present).
  assert.equal(tagMarksMarkdown('see `code` here', [['a', { snippet: '`code`', head: 'h' }]]), '> **«a» `code`**\n\nsee `code` here')
})

// Slice B (2026-10-21): a marked line that carries a link is drawn as Markdown, so the split
// keeps the raw line and markedLineMarkdown says how to draw it.
test('colorSplit keeps the marked line as written, beside its plain parts', () => {
  const c = colorSplit('a\n\nsee [the docs](https://x.y/d) for the rest\n\nz', 'a', 'for the rest')!
  assert.equal(c.raw, 'see [the docs](https://x.y/d) for the rest')
  assert.equal(c.pre, 'see the docs ')
})

test('markedLineMarkdown: a link line is drawn as markdown with the words tagged; no link, no markdown', () => {
  const split = (line: string, snippet: string) => colorSplit(`a\n\n${line}\n\nz`, 'a', snippet)!
  assert.equal(markedLineMarkdown(split('see [the docs](https://x.y/d) for the rest', 'for the rest')), 'see [the docs](https://x.y/d) **«a» for the rest**')
  // The words are a link's own text: tagged inside the label, so the link stays a link.
  assert.equal(markedLineMarkdown(split('see [the docs](https://x.y/d) for the rest', 'the docs')), 'see [**«a» the docs**](https://x.y/d) for the rest')
  // The words' first literal occurrence in the raw line lies inside a link's href (the plain line
  // has them later, as text): tagging there would break the link, so the band alone marks the line.
  // (Words that straddle a bracket are never literal in the raw line, so they land here too, untagged.)
  assert.equal(markedLineMarkdown(split('see [the docs](https://x.y/d) at x.y now', 'x.y')), 'see [the docs](https://x.y/d) at x.y now')
  // Words with a markup character of their own (an underscore inside a word survives the plain form) are never tagged.
  assert.equal(markedLineMarkdown(split('see [the docs](https://x.y/d) for a_001', 'a_001')), 'see [the docs](https://x.y/d) for a_001')
  // Words the plain line has but the raw line does not hold literally (markup between them): untagged, under the band.
  assert.equal(markedLineMarkdown(split('see [the docs](https://x.y/d) and `code` here', 'and code here')), 'see [the docs](https://x.y/d) and `code` here')
  // Two links on the line: each is its own span. Words whose first occurrence sits in the first
  // link's href are inside that link, not between the two (a greedy link match would say otherwise).
  assert.equal(markedLineMarkdown(split('see [alpha](https://x.y/u1) and [beta](https://x.y/u2) at u1 now', 'u1')), 'see [alpha](https://x.y/u1) and [beta](https://x.y/u2) at u1 now')
  assert.equal(markedLineMarkdown(split('see [alpha](https://x.y/u1) and [beta](https://x.y/u2) at u1 now', 'and')), 'see [alpha](https://x.y/u1) **«a» and** [beta](https://x.y/u2) at u1 now')
  // Words that end exactly where a link begins, or begin where one ends, are outside it: tagged.
  assert.equal(markedLineMarkdown(split('read this:[the docs](https://x.y/d)', 'read this:')), '**«a» read this:**[the docs](https://x.y/d)')
  assert.equal(markedLineMarkdown(split('[the docs](https://x.y/d), then rest', ', then rest')), '[the docs](https://x.y/d)**«a» , then rest**')
  // No link: drawn as Text, as before.
  assert.equal(markedLineMarkdown(split('see the docs for the rest', 'for the rest')), undefined)
})
