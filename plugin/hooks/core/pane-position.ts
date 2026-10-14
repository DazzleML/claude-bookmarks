// Where the view was before a pane opened, and where it goes back to (the navigation
// cluster's shared state, under the one-owner principle: notes/meta/2026-10-12__22-48-40).
// The three fields were module `let`s in register.tsx written from three places (the pane
// opening, a jump, the restore); here each write is a named method, and the restore reads
// and clears in one step. Comments moved verbatim from register.tsx.

export type ViewSpot = { uuid: string; block: 'start' | 'end' }

export class PanePosition {
  // Highlight a mark just set from a selection, then put the view back. Redrawing the
  // message under a visible selection drops the view to the bottom, even with following
  // the bottom turned off (djdarcy, 2026-10-06; a stale selection, no longer shown, did
  // not; seen only when the pane held the keyboard). So note the message at the top of
  // the screen first, and scroll back to it once the pane has closed: message-level, like
  // the reading position's return. The scroll must run within the keypress's own handler:
  // one from a timer is refused ("not person-initiated", log 2026-10-06 04:22:20).
  private restoreTo: string | undefined
  // The message at the top of the screen just before a pane opened (openFor): where the
  // view goes back to once the pane has done its job. A jump clears it (jumpTo).
  private paneAnchor: string | undefined
  // The same moment as a scroll can restore it: at the bottom, the last message's end.
  private paneView: ViewSpot | undefined

  /** A pane opened: the message at the top of the screen, and the view as a scroll can restore it. */
  opened(anchor: string | undefined, view: ViewSpot | undefined): void {
    this.paneAnchor = anchor
    this.paneView = view
  }

  /** A new conversation (/clear, /resume): the old one's messages are no place to go back to. */
  newConversation(): void {
    this.restoreTo = undefined
    this.paneAnchor = undefined
    this.paneView = undefined
  }

  /** The jump is where the person wants to be: no going back to before the pane. */
  jumped(): void {
    this.paneAnchor = undefined
  }

  /** A highlight is about to redraw a message: remember where to put the view back (the pane's anchor when a pane is up). */
  noteRestore(top: string | undefined): void {
    this.restoreTo = this.paneAnchor ?? top
  }

  /** The message at the top of the screen before the pane opened, if a pane is up. */
  get anchor(): string | undefined {
    return this.paneAnchor
  }

  /** The view before the pane opened, as a scroll can restore it. */
  get view(): ViewSpot | undefined {
    return this.paneView
  }

  /**
   * Where the view goes back to, cleared as it is read: after a pane, its view (the
   * shift is certain); else where a highlight left it. `fromPane` says which.
   */
  takeRestore(): { here: string | undefined; block: 'start' | 'end'; fromPane: boolean } {
    // A pane opened and closed: the view was shifted for certain, so go back to where it
    // was before the pane, whether or not that message is still on screen somewhere.
    const fromPane = !!this.paneAnchor
    const block = (fromPane && this.paneView?.block) || 'start'
    const here = (fromPane ? this.paneView?.uuid ?? this.paneAnchor : undefined) ?? this.restoreTo
    this.restoreTo = undefined
    this.paneAnchor = undefined
    this.paneView = undefined
    return { here, block, fromPane }
  }
}
