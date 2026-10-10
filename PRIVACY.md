# Privacy

**Plugin:** Bookmarks (`bookmarks`), published by DazzleML
**Applies to:** version 0.3.4 and later, until this page changes
**Last changed:** 2026-10-09

The short version: the plugin runs inside Claude Code on your machine, reads the conversation Claude Code already keeps on your disk, writes its own small files next to it, and sends nothing anywhere. There is no account, no telemetry, no network connection and no third party.

## What it reads

- **The conversation transcript.** Claude Code keeps every conversation as a file on your disk (`~/.claude/projects/<project>/<session id>.jsonl`, or under `CLAUDE_CONFIG_DIR`). The plugin reads this file to list the prompts you have typed and to find the message a bookmark points at. It never writes to it.
- **Its own files.** The marks, bookmarks and settings it wrote earlier (listed below).
- **A few environment variables**, only to find folders and to know its own state: `HOME` or `USERPROFILE`, `CLAUDE_CONFIG_DIR`, `CLAUDE_USER_DIR`, `CONVO_BOOKMARKS_DEBUG`, and `DCC_PATCH_H`, `DCC_PATCHES`, `DCC_PATCHER` (present only if you run a patched build of Claude Code; the plugin only displays them).
- **Your mouse selection** inside Claude Code, through the plugin API, to know which line you want to mark.

## What it writes, and where

- **Marks, pinned prompts, reading positions, prompt lists and the jumplist**, per conversation, in Claude Code's plugin store: `~/.claude/plugins/store/bookmarks_inline-<id>.json`.
- **Bookmarks**, in your own folder `~/claude/bookmarks/` (or under `CLAUDE_USER_DIR`): one JSON register per conversation under `sessions/`, and one markdown file per bookmarked message holding that message's text, so you can read and edit it.
- **A debug log** per conversation, `~/claude/bookmarks/debug/<session id>.log`, kept to its last 400 lines. It records key names and pane and jump events, never the text you type or the conversation's text.
- **Your clipboard**, only when you ask: promoting a mark copies the bookmark's link; a jump that cannot be made copies a short phrase of the message so you can search for it.
- **One environment variable**, `CONVO_BOOKMARKS_DEBUG`, inside the plugin's own process, when you type `/bm-debug on` or `off`. It disappears when Claude Code exits.

It writes nothing else: no configuration file, no settings file, no start-up file, nothing under `~/.claude` other than the plugin store, and never the conversation file itself.

## What it runs

To search the transcript, which can be larger than the plugin API will read at once, the plugin runs a search program already on your machine with the transcript's path and the search text as arguments:

- on macOS, Linux and Git Bash on Windows: `sh` running `grep`;
- on Windows without them: two PowerShell scripts shipped inside the plugin, `hooks/scripts/user-rows.ps1` and `hooks/scripts/grep-offsets.ps1`, started as `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <script>`.

Their output is read back by the plugin and goes nowhere else. Nothing else is executed, and nothing is installed.

## What it sends

Nothing. The plugin makes no network connections and contacts no service, including DazzleML. The only thing the Claude model sees is the plugin's own `bookmark` tool and the links that tool returns, inside the conversation you are already having.

## What Claude Code sees

The plugin is a Claude Code mod and uses only the plugin API Claude Code provides. Whatever Claude Code itself sends to Anthropic is governed by Anthropic's own terms, not by this plugin; the plugin adds nothing to it.

## Children

The plugin is a developer tool and is not intended for anyone under 18.

## Removing everything

1. Uninstall the plugin (`/plugin uninstall bookmarks`, or remove it where you installed it from).
2. Delete `~/.claude/plugins/store/bookmarks_inline-*.json` (your marks, pins, reading positions and jumplists).
3. Delete `~/claude/bookmarks/` (your bookmarks, their exports and the debug logs).

Nothing remains after those three steps, because nothing was ever stored anywhere else.

## Changes to this page

This page lives in the plugin's repository at `https://github.com/DazzleML/claude-bookmarks/blob/main/PRIVACY.md`. Changes are listed in the repository's `CHANGELOG.md` under the version that made them.

## Contact

Open an issue at `https://github.com/DazzleML/claude-bookmarks/issues`.
