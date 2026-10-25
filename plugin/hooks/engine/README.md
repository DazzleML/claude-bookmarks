# engine/

Where the code outside `register.tsx` meets Claude Code's engine.

- **`ports.ts`**: the type of every port, the object of small functions a handler gets instead of `$` (see `../README.md` for why). Each `XPorts` type is built by a top-level `xPorts($)` factory in `register.tsx`, which is the only place the engine calls are spelled. At the bottom, **the ownership table**: each piece of shared state, the code that owns it (and may change it), and who reads it. `tests/core/ownership.test.ts` checks the handlers and views against it.
- **`select.ts`**: the capability table (issue #18). One row per engine feature the plugin stands in for (the jump past a compaction, the band handing its pane the keyboard, the arrows in a band field, the background transcript read, ...): what is missing, and up to three ways to do it (the proper API, a patched build's route, the stock workaround). A pure chooser picks the route from what the session start read (the build's version and its markers), and `/bm-env` prints the choice for each row.

Nothing here calls the engine itself, and nothing here holds state.
