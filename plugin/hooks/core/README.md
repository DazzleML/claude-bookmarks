# core/

Pure logic: no `$`, no engine calls, nothing that needs Claude Code to run. Everything here is tested with `node --test tests/core/*.test.ts` from the repository root, in Node's strip-only TypeScript mode (so no parameter properties or enums).

Two kinds of thing live here:

- **Functions** that take data and return data: parsing the transcript, numbering prompts, filtering, resolving settings, routing a key to an operation.
- **Classes that own shared state** (the one-owner rule, see `../README.md`): `MarkCache`, `BandState`, `MarkState`, `ScreenModel`, `PanePosition`, `DrawnMessages`, `PromptsPaneState`, `SettingsState`. Each has named methods for every change, so a reader can find every writer.

`core/` imports only from `core/`.

## The groups

Each folder has its own README listing its files.

| Folder | What it is about |
|---|---|
| `band/` | The band (the strip above the prompt): its key table (`keys.ts`, the one place keys are defined), the person's keymap over it (`keymap.ts`), what a list's number field does with its text (`field-input.ts`, one contract for the band's field and the panes'), where a list number is typed (`routes.ts`), what happens after an action (`after-action.ts`), the number and footnote entry, the band's state, and the typed commands' names and descriptions (`commands.ts`) |
| `bookmarks/` | Bookmark records and their files: the anchor (a durable address for a place in the conversation), the register file and the operations a save carries, its migrations, the tiers, the Markdown note and what it reads back, the sessions index, the read-state file's shape, `/bm-check`, the data folder's README, the `bookmark` tool's arguments, reading the transcript |
| `kit/` | Shared building blocks: the screen model (which messages Claude Code reports on screen), the messages drawn since load, where the view was before a pane opened, message ids, the latest burst of reports, the plugin's folders, what a refused jump says, and the continuum (an ordered axis around a neutral zero, such as hidden < folded < shown) that several settings and the tiers are built on |
| `log/` | The debug log's ring buffer and file names, the debug channels, the diagnostic commands' formatting |
| `marks/` | Lettered marks: the store's shape, the highlight of a marked line, the selection at the mark chord |
| `prompts/` | The prompts list: the stored prompts, footnotes, the filter, the kept prompt text, the prompt nearest the view, the pane's own state |
| `transcript/` | The whole-conversation loader: the reader fed the transcript in pieces, and the index that lets the next load resume |

At the top level: `settings.ts` (every setting, its default and how it resolves), `settings-state.ts` (the settings as they stand, owned in one place), `settings-fold.ts` (which `/config` rows the folds leave out, and how a fold row is labelled), `palette.ts` (colours by role), `store-keys.ts` (every key family the plugin keeps in Claude Code's plugin store) and `store-prune.ts` (what that store keeps).
