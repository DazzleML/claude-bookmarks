// The band, drawn: the one-line command strip above the prompt, in its idle, help, jump,
// mark and number modes (the second view out of register.tsx, Q261012-11 "hybrid"). The
// JSX moved verbatim under /move-code, comments as they were; register.tsx builds the
// model (what to draw) and the actions (closures over `$`) and hands them in with the
// palette's two lookups. Location provisional (Q261012-11, question 3).
import type { EngineInterface, RenderChildren } from 'claude-code'
import type { Operation } from '../core/keys.ts'
import type { Role, Style } from '../core/palette.ts'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

export type BandMode = 'idle' | 'help' | 'jump' | 'mark' | 'list' | 'bookmarks'

export type BandModel = {
  mode: BandMode
  /** The mark last shown: its letter and words, on the bar's right. */
  shown: { letter: string; text: string } | null | undefined
  /** The help's lines, already fitted to the band's height (help mode). */
  help: readonly string[]
  /** The marks set, by letter (jump and mark modes). */
  marks: Readonly<Record<string, { head: string } | undefined>>
  letters: readonly string[]
  readingLetter: string
  /** The number row (list and bookmarks modes). */
  typed: string
  count: number
  groupTitle: string
  listKeys: readonly { key: string; button: string; operation: Operation }[]
  /** The idle bar, from the key table; empty when the band is a field only. */
  bar: readonly { id: string; label: string; key: string; hotkey?: string; action?: string }[]
  cmdRev: number
}

// Each action returns its promise, so a press awaits the work and a refusal surfaces where
// the press was made (the kit catches it there; a dropped promise fails the whole file).
export type BandActions = {
  endBandMode: () => Promise<unknown>
  readingToggle: () => Promise<unknown>
  jumpToMark: (letter: string) => Promise<unknown>
  setMark: (letter: string) => Promise<unknown>
  cancel: () => Promise<unknown>
  listKey: (operation: Operation) => Promise<unknown>
  digit: (digit: string) => Promise<unknown>
  dot: () => Promise<unknown>
  go: () => Promise<unknown>
  runCommandLine: (typed: string, kind: 'input' | 'submit') => Promise<unknown>
  perform: (key: string, id: string, action: string | undefined) => Promise<unknown>
}

export type BandStyles = { text: (role: Role) => Style; button: (role: Role) => { dimColor?: boolean } }

