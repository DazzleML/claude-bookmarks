import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUTOMATED_ORIGINS, FOOTNOTE_LABEL_MAX, classifyAppend, footnoteOf, looksLikePrompt, numberFootnotes, numberRows, promptTextOf, unwrapQueued, type AppendEvent } from '../../plugin/hooks/core/prompts/prompt-rows.ts'

// What session.append makes of a row (the sorter moved out of register.tsx, U60): a row to
// keep, the prompt's text for the filter, a footnote, or nothing.
const appended = (over: Partial<AppendEvent> & { text?: string }): AppendEvent => ({
  uuid: 'u-1',
  door: 'prompt',
  origin: { kind: 'user' },
  message: { type: 'user', content: [{ type: 'text', text: over.text ?? 'a typed prompt' }] },
  ...over,
})

test('classifyAppend: a typed prompt is a row with its whole text kept for the filter', () => {
  const r = classifyAppend(appended({ text: 'a typed prompt, kept whole' }))
  assert.deepEqual(r.row, { uuid: 'u-1', door: 'prompt', head: 'a typed prompt, kept whole', text: 'a typed prompt, kept whole' })
  assert.equal(r.promptText, 'a typed prompt, kept whole')
  assert.equal(r.footnote, undefined)
})

test('classifyAppend: a queued attachment is a prompt, its text unwrapped', () => {
  const wrapped = '<system-reminder>\nThe user sent a new message while you were working:\nwhile you work\n\nThis is how Claude Code surfaces messages the user sends mid-turn.\n</system-reminder>'
  const r = classifyAppend(appended({ door: 'attachment', origin: { kind: 'engine' }, message: { type: 'attachment', name: 'queued_command', content: [{ type: 'text', text: wrapped }] } }))
  assert.equal(r.row?.door, 'prompt')
  assert.equal(r.row?.text, 'while you work')
  assert.equal(r.promptText, 'while you work')
  assert.equal(r.footnote, undefined)
})

test('classifyAppend: an automated origin, an agent row and a meta row are nothing', () => {
  for (const kind of AUTOMATED_ORIGINS) assert.deepEqual(classifyAppend(appended({ origin: { kind } })), {}, kind)
  assert.deepEqual(classifyAppend(appended({ agentId: 'agent-7' })), {})
  assert.deepEqual(classifyAppend(appended({ message: { type: 'user', isMeta: true, content: [{ type: 'text', text: 'meta' }] } })), {})
})

test('classifyAppend: a response is a row with no prompt text and no footnote; a slash command is a footnote only', () => {
  const r = classifyAppend(appended({ door: 'response', origin: { kind: 'engine' }, message: { type: 'assistant', content: [{ type: 'text', text: 'a reply' }] } }))
  assert.equal(r.row?.door, 'response')
  assert.equal(r.promptText, undefined)
  assert.equal(r.footnote, undefined)
  const f = classifyAppend(appended({ text: '<command-name>/goal</command-name> <command-args>build it</command-args>' }))
  assert.equal(f.row, undefined)
  assert.deepEqual(f.footnote, { kind: 'command', label: '/goal build it' })
})

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

// 2026-10-23: the transcript held 56 footnotes the reader found, and two shapes it missed.
// Built-in commands (/goal clear, /rename, /branch, /fork, /cd, /feedback) are `system` rows
// with subtype `local_command`; and setting a goal leaves no command row at all, only the
// engine's queued "Goal set: <condition>" from `auto-continuation` (8 in this transcript).
const systemCommand = (content: string, extra: Record<string, unknown> = {}) => ({ type: 'system', subtype: 'local_command', uuid: 's1', content, ...extra })
const goalQueued = (prompt: string, over: Record<string, unknown> = {}) => ({
  type: 'attachment',
  uuid: 'g1',
  attachment: { type: 'queued_command', prompt, commandMode: 'prompt', origin: { kind: 'auto-continuation' }, ...over },
})

test('a built-in command written as a system row is a footnote; its output row is not', () => {
  const cmd = '<command-name>/goal</command-name>\n            <command-message>goal</command-message>\n            <command-args>clear</command-args>'
  assert.deepEqual(footnoteOf(systemCommand(cmd)), { kind: 'command', label: '/goal clear' })
  assert.deepEqual(footnoteOf(systemCommand('<command-name>/rename</command-name> <command-message>rename</command-message> <command-args>my session</command-args>')), { kind: 'command', label: '/rename my session' })
  assert.equal(footnoteOf(systemCommand('<local-command-stdout>Goal cleared: x</local-command-stdout>')), undefined, 'the output folds into its command')
  assert.equal(footnoteOf({ ...systemCommand(cmd), subtype: 'informational' }), undefined, 'only local_command rows')
  assert.equal(footnoteOf(systemCommand(cmd, { isMeta: true })), undefined)
  assert.equal(footnoteOf(systemCommand(cmd, { isSidechain: true })), undefined)
})

test('a goal the person set is a /goal footnote, from the engine\'s queued "Goal set:" message', () => {
  assert.deepEqual(footnoteOf(goalQueued('Goal set: Make it so.\n\nRecord: x.md')), { kind: 'command', label: '/goal Make it so. Record: x.md' })
  assert.equal(footnoteOf(goalQueued('another continuation the engine queued')), undefined)
  assert.equal(footnoteOf(goalQueued('Goal set: typed by hand', { humanTurn: true, origin: { kind: 'engine' } })), undefined, 'a queued message the person typed is a prompt')
  assert.equal(footnoteOf({ ...goalQueued('Goal set: x'), isSidechain: true }), undefined)
  assert.equal(footnoteOf(goalQueued(`Goal set: ${'brief '.repeat(100)}`))!.label.length, FOOTNOTE_LABEL_MAX, 'a long brief is cut like any label')
})

test('classifyAppend: a goal set arrives queued from auto-continuation: a footnote, never a row', () => {
  const wrapped = '<system-reminder>\nThe user sent a new message while you were working:\nGoal set: Build it all.\n\nThis is how Claude Code surfaces messages the user sends mid-turn.\n</system-reminder>'
  const r = classifyAppend(appended({ door: 'attachment', origin: { kind: 'auto-continuation' }, message: { type: 'attachment', name: 'queued_command', content: [{ type: 'text', text: wrapped }] } }))
  assert.deepEqual(r, { footnote: { kind: 'command', label: '/goal Build it all.' } })
  const other = classifyAppend(appended({ door: 'attachment', origin: { kind: 'auto-continuation' }, message: { type: 'attachment', name: 'queued_command', content: [{ type: 'text', text: 'keep going' }] } }))
  assert.deepEqual(other, {}, 'any other continuation is still nothing')
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
