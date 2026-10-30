# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.32] - 2026-10-30

### Changed

- **Tests only; the plugin behaves as in 0.7.31.** New tests confirm that, in a conversation Claude Code has moved to a new session id, a bookmark link in the copied history, a `bm:` reference naming the earlier id, and a lookup through the earlier id's bookmark file all still lead to the place in this conversation.

## [0.7.31] - 2026-10-30

### Added

- **The plugin learns which earlier sessions a conversation continues.** When a conversation starts, or Claude Code moves it to a new session id, the plugin reads its transcript once in the background (a single `grep`, a second or two even on a very large transcript; skipped where there is no `sh`) and keeps the answer, so it never reads it again. Nothing uses the answer yet; the next versions use it to keep links, bookmarks, marks and pins working under the new id.

## [0.7.30] - 2026-10-30

### Added

- **A written rule for which Claude Code sessions are one conversation** (`tests/fixtures/session-lineage/`). When Claude Code carries a conversation on under a new session id, the transcript still says which earlier sessions it came from. The rule reads that, with seven example transcripts and their answers, so this plugin and other tools that key data by session id (Claude-Session-Backup first) agree. The plugin does not use it yet; carrying bookmarks, marks and pins over to the new id builds on it.

## [0.7.29] - 2026-10-30

### Changed

- **Tests and measurements only; the plugin behaves as in 0.7.28.** A test now checks that a short reference typed in a prompt stays tied to that prompt even when Claude Code adds a reminder between them. Three measurements are kept with the repository: how a conversation that continues under a new session id points back at the earlier ones, how many places name the plugin's own tools, and a proof of concept for describing those tools in one table.

## [0.7.28] - 2026-10-30

### Fixed

- **A list item goes to its place again after the conversation continues under a new session id.** Claude Code sometimes carries a conversation on under a new id (after a compaction or a resume); the messages keep their ids, but a list item naming the old id was treated as being in another conversation, so a press only copied a `claude --resume` command. A press now looks for the message in this conversation first and goes there. Bookmarks, marks and pins kept under the old id are not yet carried over; that comes next.

## [0.7.27] - 2026-10-28

### Added

- **Short references are documented.** `docs/usage.md` has a "Short references" section: the two forms (`bm:<session>.<n>~<check>`, a bookmark by its number; `bm:<session>/<message>`, any message), where each works (replies, prompts, the bookmark tool, lists, notes, markers in your files), how one is found, and why one may be marked unverified. The README says what a reference reads in other conversations: their bookmark files, never their transcripts. A hand-run checklist covers the whole arc (`tests/checklists/v0.7.27__Feature__short-references-bm.md`).

## [0.7.26] - 2026-10-28

### Added

- **A bookmark's note spells out the short references in the message it quotes.** Each `bm:...` reference becomes a link to the full address of the place it names, keeping the text as it was written, so the note reads and clicks without the plugin. The note's front matter says so (`references: expanded`), or how many could be expanded (`expanded 1 of 2`) when some could not be found here; those stay as written. Finding them never holds up the bookmark being made.

## [0.7.25] - 2026-10-28

### Added

- **A short reference can be a list item's link.** Give Claude's `lists` tool a `bm:...` reference (either form) and the item stores the exact message it names. One that cannot be found here is kept as typed, never mistaken for a file path; pressing it tries again, goes there once it resolves, and otherwise copies it. A pasted bookmark link is stored as its message too.

## [0.7.24] - 2026-10-28

### Added

- **A prompt's references can be read back exactly as they were bound.** The note Claude received with a prompt is found again from the conversation itself, so what a short reference meant when it was typed is never guessed later.

## [0.7.23] - 2026-10-27

### Added

- **A short reference you type in a prompt is bound for Claude.** Your prompt is kept exactly as typed; Claude also receives a note naming the exact place each `bm:...` (or pasted bookmark link) points to, or saying it could not be found, so nothing is guessed. The note is kept in the conversation with the prompt.

## [0.7.22] - 2026-10-27

### Added

- **Every bookmark Claude's tool returns carries its short references:** `lookup` (`bm:<session>.<n>~<check>`, the bookmark), `exact` (`bm:<session>/<message>`, the message itself) and `cite` (a citation ready to write, `[label](bm:...)`), beside the full link. Claude still writes the full link in its replies until short citations have been tried in practice.

## [0.7.21] - 2026-10-27

### Added

- **A short reference in Claude's reply is a link.** `[label](bm:...)` and a bare `bm:...` are drawn as links to the place they name, pressed like any bookmark link; the conversation keeps the short text. One inside code, one that names nothing, or one whose check names another bookmark stays as plain text.

## [0.7.20] - 2026-10-27

### Added

- **Claude's bookmark tool takes a short reference.** Given `bm:...` or a bookmark link instead of a quoted fragment, it finds the place: one already bookmarked is answered with its bookmark and nothing new is made; one that cannot be found, or that names another bookmark than its check says, is refused with the reason. Another conversation is looked up only in what this plugin keeps of it, never in its transcript.

## [0.7.19] - 2026-10-27

### Added

- **What a short reference names is worked out one way everywhere.** The current conversation is looked in first (a branched conversation holds its parent's messages), then the conversation the reference names. A reference that could mean two messages or two conversations offers both rather than picking one; a bookmark reference whose bookmark has changed under it says so and looks for the message it meant. Not yet reachable; replies, prompts and lists use it in the next releases.

## [0.7.18] - 2026-10-27

### Added

- **The short reference's final form.** A place can be named in about 20 characters instead of a long link, in two ways: `bm:8f0f9b27.122~68b352d2` for one of your bookmarks (with eight characters of the bookmark's own id, so a reference never lands on the wrong one), and `bm:8f0f9b27/68b352d2` for any message, which needs nothing but the conversation itself. Prefixes grow only when two ids would otherwise share them. Nothing writes or draws these yet; the next releases do.

## [0.7.17] - 2026-10-27

### Fixed

