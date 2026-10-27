{{mark}}
<!-- writer: {{writer}} -->

# Your bookmarks

This folder is where the claude-bookmarks plugin for Claude Code keeps what you make in it: bookmarks, marks, pins and the notes that go with them. It is yours, in your own folder and never under Claude Code's own configuration folder, which Claude Code cleans. The plugin reads and writes here; nothing else is needed to read it -- the JSON is plain, the notes are Markdown, and `sessions/INDEX.md` is a map of all of it that opens in Obsidian or any Markdown viewer.

## What is here

| Path | What | Kind |
|---|---|---|
{{layout_table}}

## What to back up

Everything under `sessions/` is authored, and so are the lists files under `lists/`: the bookmark files, the notes and the lists are what you and Claude made, and nothing rebuilds them. `backups/` holds the plugin's own copies from format migrations; keep it as long as you might want to go back. `prompttext/`, `replytext/`, `transcript/`, `places/` and `debug/` are caches: deleting them loses nothing you cannot get back. The index and this file are generated.

## Formats

Each bookmark file carries a `version`. A newer plugin migrates an older file at the start of a conversation, after copying the original into a run folder under `backups/`; an older plugin leaves a newer file read-only rather than write it. `/bm-check` inside Claude Code reports the state of every file here without changing anything.

A reinstall of the plugin under another marketplace name starts Claude Code's plugin store afresh and resets the plugin's `/config` options; this folder is unaffected.

Written by {{writer}}. Documentation: https://github.com/DazzleML/claude-bookmarks/blob/main/docs/usage.md
