# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.7...HEAD
[0.1.6]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/DazzleML/claude-bookmarks/releases/tag/v0.1.0
