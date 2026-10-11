import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikePrompt, promptTextOf, unwrapQueued } from './prompt-rows.ts'

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
