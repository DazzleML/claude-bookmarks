# Status: pre-alpha

This page is the current state of the plugin at the version in the badge, for anyone deciding whether to try it. It is updated with each release (hopefully); the [CHANGELOG](../CHANGELOG.md) has the history and [issue #1](https://github.com/DazzleML/claude-bookmarks/issues/1) the living roadmap.

## What works today

Used daily on Windows 11, Windows Terminal, Claude Code 2.1.288 to 2.1.296, in the fullscreen renderer, including a shrunk remote-desktop window. Since 0.3.0 the plugin is named `bookmarks` and lives in the repository's `plugin/` folder, so an install carries the plugin and not the repository's tooling and tests:

- **Marks** (`a`-`z`) on any line, with the in-place highlight, jumps, and the reading position with its go-and-return.
- **The prompts pane**: every prompt of the conversation numbered from the first, browse or type a number, pins.
- **Bookmarks**: durable, addressable places kept as readable files in your own folder; Claude's `bookmark` tool and the clickable `⚓` links in its replies (click to jump with the words highlighted, ctrl-click to open the file); your list and Claude's, promotion of a mark, the bookmarks pane with its groups.
- **Back and forward** through every jump.
- **The band leader** that works over a draft and while Claude is working.
- The pure core (`plugin/hooks/core/`: the anchor URL, the transcript reader, the register file) has an automated test suite; the mod itself is verified by hand with the checklists under `tests/checklists/`.

The complete key list is [keys.md](keys.md).

## Known issues and limits

| | Where it is tracked |
|---|---|
| **Windows is the only tested platform.** macOS and Linux are expected to work and have not been tried; ctrl-click on a `file:` link is OS-specific by nature. | [platform-support.md](platform-support.md) |
| After any band command the keyboard stays on the band; `Esc` returns it. After `o`/`i` especially, the next thing you type lands in the band's field. | [#24](https://github.com/DazzleML/claude-bookmarks/issues/24) |
| Arrow keys cannot be used after the leader. | [#23](https://github.com/DazzleML/claude-bookmarks/issues/23) |
| A pane does not open in a terminal narrower than about 110 columns; a toast says so. Widen the window or step the font down. | [troubleshooting.md](troubleshooting.md#a-pane-doesnt-open-in-a-narrow-terminal) |
| After a restart or `--resume`, messages from before the last compaction cannot be jumped to; the plugin copies a phrase to the clipboard and says where to look. | [#16](https://github.com/DazzleML/claude-bookmarks/issues/16), [troubleshooting.md](troubleshooting.md#a-jump-says-it-cant-go-there) |
| Ctrl-click opens a bookmark's file at its top; no markdown editor takes a position from outside. The bookmarked words are bold in the file. | [#16](https://github.com/DazzleML/claude-bookmarks/issues/16) |
| The highlight of a mark fades after two minutes; marks do not stay lit, and there is no age shading yet. | [#22](https://github.com/DazzleML/claude-bookmarks/issues/22) |
| The keys do nothing while a dialog is up (a permission prompt, a question from Claude). | [troubleshooting.md](troubleshooting.md) |
| The `/bm-` command names are from the proof of concept and will change. | [#7](https://github.com/DazzleML/claude-bookmarks/issues/7) |
| No settings yet: colours, timings and key choices are fixed. | [#7](https://github.com/DazzleML/claude-bookmarks/issues/7) |

## Big changes coming

These are decided directions, not promises of dates. Each is an issue you can watch.

- **The pane takes the keyboard, the band steps back** ([#26](https://github.com/DazzleML/claude-bookmarks/issues/26)). Today every key goes through the band because Claude Code refuses a pane the keyboard over a draft. The plan is the reverse: `Ctrl+] p` lands you in the prompts pane whenever Claude Code allows it, the pane has its own keys, and the band remains only as the fallback over a draft. Search will be built that way from the start.
- **Refer to a mark by name in your prompt** ([#25](https://github.com/DazzleML/claude-bookmarks/issues/25)): `[**a**]` or `[**bm:label**]` typed into a prompt becomes a clickable link, so your references and Claude's citations are the same thing.
- **One kind of record for marks and bookmarks**, with a stable id for every mark from the moment it is set, promotion and demotion between the tiers (transient, mark, perma-mark, bookmark), and Claude having its own marks, reading position and history as well as its own bookmarks ([#19](https://github.com/DazzleML/claude-bookmarks/issues/19), [#6](https://github.com/DazzleML/claude-bookmarks/issues/6), [#10](https://github.com/DazzleML/claude-bookmarks/issues/10)). Re-marking a letter will archive the old place as `a_1`, `a_2`, ... instead of losing it.
- **Conversation search** ([#20](https://github.com/DazzleML/claude-bookmarks/issues/20)): type, see matches, jump, keep one as a mark or bookmark.
- **Settings in `/config`** ([#7](https://github.com/DazzleML/claude-bookmarks/issues/7)): palette, timings, the command prefix, the debug echo default.
- **Opening a mark's files and links with handlers** ([#12](https://github.com/DazzleML/claude-bookmarks/issues/12)), the fourth pillar of the [roadmap](../ROADMAP.md).
- **The mod split into modules.** `plugin/hooks/register.tsx` is one massive file that will be refactored / split along the classes / categories that already exist in it, together with the record change above.

## Reporting

The debug log, one file per conversation under `~/claude/bookmarks/debug/`, is the most useful thing to attach to an [issue](https://github.com/DazzleML/claude-bookmarks/issues); `/bm-debug on` shows the same lines in the conversation while you reproduce a problem. See [troubleshooting.md](troubleshooting.md#the-debug-log).
