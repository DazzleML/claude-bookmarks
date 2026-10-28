// What a reference typed in a prompt was bound to (the bm: short-reference design, units 5a/5b).
// The prompt's text is never rewritten (djdarcy: "Visually the text should be kept as is and under
// the hood as a note or link it should be durable so there's no guessing"). A prompt hook attaches
// one context entry whose lines say what each reference names; Claude Code keeps that entry in the
// transcript as its own row (unit 0's probe), so the binding is durable and read back by parsing
// these lines. The line shape is stored data: versioned, one per reference.
//
//   bm-binding v1: <as typed> = <exact form>[ (#<n>)]
//   bm-binding v1: <as typed> = unresolved (<why>)
//
// Pure.

export const BINDING_PREFIX = 'bm-binding v1: '

export type Binding = { asTyped: string; exact?: string; record?: number; unresolved?: string }

/** One binding line. */
export function bindingLine(b: Binding): string {
  if (b.exact) return `${BINDING_PREFIX}${b.asTyped} = ${b.exact}${b.record !== undefined ? ` (#${b.record})` : ''}`
  return `${BINDING_PREFIX}${b.asTyped} = unresolved (${b.unresolved ?? 'unknown'})`
}

/** The context entry for a prompt's bindings: the lines, then one sentence for Claude; undefined for none. */
export function bindingContext(bindings: Binding[]): string | undefined {
  if (bindings.length === 0) return undefined
  return [
    ...bindings.map(bindingLine),
    'The short references in this prompt name these places; the prompt itself is as typed.',
  ].join('\n')
}

/** The bindings a text holds (a context row's text), in order; lines of any other shape are skipped. */
export function parseBindings(text: string): Binding[] {
  const out: Binding[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith(BINDING_PREFIX)) continue
    const m = /^(\S+) = (?:unresolved \((.*)\)|(\S+)(?: \(#(\d+)\))?)$/.exec(line.slice(BINDING_PREFIX.length).trim())
    if (!m) continue
    out.push(m[2] !== undefined ? { asTyped: m[1]!, unresolved: m[2] } : { asTyped: m[1]!, exact: m[3]!, ...(m[4] ? { record: Number(m[4]) } : {}) })
  }
  return out
}
