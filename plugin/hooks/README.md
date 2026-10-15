# hooks/

The plugin's code. Claude Code loads one module, `register.tsx` (named in `hooks.json`), and everything else is reached from it.

## Why one module registers everything

Claude Code's validator reads `register.tsx` statically, so that it can find every hook the plugin registers and every engine call it makes (the `$` object each hook receives). Two rules follow, and they shape the whole folder:

- **Every hook is registered in `register.tsx`**, with its filter written literally (`on('command.run', { command: 'bm-ids' }, ...)`). A filter built at run time still works, but the validator can no longer say which command it is (it reports `command=?`).
- **`$` never leaves `register.tsx`.** The validator follows `$` only into functions declared there. Code in other files gets the engine through *ports*: plain objects of small functions, each spelled `$.noun.verb(...)` inside a top-level factory in `register.tsx` (`marksPorts($)`, `promptsPorts($)`, ...), whose types live in `engine/ports.ts`.

So `register.tsx` is the registrations, the ports factories, a few one-line wrappers that keep old call sites working, and the few things that must call `$` where the validator can see them (`log()`, which calls `$.ui.log`; the two functions that run a program, so their arguments stay literal and visible).

## The folders

| Folder | Holds | May import |
|---|---|---|
| `core/` | Pure logic and the classes that own shared state: no `$`, no engine, testable with `node --test` | `core/` only |
| `engine/` | The ports' types, the ownership table, and the capability paths for engine APIs Claude Code is missing | types from `core/` |
| `handlers/` | What each feature does (marks, band, navigation, bookmarks, prompts, log, the commands), written against ports | `core/`, `engine/` |
| `views/` | What is drawn (the band, the panes, a marked message), as JSX that takes already-resolved data and actions | `core/` |
| `scripts/` | PowerShell helpers the plugin runs on Windows, where `sh` and `grep` may be missing | nothing |

The direction is one way: `register.tsx` uses handlers and views; handlers and views use `core/`; `core/` uses nothing outside itself.

## Shared state has one owner

Every piece of state that more than one part of the plugin reads (the marks cache, the band's state, the screen model, the log files, ...) belongs to one class with named methods that change it, and the others read it through a port. The table of owners and readers is at the bottom of `engine/ports.ts`; `tests/core/ownership.test.ts` checks that no handler or view holds module state the table does not list.

## Tests

- `tests/core/` (repository root): `node --test tests/core/*.test.ts`, for everything in `core/` and the ownership and colour scans.
- `plugin/tests/`: `claude plugin test plugin`, which drives the hooks through a fake `$` (the kit).

Before a commit, also `npx tsc -p plugin --noEmit` and `claude plugin validate ./plugin`.

## Moving code here

Code moves between these folders are done copy-first (the source copied verbatim, then trimmed, then modified in small diffs), with every comment carried over; each moved file says so in its header and names the version it moved in.
