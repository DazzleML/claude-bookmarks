# Status: pre-alpha

This page is the current state of the plugin at the version in the badge, for anyone deciding whether to try it. It is updated with each release (hopefully); the [CHANGELOG](../CHANGELOG.md) has the history and [issue #1](https://github.com/DazzleML/claude-bookmarks/issues/1) the living roadmap.

## What works today

Used daily on Windows 11, Windows Terminal, Claude Code 2.1.288 to 2.1.310, in the fullscreen renderer, including a shrunk remote-desktop window. Since 0.3.0 the plugin is named `bookmarks` and lives in the repository's `plugin/` folder, so an install carries the plugin and not the repository's tooling and tests:

- **Marks** (`a`-`z`) on any line, with the in-place highlight, jumps, and the reading position with its go-and-return.
- **The prompts pane**: every prompt of the conversation numbered from the first, browse or type a number, pins, the `/words` filter, and footnotes for your slash commands, shell commands and interruptions.
- **Bookmarks**: durable, addressable places kept as readable files in your own folder (one file per conversation, with migrations and backups when its format changes, and each bookmark an Obsidian note); Claude's `bookmark` tool and the clickable `⚓` links in its replies (click to jump with the words highlighted, ctrl-click to open the file); your list and Claude's, promotion of a mark, the bookmarks pane with its groups; `/bm-check` to look the files over.
- **Back and forward** through every jump.
- **The band leader** that works over a draft and while Claude is working, with its own field for a list number.
- **Settings in `/config`**, folded behind one **▸ Bookmarks** row, including your own keys for every band command.
- Automated tests: the pure core under Node, and the plugin itself through Claude Code's test kit, both run on Linux and Windows for every push. Live-terminal behaviour is verified by hand with the checklists under `tests/checklists/`.

The complete key list is [keys.md](keys.md).

## Known issues and limits

| | Where it is tracked |
|---|---|
| **Windows is the only platform in daily use.** The automated tests pass on Linux; macOS has not been tried. Ctrl-click on a `file:` link is OS-specific by nature. | [platform-support.md](platform-support.md) |
| After any band command the keyboard stays on the band; `Esc` returns it. After `o`/`i` especially, the next thing you type lands in the band's field. | [#24](https://github.com/DazzleML/claude-bookmarks/issues/24) |
| Arrow keys cannot be used after the leader. In the band's number field, Up and Down step the list with one entry in `keybindings.json` ([keys.md](keys.md)). | [#23](https://github.com/DazzleML/claude-bookmarks/issues/23) |
| A pane does not open in a terminal narrower than about 110 columns; a toast says so. Widen the window or step the font down. | [troubleshooting.md](troubleshooting.md#a-pane-doesnt-open-in-a-narrow-terminal) |
| After a restart or `--resume`, messages from before the last compaction cannot be jumped to; the plugin copies a phrase to the clipboard and says where to look. | [#16](https://github.com/DazzleML/claude-bookmarks/issues/16), [troubleshooting.md](troubleshooting.md#a-jump-says-it-cant-go-there) |
| Ctrl-click opens a bookmark's file at its top; no markdown editor takes a position from outside. The bookmarked words are bold in the file. | [#16](https://github.com/DazzleML/claude-bookmarks/issues/16) |
| The highlight of a mark fades after two minutes; marks do not stay lit, and there is no age shading yet. | [#22](https://github.com/DazzleML/claude-bookmarks/issues/22) |
| The keys do nothing while a dialog is up (a permission prompt, a question from Claude). | [troubleshooting.md](troubleshooting.md) |
| The `/bm-` command names are from the proof of concept and will change. | [#7](https://github.com/DazzleML/claude-bookmarks/issues/7) |

## Big changes coming

These are decided directions, not promises of dates. Each is an issue you can watch.

- **Conversation search** ([#20](https://github.com/DazzleML/claude-bookmarks/issues/20)): type, see matches, jump, keep one as a mark or bookmark. It will open from a typed command or a key binding, so it can take the keyboard itself.
- **Tabs in the prompts list** ([#40](https://github.com/DazzleML/claude-bookmarks/issues/40)) for other kinds of message, such as messages between sessions.
- **Where the keyboard lands** ([#26](https://github.com/DazzleML/claude-bookmarks/issues/26)). Claude Code gives a pane the keyboard only from an empty input box, never from the band, so the band's own number field now takes the pane's keys. What remains open is a pane-first route from an empty box.
- **Refer to a mark by name in your prompt** ([#25](https://github.com/DazzleML/claude-bookmarks/issues/25)): `[**a**]` or `[**bm:label**]` typed into a prompt becomes a clickable link, so your references and Claude's citations are the same thing.
- **Claude's own marks, reading position and history**, beside its own bookmarks ([#19](https://github.com/DazzleML/claude-bookmarks/issues/19), [#10](https://github.com/DazzleML/claude-bookmarks/issues/10)), and where each reader stands with each prompt ([#34](https://github.com/DazzleML/claude-bookmarks/issues/34)).
- **Opening a mark's files and links with handlers** ([#12](https://github.com/DazzleML/claude-bookmarks/issues/12)), the fourth pillar of the [roadmap](../ROADMAP.md).

## Reporting

The debug log, one file per conversation under `~/claude/bookmarks/debug/`, is the most useful thing to attach to an [issue](https://github.com/DazzleML/claude-bookmarks/issues); `/bm-debug on` shows the same lines in the conversation while you reproduce a problem. See [troubleshooting.md](troubleshooting.md#the-debug-log).
