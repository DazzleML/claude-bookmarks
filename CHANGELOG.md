# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/DazzleML/claude-bookmarks/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/DazzleML/claude-bookmarks/releases/tag/v0.1.0
