import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FOOTNOTE_LABEL_MAX, footnoteOf, looksLikePrompt, numberFootnotes, numberRows, promptTextOf, unwrapQueued } from '../../plugin/hooks/core/prompts/prompt-rows.ts'

test('kept footnotes number by the prompt they follow', () => {
  const f = (uuid: string, after: string | null) => ({ uuid, after, kind: 'command' as const, label: '/x' })
  assert.deepEqual(numberFootnotes(['p1', 'p2'], [f('a', null), f('b', 'p1'), f('c', 'p1'), f('d', 'p2'), f('e', 'gone')]), [
    { n: 0, k: 1 },
    { n: 1, k: 1 },
    { n: 1, k: 2 },
    { n: 2, k: 1 },
    undefined,
  ])
})

const row = (content: unknown, extra: Record<string, unknown> = {}) => ({ type: 'user', uuid: 'f1', message: { role: 'user', content }, ...extra })

test('a slash command, a ! shell command and an interruption are footnotes', () => {
  assert.deepEqual(footnoteOf(row('<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args>keep it short</command-args>')), {
    kind: 'command',
    label: '/compact keep it short',
  })
  assert.deepEqual(footnoteOf(row('<bash-input>git status</bash-input>')), { kind: 'shell', label: '!git status' })
  assert.deepEqual(footnoteOf(row([{ type: 'text', text: '[Request interrupted by user for tool use]' }])), {
    kind: 'interrupted',
    label: 'Request interrupted by user for tool use',
  })
})

test('engine rows and outputs are not footnotes; a prompt is not a footnote', () => {
  assert.equal(footnoteOf(row('<local-command-stdout>done</local-command-stdout>')), undefined, 'output folds into its command')
  assert.equal(footnoteOf(row('<bash-stdout>ok</bash-stdout>')), undefined)
  assert.equal(footnoteOf(row('<task-notification>x</task-notification>')), undefined, 'not the person')
  assert.equal(footnoteOf(row('anything', { isMeta: true })), undefined)
  assert.equal(footnoteOf(row('summary', { isCompactSummary: true })), undefined)
  assert.equal(footnoteOf(row([{ type: 'tool_result', content: 'x' }])), undefined)
  assert.equal(footnoteOf(row('please fix the band')), undefined)
  assert.equal(footnoteOf({ type: 'assistant', message: { content: '<command-name>/x</command-name>' } }), undefined)
})

test('footnotes number N.k under the prompt before them and never shift prompt numbers', () => {
  const kinds = ['footnote', 'prompt', 'footnote', 'footnote', 'prompt', 'prompt', 'footnote'] as const
  assert.deepEqual(numberRows(kinds), [
    { n: 0, k: 1 },
    { n: 1, k: 0 },
    { n: 1, k: 1 },
    { n: 1, k: 2 },
    { n: 2, k: 0 },
    { n: 3, k: 0 },
    { n: 3, k: 1 },
  ])
  const promptsOnly = numberRows(['prompt', 'prompt', 'prompt'])
  const withFootnotes = numberRows(kinds).filter((_, i) => kinds[i] === 'prompt')
  assert.deepEqual(withFootnotes.map(r => r.n), promptsOnly.map(r => r.n))
})

const user = (content: unknown, extra: Record<string, unknown> = {}) => ({ type: 'user', uuid: 'u1', message: { role: 'user', content }, ...extra })

test('a typed prompt, as a string or as text blocks', () => {
  assert.equal(promptTextOf(user('Hello there')), 'Hello there')
  assert.equal(promptTextOf(user([{ type: 'text', text: 'Hello' }, { type: 'text', text: 'again' }])), 'Hello again')
})

test('a queued message stored as an attachment is a prompt', () => {
  const row = { type: 'attachment', uuid: 'a1', attachment: { type: 'queued_command', prompt: 'I have checked each on', humanTurn: true } }
  assert.equal(promptTextOf(row), 'I have checked each on')
})

test('other attachments are not prompts', () => {
  assert.equal(promptTextOf({ type: 'attachment', attachment: { type: 'nested_memory', prompt: 'x', humanTurn: true } }), undefined)
  assert.equal(promptTextOf({ type: 'attachment', attachment: { type: 'queued_command', prompt: 'x' } }), undefined)
})

test('tool results, meta and sidechain rows are not prompts', () => {
  assert.equal(promptTextOf(user([{ type: 'tool_result', tool_use_id: 't' }, { type: 'text', text: 'note' }])), undefined)
  assert.equal(promptTextOf(user('Hi', { isMeta: true })), undefined)
  assert.equal(promptTextOf(user('Hi', { isSidechain: true })), undefined)
  assert.equal(promptTextOf({ type: 'assistant', message: { content: 'Hi' } }), undefined)
})