- **A bookmark link whose highlighted words hold a `)` is no longer cut short.** The words, and an agent file's name, are now written with `~ ( ) ! * '` encoded, so a link stays one link in a reply, a note or a list, and its words come back whole. Links written before still read.

## [0.7.16] - 2026-10-27

### Added

- **Engine notes: what a plugin's prompt hook can change, and where what it adds is kept.** A prompt hook may rewrite what you typed; text it adds for Claude is kept in the conversation as its own entry beside your prompt; a slash command that runs without Claude raises no prompt hook at all. Measured on Claude Code 2.1.312, ahead of short references in prompts.

## [0.7.15] - 2026-10-27

### Fixed

- **Several links given to Claude's `lists` tool in one call are no longer dropped.** Claude Code hands the tool its list of links as text, which the tool ignored, so an item made or extended with more than one link kept only the first.
- **Adding a link an item already has no longer adds it twice.**

## [0.7.14] - 2026-10-27

### Added

- **The lists page shows every link of an item**, the first on the item's name and the rest after it.
- **Usage: "Links in files".** How to put a bookmark link into your own Markdown files (a ctrl-click opens its note), why to keep each link on one line, and how a line can mark itself as an entry of a list. The Lists section covers several links per item and pressing a place in another conversation.

## [0.7.13] - 2026-10-27

### Changed

- **Pressing a list item whose place is in another conversation names that conversation.** When its conversation is on this machine, the toast gives its title and copies the `claude --resume` command for it; when it is not, the toast says so and nothing is copied. Before, the command was copied whether or not the conversation existed here.

## [0.7.12] - 2026-10-27

### Added

- **Claude can give a list item several links at once**: a place in the conversation, a file, a web page and a GitHub issue together. Its `lists` tool takes them when it adds an item, and gains `link` (add links to an item) and `unlink` (remove one). Its answers list every link of an item, a GitHub issue shown as `owner/repo#N`.

### Fixed

- **A list item that points at a place in the conversation now has a note to open.** The place is saved as one of Claude's own references when the item is added, so ctrl-clicking the item opens its note; before, the link pointed at a note that was never written.

## [0.7.11] - 2026-10-27

### Added

- **The plugin can read callback lines in Markdown files.** A line (a heading, a bullet, a paragraph) declares itself an entry of a list with a marker: a bookmark link carrying `list=<list>&id=<entry>`, or an invisible `<!-- bm list=<list> id=<entry> -->` comment. The marker's id is the line's identity, so the line is found again after it moves or its heading is renamed. A link marker that a line wrap broke is reported as broken rather than lost, and markers inside code are taken as examples. Nothing reads files for markers yet; lists that pick up their entries from files come later.

## [0.7.10] - 2026-10-27

### Changed

- **The lists file is now format 2: each item holds a list of links.** An item can point at several things at once (a place in a conversation, a file, a web page, a GitHub issue), the first being what a press opens. Your lists are converted the next time they are saved, and the file from before is kept beside it as `.json.bak`. The pane, the page and Claude's `lists` tool show the same items as before; adding several links to one item comes next.
- The lists file keeps any field it does not know, at every level, so a newer version of the plugin can add to it without an older one losing what it added.

## [0.7.9] - 2026-10-27

### Fixed

- **Claude's `lists` calls now fold away like its `bookmark` calls.** A reply that keeps a list no longer fills the conversation with tool rows: its calls sit under one line (`☰ 2 lists calls ▸`), each opens to a one-line summary (`☰ lists add: Push dev`), and that opens to the call itself. A reply that uses both tools gets one fold for all of them (`⚓ 5 calls: 3 bookmark, 2 lists ▸`). `ctrl+o` still shows every row as Claude Code draws it.
- **A link Claude makes to words that were bold or in code in the original now finds them.** Claude quotes a reply's words without their Markdown, so a fragment such as "<leader> l opens" did not match `**<leader> l** opens` and the link failed with "no message holds it". The exact text is still tried first; only when nothing holds it exactly are the stars, underscores, tildes and backticks left out of both, along with extra spaces and line breaks.

## [0.7.8] - 2026-10-27

### Added

- **`<leader> l` opens the lists pane, and closes it again.** It also has a `lists` button on the band's bar, which now reads `mark jump read prompts lists /search ?`. The key can be changed in `/config` (Keys: lists), as the other commands' keys can.

## [0.7.7] - 2026-10-26

### Added

- **Lists.** Named, ordered lists of what you are keeping track of, kept per project so they span conversations. `/bm-lists` opens them in a pane docked beside the conversation (in fullscreen, 110 columns or wider), without taking the keyboard. Press an item to go to it, `▲` `▼` to reorder, `·` to tick it done; the top row switches between lists. An item is a place in a conversation, a link to a file or page, or a line of text.
- An item with a place or a link is drawn as a link, as in Claude's replies: a click goes to it, a ctrl-click opens it (the note, the file or the web page). Press an item's number to open it in place: its whole note, where it points, who added it and when. A note with nowhere to go opens on a press of its label.
- Claude keeps lists through a new `lists` tool (create, add, move, done, remove, share), on your side when you ask and on its own. The tool is loaded only when needed.
- The lists live in `~/claude/bookmarks/lists/<project>.json`, with a Markdown page of the same lists beside it, each item a link. The page's wording is the plugin's own file, `templates/lists-page.md`.

## [0.7.6] - 2026-10-26

### Fixed

- **A link to a tool call that Claude Code draws no row for still lands.** Claude Code draws a shell command under its own id, but not every tool: a link to an `AskUserQuestion` call was refused ("nothing drawn under that requestId"). The jump now tries the call's own row, then the message that holds it, then (once the conversation has been read for search) the reply it was made in, and says where it landed. One press shows one message, not one per try.

## [0.7.5] - 2026-10-26

### Changed

- **Claude's bookmark calls are folded away.** A reply's calls to the `bookmark` tool (the ones behind its links) draw as one dim line, `⚓ 5 bookmark calls ▸`, instead of a full row and a block of JSON each. Press the line to list one line per call (`⚓ bookmark #95: <label> ▸`); press a call's line to see its row and answer as before. ctrl+o shows every call in full. Nothing is removed; other tools' rows are unchanged.
- Calls made before the plugin last loaded (a resumed conversation) each draw their own one-line summary, not grouped under a reply's line.

## [0.7.4] - 2026-10-26

### Added

