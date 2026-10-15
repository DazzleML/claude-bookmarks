# core/

Pure logic: no `$`, no engine calls, nothing that needs Claude Code to run. Everything here is tested with `node --test tests/core/*.test.ts` from the repository root, in Node's strip-only TypeScript mode (so no parameter properties or enums).

Two kinds of thing live here:

- **Functions** that take data and return data: parsing the transcript, numbering prompts, filtering, resolving settings, routing a key to an operation.
- **Classes that own shared state** (the one-owner rule, see `../README.md`): `MarkCache`, `BandState`, `MarkState`, `ScreenModel`, `PanePosition`. Each has named methods for every change, so a reader can find every writer.

`core/` imports only from `core/`.

## The groups

Each folder has its own README listing its files.

| Folder | What it is about |
|---|---|
| `band/` | The band (the strip above the prompt): its key table (`keys.ts`, the one place keys are defined), what happens after an action (`after-action.ts`), the number and footnote entry, the band's state, and the typed commands' names and descriptions (`commands.ts`) |
| `bookmarks/` | Bookmark records: the anchor (a durable address for a place in the conversation), the register file on disk, the `bookmark` tool's arguments, reading the transcript |
| `kit/` | Shared building blocks: the screen model (which messages Claude Code reports on screen), where the view was before a pane opened, message ids, the latest burst of reports, and the continuum (an ordered axis around a neutral zero, such as hidden < folded < shown) that several settings are built on |
| `log/` | The debug log's ring buffer and file names, the debug channels, the diagnostic commands' formatting |
| `marks/` | Lettered marks: the store's shape, the highlight of a marked line, the selection at the mark chord |
| `prompts/` | The prompts list: the stored prompts, footnotes, the filter, the kept prompt text, the prompt nearest the view |

At the top level: `settings.ts` (every setting, its default and how it resolves), `palette.ts` (colours by role) and `store-prune.ts` (what the plugin store keeps).
