// The band's own state, owned in one place (the one-owner principle,
// notes/meta/2026-10-12__22-48-40): the wait that ends a band mode, the watch that notices
// Esc took the keyboard back, the element the focus ring is on, the band's requestId, and
// whether the Esc reminder is owed. These were five module `let`s in register.tsx, written
// from the pane opening, the help, the band's keys, the focus and edit hooks, the band's
// render and the session start; here each write is a named method.

/** A timer as the engine hands it back: something that can be cancelled. */
export type Cancellable = { cancel: () => void }

export class BandState {
  private waitTimer: Cancellable | undefined
  private watchTimer: Cancellable | undefined
  // The band element the focus ring is on, as the ui.focus hook last saw it.
  private ringOn: string | undefined
  // The band's own requestId, as its render hook last saw it: $.ui.focus names the site
  // by it, to put the band's ring on the prompts field or the reading entry.
  private requestId: string | undefined
  // After a band action that finishes with the band still holding the keyboard (a jump,
  // `o`/`i`, the reading position, a promote), the person's next keys are usually their
  // prompt. The plugin can't hand the keyboard back (#24), so the first key the band does
  // not know says so, once per action, when "Keyboard after an action" is `input`.
  private escOwed = false

  /** (Re)start the wait that ends the band's mode; the previous wait is cancelled. */
  restartWait(start: () => Cancellable): void {
    this.waitTimer?.cancel()
    this.waitTimer = start()
  }
  stopWaiting(): void {
    this.waitTimer?.cancel()
    this.waitTimer = undefined
  }

  /** (Re)start the watch on the band's keyboard; the previous watch is cancelled. */
  startWatch(start: () => Cancellable): void {
    this.watchTimer?.cancel()
    this.watchTimer = start()
  }
  stopWatching(): void {
    this.watchTimer?.cancel()
    this.watchTimer = undefined
  }

  /** The band's mode ended: no wait, no watch, no ring. */
  ended(): void {
    this.stopWaiting()
    this.stopWatching()
    this.ringOn = undefined
  }

  /** A new conversation: what belonged to the last one goes (test-plan 2026-10-12__15-25-30, row M). */
  newConversation(): void {
    this.escOwed = false
    this.ringOn = undefined
  }

  get ring(): string | undefined {
    return this.ringOn
  }
  /** The ui.focus hook saw the ring move onto this element. */
  ringMoved(element: string): void {
    this.ringOn = element
  }

  get id(): string | undefined {
    return this.requestId
  }
  /** The band was drawn under this requestId. */
  drawn(requestId: string): void {
    this.requestId = requestId
  }

  get reminderOwed(): boolean {
    return this.escOwed
  }
  oweReminder(owed: boolean): void {
    this.escOwed = owed
  }
}