- **Search the whole conversation.** `Ctrl+] /` (the leader, then `/`), the bar's new `/search` button, or `/bm-search some words` opens the search pane. It searches every row the conversation has, not only your prompts: Claude's replies and thinking, every tool call and its output, agents' messages and messages from other sessions. The results narrow as you type and are numbered 1 the newest. Words match in any order and case; `"a phrase"` matches exactly; `m/pattern/i` is a regular expression; `in:tools`, `from:claude`, `tool:Bash` and `agent:oracle` narrow, and `-in:thinking` leaves rows out.
- In search, `Tab` and `Shift+Tab` (or the `↑` `↓` buttons) move the `▶`; `Enter` goes to that result, `#12` then `Enter` to result 12, and `*12` then `Enter` pins or unpins it. A prompt or reply lands with its first line, or your search words, highlighted; a tool call or its output lands on the tool's row; an agent's message lands on the call that started the agent. The result you last went to stays yellow in the list.
- A row of on/off toggles in the pane narrows by kind: you, claude, agents, sessions, tools, outputs, thinking, notices, other.
- Settings in `/config`, behind their own fold ("▸ Search: show the search rows", inside ▸ Bookmarks, as the keys and the debug rows are):
  - "Search: what it opens on": `all`, `you+claude+sessions+tools+outputs`, `you+claude+sessions`, or `custom`, which shows one on/off row per kind to build your own;
  - "Search: the row of toggles": `shown` or `hidden`;
  - "Search: how a result says what it is": `words`, or `short` (each kind word cut to its first letters on the result rows; the toggles keep their words), with "Search: letters in a short kind" (2 by default, 3 for `cla`, `out`);
  - "Search: labels in a one-kind view": `implied` (the default) leaves out a label that only repeats the one toggle on (replies under `claude` alone, while thinking keeps its label); `always` keeps every label;
  - "Search: how a result is laid out": `stacked` (the default) gives a long kind such as an agent's a line of its own with the text indented below, short kinds staying beside their text; `inline` puts every text beside its kind.

  A key row for search joins the others under "Keys".

### Changed

- The band's bar reads `mark jump read prompts /search ?`: `read` sits with mark and jump, and the two panes sit together.
- `docs/usage.md` says what a bookmark link can point at: any row the chat draws, a tool call or its output and an agent's message included.

### Known gaps

- A result from before the conversation's last compaction cannot be scrolled to, as with the prompts list; the toast copies its first line so `ctrl+o` can search for it.
- A thinking result lands on its message with the thinking still folded; `ctrl+o` shows it.

## [0.7.3] - 2026-10-26

### Added

- **Links to any row the chat draws.** Claude's `bookmark` tool can now link to a tool call, a tool's output or an agent's message, not only to a prompt or a reply. Name the row by a phrase from it or by its id. A click scrolls to that row, or to the folded group ("Ran 1 shell command") that holds it. Links to prompts and replies work as before and still highlight the words.
- A bookmark on such a row keeps its note as `<id>.p<part>.md` beside the message notes, so two rows of one message never share a note.
- `/bm-jump` accepts a tool call's id (`toolu_...`) and a folded group's id (`collapsed-...`).

### Changed

- To find those rows, the plugin now reads all of a conversation's files: the transcript, each agent's file and the tool outputs Claude Code stores beside it. The read starts the first time it is needed, runs in the background, and picks up where it left off at the next start. In a long conversation the first link can answer that the conversation is still being read; `/bm-env` shows the progress, and asking again later works.
- What it reads is kept under `bookmarks/places/<session id>/`, about the size of the conversation's text, and is rebuilt when missing. `PRIVACY.md` and the plugin's listing describe the new reads and this folder.

## [0.7.2] - 2026-10-26

### Changed

- **The bookmark file's format moves to v5.** The pin records 0.7.1 wrote under `stars` are written under `pins`, one name for one thing. The screen is unchanged. A file is brought up to date the first time a session loads it, not only when a session starts, so a session that picked up the new plugin without restarting writes the new format at once. As before, a backup of each file is written first, under `bookmarks/backups/`. A file older than 0.7.1 goes to v5 in one step.
- If a file cannot be brought up to date (it cannot be written, say), the conversation's bookmarks are shown but not saved, with a toast saying so, until the next start. Before, such a file could be written in its old shape.
- The setting "Pins shown in a list" is stored as `pinScope` (it was `starScope` in 0.7.1); a value saved under the old name is read as the default, `here`.

## [0.7.1] - 2026-10-26

### Changed

- A pin now remembers the list it was made in, so the lists coming in 0.7 (search, and the prompts pane's other views) can let you pin their rows too. The prompts list looks and works as before: `*21`, `s` and `/bm-pin` pin and unpin, and pinned prompts stay at the top.
- **The bookmark file's format moves to v4.** At a session's first start on 0.7.1, every bookmark file in your data folder is brought up to date: each pin becomes a pin record that says which list it came from. A backup of every file is written first, under `bookmarks/backups/`. Your bookmarks and marks are not changed. An older build of the plugin can still read a v4 file but will not write to it, so update the plugin on every machine you use.

### Added

- A setting, "Pins shown in a list" (`here` or `everywhere`). `here`, the default, shows in a list only the pins made in it; `everywhere` shows a pin on any of its rows, wherever it was made. Only the prompts list exists so far, so the two read the same today.

### Fixed

- For contributors: the conversation reader added in 0.7.0 held about four times the memory it needed (72.6 MB, now 18.7 MB, on a 600 MB conversation). Each row's short preview kept its whole text alive. It is not yet called by the plugin, so this changes nothing in a session today.

## [0.7.0] - 2026-10-26

The first release of the 0.7 line, which adds search, more lists in the prompts pane, and links to any row of a conversation. This one lays the groundwork; nothing new is switched on yet, so the plugin behaves as in 0.6.28 apart from the fix below.

### Fixed

- The README in the plugin's data folder lists every folder the plugin writes there. `replytext/` (the text of Claude's replies, kept for finding the message a link names) and `transcript/` (where each message sits in the conversation file, so a later read resumes) were missing; both are caches, and deleting them loses nothing.

### Added

- For contributors: the groundwork for 0.7's search and lists, tested but not yet called by the plugin.
  - `core/places/` gives every row of a conversation one address: prompts, replies, thinking, tool calls and their outputs, other sessions' messages, agents' messages and reports, notices and events. It covers every file a conversation spans: the transcript, each agent's own file, stored tool outputs and a continued conversation.
  - A reader takes a whole conversation in pieces and keeps an index it can resume from.
  - `core/places/landing.ts` decides where a jump to any row lands.
  - `core/search/` reads a search query (words, quoted phrases, regular expressions, and rules such as `from:`, `agent:`, `tool:` and `failed`) and finds the matching rows.
- `/bm-env` lists two more entries in its table of what this Claude Code build can do: scrolling to a tool row, and scrolling to an agent's message. On stock Claude Code both fall back to the message the row belongs to.

## [0.6.28] - 2026-10-25

Documentation only; the plugin behaves exactly as in 0.6.27.

### Fixed

- The plugin's README, which is also its listing, and `PRIVACY.md` now say everything the plugin runs and writes. Since 0.6.18 the plugin also reads the conversation's transcript once in 4 MB pieces (`sh` running `tail` and `head`, or `hooks/scripts/read-chunk.ps1` on Windows), which the README did not mention and the reviewers' note in `register.tsx` did not count. Both READMEs also said marks and pins live in Claude Code's plugin store; since 0.5.4 and 0.5.5 they live in your bookmark files, and the store keeps only the prompt lists, the jumplist and the reading position's way back. The data folder's index, its README and the migration backups are listed too.
- `docs/status.md` describes the plugin as it is: settings exist, the tested Claude Code versions run to 2.1.310, the automated tests pass on Linux, and the "big changes coming" list drops what 0.5 and 0.6 delivered.

