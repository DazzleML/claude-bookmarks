# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.85] - 2026-10-15

### Changed

- Internal, no visible change: the debug echo (whether log lines are drawn into the conversation: the machine-wide default and this conversation's choice) moved out of `register.tsx` into `handlers/log.ts`.

## [0.4.84] - 2026-10-15

### Changed

- Internal, no visible change: the prompt store (the conversation's prompts and footnotes, and the prompts' text kept for the filter) moved whole out of `register.tsx` into `handlers/prompts.ts`.

## [0.4.83] - 2026-10-15

### Fixed

- A band command that never finished (if Claude Code stopped answering one of its calls) left the band's field ignoring every key until a reload. After 10 seconds the field takes the next command, and the debug log says the last one did not finish.

## [0.4.82] - 2026-10-15

### Fixed

- Opening a second pane while the band still watched the first one (a mark pane, then the prompts list) could later apply the first pane's closing rule to the second. Opening a pane now stops the previous pane's watcher.

## [0.4.81] - 2026-10-15

### Fixed

- The debug log's note of a pane's size when it closes now describes the pane that closed; closing a list could report the size of the last mark or jump pane.

### Changed

- Internal: every toast is called the same way, with options only when a duration is given.

## [0.4.80] - 2026-10-14

### Changed

- The bookmarks pane (`<leader> b`) lists bookmarks only. The links Claude writes into its replies to cite earlier places (permalinks) are no longer listed there, so the pane holds what you and Claude chose to keep. The links still work from the replies.

## [0.4.79] - 2026-10-14

### Fixed

- A conversation resumed inside a running Claude Code session had its prompts list filled only from what arrived live; its earlier prompts were read from the transcript only at the next start. They are now read as soon as the plugin sees the resumed conversation.

### Changed

- Internal: the check that nothing draws a colour of its own now covers the views and handlers the drawing moved into, not only `register.tsx`.

## [0.4.78] - 2026-10-14

### Changed

- Internal, comments only: five file headers that called their location provisional now say the layout pass settled it.

## [0.4.77] - 2026-10-14

### Changed

- Internal, no visible change: the plugin's pure modules are grouped in folders by what they serve: `core/prompts/`, `core/marks/`, `core/band/`, `core/bookmarks/`, `core/log/`, and `core/kit/` for the pieces with nothing bookmark-specific in them. Settings, the palette and the store prune stay at the top of `core/`.

## [0.4.76] - 2026-10-14

### Added

- Internal: tests for promoting a mark into a bookmark (`/bm-promote`), which ends at the clipboard; the test harness now answers the clipboard and records what was copied.

## [0.4.75] - 2026-10-14

### Fixed

- The resets of 0.4.73 and 0.4.74 now actually happen at `/clear` and `/resume`. Claude Code does not run a plugin's session-start hook at either, so they were never reached. The plugin now notices a new conversation by its session id, wherever it next looks, and resets what the old one left in memory. A resumed conversation's marked lines are tagged again at once, where before they waited for the next mark set. Compaction keeps the same conversation and resets nothing.

## [0.4.74] - 2026-10-14

### Fixed

- After `/clear` or `/resume` in the same Claude Code session, the plugin's debug log lines went on into the previous conversation's log file, and `/bm-debug status` named that file. Each conversation now writes its own.

## [0.4.73] - 2026-10-14

### Fixed

- After `/clear` or `/resume` in the same Claude Code session, a highlight could stay showing, a mark set with nothing selected could land on a message of the previous conversation, and the prompts pane's yellow row could aim at the previous conversation's prompts. The highlight, the pane's remembered place, a mark chord's selection and the view tracker's state are now reset when a conversation starts.

## [0.4.72] - 2026-10-14

### Fixed

- After `/clear` or `/resume` in the same Claude Code session, `<leader> o` and `<leader> i` could walk the previous conversation's jumps, and the next jump could save them over the new conversation's own back-and-forward history. The jumplist in memory is now held only for the conversation it was read in.

## [0.4.71] - 2026-10-14

### Added

- Internal: an ownership check among the core tests. Each piece of shared state (the band's, the marks', the mark cache) may be changed only by the code that owns it, no handler or view reaches into `register.tsx`, and every piece of a handler's own state is listed in the ownership table.

## [0.4.70] - 2026-10-14

### Changed

- Internal, comments and indentation only: the three pane views indented to their own depth, and three comments the split left pointing at the wrong place now name where things live.

## [0.4.69] - 2026-10-14

### Changed

- Internal, no visible change: the panes' drawing (the prompts list with its footnotes, pins and filter, the bookmarks list by group, and the jump and mark letters) moved whole out of `register.tsx` into `views/prompts-pane.tsx`, `views/bookmarks-pane.tsx` and `views/marks-pane.tsx`.

## [0.4.68] - 2026-10-14

### Changed

- Internal, comments and indentation only: the two start functions moved in 0.4.67 indented to their new depth, and the start hook's note on what resets at a conversation boundary now names where each reset lives.

## [0.4.67] - 2026-10-14

### Changed

- Internal, no visible change: the session start hook hands each part of a conversation's start to the code that owns it. The register's load and prune moved to `handlers/bookmarks.ts`, the marks and the selection poll to `handlers/marks.ts`, and the typed-command table into `core/commands.ts`.

## [0.4.66] - 2026-10-14

### Changed

- Internal, comments and indentation only: the comments moved in 0.4.64 re-read against their new file, and the tool handler's body indented to its new depth.

## [0.4.65] - 2026-10-14

### Fixed

- After `/clear` or `/resume` in the same Claude Code session, the bookmarks list and the `bookmark` tool could show the previous conversation's bookmarks, and the next bookmark saved could write them into the new conversation's file. The register in memory is now held only for the conversation it was read in.

## [0.4.64] - 2026-10-14

### Changed

- Internal, no visible change: the bookmarks (the register file and its backup, minting, the per-message exports, bookmark links found in replies, pressing a link, arriving at a bookmark, promoting a mark, and the model's `bookmark` tool) moved whole out of `register.tsx` into `handlers/bookmarks.ts`.

## [0.4.63] - 2026-10-13

### Changed

- Internal, comments only: the comments moved in 0.4.62 re-read against their new files. One described an order the code had since reversed (when the mark chord reads the selection) and now says both; four now say where a relocated thing lives; the ownership note for the mark cache names its writers in both files.

## [0.4.62] - 2026-10-13

### Changed

- Internal, no visible change: the marks (the highlight, setting a mark, the reading position, jumping to a mark) moved whole out of `register.tsx` into `handlers/marks.ts`, and their own state (the highlight's timer, the selection at the chord, how old the selection is) into `core/mark-state.ts`, with 3 tests.

## [0.4.61] - 2026-10-13

### Changed

- Internal, comments only: the comments moved verbatim in 0.4.58-0.4.60 re-read against their new files; six that pointed at things the move relocated now say where they are.

## [0.4.60] - 2026-10-13

### Changed

- Internal, no visible change: the band's command line (the field the leader lands on, and the one place a band command is done, typed or pressed) moved whole out of `register.tsx` into its own `handlers/command-line.ts`, beside the key table it reads.

## [0.4.59] - 2026-10-13

### Changed

- Internal, no visible change: stepping through a list from the band (next and previous, `j` and `k` by default) is carried as a direction from the key table, no longer as the letters themselves, a first step toward every key being configurable.

## [0.4.58] - 2026-10-13

### Changed

- Internal, no visible change: opening a pane from the band or a command (the pane, its title and size, the view kept in place, the band taking the key when the pane cannot), and the band-only mode used when lists are off, moved whole out of `register.tsx` into `handlers/band.ts`.

## [0.4.57] - 2026-10-13

### Changed

- Internal, no visible change: the band's `?` help (opening it, and noticing Esc or a click to end it) moved whole out of `register.tsx` into `handlers/band.ts`.

## [0.4.56] - 2026-10-13

### Changed

- Internal, no visible change: the band's focus probe (how the plugin notices that Esc or a click took the keyboard away from the band) moved whole out of `register.tsx` into `handlers/band.ts`.

## [0.4.55] - 2026-10-13

### Changed

- Internal, no visible change: the band's number-row keys (digits, `.`, `j`/`k`, `s` pin, `c` claim, `go`, and the list keys) moved whole out of `register.tsx` into `handlers/band.ts`.

## [0.4.54] - 2026-10-13

### Changed

- Internal, no visible change: the close path (what an action leaves behind, the band's mode ending, the pane closing, and `q`) moved whole out of `register.tsx` into `handlers/band.ts`.

## [0.4.53] - 2026-10-13

### Changed

- Internal, no visible change: the band's own state (the wait that ends a band mode, the watch that notices Esc, the focus ring, the band's id, the Esc reminder) is now one class with named writers (`core/band-state.ts`), with its own tests, instead of five variables written from eight places.

## [0.4.52] - 2026-10-13

### Changed

- Internal, no visible change: the in-memory copy of the conversation's marks is now one class with two named writers (`core/marks.ts` MarkCache), so every place that changes it can be found by name.

## [0.4.51] - 2026-10-13

### Changed

- Internal, no visible change: every jump, the jumplist (`<leader> o` / `i`), and the view's return after a pane or a highlight moved whole out of `register.tsx` into `handlers/navigation.ts`, which owns the jumplist's state.

## [0.4.50] - 2026-10-13

### Changed

- Internal, no visible change: where the view goes back to after a pane closes or a highlight redraws a message is now one class with named writers (`core/pane-position.ts`), with its own tests, instead of three variables written from several places.

## [0.4.49] - 2026-10-13

### Changed

- Internal, no visible change: the view tracker (which messages are on screen in conversation order, the prompt nearest the view, where "back" returns to, and the prompts list's yellow row following the view) moved whole out of `register.tsx` into `handlers/view-tracker.ts`, as a class that owns its state.

## [0.4.48] - 2026-10-12

### Changed

- Internal, no visible change: how a reply is drawn when it carries a mark or bookmark links (the marked line, the link legend, the bold form) moved out of `register.tsx` into `views/marked-message.tsx`.

## [0.4.47] - 2026-10-12

### Changed

- Internal, no visible change: the band's drawing (its bar, help, letter and number modes) moved out of `register.tsx` into `views/band.tsx`; the hooks module gathers what to draw and what each press does.

## [0.4.46] - 2026-10-12

### Changed

- Internal, no visible change: the marked line a mark or bookmark draws on a message, and the column it sits in, are the first piece of drawing moved out of `register.tsx` into `views/marked-message.tsx`.

## [0.4.45] - 2026-10-12

### Changed

- Internal, no visible change: the six diagnostic commands (`/bm-ids`, `/bm-marks`, `/bm-sel`, `/bm-timeline`, `/bm-config`, `/bm-env`) are handled outside `register.tsx` through the same callback set `/bm-debug` uses. Five tests pin their words.

## [0.4.44] - 2026-10-12

### Changed

- Internal, no visible change: `/bm-debug` is the first command handled outside `register.tsx`. The hooks module hands it a small set of callbacks for the engine calls it needs, which Claude Code's validator allows where handing it the engine itself is refused. Five tests pin the command's words. The test harness now remembers an environment variable the plugin sets.

## [0.4.43] - 2026-10-12

### Changed

- Internal, no visible change: the tenth move of the `register.tsx` split. What `/bm-delmarks` deletes (named letters, or every set one; the reading position never) now lives in `core/marks.ts` with a test.

## [0.4.42] - 2026-10-12

### Changed

- Internal, no visible change: the ninth move of the `register.tsx` split. What a number typed in the band or a list means (a jump, a pin, the filter, a footnote, an unfold), when a number is complete, where `j` and `k` go, and which bookmark group comes next now live in `core/band-entry.ts` with their own tests.

## [0.4.41] - 2026-10-12

### Fixed

- The bookmarks list dimmed every row as "not drawn yet", because it compared a bookmark's uuid with the id Claude Code draws a message under, which differs in its last group. It now dims the way the prompts list does, by the uuid's first four groups, so only bookmarks whose message has not been drawn since the plugin loaded are dim.

## [0.4.40] - 2026-10-12

### Changed

- Internal, no visible change: the eighth move of the `register.tsx` split. The lists' model (numbering, footnotes under their prompt and whether they show, the pinned group, the `▶` pointer, the dim rule, the bookmarks pane's words) now lives in `core/list-model.ts` with its own tests; the pane keeps the drawing.

## [0.4.39] - 2026-10-12

### Changed

- Internal, no visible change: the seventh move of the `register.tsx` split. The mark types, the rule for which mark a row shows, and the phrase a transcript search is given now live in `core/marks.ts` with their own tests.

## [0.4.38] - 2026-10-12

### Changed

- Internal, no visible change: the sixth move of the `register.tsx` split. The `bookmark` tool's schema, how its call is read (trimming, defaults, the tier rule) and the shapes it answers with now live in `core/bookmark-tool.ts` with their own tests; the handler keeps the register-file, transcript and mint calls.

## [0.4.37] - 2026-10-12

### Changed

- Internal, no visible change: the fifth move of the `register.tsx` split. What is on screen, as Claude Code last reported it, and the two-second window in which a redraw is the plugin's own now live in `core/screen-model.ts` with their own tests.

## [0.4.36] - 2026-10-12

### Changed

- Internal, no visible change: the fourth move of the `register.tsx` split. Where a mark's line sits in a message's text and the bold `«a»` forms used when that line cannot be drawn on its own now live in `core/highlight.ts` with their own tests.

## [0.4.35] - 2026-10-12

### Changed

- Internal, no visible change: the third move of the `register.tsx` split. The prompt store's keys, what a transcript read yields, how it merges with the prompts captured live, and the list the pane draws now live in `core/prompt-store.ts` with their own tests; `register.tsx` keeps the store, file and program calls.

## [0.4.34] - 2026-10-12

### Changed

- Internal, no visible change: the second move of the `register.tsx` split. What the `/bm-*` diagnostic commands decide and say (how `/bm-jump` reads its argument, how `/bm-ids` classifies a drawn id, `/bm-debug`'s words, the `/bm-config` and `/bm-env` lines) now lives in `core/diagnostics.ts` with its own tests; the handlers keep only the engine reads.

## [0.4.33] - 2026-10-12

### Changed

- Internal, no visible change: the first move of the `register.tsx` split. The bounded line rings behind the debug log, the screen log and the event timeline, what a reload does with the lines a file already holds, and the log-echo policy (forced, chosen, default) now live in `core/log-ring.ts` with their own tests; `register.tsx` keeps only the file and store calls.

## [0.4.32] - 2026-10-12

### Fixed

- A new conversation in the same Claude Code process (`/clear`, `/resume`) no longer inherits the previous one's open footnotes, prompts filter or band state: a session start puts them back to their defaults.

### Changed

- Tests only, otherwise: the test harness can answer the program the back-fill runs, so the transcript read is pinned (file prompts first, then prompts captured live; commands, notices and skill bodies are not prompts; a complete read is not repeated; a read cut off at 4 MiB is retried at the next start). Also pinned: "go" with nothing typed closes the list, and a session start folds footnotes.

## [0.4.31] - 2026-10-12

### Changed

- Tests only: six tests pin behaviour the `register.tsx` split must keep -- the store prune at session start (and its control), a typed prompt being listed while a task notification or a queued notice is not, and a submitted prompt ending the band's wait for a number.

## [0.4.30] - 2026-10-12

### Changed

- Tests only, before the `register.tsx` split: the test harness can now say a pane is open and answers the calls the plugin makes when a session starts, so start-up can be tested; the `q` test now checks that the pane really closes; a check that could not fail is gone; a control added where a test only checked that something did not happen. `docs/engine-quirks.md` corrected: a test can raise a session start.

## [0.4.29] - 2026-10-12

### Added

- **Footnotes fold again** ([#33](https://github.com/DazzleML/claude-bookmarks/issues/33)): once a prompt's footnotes are open, a dim `▴ fold` row under them closes them, and typing `12.` a second time does the same.
- With "Footnotes in the prompts list" set to `hidden`, `12.1` still jumps to that footnote, and `12.` says the footnotes are hidden and where the setting is, instead of doing nothing.

## [0.4.28] - 2026-10-12

### Added

- **`q` closes the pane from the keyboard**: after the leader (`Ctrl+] q`), in the band's list row, or typed alone in a pane's `#` field. It closes the plugin's pane and ends whatever the band was doing, which matters once "Prompts or bookmarks list after you pick a row" is `stay` and the list stays open. `q` quits a view as it does in Neovim's and Emacs's non-editing buffers; the `?` help and the lists' hints name it.

## [0.4.27] - 2026-10-12

### Fixed

- **The prompts list showed notices that were not yours** ([#15](https://github.com/DazzleML/claude-bookmarks/issues/15)): a background task's `[SYSTEM NOTIFICATION ...]`, another Claude session's message, a goal check. Claude Code queues them into a running turn the same way as a message you type while Claude is working, and the list took them for yours. The list is your own inputs only; notices are left out, ones already kept drop out, and the numbers close up. Your interruptions and slash commands stay as footnotes.

### Changed

- The setting "A list after a jump" is now "Prompts or bookmarks list after you pick a row" in `/config`: `stay` keeps the list open after you click a row. A value you already chose is kept.

## [0.4.26] - 2026-10-12

### Fixed

- **`?` clicked on the band closed at once.** A click leaves the keyboard where it was, and the help was closing as soon as it saw the band did not hold it. It now stays until `close`, `Enter`, a minute, or a prompt typed.
- **The help jumped back to the top while you scrolled it with the keyboard.** The check that notices `Esc` moved the band back to its `close` button every moment. The help is now drawn to fit the band: one line per command where there is room, and a four-line form (each key with a one-word label) where there is not.

### Added

- `docs/keys.md` explains why jump and read have two keys each (`'` or `j`, `Space` or `r`: a band button can only answer a letter or digit), why `j` means "next" inside a list, and that choosing your own keys is planned ([#36](https://github.com/DazzleML/claude-bookmarks/issues/36)).

## [0.4.25] - 2026-10-12

### Fixed

- **A long conversation's prompt list missed its newest prompts, and was read again at every start** ([#15](https://github.com/DazzleML/claude-bookmarks/issues/15)). The read of your prompts from the transcript is capped at 4 MiB, and in a long conversation most of what it read was Claude Code's own notes stored beside your messages (skill text, system notes). It now leaves those out: measured on an 84 MB transcript, 4.2 MB cut off became 1.5 MB read whole in about a second.

### Added

- `/bm-config` says how many of the plugin's settings Claude Code's `/config` lists. They are at the bottom of `/config`, each ending `· bookmarks`; typing `bookmarks` in its search box shows only them.

## [0.4.24] - 2026-10-12

### Changed

- **The band reads once** ([#29](https://github.com/DazzleML/claude-bookmarks/issues/29)). At rest it shows `mark  jump  prompts  read  ?`: the field's row of bare letters (`' m ␣ p b P o i`) is gone, and each word does exactly what its key does after the leader. The band's rows for the prompts and bookmarks lists are drawn from the same key table as their hints, so they cannot offer a key the hint does not name.

### Added

- **`?` shows every command**: type it after the leader or click it. The help lists the commands the bar has no room for (`b`, `P`, `o`, `i`), the keys of the prompts and bookmarks lists, and how the switches below are set; `Enter` or `Esc` closes it.
- Three switches in `/config`: "The band" (`full`, or `field`: the command field alone), "Chords on their own keybindings" (`off` stops mark, jump, prompts and read answering the optional chords, to try the plugin without them), and "Lists in a pane" (`off`: `p` and `b` take a number in the band and jump, with no pane).

## [0.4.23] - 2026-10-12

### Added

- **Filter the prompts list** ([#28](https://github.com/DazzleML/claude-bookmarks/issues/28)). Type `/` and some words in the prompts pane's `#` field (`/bm-prompts` from an empty input box) to list only the prompts containing all of them, in any order and any case. Prompts keep their numbers, pinned prompts are filtered too, and a line above the list says `N of M match`. With a filter active, the first `Esc` clears it and the second closes the pane.
- The filter searches the whole text of your prompts, not only the excerpt the list shows. That text is kept per conversation in `~/claude/bookmarks/prompttext/`, up to "Prompt text kept for the filter (bytes)" in `/config`, 2 MB by default, newest first; `0` keeps everything, and lowering it frees the space at once. Conversations are read once more to collect the text of their earlier prompts.

### Changed

- The band's hint for the prompts list no longer offers `/ filter`: a band key is one letter or digit, so the filter lives in the pane's own field.
- **The plugin's storage stays small** ([#15](https://github.com/DazzleML/claude-bookmarks/issues/15)). Claude Code gives a plugin one storage file for every conversation, refused past 4 MiB in all, and the plugin never removed anything from it. Now a conversation not opened for 30 days gives up its prompt list and footnotes, which are read again from the transcript when you reopen it; its marks, pins and reading position stay. Conversations already stored count from today.

## [0.4.22] - 2026-10-12

### Added

- **Footnote numbers** ([#33](https://github.com/DazzleML/claude-bookmarks/issues/33)): `3.1` + Enter jumps to prompt #3's first footnote, and `3.` + Enter unfolds #3's footnotes; whole numbers work as before. In the prompts pane's number field you type the dot; in the band, click the `.` button between the digits and `k`/`j` (a band key can only be a letter or a digit).

## [0.4.21] - 2026-10-12

### Added

- **Footnotes in the prompts list** ([#33](https://github.com/DazzleML/claude-bookmarks/issues/33)). Your slash commands, `!` shell commands and interruptions now appear under the prompt they followed, numbered `N.k` (`3.1`, `3.2`, ...) so whole prompt numbers never change. They are folded by default: a prompt that has some shows a dim `… 2 footnotes` row, and pressing it unfolds them; a footnote row jumps to its place. "Footnotes in the prompts list" in `/config` chooses `folded`, `shown` or `hidden`. Compactions, task notifications and the engine's own messages are not footnotes: the list stays your own markers. Conversations are read once more to find their footnotes.

## [0.4.20] - 2026-10-12

### Added

- **Claude's references are perma by default** ([#21](https://github.com/DazzleML/claude-bookmarks/issues/21), [#19](https://github.com/DazzleML/claude-bookmarks/issues/19)). Each record now has a tier. When Claude bookmarks a place for its own use, the record is `perma`: a stable link it cites, drawn without the `⚓`, so its references no longer look like bookmarks you made. A bookmark Claude makes for you, or one it marks `tier: "bookmark"`, keeps the `⚓`. Records from before this version are bookmarks.
- **`claim`**: Claude's `bookmark` tool can move one of its records onto your list, with the same message, id and link. Ask Claude to claim it for you, or press `c` in the bookmarks list (`Ctrl+] b`, choose one of Claude's with its number or `j`/`k`, then `c`).

## [0.4.19] - 2026-10-12

### Changed

- **One palette, by role, readable on light themes too** ([#27](https://github.com/DazzleML/claude-bookmarks/issues/27)). Every colour, background, dim and bold the plugin draws now comes from one palette by what it means (the prompt nearest your view, a pin, a mark's words and band, hints, taken and free mark letters), and the defaults are Claude Code's theme keys wherever one fits, so they follow your theme. The band behind a marked line is pale on a light theme and navy on a dark one. The prompts list's legend shows a sample in the nearest-row colour instead of naming it, and taken mark letters use the theme's inactive colour.

### Added

- "Colour overrides" in `/config`: JSON naming roles, e.g. `{"here": {"color": "cyan"}}`. A colour that is not a theme key, a terminal colour name or `#rrggbb`, an unknown role, or text that is not JSON is ignored, and the defaults stand.

## [0.4.18] - 2026-10-12

### Changed

- **After a band action, the first stray key says to press `Esc`** ([#24](https://github.com/DazzleML/claude-bookmarks/issues/24)). After a jump, `o`/`i`, the reading position or a promote, the band still holds the keyboard (Claude Code does not let a plugin hand it back), so the words you start typing used to go nowhere. Now the first key the band does not know shows a toast saying to press `Esc`, once per action. With "Keyboard after an action" set to `band` in `/config`, it stays quiet.
- Every pane close now goes through the same after-action rule ([#29](https://github.com/DazzleML/claude-bookmarks/issues/29)): a mark or jump letter, the jump pane's reading row, `go` with no number, and a pane refused over a typed command. Nothing visible changes at the default settings.
- The line the debug log writes for each band command quotes what was typed only when "Conversation text in the debug log" allows it, as does the line about the pane taking the keyboard.

## [0.4.17] - 2026-10-12

### Added

- **Settings in `/config`** ([#7](https://github.com/DazzleML/claude-bookmarks/issues/7)). The plugin's settings now appear in Claude Code's `/config` under its name, and a change takes effect at once: where the prompts list opens (`nearest` or `newest`), whether it follows the view (`when-idle`, `always`, `never`), how close an earlier exchange must be to count as nearest, whether a list stays open after a jump or while you type, where the keyboard should go after an action, and the debug echo's default. `/bm-config` prints each setting, its value, and whether it came from `/config` or the default. The README has the full table.
- **Conversation text in the debug log is a setting** ([#35](https://github.com/DazzleML/claude-bookmarks/issues/35)). Log lines that quote the conversation (the selected words, a message's first line, a bookmark's label) follow "Conversation text in the debug log": `auto` (the default) is off in a plugin installed from a marketplace and on in one loaded from a folder, `with-debug` quotes while `/bm-debug on`, and `off` and `always` mean what they say. "How much text a debug line quotes" chooses a short excerpt or the whole text. A new `text` debug channel turns quoting on for one conversation.

## [0.4.16] - 2026-10-12

### Added

- Tests that run the plugin inside Claude Code's own test kit (`claude plugin test plugin`): the band at rest, `p` opening the prompts pane with the band taking a number, the pane's rows, and `/bm-config`. They draw exactly what the plugin draws and type into the band as a person does, so a restructuring of the plugin cannot change what you see without a failing test. A small harness answers every call the plugin makes to Claude Code from memory, so the tests never touch your files or start a process.
- `docs/engine-quirks.md`: what the test kit can drive, and that every call to Claude Code has to stay in the plugin's main file (the validator follows them nowhere else).

## [0.4.15] - 2026-10-12

### Changed

- The debug log keeps no text from the conversation unless debugging is on for it (`/bm-debug on`). Lines that quote a selection, a message's first line, a bookmark's label, highlighted words or the `bookmark` tool's input are written only then, as `PRIVACY.md` describes. `docs/troubleshooting.md` says so.
- The pure core's tests moved from `plugin/hooks/core/` to `tests/core/`, so the installed plugin carries only the code it runs, and CI now runs them (`node --test tests/core/*.test.ts`) beside the Python checks.

## [0.4.14] - 2026-10-12

### Changed

- Internal tidy: the marked line (the soft band with the mark's letter and words) is drawn by one helper on prompts and replies alike; the plugin's pane id and a few comments lose their prototype-era names. No visible change.

## [0.4.13] - 2026-10-12

### Changed

- Internal tidy: when the band loses the keyboard (a click in the input box), the same after-action rule as everywhere else decides whether the pane stays. With the default settings a list stays open and the mark and jump panes close, as before.

## [0.4.12] - 2026-10-12

### Changed

- Internal tidy: the check for a bookmark already recorded uses the same lookup as the rest of the plugin. No visible change.

## [0.4.11] - 2026-10-12

### Changed

- Internal tidy: one definition of which panes are lists (prompts and bookmarks), shared by the band and the after-action rules. No visible change.

## [0.4.10] - 2026-10-12

### Changed

- Internal tidy: one tested helper places a message drawn on screen in the conversation's order (it was written out twice). No visible change.

## [0.4.9] - 2026-10-12

### Fixed

- The debug log's lines have a space after `[bm]` again, and the `screen` debug channel copies the prompts pane's moves into its log again. Both broke in 0.4.7.

## [0.4.8] - 2026-10-12

### Changed

- The band's empty field shows a key for every command (`' m ␣ p b P o i`); it used to show only `' j m p ␣`. The bookmarks pane's key line comes from the same table that decides what the keys do, so the two cannot disagree ([#29](https://github.com/DazzleML/claude-bookmarks/issues/29)).

## [0.4.7] - 2026-10-12

### Changed

- Every line in the plugin's debug log starts with `[bm]`; most used to start with `[bm-poc]`, a name left from the plugin's prototype.

## [0.4.6] - 2026-10-12

### Changed

- Internal: one tested rule now decides when two ids name the same message (Claude Code reports a message on screen under an id that differs from the stored one in its last part). No visible change.

## [0.4.5] - 2026-10-12

### Changed

- The debug log's lines say what happened ("chord jump", "/bm-jump", "anchor link") instead of the internal test codes they carried from the plugin's prototype.
- The version test checks for a valid Python package version on any branch; it had failed on every automated run.

## [0.4.4] - 2026-10-12

### Added

- `/bm-config` lists every setting, its value and where it came from. Every value is the default for now; the settings you choose in Claude Code's `/config` come next ([#7](https://github.com/DazzleML/claude-bookmarks/issues/7)).

### Changed

- The prompts list stays open while you type in the input box; only the band's key mode ends. Before, typing closed the list ([#29](https://github.com/DazzleML/claude-bookmarks/issues/29)).
- The hint the band shows for an unknown key lists every band key, from the same table that decides what each key does, so the two cannot disagree.
- The `/bm-*` commands meant for diagnosing problems now say so in the command menu, and the prompts pane's title says to type a number.
- The install instructions name Claude Code 2.1.287 or later, the version the plugin needs, in every place they appear.

## [0.4.3] - 2026-10-12

### Changed

- The debug channels are kept in the same environment variable as the debug echo, `CONVO_BOOKMARKS_DEBUG`, rather than a second one. From a shell, channel names join the echo's value: `CONVO_BOOKMARKS_DEBUG=screen claude`, or `CONVO_BOOKMARKS_DEBUG=1,screen claude` with the echo on as well. Values from before (`1`, `0`, `off`) work as they did.

## [0.4.2] - 2026-10-12

### Added

- Debug channels: diagnostics too heavy or too narrow to run all the time, each off until you turn it on for one conversation. `/bm-debug channels` lists them, `/bm-debug enable screen,held` and `/bm-debug disable screen` switch them, and `/bm-debug status` shows which are on. `screen` writes every on-screen report Claude Code sends the plugin to `<session id>.screen.log` beside the debug log, for a prompts pane whose highlight lands on the wrong prompt; `held` logs which rule kept the prompts pane's highlight where it was. The choice ends with the session; from a shell, `CONVO_BOOKMARKS_DEBUG_CHANNELS=screen claude`. ([#35](https://github.com/DazzleML/claude-bookmarks/issues/35))

## [0.4.1] - 2026-10-11

### Fixed

- The prompts pane's yellow row no longer jumps to the newest prompts after you move with a click or a key. When the view jumps, the messages it leaves behind are never reported as gone, and the pane listened only to messages, not to tool calls and their output. So while a stretch of tool output filled the screen, the last messages the pane had heard of were the ones you had jumped away from, and the yellow row went to them. The pane now also hears tool rows, command output and notices, and when no message is on screen it keeps the yellow row where it was.
- The prompts pane's yellow row no longer jumps to a message that was only redrawn, not viewed. A message redrawn off screen (a bookmark link minted into it, a highlight cleared) reports itself as fully on screen, and that single report displaced the real view, so the highlight could leap from the prompt above you to one five exchanges back. Such reports are now recognised by their shape and ignored, and the previous answer stands. The debug log's "nearest prompt moved" line shows each message's visible range against its row count.
- The prompts list recognises a compaction summary by the flag Claude Code stores on it, not only by its opening sentence, so a change in that wording cannot put the summary back in the list. Messages another agent sends into the conversation are not counted as prompts either.
- Messages typed while Claude was working are now added to the prompts list as they arrive. 0.4.0 found them when it read the transcript, but stored the ones arriving live under the wrong kind, so every later one went missing until the next full read. Background-task notifications, which Claude Code files as user rows, no longer appear as prompts. The list is rebuilt once more to pick up what was missed.

## [0.4.0] - 2026-10-11

### Added

- The prompts pane shows where you are: the prompt nearest your view has its number in yellow, and the list opens scrolled to it instead of to the newest prompt. The prompt whose exchange (the prompt and the replies after it) fills most of your screen wins, and when two are close the earlier one does, so you get the context above as well as below. The highlight follows the view while the pane is open, and the list slides the least that keeps the yellow row showing, never while you are picking a row from the band.

### Fixed

- Messages typed while Claude was working are in the prompts list. Claude Code queues such a message and stores it as an attachment rather than a user row, so the list skipped it, both when reading the transcript and as it arrived. Conversations already read are read once more at their next start to pick them up.
- The prompts list no longer carries rows that are not prompts: interruption notices and slash-command echoes the live capture had kept before it could tell them apart. When the transcript was re-read, those rows were appended after the real prompts, so every number past that point was too high and the yellow row sat on the wrong prompt. The list is rebuilt once more at the next start, and such rows are dropped as they arrive.

## [0.3.5] - 2026-10-09

### Added

- `SECURITY.md`: how to report a vulnerability privately (GitHub's private reporting, with an issue as the fallback), what to include, what to expect, and what is in scope. The directory's terms ask for a reporting mechanism; GitHub shows this page under the repository's Security tab.

### Changed

- The two places the plugin runs a program now spell the whole command out at the call: program name, flags and script path as plain text, with only the transcript path and the search text as variables. Same programs, same order, same timeouts; the change is for anyone reading the code, including the directory's own reader.
- The plugin README says what the prompt hooks do: catch the plugin's own `/bm-` commands and keep your draft intact while a pane is open; anything else typed passes through untouched.
- The directory listing's Support link points at the issue tracker (`supportUrl` in the manifest) instead of the repository front page, and its Documentation link at the `docs/` folder (`documentationUrl`) instead of the status page alone. Both listing-only; Claude Code ignores the fields.
- `docs/README.md`: an index of the documentation, which GitHub shows when the `docs/` folder is opened.
- The listing's Terms of service link points at the GPL-3.0 licence (`termsOfServiceUrl`): there is no hosted service and no agreement beyond the licence.

## [0.3.4] - 2026-10-09

### Added

- `PRIVACY.md`: what the plugin reads, writes, runs and sends (nothing), and how to remove everything it stored. Linked from the manifest as the privacy policy, so the directory listing shows it, and from the plugin README.

## [0.3.3] - 2026-10-09

### Changed

- The plugin README, the directory listing, opens its disclosure section with what the plugin sets (one environment variable, no configuration or settings file) and points reviewers to that section from the top of the page.
- Two internal constants renamed so the directory's credential heuristic no longer pairs them with the README. No behaviour change.

### Removed

- The "Extended history with the patcher" section of the main README. The compaction tip now links to the engine notes in `docs/engine-quirks.md`, where the patched builds are documented for those who want them; the plugin never depends on them.

## [0.3.2] - 2026-10-09

### Added

- A listing icon, `plugin/.claude-plugin/icon.png` (a yellow bookmark ribbon on the band's blue, 1024 px), which the Anthropic plugin directory takes once at the first submission.

### Changed

- Two identifiers renamed for the directory's static reader, which treats any binding named `on` as the hook registrar and any identifier containing `KEYS` as a credential: the echo setter's parameter and an arrow variable are now `enabled`; the group-switch constant is `GROUP_CYCLE`. No behaviour change. The marketplace file's sibling entries use full HTTPS `url` sources, so an install from this repository as a marketplace never clones over SSH.

## [0.3.1] - 2026-10-09

### Fixed

- `Ctrl+] '` (or `j`) opens the jump pane again, listing your marks and the reading position, and the letter jumps from it. Since 0.2.0 the band waited for the letter in silence and nothing opened, while the docs promised the pane.

### Changed

- The plugin folder's README is the plugin's listing: what it does, a screenshot, the install from one place only (the directory or a marketplace, never both), and a section on everything the plugin runs, reads, writes and sends (two PowerShell scripts on Windows, the transcript it reads, the store and the files under `~/claude` it writes, the clipboard, and no network at all). Links are absolute, so they work wherever the README is shown. `homepage` added to the manifest. The listing's screenshot lives in `plugin/images/` (the one file the listing needs), the other under `docs/images/`; nothing is duplicated.

## [0.3.0] - 2026-10-09

### Changed

- **The plugin is named `bookmarks`** (published by DazzleML; the repository stays `claude-bookmarks`, since plugin names may not start with `claude-`). Claude's tool is therefore `mcp__bookmarks__bookmark`, and the dim log rows read `bookmarks:`. Claude Code keeps a plugin's marks, pins, reading positions and jumplists in a store file named after the plugin, so on a machine that ran 0.2.x those move to the new file once; the bookmark files under `~/claude/bookmarks/` are unaffected. (The manifest's author is now DazzleML, the publisher the directory shows.)
- **The plugin lives in the repository's `plugin/` folder.** An install carries the plugin (the manifest, the mod, its pure core, the PowerShell fallbacks, a README and the licence), not the repository's tests, docs and tooling. Point `--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS` at `<repo>/plugin`.
- **This repository is also a marketplace** (`.claude-plugin/marketplace.json`, named `dazzle-claude-plugins`): `/plugin install bookmarks --marketplace DazzleML/claude-bookmarks` installs it in one step on Claude Code 2.1.275 or later.
- README: a screenshot of the plugin in use at the top (the prompts pane, a marked line, a bookmark link, the band); usage shows the jump pane.
- The two PowerShell fallbacks for reading the transcript on Windows are scripts shipped with the plugin (`hooks/scripts/`), run with `-File`, in place of base64-encoded inline commands. Their output is unchanged: the row list and the byte offsets agree with `grep` line for line on a 4 MB transcript, and the user-row match is now case-sensitive, as `grep -F` is.

## [0.2.2] - 2026-10-09

### Added

- `docs/keys.md`: every key in one place, grouped by where the keyboard is (the input box, the band, the band with a pane open, a pane that holds the keyboard, typed commands, optional keys).
- `docs/status.md`: what works today, the known issues with where each is tracked, and the big changes coming (#26 the pane takes the keyboard, #25 references by name, the mark record change, search, settings).

### Changed

- README: the status and key pages lead the documentation list; the pre-alpha notice says Windows is the only tested platform; the install section names the one-command install for when the plugin is listed; "How it works" describes the attribution rule rather than "only from a button press".
- Usage and the README no longer describe the once-per-version "press Enter" probe, which v0.2.0 removed.

## [0.2.1] - 2026-10-09

### Fixed

- `/bm-debug` is per conversation. In 0.2.0 the echo switch was one setting for the whole machine, so `/bm-debug off` in one session silenced every other. Now `/bm-debug on|off` affects only the conversation it is typed in: the choice lives in that session's own environment, survives the plugin reloading, reaches processes the session starts, and ends with the session (a resumed conversation starts from the default). `CONVO_BOOKMARKS_DEBUG=1 claude` gives the same signal from the shell. `/bm-debug reset` drops the choice.
- `/bm-env` printed nothing while the echo was off; a command's answer is now always drawn.

### Added

- `/bm-debug default on|off` sets the default every conversation without a choice of its own follows; `/bm-debug force on|off` makes every conversation echo, or stay silent, with no exceptions, and reaches open sessions on their next log line. `/bm-debug status` and `/bm-env` say which is in effect. A fresh install is off and overridable; the only thing written to disk is that one default-and-force setting.
- Troubleshooting: why a pane does not open in a narrow terminal (under about 110 columns), and the remedy.

## [0.2.0] - 2026-10-09

### Added

- **Bookmarks**: permanent, addressable places in the conversation, kept as readable files under your own folder (`~/claude/bookmarks/sessions/`, or `CLAUDE_USER_DIR`): a JSON register per conversation and one markdown file per bookmarked message, with the message text, every field, a verify-by-hand recipe and a Notes section that survives rewrites. A bookmark's address is a `file:` link to that file with the message's uuid, transcript line and byte range in its query string.
- **Claude cites with bookmarks.** A `bookmark` tool for the model: a verbatim fragment (or a uuid) and a label in, a markdown link out. The tool resolves the fragment against the transcript (the earliest message containing it; several matches are returned as candidates, never guessed), and can also `relabel`, `remove` (archived as a tombstone, never deleted), `share` and `list`.
- **Clickable links in replies.** A bookmark link is drawn with a `⚓` marker and a legend line; a plain click jumps to the message and highlights the words the link names in the mark colours; a ctrl-click opens the bookmark's file. File links get a `▤` marker. A bookmark link written by hand is recognised when drawn and recorded.
- **Two lists.** Your bookmarks and Claude's are separate: Claude's own citations never land on your list unless you ask ("bookmark this for me") or Claude shares one. `Ctrl+] b` (and `/bm-bookmarks`) opens on your list; `l` and `h` switch to Claude's and to all; numbers are shared across the groups; a number and `Enter` jumps. Each row shows the label, then its age, who said the message, where the bookmark came from, and the "why".
- `/bm-debug on|off|status`: the plugin's log lines are no longer echoed into every conversation as dim rows; the echo is off by default and switched per machine by this command (or `CONVO_BOOKMARKS_DEBUG=1`). The file log under `~/claude/bookmarks/debug/` is always written.
- **Promote a mark**: `Ctrl+] P` then its letter (or `/bm-promote a`) makes a bookmark of that mark's message on your list, keeps the letter, and copies the bookmark's link to the clipboard.
- **Back and forward**, vim's jumplist: every jump is remembered; `Ctrl+] o` goes back, `Ctrl+] i` forward. The reading position is never moved by a jump. A terminal mapping recipe gives `Alt+←` / `Alt+→` (arrows can't reach the band).
- `/bm-env` shows the dcc-patcher build signal (`DCC_PATCH_H`, `DCC_PATCHES`, `DCC_PATCHER`) so you can see which Claude Code build you're on.
- When Claude Code doesn't draw a pane (a terminal too narrow), a toast says so and gives the engine's reason.
- Pure core modules under `hooks/core/` (anchor URL, transcript resolver, register file) with tests that run under `node --test` and a debugger.

### Changed

- The band's `'`, `j` and `Space` act directly from the field: a letter jumps, `Space` toggles the reading position. The once-per-version "press Enter" probe is gone.
- The plugin calls itself pre-alpha now rather than a proof of concept (README; `version.py` reports `PREALPHA 0.2.0`): it is in daily use, and the pure core is tested.

### Fixed

- In a narrow terminal (under about 110 columns, a shrunk RDP window), `Ctrl+] p` and the other band commands opened nothing, and every band command logged a refused scroll-back. Cause: the band's field handed its work off without waiting, so Claude Code no longer counted it as your keystroke. The field now returns its promise; the pane is drawn and the view returns where it was.
- A prompt row with a mark on it is drawn in colour, like a reply's marked line, instead of only a `«a»` tag.
- A reply that carries bookmark links keeps its mark highlight (the coloured line) as any other message does.

### Known issues

- After `Ctrl+] o` or `i` the keyboard stays on the band (as after every band command); `Esc` returns it. Text typed before `Esc` goes into the band's field.
- Ctrl-click opens the bookmark's file at the top: no markdown editor takes a position from the outside (Typora refuses a `#heading` on its command line). The bookmarked words are bold in the file, and a long message has a link to them.

## [0.1.7] - 2026-10-07

### Added

- The band is the plugin's command line. The leader is Claude Code's own "focus the band" action, `abovePrompt:focus`: `Ctrl+X Tab` by default, and we recommend binding `Ctrl+]` to it. It moves the keyboard to the band, works with a draft in the input box and while Claude is working, and leaves the draft untouched. A small field at the front of the band takes the next key, any key, including `'` and `Space`:
  - `'` or `j`, then a letter: jump to that mark;
  - `m`, then a letter: mark;
  - `Space Space` (or `Space Enter`, or `r`): the reading position, there or back;
  - `p`, then a number and `Enter`: jump to that prompt;
  - any other key: a reminder of the keys.
- Browsing the prompts from the band: in prompt mode, `j`/`k` or the Up/Down arrows move a `▶` through the prompts pane's list, digits type a number (shown in the pane's `#` field, with the list scrolled to it), `s` pins or unpins the prompt under the `▶`, and `Enter` jumps.
- With no fresh selection, a mark goes on the message at the top of the screen, its first line highlighted. Only a selection made within the last 75 seconds counts, for marks and for the reading position. Claude Code keeps returning the last selection after its highlight is gone, so an old one used to decide where a new mark went.
- Typed commands `/bm-mark`, `/bm-goto`, `/bm-prompts` and `/bm-read`. From an empty input box, their pane takes the keyboard, so the prompts pane's arrows and `Tab` work there.
- `/bm-delmarks a b` and `/bm-delmarks all` delete marks.
- Optional fast keys for power users, documented in `docs/usage.md`: `Ctrl+X Space` for one-step reading. They borrow Claude Code's idle diff-panel actions, so they aren't part of the default setup.
- `/bm-diag-keys` and `[diag]` lines in the debug log: who held the keyboard around each key, and the draft's length (never its text).
- The first step of the capability paths (#18): `hooks/engine/select.ts`, and `/bm-env` shows the order the paths are tried in.
- Verified on Claude Code 2.1.290.

### Changed

- The leader replaces the `Ctrl+X` chords as the way in. The chords still work if bound, but not with text in the input box, and they will be removed in a later version.
- A mark with no selection no longer marks your latest prompt; the prompts pane and pins cover prompts.
- A typed prompt number waits for `Enter` instead of jumping as soon as it is complete.
- After a mark, the view returns to where it was before the pane opened (the pane narrows the conversation, which shifts it).
- Going back from the reading position, from the very bottom of the conversation, returns to the same text you were reading, even if new replies arrived below it.
- In mark mode, `Enter` cancels; it used to mark `a`.
- The first jump on a new Claude Code version asks for `Enter` once while the plugin checks whether it may jump straight from what you type; current Claude Code doesn't allow that, so the band hands the letter to its buttons.
- README, usage guide, tutorial, troubleshooting and engine quirks rewritten for the leader. The README also points to the companion [dazzle-claude-code-patcher](https://github.com/DazzleML/dazzle-claude-code-patcher), which keeps a resumed session's whole conversation in view so marks can reach messages from before a compaction.

### Fixed

- Clicking a band button with text in the input box closed the pane at once; it now stays open as a list to click.
- Clicking into the prompts pane's field closed the pane; the pane now keeps the keyboard.
- Pressing the leader again after a command could land on the band's `mark` button, so `Space` and `Enter` overwrote mark `a`.
- From the bottom of the conversation, going back from the reading position said "You're at the reading position" instead of going there.

### Known issues

- After a command the keyboard stays on the band; press `Esc` to go back to typing. A plugin can't hand it back.
- A click on a band button occasionally doesn't reach the plugin at all; the cause isn't known yet.
- From the bottom, going back occasionally lands on the top message instead of the last message's end.
- The Left/Right arrows in prompt mode are expected to act like Up/Down (not tested).

## [0.1.6] - 2026-10-05

### Added

- Pinned prompts: pin the prompts you want to come back to. Type `*21` in the prompts pane's `#` field (or the band's) to pin or unpin #21, or `*` for your newest prompt; `/bm-pin [N]` does the same from the prompt. Pinned prompts show a gold star inside their number (`245★)`), in a **★ pinned** group at the top of the pane and in place in the full list, and are kept per conversation.
- `docs/engine-quirks.md`: each Claude Code limit the plugin has hit, what you'd notice, why it happens, what the plugin does about it, and what a proper fix would be.

### Fixed

- Leaving the band's key mode: `Esc` now closes a pane opened from the band within about half a second (the plugin checks whether the band still holds the keyboard), and typing in the prompt or closing the pane yourself resets the band too. Previously the pane stayed open until a 15 s timeout.

## [0.1.5] - 2026-10-05

Experimental: the leader works, with known rough edges listed under Known issues.

### Added

- The band works as a leader, without borrowing a keybinding action: Claude Code's own `Ctrl+X Tab` (`abovePrompt:focus`, rebindable) puts the keyboard on the band, and its buttons now have hotkeys: `m` mark, `j` jump, `p` prompts, `r` reading position.
- When a pane opened from the band can't take the keyboard (Claude Code keeps it on the band), the band itself takes the next key: the jump letters with the reading position on Enter, the mark letters, or a `prompt #` field. The pane stays open beside it as the list. The band returns to its buttons after a jump or mark, on the next prompt, or after 15 seconds.
- `docs/usage.md`: the leader, and how to rebind it to another key (with the Windows Terminal recipe for `Ctrl+;`).
- Measurement scripts for the planned conversation search (`tests/one-offs/thinking/search-extraction/`): the whole conversation's text loads in one shell pass, under the output cap.
- `docs/tutorial.md`: chords, leader keys and vim marks explained for people who haven't used vim, then a hands-on walkthrough of each feature.
- `docs/usage.md`: each feature in detail (marks, jumps, the reading position, the prompts pane) and what is kept, for how long.
- `docs/troubleshooting.md`: the known limits and what to do about each (the band doesn't appear, a chord does nothing, a jump is refused).

### Changed

- README rewritten in the shape of the other DazzleML Claude Code projects: badges, the problem it solves, a numbered quick start, a keys table, common workflows, known limits as tips, debug logging, platform support, project structure and how it works.
- The band's label is now `bm:` (was `bm-poc:`).
- The docs now give the right cause for unreachable messages: Claude Code loads a resumed or restarted session only from its last compaction onward. They no longer say that compaction itself hides them.

### Known issues

- `Esc` doesn't close a pane opened from the band, because the pane never holds the keyboard.
- The `Ctrl+X` chords and the band's key mode can both be active in ways that still need ironing out.
- A mark's "text verified" check compares the plain selection with the message's markdown, so it can report `TEXT NOT IN ROW` for a mark that is fine.

## [0.1.4] - 2026-10-04

### Fixed

- `Ctrl+X Space`: after scrolling somewhere else by hand, the next press goes to the reading position; before, it went back to the spot saved before the last jump.
- `Ctrl+X Space` on the reading position, with nowhere to go back to, now stays put and says so; before, it swapped between the mark and the line just above it, or re-jumped to the mark.

### Changed

- Checklist: chords do nothing while a Claude Code dialog is up (Claude Code only lets a chord press a plugin's button when no dialog is open).

## [0.1.3] - 2026-10-04

### Added

- `Ctrl+X p`: every prompt of the conversation, numbered from your first and listed newest first. Type a number and Enter (a number that can't grow into a larger one jumps at once), or Tab through the list. Prompts sent before the plugin was loaded are read once from the conversation's transcript, using a tool every system has (Windows PowerShell, or `sh` and `grep`); nothing extra to install. The list survives restarts.
- `Ctrl+X Space`: a reading position. Select text and press it to set it; press it again to go there, and again to return to where you were. It heads the `Ctrl+X '` pane, where Enter goes to it.
- A `prompts` and a `read` button on the band above the prompt, for the new chords.
- When a jump can't be made because Claude Code no longer has the message on screen (from before the conversation was compacted), a phrase of it is copied to the clipboard and a toast says how to find it: `Ctrl+O`, `[`, then the terminal's Find. Prompts not on screen are dimmed in the `Ctrl+X p` list.
- A debug log of the plugin's activity in `<user dir>/bookmarks/debug/<session id>.log`.

### Changed

- The `Ctrl+X '` pane lists only the marks you have, with their text; the `Ctrl+X m` pane shows letters in use as `a: ●` and lists them below. Both panes ask Claude Code for a narrow width.
- README: setup for all four chords.

### Fixed

- The highlight now finds lines containing **bold**, `code` or links; before, those marks showed a plain quote line at the top of the reply instead.
- Highlighting a line no longer removes the blank line above it, including on the first line of a reply.

## [0.1.2] - 2026-10-04

### Changed

- Repo tooling: `git-repokit-common` updated to v0.3.4, so a version bump now also writes `.claude-plugin/plugin.json`, and no longer rewrites the comment on `PHASE` in `version.py`.
- Repo tooling settings moved from `pyproject.toml` to `.repokit-common.toml`, the config file `git-repokit-common` reads in projects that are not Python packages. The plugin is TypeScript; Python only runs the repo tooling.

## [0.1.1] - 2026-10-04

### Changed

- The version tripwire now checks a list of verified Claude Code builds (2.1.288, 2.1.289) instead of one, and its start-up toast and `/bm-env` report the plugin's own version, read from `.claude-plugin/plugin.json`, beside the running Claude Code version.
- README and platform support list Claude Code 2.1.289 as tested, alongside 2.1.288.
- `tsconfig.json` is now tracked (an exception to the template's `*config*.json` ignore rule), so contributors can run `tsc`.

### Removed

- The `/poc/` ignore entry: the root proof-of-concept copy is gone, preserved privately.

## [0.1.0] - 2026-10-04

### Added

- Claude Code mod `convo-bookmarks`, from the proof of concept:
  - mark the mouse selection (or the latest prompt) with `Ctrl+X m <letter>`, jump back with `Ctrl+X ' <letter>`;
  - temporary in-place highlight of the marked line (coloured band, bold yellow words, `«a»` tag), cleared after 120 s or on the next prompt; display only, never written to the session file;
  - band line above the prompt showing the active mark's text;
  - probe commands used to verify the mod API: `/bm-ids`, `/bm-jump`, `/bm-pane`, `/bm-marks`, `/bm-sel`, `/bm-timeline`, `/bm-env`.
- Repo tooling: root `version.py`, `git-repokit-common` subtree, tests that keep `.claude-plugin/plugin.json` in step with `version.py`.

[Unreleased]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.85...HEAD
[0.4.31]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.30...v0.4.31
[0.4.30]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.29...v0.4.30
[0.4.29]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.28...v0.4.29
[0.4.28]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.27...v0.4.28
[0.4.27]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.26...v0.4.27
[0.4.26]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.25...v0.4.26
[0.4.25]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.24...v0.4.25
[0.4.24]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.23...v0.4.24
[0.4.23]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.22...v0.4.23
[0.4.22]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.21...v0.4.22
[0.4.21]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.20...v0.4.21
[0.4.20]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.19...v0.4.20
[0.4.19]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.18...v0.4.19
[0.4.18]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.17...v0.4.18
[0.4.17]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.16...v0.4.17
[0.4.16]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.15...v0.4.16
[0.4.15]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.14...v0.4.15
[0.4.14]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.13...v0.4.14
[0.4.13]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.12...v0.4.13
[0.4.12]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.11...v0.4.12
[0.4.11]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.10...v0.4.11
[0.4.10]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.9...v0.4.10
[0.4.9]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.8...v0.4.9
[0.4.8]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.7...v0.4.8
[0.4.7]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.6...v0.4.7
[0.4.6]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/DazzleML/claude-bookmarks/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/DazzleML/claude-bookmarks/compare/v0.3.5...v0.4.0
[0.3.5]: https://github.com/DazzleML/claude-bookmarks/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/DazzleML/claude-bookmarks/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/DazzleML/claude-bookmarks/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/DazzleML/claude-bookmarks/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/DazzleML/claude-bookmarks/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/DazzleML/claude-bookmarks/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/DazzleML/claude-bookmarks/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/DazzleML/claude-bookmarks/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.7...v0.2.0
[0.1.7]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/DazzleML/claude-bookmarks/releases/tag/v0.1.0
