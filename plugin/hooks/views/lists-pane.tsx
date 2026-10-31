// The lists pane (#45, the first slice, L-5): a row of the project's lists to switch between,
// then the shown list's items, each a button that lands on its place, with ▲ ▼ to move it and
// ✓ to tick it done. Every action is a press, so the pane needs no keyboard and stays docked
// beside the conversation while you type. register.tsx reads the file through handlers/lists.ts
// and hands in the model and the actions.
import type { EngineInterface } from 'claude-code'
import type { List, ListItem, ListsFile } from '../core/lists/lists.ts'
import { linksOf, primaryLink, textOf, type ItemLink } from '../core/lists/item-links.ts'
import { describeLink } from '../core/lists/lists-tool.ts'
import type { PaneStyles } from './prompts-pane.tsx'

type Elements = ReturnType<EngineInterface['ui']['resolve']>

export type ListsPaneModel = {
  file?: ListsFile
  shown?: List
  /** The error the last read gave, shown instead of the lists. */
  error?: string
  /** Body columns, for the item rows' width. */
  columns: number
  /**
   * An item's link target (handlers/lists.ts linkOf): its place's anchor URL or its file or web
   * link. An item that has one is drawn as a Markdown link, as a reply's links are, so a plain
   * click goes to it and a ctrl-click opens it in the terminal (djdarcy, 2026-10-27: "I can click
   * the local file links from /bmlinks with ctrl click, why can't we do that in the panel?").
   */
  hrefOf?: (item: ListItem) => string | undefined
  /** One link's target, for its row in an opened item: drawn as a Markdown link, so a ctrl-click opens it too. */
  hrefOfLink?: (link: ItemLink) => string | undefined
  /**
   * The items opened in place, by id: drawn with their whole note wrapped, where they point, and
   * who added them when (djdarcy, 2026-10-27: "how am I supposed to read the entire note?").
   */
  expanded?: ReadonlySet<string>
}

export type ListsPaneActions = {
  pick: (list: List) => Promise<unknown>
  land: (item: ListItem) => Promise<unknown>
  move: (item: ListItem, to: number) => Promise<unknown>
  done: (item: ListItem) => Promise<unknown>
  /** Open or close an item in place. */
  toggle: (item: ListItem) => Promise<unknown>
  /** One of an opened item's links, pressed (the bundles design, unit 6). */
  landLink?: (item: ListItem, link: ItemLink) => Promise<unknown>
  /** A bundled item's face set to one of its links. */
  face?: (item: ListItem, link: ItemLink) => Promise<unknown>
}

// A link's mark in the opened view, by kind.
const GLYPH: Record<string, string> = { place: '⚓', file: '▤', line: '▤', issue: '#', url: '↗', ref: 'bm' }

const when = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const ownerMark = (l: List) => (l.owner === 'claude' ? '◆ ' : '')