### Changed

- For contributors: every README under `plugin/hooks/` lists every file in its folder (twenty were missing), and a new `core/transcript/README.md` covers the loader. The hooks README counts three program calls, not two, and the engine README describes the capability table as it is since 0.6.16.

## [0.6.27] - 2026-10-25

### Changed

- After `Ctrl+] p` or `Ctrl+] b`, the band takes the number in a text field of its own instead of a row of digit buttons. You can correct what you type with Backspace, even with an empty input box, and `/words` filters the prompts list and `*21` pins prompt 21 from the band, as they already did in the pane's own field. `j`/`k` and `Tab`/`Shift+Tab` still step the list; after a step the field is empty again with the number shown dim in it, and `12j` steps from 12.
- Up and Down can step the list too, with one entry in `~/.claude/keybindings.json` (`docs/keys.md` has it). The plugin never writes that file.
- "Typing a list number" in `/config` brings back the digit buttons (`buttons`) if you prefer them; `auto` is the default.

### Fixed

- Typing `/` after `Ctrl+] p` no longer ends the band and lands the text in your input box.

## [0.6.26] - 2026-10-24

### Changed

- The plugin's automated tests now pass on Linux as well as Windows, and every push checks the plugin on both. Until now the plugin tests could only pass on Windows, so a problem specific to Linux would have gone unnoticed.

## [0.6.25] - 2026-10-24

### Changed

- The plugin's settings are folded away in `/config` by default, since the defaults are meant to need no changing: one row, **▸ Bookmarks**, shows until you press `Enter` on it, and then the settings appear below it. The key rows and the debugging rows each sit behind a fold of their own inside it. A fold is a true/false row that `Enter` flips in place, with no picker to open, and its arrow shows its state (`▸` folded, `▾` open). Everything you have set still applies while folded.
- The three debugging settings now read "Debug: echo by default", "Debug: conversation text in the log" and "Debug: how much text a line quotes", and sit together at the end of the list.

## [0.6.24] - 2026-10-24

### Changed

- The keys documentation covers what the 0.6 line added. `docs/keys.md` gains "Choosing your own keys" (the rows in `/config`, how a value is written, which keys a button can be pressed with, what is refused and why, and how to change the leader) and lists `d` and `D` on the band, `c` and number-then-`d` in the bookmarks list, and that a bar button closes the pane it opened while its key never does. `docs/usage.md` describes deleting a mark with `d` and `D`, the keymap rows under Settings, and the bookmarks list's new keys; the README's Configuration table lists the key rows.
- With this, the 0.6 line's keys work is complete: one key table drives the band, its help, its hints and the lists (0.6.1); a keymap layer applies your choices to it (0.6.2); a bar button toggles its pane (0.6.3); `d` and `D` clear and forget a mark (0.6.4); and the keys are yours to choose in `/config` (0.6.23).

## [0.6.23] - 2026-10-24

### Added

- Choose the band's keys in `/config`. A row, "Keys: show the key rows", unfolds one row per band command (mark, jump, prompts, the reading position, bookmarks, promote, clear and forget a mark, back, forward, close, help) and one for the keys in a list. A row takes the command's keys separated by spaces (`Space` spells the space key) and `hidden` at the end takes its button off the bar; an empty row keeps the default. The band's buttons, the help, the hints and the lists' keys all follow. A change that would give two commands the same key, or use a key the band never receives (an arrow, Tab, Enter), is refused with the reason, and a value set by hand in settings.json that cannot be used keeps the default and is named in the debug log. The rows stay folded until you open them.
- A "Keys: the leader" row says which chord opens the band, read from `~/.claude/keybindings.json`, and how to change it there: the leader is a Claude Code keybinding, so the row itself is never set.

## [0.6.22] - 2026-10-23

### Fixed

- The prompts list no longer shows, as its newest rows, old messages the person never typed. Three "Goal set" messages Claude Code queued on 2026-10-12 had been captured live as prompts back then; the whole-conversation read holds them as non-prompt rows, and since 0.6.18 every read moved them to the end of the list, where they read as tonight's prompts and a click on one scrolled the view back to October. A stored row the read has seen and judged not a prompt now leaves the list, and the debug log says which; a stored row the read has never seen is kept, so nothing the file did not judge is dropped.
- Footnotes are kept across sessions again. Since 0.6.18 the whole-conversation read resumed from an index that held the prompts but not the footnotes, and each publish replaced the stored footnotes with only those in the newly read part of the file, so the list thinned out at every start (one conversation: 56 footnotes in the file, 1 in the list). The index keeps them now; every existing index is rebuilt once, a background read of the whole conversation, after which they are back.
- A goal you set with `/goal` shows as a footnote under the prompt before it. Claude Code records setting a goal only as a queued "Goal set: ..." message, which the list read as nothing (or, captured live, as a prompt); it is now the `/goal <condition>` footnote. Commands Claude Code runs itself and writes as system rows (`/goal clear`, `/rename`, `/branch`, `/fork`, `/cd`, `/feedback`) are footnotes too, from the next session start.
- The CI workflow was invalid since 0.6.8 and no job ran on a push: the plugin job set its config directory from the `runner` context in a job-level `env`, which GitHub does not allow ("Unrecognized named-value: 'runner'"). The directory is now set from a step. The plugin job (validate and the kit suite on the runner) runs for the first time on the next push.

## [0.6.21] - 2026-10-22

### Added

- A hand-run checklist for the keys work of this line (`tests/checklists/v0.6.20__Feature__the-keymap-the-toggle-and-deleting-a-mark.md`): the pane fields and the band reading one key table, the band-button toggle, `d` and `D` on a mark, hot reload, all against a scratch data folder; the `/config` keymap rows and their docs are listed as pending.

### Changed

- The keys probe (`tests/one-offs/probe_literal_keys_outside_table.py`) carries its hand classification: every literal key comparison outside the key table is printed with its class and reason, and the run ends with the count of keys a surface holds on its own (0 today). A line the table does not know is counted on the safe side until someone reads it.

## [0.6.20] - 2026-10-22

### Added

- A plugin test for the whole-conversation read: a conversation file larger than one 4 MB piece, with a prompt cut in two at the piece boundary, is read in two pieces, the second starting exactly where the first ended, and the cut prompt is still counted once.

## [0.6.19] - 2026-10-22

