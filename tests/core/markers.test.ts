// node --test tests/core/markers.test.ts
// Callback markers (core/lists/markers.ts; the links-in-files design, 2026-10-27, step B3). The
// POC's arms (tests/one-offs/thinking/poc-callback-markers/README.md) as tests: every form on a
// heading or a bullet, after a reorder and a rename, at the end and in the middle of a paragraph,
// and the wrapped-link hazard -- with md-unwrap's join stood in for by joining a paragraph's lines
// with a space, which is what the POC observed it do (out/a5.out.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markersOf, scanMarkers } from '../../plugin/hooks/core/lists/markers.ts'

const SID = '8f0f9b27-33fc-4054-806a-22a6d569dfb5'
const UUID = 'e92204f6-0000-4000-8000-000000000000'
type Form = 'F1' | 'F2' | 'F3' | 'F4' | 'F5'
const FORMS: Form[] = ['F1', 'F2', 'F3', 'F4', 'F5']

function marker(form: Form, id: string, split = false): string {
  const br = split ? '\n' : ''
  if (form === 'F1') return `[*](bm:8f0f9b27/e92204f6?list=whats-left${br}&id=${id})`
  if (form === 'F2') return `[*](file:///C:/Users/x/claude/bookmarks/sessions/${SID}/e92204f6.md?u=${UUID}&list=whats-left${br}&id=${id}&v=2)`
  if (form === 'F3') return `<!-- bm list=whats-left${br || ' '}id=${id} -->`
  if (form === 'F4') return `^${id}`
  return `#list/whats-left/${id}`
}
/** md-unwrap's join: a paragraph's lines become one, separated by a space. */
const unwrap = (text: string) => text.split('\n\n').map(p => (/^(#|- )/.test(p) ? p : p.replace(/\n/g, ' '))).join('\n\n')
const ids = (text: string) => new Set(scanMarkers(text).filter(m => !m.broken).map(m => m.id))

function entries(prefix: string, heading: string): string[] {
  return FORMS.map(f => `## ${heading} ${f} ${marker(f, `${prefix}-${f.toLowerCase()}-h`)}\n\n- a bullet entry for ${f} ${marker(f, `${prefix}-${f.toLowerCase()}-b`)}\n`)
}

test('A1: every form on a heading and on a bullet is found, with its form and line', () => {
  const text = `# What's left\n\n${entries('a1', 'Entry').join('\n')}`
  const found = ids(text)
  for (const f of FORMS) for (const where of ['h', 'b']) assert.ok(found.has(`a1-${f.toLowerCase()}-${where}`), `${f} ${where}`)
  const byId = new Map(scanMarkers(text).map(m => [m.id, m]))
  assert.deepEqual([byId.get('a1-f1-h')!.form, byId.get('a1-f2-h')!.form, byId.get('a1-f3-h')!.form, byId.get('a1-f4-h')!.form, byId.get('a1-f5-h')!.form], ['bm', 'file', 'comment', 'block', 'tag'])
  assert.equal(byId.get('a1-f1-h')!.line, 3)
  assert.equal(byId.get('a1-f4-h')!.list, undefined, 'a block id names only the entry')
  assert.equal(byId.get('a1-f2-b')!.ref?.uuid, UUID, 'a file: marker also names its place')
})

test('a bm: marker in either form, the lookup with its check, names its place (the bm: design, unit 6)', () => {
  const text = [
    '- by number [*](bm:8f0f9b27.12~e92204f6?list=whats-left&id=look)',
    '- exact, with words [*](bm:8f0f9b27/e92204f6~w:the%20release?list=whats-left&id=exact)',
  ].join('\n')
  const byId = new Map(scanMarkers(text).map(m => [m.id, m]))
  const look = byId.get('look')!
  assert.equal(look.form, 'bm')
  assert.equal(look.broken, undefined)
  assert.deepEqual([look.ref?.session, look.ref?.record, look.ref?.check], ['8f0f9b27', 12, 'e92204f6'])
  const exact = byId.get('exact')!
  assert.deepEqual([exact.ref?.uuid, exact.ref?.words, exact.list], ['e92204f6', 'the release', 'whats-left'])
})

test('A2: reordered and renamed, every entry is still found by its id', () => {
  const text = `# What's left (renamed)\n\n${entries('a2', 'Renamed heading for').reverse().join('\n')}`
  const found = ids(text)
  for (const f of FORMS) for (const where of ['h', 'b']) assert.ok(found.has(`a2-${f.toLowerCase()}-${where}`))
})

test('A3: a marker at the end of a wrapped paragraph survives the join', () => {
  const text = unwrap(FORMS.map(f => `A paragraph about ${f} that was hard-wrapped by an editor\nat seventy columns and ends with its marker ${marker(f, `a3-${f.toLowerCase()}`)}\n`).join('\n'))
  for (const f of FORMS) assert.ok(ids(text).has(`a3-${f.toLowerCase()}`), f)
})

test('A4: a marker in the middle of a paragraph is found, except a block id (a block id only ends a block)', () => {
  const text = unwrap(FORMS.map(f => `A paragraph about ${f} with its marker ${marker(f, `a4-${f.toLowerCase()}`)} in the\nmiddle, and more words after it on the next line.\n`).join('\n'))
  const found = ids(text)
  for (const f of ['F1', 'F2', 'F3', 'F5'] as const) assert.ok(found.has(`a4-${f.toLowerCase()}`), f)
  assert.equal(found.has('a4-f4'), false)
})

test('A5: a link marker wrapped inside its URL is reported broken, never dropped; a comment survives the wrap', () => {
  const raw = (['F1', 'F2', 'F3'] as const).map(f => `Before the marker ${marker(f, `a5-${f.toLowerCase()}`, true)} after it.\n`).join('\n')
  // After md-unwrap: a space inside the URL.
  const joined = scanMarkers(unwrap(raw))
  const j = new Map(joined.map(m => [m.id, m]))
  assert.equal(j.get('a5-f1')?.broken, true)
  assert.equal(j.get('a5-f2')?.broken, true)
  assert.equal(j.get('a5-f1')?.list, 'whats-left', 'what can still be read of it is kept')
  assert.ok(j.has('a5-f3') && !j.get('a5-f3')!.broken, 'the comment is found whole')
  // Before md-unwrap: still split across two lines.
  const split = new Map(scanMarkers(raw).map(m => [m.id, m]))
  assert.equal(split.get('a5-f1')?.broken, true)
  assert.equal(split.get('a5-f1')?.line, 1)
  assert.equal(split.get('a5-f2')?.broken, true)
  assert.ok(split.has('a5-f3') && !split.get('a5-f3')!.broken, 'a comment split across lines is still a marker')
})

test('control: stripping comments and block ids loses exactly those markers', () => {
  const text = `# What's left\n\n${entries('c', 'Entry').join('\n')}`
  const stripped = text.replace(/[ \t]*<!--[\s\S]*?-->/g, '').replace(/[ \t]+\^[\w-]+[ \t]*$/gm, '')
  const found = ids(stripped)
  for (const f of FORMS) {
    const kept = f !== 'F3' && f !== 'F4'
    assert.equal(found.has(`c-${f.toLowerCase()}-h`), kept, f)
  }
})

test('markers in code are examples, not markers; a link without list= is not a marker', () => {
  const text = [
    '```markdown', `### An example ${marker('F3', 'in-fence')}`, '```',
    `Inline: \`${marker('F5', 'in-span')}\``,
    `A plain bookmark link [x](file:///C:/x/bookmarks/sessions/${SID}/e92204f6.md?u=${UUID}&v=1) is not one.`,
    `### A real one ${marker('F3', 'real')}`,
  ].join('\n')
  assert.deepEqual(scanMarkers(text).map(m => m.id), ['real'])
})

test("one list's markers by id; a second line claiming an id is a copy; broken ones are left out", () => {
  const text = [`## One ${marker('F3', 'wl-a')}`, `## Two ${marker('F5', 'wl-a')}`, `## Three ${marker('F3', 'wl-b')}`, `## Elsewhere <!-- bm list=other id=wl-a -->`].join('\n')
  const { byId, copies } = markersOf(scanMarkers(text), 'whats-left')
  assert.deepEqual([...byId.keys()], ['wl-a', 'wl-b'])
  assert.equal(byId.get('wl-a')!.line, 1)
  assert.deepEqual(copies.map(c => c.line), [2])
})