export function listsPaneView(elements: Elements, m: ListsPaneModel, a: ListsPaneActions, s: PaneStyles) {
  const { Box, Button, Text, Markdown } = elements
  const style = s.text
  if (m.error) return <Text {...style('legend')}>{m.error}</Text>
  const lists = m.file?.lists ?? []
  if (!lists.length || !m.shown) {
    return (
      <Box flexDirection="column">
        <Text {...style('heading')}>Lists</Text>
        <Text {...style('legend')}>No lists yet for this project. Ask Claude to make one ("keep a list of what's left"), or Claude's lists tool creates one.</Text>
      </Box>
    )
  }
  const shown = m.shown
  const width = String(shown.items.length).length
  const open = shown.items.filter(i => !i.done).length
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap">
        {lists.map(l => (
          <Box key={`lists-tabbox-${l.id}`} flexShrink={0} marginRight={1}>
            <Button
              key={`lists-tab-${l.id}`}
              label={`${l.id === shown.id ? '▸' : ' '}${ownerMark(l)}${l.name} (${l.items.filter(i => !i.done).length})`}
              plain
              {...(l.id === shown.id ? {} : s.button('unreached'))}
              onPress={() => a.pick(l)}
            />
          </Box>
        ))}
      </Box>
      <Text {...style('heading')}>{`${ownerMark(shown)}${shown.name}${shown.owner === 'claude' ? " (Claude's)" : ''}: ${open} open${shown.items.length > open ? `, ${shown.items.length - open} done` : ''}`}</Text>
      {shown.items.length === 0 && <Text {...style('legend')}>Empty. Claude adds to it with its lists tool.</Text>}
      {shown.items.map((item, i) => {
        const isOpen = m.expanded?.has(item.id) ?? false
        const href = m.hrefOf?.(item)
        const first = primaryLink(item)
        const links = linksOf(item)
        return (
        <Box key={`lists-item-${shown.id}-${item.id}`} flexDirection="column">
          <Box flexDirection="row">
            <Box flexShrink={0}>
              <Button
                key={`lists-num-${item.id}`}
                label={`${String(i + 1).padStart(width)}${isOpen ? '▾' : ')'} `}
                plain
                {...(item.done ? s.button('unreached') : {})}
                onPress={() => a.toggle(item)}
              />
              {first && <Text {...style('pinned')}>{first.kind === 'place' ? '⚓ ' : '▤ '}</Text>}
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              {(() => {
                // Markdown draws only https:, http: and file: targets as links (the engine's typings).
                if (href && /^(https?|file):/i.test(href)) {
                  // A paren would end the markdown link early (anchor.ts fileUrl does the same).
                  const target = href.replace(/[()]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
                  return (
                    <Markdown
                      key={`lists-go-${item.id}`}
                      text={`[${item.label.replace(/[[\]]/g, ' ')}](${target})`}
                      {...(item.done ? s.button('unreached') : {})}
                      pressableLinks={[target]}
                      onLinkPress={() => a.land(item)}
                    />
                  )
                }
                // A note with no place or link opens in place instead of saying it has nowhere to go.
                const onPress = first ? () => a.land(item) : () => a.toggle(item)
                return <Button key={`lists-go-${item.id}`} label={item.label} plain {...(item.done ? s.button('unreached') : {})} onPress={onPress} />
              })()}
            </Box>
            {links.length > 1 && <Text {...style('legend')}>{` +${links.length - 1}`}</Text>}
            <Box flexShrink={0} marginLeft={1}>
              <Button key={`lists-up-${item.id}`} label="▲" plain {...(i === 0 ? s.button('unreached') : {})} onPress={() => a.move(item, i)} />
              <Text> </Text>
              <Button key={`lists-down-${item.id}`} label="▼" plain {...(i === shown.items.length - 1 ? s.button('unreached') : {})} onPress={() => a.move(item, i + 2)} />
              <Text> </Text>
              <Button key={`lists-done-${item.id}`} label={item.done ? '✓' : '·'} plain {...(item.done ? {} : s.button('unreached'))} onPress={() => a.done(item)} />
            </Box>
          </Box>
          {item.why && !isOpen && <Text {...style('legend')} wrap="truncate-end">{`${' '.repeat(width + 2)}${item.why}`}</Text>}
          {isOpen && (
            <Box key={`lists-open-${item.id}`} flexDirection="column" marginLeft={width + 2}>
              {item.why && <Text wrap="wrap">{item.why}</Text>}
              <Text {...style('legend')} wrap="wrap">
                {first?.kind === 'place'
                  ? `⚓ a place in ${first.session.slice(0, 8)}${first.file ? ` (${first.file})` : ''}: press the label to go there${href ? ', ctrl-click to open its note' : ''}`
                  : first
                    ? `▤ ${textOf(first) ?? ''}: press the label to copy it, ctrl-click to open it`
                    : 'a note: no place or link'}
              </Text>
              {links.length > 1 &&
                links.map((l, k) => (
                  <Box key={`lists-linkrow-${item.id}-${k}`} flexDirection="row">
                    {(() => {
                      const glyph = GLYPH[l.kind] ?? '·'
                      const mark = k === 0 && item.bundle ? '★ ' : ''
                      // A place says what it is about: the words it was made from (djdarcy, 2026-10-31:
                      // "some description as to what they were about so it wasn't just a bare anchor").
                      const words = l.kind === 'place' && l.words ? (l.words.length > 70 ? `${l.words.slice(0, 69)}…` : l.words) : ''
                      const what = describeLink(l, k + 1, undefined).what
                      const onPress = () => (a.landLink ? a.landLink(item, l) : a.land(item))
                      const lh = m.hrefOfLink?.(l)
                      // A link a terminal can open is drawn as one, as the item's label is: a plain
                      // click lands (onLinkPress), a ctrl-click opens it (djdarcy, 2026-10-31: clicking
                      // and ctrl-clicking a file row only copied it). One Markdown line per row, the
                      // mark and the icon inside it (separate elements put the icon on a line of its
                      // own), and only the address linked, its words after it as text.
                      if (lh && /^(https?|file):/i.test(lh)) {
                        const target = lh.replace(/[()]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
                        const esc = (t: string) => t.replace(/([\\`*_[\]<>#|])/g, '\\$1')
                        const text = `${mark}${glyph === '#' ? '\\#' : glyph} [${what.replace(/[[\]]/g, ' ')}](${target})${words ? ` "${esc(words)}"` : ''}`
                        return <Markdown key={`lists-link-${item.id}-${k}`} text={text} pressableLinks={[target]} onLinkPress={onPress} />
                      }
                      return <Button key={`lists-link-${item.id}-${k}`} label={`${mark}${glyph} ${what}${words ? ` "${words}"` : ''}`} plain onPress={onPress} />
                    })()}
                    {item.bundle && k > 0 && a.face && (
                      <Button key={`lists-face-${item.id}-${k}`} label=" ☆" plain {...s.button('unreached')} onPress={() => a.face!(item, l)} />
                    )}
                  </Box>
                ))}
              <Text {...style('legend')}>{`added by ${item.by === 'claude' ? 'Claude' : 'you'}, ${when(item.addedAt)}${item.done ? '; done' : ''}`}</Text>
            </Box>
          )}
        </Box>
        )
      })}
      <Text {...style('legend')}>Press an item to go to it, its number to read it all; ▲ ▼ move it; · ticks it done. ◆ marks Claude's lists.</Text>
    </Box>
  )
}
