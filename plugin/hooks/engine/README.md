# engine/

Where the code outside `register.tsx` meets Claude Code's engine.

- **`ports.ts`**: the type of every port, the object of small functions a handler gets instead of `$` (see `../README.md` for why). Each `XPorts` type is built by a top-level `xPorts($)` factory in `register.tsx`, which is the only place the engine calls are spelled. At the bottom, **the ownership table**: each piece of shared state, the code that owns it (and may change it), and who reads it. `tests/core/ownership.test.ts` checks the handlers and views against it.
- **`select.ts`**: capability paths (issue #18). For an engine API Claude Code is missing, the plugin can hold up to three ways of doing the thing and pick one at run time.

Nothing here calls the engine itself, and nothing here holds state.