export function bandView(elements: Elements, theirs: RenderChildren, m: BandModel, a: BandActions, s: BandStyles) {
  const { Box, Button, Text } = elements
  const Input = 'Input' in elements ? elements.Input : undefined

  // The band takes the next key itself when the pane opened from it couldn't take
  // the keyboard (see openFor). The pane stays open beside it as the readable list.
  if (m.mode !== 'idle') {
    if (m.mode === 'help') {
      return (
        <Box flexDirection="column">
          {theirs}
          <Box flexDirection="row" columnGap={1}>
            <Text {...s.text('legend')}>bm help</Text>
            <Button key="band-help-close" label="close (Enter)" plain {...s.button('legend')} onPress={() => a.endBandMode()} />
          </Box>
          {m.help.map((l, i) => <Text key={`band-help-${i}`} {...s.text('legend')}>{l}</Text>)}
        </Box>
      )
    }
    let keys: RenderChildren[]
    if (m.mode === 'jump') {
      const reading = m.marks[m.readingLetter]
      keys = [
        <Text key="band-jump-title" {...s.text('legend')}>jump:</Text>,
        ...(reading
          ? [<Button key="band-jump-reading" label="reading (Enter)" plain
              // There, or back to where you were: the leader's Space (readingToggle).
              onPress={() => a.readingToggle()} />]
          : []),
        ...m.letters.filter(l => m.marks[l]).map(l => (
          <Button key={`band-jump-${l}`} hotkey={l} label={(m.marks[l]?.head ?? '').slice(0, 12)} plain
            onPress={() => a.jumpToMark(l)} />
        )),
      ]
    } else if (m.mode === 'mark') {
      keys = [
        <Text key="band-mark-title" {...s.text('legend')}>mark as:</Text>,
        // The default focus, so a stray Enter cancels rather than overwriting a mark.
        <Button key="band-mark-cancel" label="cancel (Enter)" plain {...s.button('legend')} onPress={() => a.cancel()} />,
        ...m.letters.map(l => (
          <Button key={`band-mark-${l}`} hotkey={l} label={m.marks[l] ? '●' : '·'} plain {...(m.marks[l] ? {} : s.button('unused'))}
            onPress={() => a.setMark(l)} />
        )),
      ]
    } else {
      // A prompt number, one digit Button per key: a field's typing or Enter can't
      // scroll ("not person-initiated", 2026-10-05 17:20 and 2026-10-07 07:10), a
      // Button press can.
      const bookmarks = m.mode === 'bookmarks'
      const byKey = (k: string) => m.listKeys.find(l => l.key === k)!
      const listKeyButton = (l: (typeof m.listKeys)[number]) => (
        <Button key={`band-num-${l.key}`} hotkey={l.key} label={l.button} plain {...s.button('legend')} onPress={() => a.listKey(l.operation)} />
      )
      keys = [
        <Text key="band-num-title" {...s.text('legend')}>{bookmarks ? 'bookmark #' : 'prompt #'}</Text>,
        <Text key="band-num-typed" {...s.text('emphasis')}>{m.typed || '_'}</Text>,
        <Text key="band-num-range" {...s.text('legend')}>{`(1-${m.count})`}</Text>,
        ...'0123456789'.split('').map(d => (
          <Button key={`band-num-${d}`} hotkey={d} label={d} plain {...s.button('legend')} onPress={() => a.digit(d)} />
        )),
        // `.` starts a footnote number (`3.` unfolds #3, `3.1` its first footnote, #33). A
        // hotkey is one letter or digit, so this one is clicked (djdarcy, 2026-10-12).
        ...(bookmarks ? [] : [<Button key="band-num-dot" label="." plain {...s.button('legend')} onPress={() => a.dot()} />]),
        // `go` sits between k and j, so an arrow always has a neighbour to move to:
        // the ui.focus hook turns that move into k (previous) or j (next).
        listKeyButton(byKey('k')),
        <Button key="band-num-go" label="go (Enter)" plain onPress={() => a.go()} />,
        listKeyButton(byKey('j')),
        // The rest of this list's keys, from the same table as its hint (core/keys.ts
        // LIST_KEYS); the bookmarks group's name sits between its h and l.
        ...m.listKeys
          .filter(l => l.key !== 'j' && l.key !== 'k')
          .flatMap(l => {
            const op = l.operation
            return op.op === 'group' && op.dir === -1
              ? [listKeyButton(l), <Text key="band-num-group" {...s.text('legend')}>{m.groupTitle}</Text>]
              : [listKeyButton(l)]
          }),
      ]
    }
    return (
      <Box flexDirection="column">
        {theirs}
        <Box flexDirection="row" columnGap={1} flexWrap="wrap">
          <Text {...s.text('legend')}>bm</Text>
          {keys}
          <Text {...s.text('legend')}>(Esc)</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {theirs}
      <Box flexDirection="row" columnGap={1}>
        {/* The band leader (abovePrompt:focus: Ctrl+X Tab by default, Ctrl+] for
            djdarcy) puts the keyboard here; the field takes every key (runCommandLine).
            The Buttons stay for clicks, Tab, and the borrowed-action chords. */}
        {Input ? (
          // The engine draws its own colon after a label (screenshot 2026-10-12: `bm::`).
          <Input key={`band-cmd-${m.cmdRev}`} label="bm" placeholder="" submitLabel="run" autoFocus
            onInput={(typed: string) => a.runCommandLine(typed, 'input')}
            onSubmit={(typed: string) => a.runCommandLine(typed, 'submit')} />
        ) : (
          <Text {...s.text('legend')}>bm:</Text>
        )}
        {/* The bar, from the router's table (core/keys.ts bandButtons): each shown
            command once, `?` for the rest. A press performs what its key routes to;
            while chords are on, the four chord commands carry their borrowed action
            (docs: Optional fast keys). `band: field` draws the field alone. */}
        {m.bar.map(b => (
          <Button key={`chord-${b.id}`} label={b.label} plain {...s.button('legend')}
            {...(b.hotkey ? { hotkey: b.hotkey } : {})} {...(b.action ? { action: b.action } : {})}
            onPress={() => a.perform(b.key, b.id, b.action)} />
        ))}
        {m.shown && (
          <Text wrap="truncate-end">
            | <Text {...s.text('emphasis')}>{m.shown.letter}</Text> ▸ {m.shown.text}
          </Text>
        )}
      </Box>
    </Box>
  )
}
