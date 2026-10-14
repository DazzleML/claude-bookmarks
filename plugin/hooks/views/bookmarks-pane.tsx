// The bookmarks pane, drawn (moved out of register.tsx's Pane render hook under /move-code,
// 0.4.69, comments as they were). register.tsx reads the bookmarks, the band's number and
// group, and the drawn ids, and hands them in with the actions and the palette's lookups;
// the numbering, grouping and rows are worked out here, with the hook's local names.
import type { EngineInterface } from 'claude-code'
import { ownerOf, type AnchorOwner, type AnchorRecord } from '../core/anchor.ts'
import { promptNumberComplete } from '../core/band-entry.ts'
import { bookmarkWho, drawnFourOf, groupHeader, numberNewestFirst, numberWidth, pointerFor, unreached } from '../core/list-model.ts'
import type { PaneStyles } from './prompts-pane.tsx'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

export type BookmarksPaneModel = {
  /** Every bookmark of this conversation, in the order minted. */
  all: readonly AnchorRecord[]
  groups: readonly { owner: AnchorOwner | 'all'; title: string }[]
  groupIndex: number
  /** The band's number while the band is in its bookmarks mode, else undefined. */
  fromBand: string | undefined
  drawn: Iterable<string>
  now: number
  /** Draw ⚓ before each row (the link-marker setting is 'glyph'). */
  glyph: boolean
  /** The pane's key hint, from the key table. */
  hint: string
}

export type BookmarksPaneActions = {
  arrive: (r: AnchorRecord) => Promise<unknown>
  go: (typed: string) => Promise<unknown>
  close: () => Promise<unknown>
}

export function bookmarksPaneView(elements: Elements, m: BookmarksPaneModel, a: BookmarksPaneActions, s: PaneStyles) {
  const { Box, Button, Text } = elements
  // Every surface draws an Input except the mobile app (no fields yet).
  const Input = 'Input' in elements ? elements.Input : undefined
  const style = s.text
  const buttonStyle = s.button
  const { all, fromBand, now } = m
  const BOOKMARK_GROUPS = m.groups

      // Every bookmark of this conversation, numbered in the order minted (#1 the first,
      // so a number stays good), listed newest first like the prompts. Digits typed in
      // the band show in the `#` field and as a ▶; Enter jumps and highlights the words.
      const numbered = numberNewestFirst(all)
      const width = numberWidth(all.length)
      const targetN = fromBand ? Number(fromBand) : undefined
      const pointer = pointerFor(fromBand, targetN)
      const go = (typed: string) => a.go(typed)
      // One group at a time, one numbering across all of them. The band's h/l cycle the
      // group; the header shows where you are.
      const group = BOOKMARK_GROUPS[m.groupIndex] ?? BOOKMARK_GROUPS[0]!
      const inGroup = (g: (typeof BOOKMARK_GROUPS)[number]) => (g.owner === 'all' ? numbered : numbered.filter(r => ownerOf(r) === g.owner))
      const shownRows = inGroup(group)
      const header = groupHeader(BOOKMARK_GROUPS, group, g => inGroup(g).length)
      const who = (r: (typeof numbered)[number]) => bookmarkWho(r, now)
      // Dim as the prompts pane dims: by the uuid's first four groups, since a drawn id
      // differs in its last (refactor-advisor 2026-10-12 row 17: by exact id, every
      // bookmark row was dim).
      const drawnFour = drawnFourOf(m.drawn)
      const row = (r: (typeof numbered)[number]) => {
        const dim = unreached(drawnFour, r.uuid) && r.n !== targetN
        return (
          <Box key={`b-row-${r.uuid}-${ownerOf(r)}`} flexDirection="column">
            <Box flexDirection="row">
              <Box flexShrink={0}>
                <Text {...(dim ? style('unreached') : {})}>{`${pointer(r.n)}${String(r.n).padStart(width)}) `}</Text>
                {m.glyph && <Text {...style('pinned')}>⚓ </Text>}
              </Box>
              <Button
                key={`b-${r.uuid}-${ownerOf(r)}`}
                label={r.label}
                plain
                {...(dim ? buttonStyle('unreached') : {})}
                onPress={() => a.arrive(r)}
              />
            </Box>
            <Text {...style('legend')} wrap="truncate-end">
              {`${' '.repeat(width + 4)}${who(r)}${r.why ? ` · ${r.why}` : ''}`}
            </Text>
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          {numbered.length === 0 && <Text {...style('legend')}>No bookmarks yet. Claude mints them with its bookmark tool; P + a letter promotes one of your marks.</Text>}
          {numbered.length > 0 && Input && (
            <Input
              key="bookmark-number"
              label="#"
              placeholder={`1-${all.length}`}
              submitLabel="jump"
              {...(fromBand !== undefined ? { value: fromBand } : {})}
              autoFocus
              onInput={(typed: string) => {
                if (typed === 'q') return void a.close()
                if (promptNumberComplete(typed, all.length)) void go(typed)
              }}
              onSubmit={(typed: string) => void go(typed)}
            />
          )}
          {numbered.length > 0 && <Text>{header}</Text>}
          {numbered.length > 0 && shownRows.length === 0 && <Text {...style('legend')}>{`No bookmarks in "${group.title}" yet.`}</Text>}
          {shownRows.map(row)}
          {numbered.length > 0 && <Text {...style('legend')}>{m.hint}</Text>}
        </Box>
      )
}
