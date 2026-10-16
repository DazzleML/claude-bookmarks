import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configDirOf, dataRootOf, forwardSlashes } from '../../plugin/hooks/core/kit/paths.ts'

test('forward slashes', () => {
  assert.equal(forwardSlashes('C:\\Users\\x\\claude'), 'C:/Users/x/claude')
  assert.equal(forwardSlashes('/home/x'), '/home/x')
})

test("Claude Code's config folder: CLAUDE_CONFIG_DIR first, else <home>/.claude, else none", () => {
  assert.equal(configDirOf('D:/cc', 'C:\\Users\\x'), 'D:/cc')
  assert.equal(configDirOf(undefined, 'C:\\Users\\x'), 'C:/Users/x/.claude')
  assert.equal(configDirOf(undefined, undefined), undefined)
})

test('the data root: CLAUDE_USER_DIR without a trailing slash, else <home>/claude, never under .claude', () => {
  assert.equal(dataRootOf('D:\\mine\\', 'C:\\Users\\x'), 'D:/mine')
  assert.equal(dataRootOf(undefined, 'C:\\Users\\x'), 'C:/Users/x/claude')
  assert.equal(dataRootOf('', '/home/x'), '/home/x/claude')
  assert.equal(dataRootOf(undefined, undefined), undefined)
})
