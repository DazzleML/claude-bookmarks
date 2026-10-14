// The marks cluster's own state (handlers/marks.ts), one owner with named writers, as
// core/band-state.ts is for the band (notes/meta/2026-10-12__22-48-40):
//   - the highlight's clear timer (a mark shown clears after HIGHLIGHT_MS);
//   - the selection as it stood when the mark chord fired;
//   - when the current selection was first seen, and the poll that stamps it.
// Pure: timers come in as functions that start one and return it, so a test passes fakes.

type Cancelable = { cancel: () => void }

export type SelectionLike = { requestId?: string; text: string } | undefined

export class MarkState {
  #clearTimer: Cancelable | undefined
  #atChord: SelectionLike
  #seen: { key: string; at: number } | undefined
  #poll: Cancelable | undefined

  /** A highlight is shown: the previous clear is cancelled and `start` starts the new one. */
  restartClear(start: () => Cancelable) {
    this.#clearTimer?.cancel()
    this.#clearTimer = start()
  }
  /** The highlight is cleared, or about to be: no clear is pending. */
  stopClear() {
    this.#clearTimer?.cancel()
    this.#clearTimer = undefined
  }

  // The selection as it stood when the mark chord fired, read BEFORE the pane opens:
  // round 1 read it after, and the mark landed one row too high (the inline pane shifts
  // the transcript; hypothesis: the engine maps the selection to a row by screen position).
  /** The selection as it stood when the mark chord fired (openFor, bandOnly). */
  setAtChord(sel: SelectionLike) {
    this.#atChord = sel
  }
  /** Read once by setMark, and forgotten. */
  takeAtChord(): SelectionLike {
    const sel = this.#atChord
    this.#atChord = undefined
    return sel
  }

  get seen(): { key: string; at: number } | undefined {
    return this.#seen
  }
  /** The selection `key` was first seen at `at` (0: of unknown age). */
  see(key: string, at: number) {
    this.#seen = { key, at }
  }
  /** A new conversation: the poll stops and nothing has been seen yet. */
  stopPoll() {
    this.#poll?.cancel()
    this.#poll = undefined
    this.#seen = undefined
  }
  /** The poll that stamps selections as they change. */
  startPoll(start: () => Cancelable) {
    this.#poll = start()
  }
}
