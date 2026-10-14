// How much prompt text the filter keeps, and how it is laid out in the plugin store
// (#28; djdarcy, 2026-10-12: "The whole prompt up to a budget ... allow unlimited for
// machines that have less limitations ... freeing memory where appropriate"). Pure: the
// engine adapter reads and writes the pieces this decides.

export type PromptText = { uuid: string; text: string }

// UTF-8 bytes of a string, counted without an encoder (core/ imports nothing).
export function utf8Bytes(s: string): number {
  let n = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4
  }
  return n
}

// The texts kept under a budget in bytes, newest first: the newest prompts are the
// likeliest to be searched for. 0 is unlimited. A prompt that does not fit whole is cut
// to what remains, so the budget is used to the byte; older ones are dropped.
export function withinBudget(newestFirst: readonly PromptText[], budget: number): PromptText[] {
  if (budget <= 0) return [...newestFirst]
  const kept: PromptText[] = []
  let left = budget
  for (const p of newestFirst) {
    if (left <= 0) break
    const size = utf8Bytes(p.text)
    if (size <= left) {
      kept.push(p)
      left -= size
      continue
    }
    let cut = ''
    for (const ch of p.text) {
      const b = utf8Bytes(ch)
      if (b > left) break
      cut += ch
      left -= b
    }
    if (cut) kept.push({ uuid: p.uuid, text: cut })
    break
  }
  return kept
}

// Split the kept texts into pieces each under `maxBytes` of JSON, so no one store value
// passes the engine's cap (4 MiB). The order within and across pieces is kept.
export function shard(texts: readonly PromptText[], maxBytes: number): PromptText[][] {
  const pieces: PromptText[][] = []
  let piece: PromptText[] = []
  let size = 2 // the brackets
  for (const t of texts) {
    const s = utf8Bytes(JSON.stringify(t)) + 1
    if (piece.length > 0 && size + s > maxBytes) {
      pieces.push(piece)
      piece = []
      size = 2
    }
    piece.push(t)
    size += s
  }
  if (piece.length > 0) pieces.push(piece)
  return pieces
}
