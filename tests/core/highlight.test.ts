import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colorSplit, plainMarkdown, snippetOf, tagMarksMarkdown, tagMarksPlain } from '../../plugin/hooks/core/highlight.ts'

test('snippetOf: the first non-blank line, trimmed, at most 120 characters', () => {
  assert.equal(snippetOf('\n\n  the words  \nmore'), 'the words')
  assert.equal(snippetOf('x'.repeat(200)).length, 120)
  assert.equal(snippetOf('   \n  '), '')
})

test('plainMarkdown strips bold, code and link markup the rendered reply has lost', () => {
  assert.equal(plainMarkdown('see **this** and `that` and [a link](http://x)'), 'see this and that and a link')
  assert.equal(plainMarkdown('__under__'), 'under')
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

test('a prompt row: the «a» tag in front of the words; untouched when nothing matches', () => {
  const marks = [['a', { snippet: 'two', head: 'h' }], ['b', { snippet: 'nine', head: 'h' }]] as const
  assert.equal(tagMarksPlain('one two three', marks), 'one «a» two three')
  assert.equal(tagMarksPlain('one three', marks), 'one three')
})

test('a reply: bold «a» words, else a quoted line on top collecting the unmatched marks', () => {
  const marks = [['a', { snippet: 'two', head: 'h' }], ['b', { snippet: 'bold *x*', head: 'head b' }], ['c', { head: 'head c' }]] as const
  assert.equal(tagMarksMarkdown('one two three', marks), '> **«b» bold *x*  «c» head c**\n\none **«a» two** three')
  assert.equal(tagMarksMarkdown('one two', [['a', { snippet: 'two', head: 'h' }]]), 'one **«a» two**')
})
