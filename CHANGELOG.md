# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/DazzleML/claude-bookmarks/compare/v0.3.2...HEAD
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
