# core/bookmarks/

Bookmarks and the durable addresses behind them, without the engine. The reads and writes are done by `handlers/bookmarks.ts`.

| File | What it is |
|---|---|
| `anchor.ts` | The anchor: the durable address of a place in a conversation (a message's uuid and its line in the transcript), its record (`AnchorRecord`: owner, tier, label, why), and the `file:` link a bookmark is cited by. |
| `register-file.ts` | The bookmark register: one readable JSON file per conversation under the data root (`<dataRoot>/bookmarks/sessions/<session>.json`), with its `version` and `format`, a revision count, a `.bak` copy and a list of removed records; its verbs (add, relabel, share, claim, remove, prune), and how it is read and written. A file newer than the build is read and never written. |
| `register-ops.ts` | Operations on the register, as data: a save carries one operation, so when the file on disk changed since this session read it (another window, a hand edit) the operation is applied to the file as it is, instead of overwriting it. Also the mark letters' slots and their history, `forget`, and the merge of two copies of one file. |
| `migrations.ts` | Numbered, pure steps from one format version to the next, run when a conversation starts, each reading only what the handler backed up first. |
| `tiers.ts` | The tiers (transient, mark, perma, bookmark) as one ordered axis, stored by name; the gate a pane uses to show "bookmarks and up". |
| `note.ts` | Each bookmark's Markdown file as an Obsidian note: its front matter, and the three properties (`label`, `why`, `tags`) read back from it before it is rewritten. |
| `stars.ts` | Stars (shown as pins): a place starred in a list, with the list it was made in, turned off by a stamp rather than deleted, so the later touch wins when two copies of a register meet; whether a list shows only its own stars or every star on its rows (the `starScope` setting). Format v4; the v3 pins became stars from the prompts list. |
| `session-index.ts` | `sessions/index.json` and `sessions/INDEX.md`: every conversation with bookmarks, generated from the registers. |
| `read-state.ts` | The shape of the read-state file beside a register (where each reader stands with each prompt), fixed ahead of the feature that will write it (#34). |
| `check.ts` | `/bm-check`: a linter over the data folder that reports and never repairs. |
| `data-readme.ts` | The README the plugin writes into its data folder, rendered from `templates/data-readme.md` and the layout table here. |
| `bookmark-tool.ts` | The `bookmark` tool Claude calls: its schema, how a call is read, and the shapes it is answered with. |
| `transcript-lines.ts` | Turning matched lines of a conversation's transcript into message rows with their line number and byte range, and picking the row a quoted fragment or a uuid names. |
