# handlers/

What each feature does, one file per cluster, written against ports (`../engine/ports.ts`) rather than `$`. `register.tsx` registers the hook, builds the ports and calls in here; the handler decides what happens.

| File | The cluster |
|---|---|
| `band.ts` | The band's keys and modes, and opening a pane from it (`openFor`) |
| `command-line.ts` | The band's command line: the field the leader lands on, and `perform`, the one place a band command is done |
| `marks.ts` | Setting, showing and jumping to marks; the reading position |
| `navigation.ts` | Every jump, the jumplist (back and forward), and putting the view back after a pane or a highlight |
| `view-tracker.ts` | Which messages are on screen, the prompt nearest the view, and the prompts pane's row following it |
| `bookmarks.ts` | The bookmark register on disk, the `bookmark` tool Claude calls, promote and claim, the migrations at a start, the notes and the index, `/bm-check` |
| `prompts.ts` | The prompt store: the session's prompts and footnotes, and their kept text for the filter |
| `log.ts` | The debug log: the echo into the conversation, the debug channels, the log files and the timeline |
| `debug-command.ts` | `/bm-debug` |
| `diagnostics-commands.ts` | `/bm-ids`, `/bm-marks`, `/bm-sel`, `/bm-timeline`, `/bm-config`, `/bm-env` |

A handler may keep state only through a class from `core/` (or its own, listed in the ownership table); a module-level variable that the table does not list fails `tests/core/ownership.test.ts`.

Most files here were moved out of `register.tsx`; each one's header says when, and that its comments came across verbatim.
