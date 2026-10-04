# Claude Bookmarks: bookmarks for Claude Code conversations

Highlight a line in your Claude Code terminal conversation, mark it, and jump back to it later. Vim-style marks, a named bookmarks pane, pins. (This is a Claude Code plugin, not a claude.ai browser extension.)

> **Status: proof of concept.** The core loop works (select text, `Ctrl+X m a` marks it and lights it up in place, `Ctrl+X ' a` jumps back), proven on Claude Code 2.1.288. The tool is being rebuilt into a proper release; see the [Roadmap](https://github.com/DazzleML/claude-bookmarks/issues/1).

The plugin's name is **`convo-bookmarks`** (third-party plugin names may not start with `claude-`).

## What it does

- **Mark a spot:** select some text in a reply or prompt with the mouse, press `Ctrl+X m` then a letter. The marked line is highlighted in place for a couple of minutes.
- **Jump back:** press `Ctrl+X '` then the letter, from anywhere in the conversation.
- **Display only:** highlights and tags change what is drawn on screen, never what Claude reads or what is saved in the session file.

Planned for 1.0: aliases (memorable names alongside letters), notes and links on each bookmark, opening a bookmark's URLs and files, a bookmarks pane, and a one-chord reading position (`Ctrl+X r`).

## Requirements

- Claude Code **2.1.287 or later** (mods are on by default from there)
- The **fullscreen** renderer (`/tui fullscreen`); mods that scroll the transcript need it

## Install

Installation through the DazzleML plugin catalog is coming. Until then, load a local clone:

```bash
git clone https://github.com/DazzleML/claude-bookmarks.git
claude --plugin-dir /path/to/claude-bookmarks
```

### Set up the chords

The mark and jump chords are bound in your own `~/.claude/keybindings.json` (a mod cannot declare keybindings, so the plugin reuses two engine actions that normally have nothing attached):

```json
{
  "bindings": [
    {
      "context": "Global",
      "bindings": {
        "ctrl+x m": "app:toggleDiffNoiseFilter",
        "ctrl+x '": "app:toggleDiffPreSession"
      }
    }
  ]
}
```

If you have disabled Claude Code's built-in diff mod, those two actions belong to the old diff panel and the chords may toggle its filters instead.

## Development

```bash
git clone https://github.com/DazzleML/claude-bookmarks.git
cd claude-bookmarks
bash scripts/repokit-common/install-hooks.sh   # version sync, pre-push checks
claude --plugin-dir .                          # saving a file reloads the mod live
```

- `claude plugin validate .` checks the manifest and the hooks module.
- `python -m pytest tests/ -v` runs the tooling checks (version and manifest).
- The mod is TypeScript with no runtime dependencies; Python is used only for repo tooling.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) for details.
