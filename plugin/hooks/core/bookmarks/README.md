# core/bookmarks/

Bookmarks and the durable addresses behind them, without the engine. The reads and writes are done by `handlers/bookmarks.ts`.

| File | What it is |
|---|---|
| `anchor.ts` | The anchor: the durable address of a place in a conversation (a message's uuid and its line in the transcript), its record (`AnchorRecord`: owner, tier, label, why), and the `file:` link a bookmark is cited by. |
| `register-file.ts` | The bookmark register: one readable JSON file per conversation under the data root (`<dataRoot>/bookmarks/sessions/<session>.json`), with a revision count, a `.bak` copy and a list of removed records, and its verbs (add, relabel, share, claim, remove, prune). |
| `bookmark-tool.ts` | The `bookmark` tool Claude calls: its schema, how a call is read, and the shapes it is answered with. |
| `transcript-lines.ts` | Turning matched lines of a conversation's transcript into message rows with their line number and byte range, and picking the row a quoted fragment or a uuid names. |