### Fixed

- The whole-conversation read now runs on Windows: 0.6.18's read needed `sh`, which Claude Code does not find on a Windows machine even with Git Bash installed, so it never started. A PowerShell script shipped with the plugin (`hooks/scripts/read-chunk.ps1`) reads each piece of the file by byte offset instead, and the read advances by the bytes it received rather than re-reading a line split across two pieces.

## [0.6.18] - 2026-10-22

### Added

- The whole-conversation loader runs. Where `sh` is available the plugin reads the conversation file once, in the background and in 4 MB pieces, keeps every prompt and reply in memory, and from then on finds the message a bookmark or a link names without searching the file again; an index under `~/claude/bookmarks/transcript/` and the replies' text under `replytext/` let the next load resume where the last one stopped. `/bm-env` reports the read: rows, bytes, pieces, running or done. Without `sh` nothing changes: the per-request search and the one-time back-fill stand, and the capability table says so (`transcript.chunks`).

### Fixed

- Prompts whose pasted text happens to contain the strings the old back-fill filtered on (`"type":"tool_result"`, `"isMeta":true`) now reach the prompts list from the file read: the loader parses every line instead of grepping it (7% of one long conversation's prompts were missing).

## [0.6.17] - 2026-10-22

### Changed

- Internal, no visible change yet: the core of the whole-conversation loader. A pure reader is fed the transcript in chunks of any size and keeps one row for every prompt and reply with its line and byte range, carrying a line split across chunks; a pure index remembers a pass (the rows without their text, the byte watermark, the conversation) so the next load resumes instead of re-reading. Nothing is wired to it yet; the wiring and the public text follow. Measured on the way: the old back-fill's text filter drops queued prompts whose pasted text quotes a marker string (7% of one long conversation's prompts); the loader keeps them.

## [0.6.16] - 2026-10-22

### Added

- The capability paths have a table and a chooser: for each engine feature the plugin stands in for (a jump past a compaction after a resume, the keyboard's return to the input box, the band losing the keyboard, a plugin-defined shortcut, the hover highlight on a two-line row), the plugin now works out at start which path runs on this build (the proper API, a patched build's route, the stock workaround, or the plain behaviour) and `/bm-env` says so per feature, with the reason.

### Changed

- When a jump is refused because nothing is drawn for the message, the toast's wording follows the path: on stock it still suggests a compaction; on a build with the history patch it says the patch is present and offers the same search route without the guess. The log line names the path.

## [0.6.15] - 2026-10-22

### Changed

- The prompts list's group headings ("★ pinned", "all prompts") have a palette role of their own, `heading`, drawn as a dim blue-gray (darker on a light theme) so they read as headings without standing out. A trial value: the colour overrides setting can replace it (`{"heading": {"color": "subtle", "dimColor": false}}`), as for any role.

## [0.6.14] - 2026-10-22

### Added

- A setting, "Lines per row in the lists" (1 to 5, default 2), for how many lines each prompt in the prompts list and each mark in the jump list may take. A line breaks at a space when the word at its edge would fit on the next line, and cuts through a token no line could hold (a path, a slug); the last line ends in an ellipsis when the text runs on. A second line sits under the text rather than under the number, so the number column stays a column. Set 1 for the one-line rows of 0.6.10.

## [0.6.13] - 2026-10-22

### Changed

- Internal, no visible change: the third round of moves out of the hooks module. Where a focus move in the band lands (an arrow off the go button steps the list; a chord button focused while the band is idle keeps the ring on the command field) and what a reply carrying bookmark links logs and queues now live in the core and the bookmarks handler, with their own tests.

### Fixed

- When the process moves to another conversation (a resume), the plugin now also forgets which replies' links it had already logged, what the previous conversation had on screen, and the title its start event carried. Before, the set of logged replies grew for the life of the process and the screen reports of the previous conversation could pass for the new one's.

## [0.6.12] - 2026-10-22

### Changed

- Internal, no visible change: the second round of moves out of the hooks module. What the plugin decides about each message the session appends, the colour split of a marked prompt, the prompts pane's centring retries and Esc rule, the "#n" lookup behind pin, jump and remove, the help that fits the band and the band's bar, the pattern a jump greps for, and the diagnostic lines now live in the plugin's core modules with their own tests. The hooks module keeps the engine calls and the wiring.

## [0.6.11] - 2026-10-22

### Changed

- Internal, no visible change: the borrowed keyboard actions behind the band's chords, the list of Claude Code builds they were checked on, the mark letters and the bookmarks pane's groups now live in the plugin's core modules beside the code that uses them, instead of in the hooks module. The first of a series of such moves.

## [0.6.10] - 2026-10-22

### Fixed

- 0.6.9 made the prompts pane unusable: every row showed its whole prompt wrapped over many lines, and a pinned prompt's text ran into the rows below it, because the row trusted the terminal to cut it at the pane's edge and the terminal wraps instead. A row is now cut by the plugin to the pane's own width (the width the pane reports when it is drawn), with an ellipsis, so a widened pane shows more of each prompt and a narrow one shows less, one line per prompt either way. The jump pane's rows and its reading-position row are cut the same way.

## [0.6.9] - 2026-10-22

### Fixed

- A widened prompts pane left a quarter of its width empty: every row stopped at about sixty characters however wide the pane was dragged. A row now shows as much of the prompt as the pane is wide, cut at the edge with an ellipsis, and a narrow pane still cuts cleanly without squeezing the number column. The whole text is the one the `/words` filter already keeps; a prompt whose text is not kept (a conversation past the "Prompt text kept for the filter" budget) shows its first sixty characters as before. The jump pane's rows and its reading-position row fill their width the same way; they used to be cut at forty and thirty-two characters.

## [0.6.8] - 2026-10-22

### Changed

