# core/band/

The band (the one-line strip above the prompt) and the keys that drive it, without the engine. The handlers that use these are `handlers/band.ts` and `handlers/command-line.ts`; the band is drawn by `views/band.tsx`.

| File | What it decides |
|---|---|
| `keys.ts` | The plugin's own key router: one table from a key and a context (the command line, a list pane, the band's modes) to an operation. Every hint, legend and help line is generated from it, so a key is defined in one place. |
| `after-action.ts` | What happens after an action: whether the pane closes, whether the band's mode ends, and where the keyboard should go, as one decision instead of a choice at each call site (#29). |
| `band-entry.ts` | The band's number entry: what a typed entry means in the prompts list, when a number is complete, `N.k` footnote entries, stepping with `j`/`k`. |
| `band-state.ts` | `BandState`, the band's own state with one owner: the wait that ends a mode, the watch that notices Esc took the keyboard back, the focus ring's position, the Esc reminder. |
| `commands.ts` | The typed `/bm-*` commands' names and descriptions, registered at every session start. Each still has its own literal `on('command.run', ...)` in `register.tsx` (see `../../README.md`). |
