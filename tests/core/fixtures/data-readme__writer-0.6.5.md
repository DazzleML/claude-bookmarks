<!-- claude-bookmarks data folder; this file is written by the plugin and rewritten when it changes; edits here are overwritten -->
<!-- writer: claude-bookmarks 0.6.5 -->

# Your bookmarks

This folder is where the claude-bookmarks plugin for Claude Code keeps what you make in it: bookmarks, marks, pins and the notes that go with them. It is yours, in your own folder and never under Claude Code's own configuration folder, which Claude Code cleans. The plugin reads and writes here; nothing else is needed to read it -- the JSON is plain, the notes are Markdown, and `sessions/INDEX.md` is a map of all of it that opens in Obsidian or any Markdown viewer.

## What is here

| Path | What | Kind |
|---|---|---|
| `sessions/<session id>.json` | the bookmark file of one conversation: its bookmarks, marks and pins, a readable JSON register | authored -- yours; back it up |
| `sessions/<session id>.json.bak` | the same file as it was before the last change | backup -- a copy the plugin took; keep it until you no longer need to go back |
| `sessions/<session id>/<uuid8>.md` | one note per bookmarked message: the text, every field in its front matter, your Notes section; an Obsidian note | authored -- yours; back it up |
| `sessions/<session id>.state.json` | where each reader stands with each prompt (a feature to come; the shape is fixed) | authored -- yours; back it up |
| `sessions/index.json, sessions/INDEX.md` | every conversation with bookmarks, as data and as a page; rebuilt from the bookmark files | generated -- rewritten by the plugin; edits are overwritten |
| `backups/<stamp>__v<from>-to-v<to>__<writer>__<sid8>/` | the originals of one format migration, with a manifest.json listing them with hashes; kept | backup -- a copy the plugin took; keep it until you no longer need to go back |
| `backups/<stamp>__pre-0.5__snapshot/` | a plain copy of sessions/ taken once before the first migration on this machine | backup -- a copy the plugin took; keep it until you no longer need to go back |
| `prompttext/` | the text of your prompts the prompts list filters, in pieces; read again from the transcript when missing | cache -- rebuilt when missing |
| `replytext/` | the text of Claude's replies, newest first and up to 4 MB, for finding the message a link names; read again from the transcript when missing | cache -- rebuilt when missing |
| `transcript/` | where each message sits in the conversation file, so the plugin's read of it resumes instead of starting over; rebuilt when missing | cache -- rebuilt when missing |
| `debug/<session id>.log` | the plugin's log, one file per conversation | cache -- rebuilt when missing |
| `README.md` | this file | generated -- rewritten by the plugin; edits are overwritten |

## What to back up

Everything under `sessions/` is authored: the bookmark files and the notes are what you and Claude made, and nothing rebuilds them. `backups/` holds the plugin's own copies from format migrations; keep it as long as you might want to go back. `prompttext/`, `replytext/`, `transcript/` and `debug/` are caches: deleting them loses nothing you cannot get back. The index and this file are generated.

## Formats

Each bookmark file carries a `version`. A newer plugin migrates an older file at the start of a conversation, after copying the original into a run folder under `backups/`; an older plugin leaves a newer file read-only rather than write it. `/bm-check` inside Claude Code reports the state of every file here without changing anything.

A reinstall of the plugin under another marketplace name starts Claude Code's plugin store afresh and resets the plugin's `/config` options; this folder is unaffected.

Written by claude-bookmarks 0.6.5. Documentation: https://github.com/DazzleML/claude-bookmarks/blob/main/docs/usage.md
