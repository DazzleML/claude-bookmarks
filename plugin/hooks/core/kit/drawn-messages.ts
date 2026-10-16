// The messages the render hooks have drawn since the plugin loaded: each one's text the
// first time it was drawn (a selection mark checks it landed in the right row; a refused
// jump quotes it), and the set of their ids' first four groups, kept as ids arrive. A
// drawn id may be the zero-tailed form of the real uuid, so "drawn?" is asked by the
// first four groups (core/kit/message-id.ts firstFour); the panes dim a row whose prompt
// has not been drawn since load ("never drawn since load" means what it says: a jump
// target Claude Code may refuse). Owned here; the render hooks note, the rest read.
import { firstFour } from './message-id.ts'

export class DrawnMessages {
  private readonly byId = new Map<string, string>()
  private readonly four = new Set<string>()

  /** A message drawn: kept once, with the text it was first drawn with. */
  note(id: string, text: string): void {
    if (this.byId.has(id)) return
    this.byId.set(id, text)
    this.four.add(firstFour(id))
  }

  /** Each drawn id with its text, read-only (the diagnostics read it whole). */
  get texts(): ReadonlyMap<string, string> {
    return this.byId
  }

  /** The drawn ids' first four groups, for the panes' dim rule. */
  get firstFours(): ReadonlySet<string> {
    return this.four
  }
}