test("the ! shell's rows, command echoes, interrupts and compaction summaries are not prompts", () => {
  for (const text of [
    '<bash-input> git status</bash-input>',
    '<bash-stdout>On branch main</bash-stdout>',
    '<bash-stderr>fatal: x</bash-stderr>',
    '<command-name>/bm-env</command-name>',
    '<command-message>bm-env</command-message>',
    '<local-command-stdout>ok</local-command-stdout>',
    '[Request interrupted by user]',
    '[Request interrupted by user for tool use]',
    'This session is being continued from a previous conversation that ran out of context.',
    '   ',
  ]) {
    assert.equal(looksLikePrompt(text), false, text)
    assert.equal(promptTextOf(user(text)), undefined, text)
  }
})

test('a compaction summary is not a prompt, by its flag before its wording', () => {
  assert.equal(promptTextOf(user('Any wording the engine chooses', { isCompactSummary: true })), undefined)
})

test("a background task's notification is not a prompt", () => {
  assert.equal(looksLikePrompt('<task-notification> <task-id>b046k200w</task-id> <status>completed</status>'), false)
})

test('notices queued into a running turn are not prompts (they arrive as the person\'s queued messages do)', () => {
  for (const text of [
    '[SYSTEM NOTIFICATION - NOT USER INPUT]\nThis is an automated background-task event',
    'Another Claude session sent a message while you were working:\n<agent-message from="x">',
    'Stop hook feedback:\n[Finish the foundations ...]',
  ]) assert.equal(looksLikePrompt(text), false, text)
  assert.equal(looksLikePrompt('Was the [SYSTEM NOTIFICATION] row a bug?'), true, 'mentioned in passing, still a prompt')
})

test("another agent's teammate message is not a prompt", () => {
  assert.equal(looksLikePrompt('<teammate-message teammate_id="x">hello</teammate-message>'), false)
})

test('a prompt that mentions those tags in passing is still a prompt', () => {
  assert.equal(looksLikePrompt('Why does <bash-input> show up in the list?'), true)
})

test('unwrapQueued strips the engine framing and keeps the words', () => {
  const rendered =
    '<system-reminder>\nThe user sent a new message while you were working:\nI have checked each on:{\n  a\n}\n\nThis is how Claude Code surfaces messages the user sends mid-turn — within the running turn.\n</system-reminder>'
  assert.equal(unwrapQueued(rendered), 'I have checked each on:{\n  a\n}')
})

test('unwrapQueued keeps the whole text when the framing is not recognised', () => {
  assert.equal(unwrapQueued('something else entirely'), 'something else entirely')
})

// A /loop firing is a plain user row carrying the slash command it runs, stamped
// `turnOrigin: "scheduled"` with the task's id (one conversation kept 337 of them as
// footnotes, 2026-10-15): the schedule's, not the person's.
const firing = (text: string) => ({ type: 'user', uuid: 'f', turnOrigin: 'scheduled', scheduledTaskId: '4e085769', message: { content: text } })

test("a scheduled firing is neither the person's prompt nor their footnote", () => {
  const cmd = '<command-message>obsidian-update</command-message> <command-name>/obsidian-update</command-name> <command-args>on the vault</command-args>'
  assert.equal(footnoteOf(firing(cmd)), undefined)
  assert.equal(promptTextOf(firing('check the build')), undefined)
  assert.equal(footnoteOf({ type: 'user', scheduledTaskId: '4e085769', message: { content: cmd } }), undefined)
  // The same command typed by the person is still a footnote.
  assert.deepEqual(footnoteOf({ type: 'user', message: { content: cmd } }), { kind: 'command', label: '/obsidian-update on the vault' })
})

test("a footnote's label is cut to FOOTNOTE_LABEL_MAX, ending in an ellipsis", () => {
  const args = 'x'.repeat(500)
  const fn = footnoteOf({ type: 'user', message: { content: `<command-name>/goal</command-name> <command-args>${args}</command-args>` } })!
  assert.equal(fn.label.length, FOOTNOTE_LABEL_MAX)
  assert.ok(fn.label.startsWith('/goal xxx'))
  assert.ok(fn.label.endsWith('…'))
  assert.equal(footnoteOf({ type: 'user', message: { content: '<bash-input>ls</bash-input>' } })!.label, '!ls')
})