- For contributors, no change to the plugin itself: CI now has a second job that installs the Claude Code CLI on the runner (pinned to the version the plugin is verified against), validates the plugin and the repository's marketplace file the way the engine reads them, and runs the plugin's own test suite; the runner needs no sign-in for any of it. The strict type check is the one check that stays local, in the pre-push hook: it needs declarations the engine writes only when it loads the plugin in a live session, which a runner never does ([#5](https://github.com/DazzleML/claude-bookmarks/issues/5)).

## [0.6.7] - 2026-10-22

### Changed

- For contributors, no change to the plugin itself: the pre-push git hook now runs this repository's own checks before a push (the core suite under Node, the version tests, the strict type check and `claude plugin validate ./plugin`) instead of the Python-package defaults it was built for, which here ran only the nine version tests. The kit suite is left out of the hook for speed; run it yourself (CI does not run it yet). CONTRIBUTING says so, and the repository's project record names the language as TypeScript.

## [0.6.6] - 2026-10-21

### Changed

- Internal, no visible change: the text of the `README.md` the plugin writes into its data folder now lives in a template file inside the plugin (`templates/data-readme.md`), with the layout table filled in from the code, instead of as strings in the code. The README you get is identical to before, byte for byte. If the template is ever missing from an installed copy of the plugin, the start says so in the conversation and writes no README, rather than inventing one.

## [0.6.5] - 2026-10-21

### Fixed

- A link on a highlighted line kept neither its colour nor its click: the marked line of a reply was drawn as plain text, so for as long as the highlight showed a link on it was just words. A marked line that carries a link is now drawn as markdown inside the band, so the link keeps its colour, its underline and its click, and the plugin's own bookmark links on it still jump; the marked words keep their bold `«a»` tag wherever the tag cannot break the link (when the words are a link's own text, the tag goes inside the link's label). A marked line with no link is drawn exactly as before.

## [0.6.4] - 2026-10-21

### Added

- Deleting a mark from the band, no confirmation asked, a toast saying what happened: `d` then a letter clears that letter (it points at nothing; its history is kept, so the earlier place is still listed and can be brought back), and `D` then a letter forgets the letter's current record as well. A record nothing else refers to -- the letter's only entry, no bookmark made from it -- is removed outright; otherwise it leaves a tombstone so the rest of the letter's history and a merge with another copy of your bookmarks stay in order. `D` is uppercase and typed after the leader; which letter does which is the keymap's to change, like any key. The reading position's backtick counts as a letter to both.
- `d` after a number in the bookmarks list (the band's row or the list's `#` field) removes that bookmark from your list, the same way Claude's tool removes one: it leaves a tombstone.
- `/bm-check` notes a letter record that no letter names (an orphan a mark forgotten on another copy can leave behind); it reports and changes nothing. Merging two copies of a bookmark file no longer brings such a record back from the older copy.

## [0.6.3] - 2026-10-20

### Added

- A button on the band closes the pane it opened: press `prompts` while the prompts list is open and the list closes; the same for `mark`, `jump` and `bookmarks`. The button is a toggle; the typed key is not (`<leader> p` with the list open leaves it open, since `<leader> p 12` may be on its way), and with lists off (the `panes` setting) nothing changes. Open means the plugin's own pane and that pane on screen, so a fresh conversation's first press always opens.

## [0.6.2] - 2026-10-20

### Added

- Internal, no visible change yet: the keymap layer behind choosing your own keys ([#36](https://github.com/DazzleML/claude-bookmarks/issues/36)). A keymap is one value per command -- its keys in order, `Space` spelling the space, `hidden` as a last word to take the command's button off the bar, an empty value meaning the default -- plus one value for the list keys in the table's order. Applied to the plugin's key table it gives the band, the hints, the help and the panes the person's keys; a key that cannot work (an arrow name, two characters, a digit in a list) or that two commands claim is reported by name and the default kept for that command, so no command can be left unreachable. A command's bar button answers the keyboard only when one of its keys is a digit or a lowercase letter, which is what Claude Code's buttons take; any other key is typed after the leader. Where the keymap is set (the `/config` rows) comes in a later version; until then every surface draws exactly as before.

## [0.6.1] - 2026-10-20

### Changed

- Internal, no visible change: the keys a list pane's own `#` field reads (`q` to close, `/words` to filter, `*N` to pin) now come from the plugin's one key table, where the band's keys already live, instead of being spelled out in the pane itself; the band's number row finds its `k`/`j` step buttons by what they do rather than by their letter. This is the ground the coming keymap stands on: a key you change in one place reaches the panes too. The hint, the help and the band row draw exactly as before.

## [0.6.0] - 2026-10-20

The 0.5.x line settled what the bookmark files hold and where they live. 0.6.x is the rest of the foundations: the keys, the input layers, the old issues, and the tidy-up around them.

### Fixed

- A mark set on a line of a reply that contains *italics* was drawn as a quoted line at the top of the reply instead of on its own paragraph. The words you select are copied from the reply as drawn, with the italics' markers gone, and the match against the reply's text knew about bold, code and links but not italics, so no line matched and the mark fell back to the top. Italics now match like bold does; a lone `*` (as in `2 * 3`) and an underscore inside a word (as in `a_001`) are left alone.

## [0.5.12] - 2026-10-17

### Added

- A bookmark file now carries a `format` beside its `version`. `version` counts the format migrations the file has been through and decides when a newer plugin migrates it (with a backup); `format` is the oldest plugin that can still handle the file's data, and decides when an older plugin must leave the file read-only. They have moved together so far (1, 2, 3); from here a migration an older plugin can live with leaves `format` where it is, so nobody is made to upgrade when nothing needs upgrading. A file written before this version has no `format` and reads as asking for its own `version`; adding the field is not a migration and takes no backup.
- The plugin writes a `README.md` into its data folder (`~/claude/bookmarks/`): what each folder and file holds, which are yours (authored: back them up), which are the plugin's copies (backup), which it rebuilds (cache) and which it generates. Written when missing and rewritten when the plugin version changes; left alone otherwise.
- `docs/usage.md`, "What to back up, and what a reinstall does": the same classification as a table, what a backup tool should take, what a reinstall under another marketplace name does and does not touch, and what the two numbers in a bookmark file mean.

## [0.5.11] - 2026-10-17

### Added

- `/bm-check`: a check of the bookmark files on disk that reports and changes nothing. It names each register whose format is older than this build (it migrates at the next start) or newer (read-only here), a file that is not a register, a notes folder with no register, the index against the registers it should list, each migration's run folder with its status and whether every copy in it still matches the hash its manifest recorded, the snapshots, the store's size against the 4 MiB cap, and marks or pins left in the store for a conversation with no register. Where something is off, the line says what the next start or save will do about it.

## [0.5.10] - 2026-10-17

### Added

- An index of every conversation with bookmarks, beside the bookmark files: `~/claude/bookmarks/sessions/index.json` (one entry per conversation -- its title, project, and each bookmark with its number, label, list and tier) and `sessions/INDEX.md`, the same as a page you can open in Obsidian or any Markdown viewer: a heading per conversation, newest first, and a line per bookmark linking its file where the file exists. The index is rebuilt from the bookmark files when a conversation starts and the conversation's own entry is refreshed after every save; a letter's mark is not listed, and a conversation whose bookmarks are all removed drops out. Both files are generated: what you write in them is overwritten.

## [0.5.9] - 2026-10-17

### Changed

- Each bookmark's Markdown file is now an Obsidian note. Its `tags` and `aliases` are lists (Obsidian's own form); the tags carry the bookmark's own tags and then one `bm/tier/...` and one `bm/owner/...` tag per record on the message, so a vault can filter by them; when the same message is on both lists, the other list's label is an alias, so Obsidian finds the note under either name. Point Obsidian at `~/claude/bookmarks` and edit a note's `label`, `why` or `tags` there: the next time the plugin touches that bookmark (a relabel, a share, a claim) it reads the edit back into the bookmark file before rewriting the note, so the edit is kept. Only those three properties are read back; a note written by a plugin older than 0.5.9 is regenerated and never read, and a property missing from a note is never treated as a deletion. The note's own version is 2.

### Added

- Internal: a record remembers what its note was last written from (`md.base`), which is how an edit in the note is told apart from a change made in Claude Code.

## [0.5.8] - 2026-10-17

### Added

- The shape of the read-state file is fixed, ahead of the feature that will use it: `<session id>.state.json` beside the bookmark file, holding where each reader stands with each prompt (named axes such as "attention" and "processing", so a prompt can be both read and still being worked on), with a short history per axis. Only a prompt you typed can be a key, never a tool result or a command's record. Nothing writes or shows this file yet; the format is settled so the feature adds to it rather than inventing it.

## [0.5.7] - 2026-10-16

### Changed

- Claude's `bookmark` tool: every answer carries the record's number; `list` links only a record whose Markdown file exists, so no link that cannot be followed is handed out; a claim writes the record's file, as every action that hands out a link now does. One `meta` parameter lets Claude keep tags (a list, nested with `/`) and its own notes (`x`) on a record, with a relabel replacing the tags and merging the notes. The tool's description tells Claude what `label` and `why` are for: what the place says, and what it decides or why it matters.

## [0.5.6] - 2026-10-16

### Added

- The bookmark file's header now carries the conversation's `title` (the first prompt's words, or the conversation's name where Claude Code gives one) and `project` (the folder's name), refreshed on every save, so a file can be told apart without opening it. The same two appear in each bookmark's Markdown file, with the bookmark's number, its tier, its tags and the plugin version that wrote it.
- A record can carry `tags` (nested with `/`), named `axes`, relations to other records (`rel`) and an open `x` namespace per owner; a save keeps them and writes them in a fixed order. An owner may be a name beyond "you" and "Claude" (`agent:<name>`, `person:<handle>`).

### Changed

- Internal, no visible change: the tiers (transient, mark, perma, bookmark) are one ordered axis in code, and a surface that shows "bookmarks and up" is gated by that axis rather than by a comparison written out each time. The Markdown front matter's property names are fixed and listed in one place.

## [0.5.5] - 2026-10-16

### Changed

- **Marks live in the bookmark file (format version 3).** Each letter, and the reading position, is now a record in the conversation's bookmark file, pointed at by the file's `slots`; a migration moves them out of Claude Code's plugin store at the conversation's start, with its own backup folder like the format-2 migration. Re-marking a letter on another message keeps the old place in the letter's history (the `a_001` stack the roadmap promised); deleting a mark clears the letter and keeps that history, so nothing a letter ever pointed at is lost. The panes read the marks from memory, never from a file while drawing.
- Marks and bookmarks on the same message are two separate records: setting a letter on a bookmarked line never renames the bookmark, and a mark is never listed as a bookmark.
- Without a data folder to write to, marks stay in Claude Code's plugin store as before.

## [0.5.4] - 2026-10-16

### Changed

- **The bookmark file format moves to version 2, with a migration that runs when a conversation starts.** Every bookmark file under your data folder that is at the old format is brought up to date in that start (the conversation you opened first, the rest in the same pass). Before the first migration ever runs on a machine, one snapshot of the whole `bookmarks/sessions/` folder is taken under `bookmarks/backups/<time>__pre-0.5__snapshot/`; each migration then gets its own folder under `bookmarks/backups/` with the original file, its `.bak`, the store entries it moved, and a `manifest.json` whose status reads `done` when it finished. Backups are kept. A file from a newer version of the plugin is still read and never written.
- What version 2 changes in the file: the conversation's session id and transcript path are written once at the top instead of on every bookmark (a bookmark copied from another conversation keeps its own); every bookmark has a number, in the order made, that is never reused; pinned prompts live in the file instead of Claude Code's plugin store. The migration moves the pins and deletes the store entry; a conversation that had pins but no bookmark file gets one.

## [0.5.3] - 2026-10-16

### Changed

- Every save of the bookmark file now carries the one change being made (a new bookmark, a relabel, a removal, a share, a claim, a prune) and applies that change to the file as it is on disk when the file has changed since this session read it: a hand edit, or another window's bookmark, is kept instead of being overwritten by this session's copy. A change whose bookmark is gone from the disk (removed elsewhere) is reported as not done, and nothing is written.
- Internal, no visible change yet: records have an identity the file format can carry (a number per conversation, never reused, with the message and its minting time as the tie-break); a bookmark made from a drawn message id is marked as such; a merge of two whole copies of one file is defined. A file keeps its present form until the format migration in a later 0.5.x release, so none of this shows in the files on disk yet.

## [0.5.2] - 2026-10-16

### Changed

- The usage guide now says how the bookmark file relates to a conversation: one file per conversation, the same file after `claude --resume`, an empty one for a forked conversation; what a newer or older file's `version` means; and the short reference form `bm:<sid8>.<n>` with the rule that resolves it. Documentation only; the number `n` itself arrives in a later 0.5.x release.

## [0.5.1] - 2026-10-16

### Fixed

- A bookmark file's backup (`.bak`) is now made only from a file that reads correctly. Before, the previous file was copied blindly, so a half-written file could become the only backup.
- Fields in a bookmark file that this version does not know are kept when the file is saved, at every level (the file, each bookmark, each tombstone), after the known fields and in their original order. Before, a save dropped them.

### Added

- A bookmark file written by a newer version of the plugin is read in full but never written: a toast and a log line say so once when it loads, and any bookmark action that would save it reports "not saved" instead. Update the plugin to write it again.

## [0.5.0] - 2026-10-16

### Fixed

- The stated minimum is now Claude Code 2.1.288, the first release with the selection call that marking from a selection uses; the README, contributing guide, platform page and troubleshooting page said 2.1.287.

## [0.4.110] - 2026-10-15

### Fixed

- Two earlier entries of this changelog said more than was true: 0.4.99's now says each conversation is re-read at its own next start (not all at the first start), and 0.4.96's now says which unused names the type check refuses.

## [0.4.109] - 2026-10-15

### Changed

- Internal, no visible change: a test now pins how the prompts list keeps its place while a reply is streaming in. Three possible speed-ups were measured and left out because the measured costs were too small to matter.

## [0.4.108] - 2026-10-15

### Changed

- Internal, no visible change: the debug echo's setting and the reading position's way back each reach the plugin store through their own entry only, instead of through access to the whole store.

## [0.4.107] - 2026-10-15

### Changed

- Internal, no visible change: what a press does next -- setting a mark, jumping to one, pressing a prompt or a bookmark in a list -- is written once for each kind of press, and the band, the marks pane and the lists all use it.

## [0.4.106] - 2026-10-15

### Changed

- Internal, no visible change: the band's code says, for each of its parts, which of three groups of plugin services it uses -- the band itself, the pane, or the lists -- instead of every part being handed all of them.

## [0.4.105] - 2026-10-15

### Changed

- Internal, no visible change: every kind of entry the plugin keeps in Claude Code's plugin store is named and listed in one place, and each part of the plugin builds its entry names from that list.

## [0.4.104] - 2026-10-15

### Changed

- Internal, no visible change: the plugin's settings are worked out once each time you change one in /config, instead of on every use (which included every debug log line and every redraw of the band and the panes); what a new conversation clears is one list in one place.

## [0.4.103] - 2026-10-15

### Changed

- Internal, no visible change: finding the prompt nearest the view reads the prompt list once instead of three times, and where the view goes back to after a highlight is decided in one place.

## [0.4.102] - 2026-10-15

### Changed

- The prompts list's filter, unfolded footnotes and the prompt it centres on are kept together, and a new conversation (/clear, /resume) now also forgets a centring that was still waiting from the conversation before.
- Internal, no visible change: the record of messages drawn since the plugin loaded keeps the set the lists use to dim unreachable rows as messages are drawn, instead of rebuilding it on every draw of a list.

## [0.4.101] - 2026-10-15

### Changed

- Internal, no visible change: reading past prompts from the transcript and keeping the plugin store small now live with the rest of the prompt list's code, which is the only code that writes the stored prompt list.

## [0.4.100] - 2026-10-15

### Changed

- Internal, no visible change: pieces the reorganisation left doing their old jobs in their new places now work as their new homes intend. A claimed bookmark, a bookmark's place in the transcript, a mark's write, a bookmark's highlight on arrival, and Claude Code's config folder are each worked out in one place instead of several; the band reads what it draws only in the modes that draw it, and pinning a prompt reads the prompt list once.

## [0.4.99] - 2026-10-15

### Fixed

- A scheduled `/loop` firing is no longer listed as one of your footnotes in the prompts list. A loop that runs a slash command every few minutes added one footnote per firing; in the author's store they were 535 of 671 footnotes and most of the plugin store's size, which counts against Claude Code's 4 MiB limit for a plugin's store. After upgrading, each conversation reads its transcript once more the next time it starts or is resumed, and rewrites its footnotes without them.
- A footnote's label is cut to 120 characters, ending in "…". A slash command carrying a long brief as its arguments drew as one label spanning many rows.

## [0.4.98] - 2026-10-15

### Changed

- The plugin's README now also says which Claude Code events the plugin hooks and that each is passed on unchanged, names the selection call as Claude Code's own, and lists the prompt text kept for the prompts filter (under `~/claude/bookmarks/prompttext/`); it no longer says that nothing you type is stored.

## [0.4.97] - 2026-10-15

### Changed

- Internal, no visible change: the code that tracks which prompt the view is nearest to now has its own tests, and the tests of the prompt-number entry, the band's state and the pane's way back were each checked to fail when the behaviour they describe is broken; two that did not are made to.

## [0.4.96] - 2026-10-15

### Changed

- Internal, no visible change: the leftovers of moving the plugin's code into separate files are removed -- wrapper functions nothing called any more, wrappers with a single caller (the caller now calls the moved code directly), unused imports, and exports nothing else used. The type check now refuses an unused variable, function or import, so those cannot pile up again (an export nothing imports is still found only by a separate check).

## [0.4.95] - 2026-10-15

### Changed

- Internal, no visible change: what decides whether a debug line is shown in the conversation and kept in the log file now lives with the rest of the debug log, in one logger.

## [0.4.94] - 2026-10-15

### Changed

- Internal, no visible change: five typed commands (`/bm-jump`, `/bm-promote`, `/bm-delmarks`, `/bm-pane`, `/bm-bookmarks`) are handled in their clusters' code instead of inline where they are registered, and a test keeps the list of commands and their registrations the same.

## [0.4.93] - 2026-10-15

### Changed

- Internal: a reply with a marked line decides how to draw the text above the line the way it did before the split (on whether there is any), not on what Claude Code's renderer returned for it; and the panes get the list of drawn messages as a list rather than a one-time iterator. No visible change in normal use.

## [0.4.92] - 2026-10-15

### Fixed

- A mark set on a line inside a reply's table no longer breaks the table: the rows after it used to show as raw `| ... |` text while the highlight was up. The marked words now show in the bold `«a»` form inside their row, the way a mark inside a code block already did.

## [0.4.91] - 2026-10-15

### Changed

- Internal, no visible change: the list of Claude Code builds the chords were verified on is defined once (it had two copies, one for the start-up check and one for `/bm-env`), and four comments the split left stale or misplaced are corrected.

## [0.4.90] - 2026-10-15

### Added

- A `README.md` in each `plugin/hooks/core/` folder (`band/`, `bookmarks/`, `kit/`, `log/`, `marks/`, `prompts/`) listing its files and what each decides.

## [0.4.89] - 2026-10-15

### Fixed

- Setting the reading position from a selection no longer scrolls the view away. With the prompts pane left open, the view used to jump back to where it was when the pane opened, however long ago that was. Only opening or closing a pane puts the view back now; setting a place keeps you where you are.

## [0.4.88] - 2026-10-15

### Added

- A `README.md` in `plugin/hooks/` and each of its folders (`core/`, `engine/`, `handlers/`, `views/`, `scripts/`): what each folder holds, which may import which, why every hook is registered in `register.tsx`, and where the tests are, for someone reading the code for the first time.

## [0.4.87] - 2026-10-15

### Changed

- Internal, no visible change: the debug log's file, the screen channel's file and their buffers, and the diagnostics timeline, are owned classes in `handlers/log.ts`.

## [0.4.86] - 2026-10-15

### Changed

- Internal, no visible change: the debug channels (which heavier diagnostics this conversation has on) are one owned class in `handlers/log.ts`.

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

[Unreleased]: https://github.com/DazzleML/claude-bookmarks/compare/v0.7.32...HEAD
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
