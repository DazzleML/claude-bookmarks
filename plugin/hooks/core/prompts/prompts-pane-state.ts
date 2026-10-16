// The prompts pane's own state, owned in one place (the one-owner principle,
// notes/meta/2026-10-12__22-48-40): the filter's words, the footnotes unfolded by hand,
// and the prompt the list centres on at its next draw. These were three module `let`s in
// register.tsx written from the number field, the pane's own buttons, the Esc hook, the
// pane opening and the conversation reset; here each write is a named method.

export class PromptsPaneState {
  // The prompts filter (#28): the words typed after `/` in the prompts pane's number field
  // (djdarcy, 2026-10-12: "Pane field only"); empty when no filter is active.
  private words = ''
  // The prompts whose footnotes the person unfolded (`.` or a press on the ellipsis row),
  // by number; folded is the default (the `footnotes` setting).
  private readonly open = new Set<number>()
  // The prompt the list should centre on at the pane's next draw (set when it opens).
  private centre: string | undefined

  get filter(): string {
    return this.words
  }
  /** The filter's words; false when they are the same as before (nothing to redraw). */
  setFilter(words: string): boolean {
    if (words === this.words) return false
    this.words = words
    return true
  }

  get unfolded(): ReadonlySet<number> {
    return this.open
  }
  unfold(n: number): void {
    this.open.add(n)
  }
  refold(n: number): void {
    this.open.delete(n)
  }
  /** `N.` in the field: unfold #N's footnotes, or fold them again. */
  toggleFold(n: number): void {
    if (this.open.has(n)) this.open.delete(n)
    else this.open.add(n)
  }

  /** The pane opened on this prompt: centre the list on it at the next draw. */
  centreOnNextDraw(uuid: string): void {
    this.centre = uuid
  }
  /** The prompt to centre on, once: read and cleared. */
  takeCentre(): string | undefined {
    const c = this.centre
    this.centre = undefined
    return c
  }

  /** A new conversation (/clear, /resume): its filter, folds and pending centre go. */
  newConversation(): void {
    this.words = ''
    this.open.clear()
    this.centre = undefined
  }
}
