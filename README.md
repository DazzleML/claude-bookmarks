# claude-bookmarks

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FDazzleML%2Fclaude-bookmarks%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=brightgreen)](CHANGELOG.md)
[![Claude Code 2.1.287+](https://img.shields.io/badge/Claude%20Code-2.1.287%2B-d97757.svg)](https://code.claude.com/docs)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](docs/platform-support.md)

> **Vim-style marks, a reading position, and a numbered prompt history, inside a Claude Code conversation**

A Claude Code plugin (a mod: it draws in Claude Code's terminal app) that lets you select a line of a conversation, mark it with a letter, and jump back to it later from anywhere in the conversation. The plugin's name is **`convo-bookmarks`**, because third-party plugin names (sadly) starting with the prefix `claude-` are verboten. This is also not a claude.ai browser extension, but if you're looking for such a thing the [AI Chat Nav](https://chromewebstore.google.com/detail/ai-chatnav/edplgflcieggamnnoecdpckjjhpjlbim?pli=1) extension might help there.

## The Problem

A long Claude Code conversation is hard to move around in. The answer you need is three hundred messages up, the prompt that started this line of work is somewhere above that, and after you scroll up to check something, finding your way back down to where you were reading is a scroll-and-squint exercise. Claude Code can jump to the top and the bottom, and its transcript view can search, but it has no way to say "remember this spot" and come back to it.

**claude-bookmarks** gives you named spots in the conversation: letters you set on any line, a reading position you can swap to and back from, and a numbered list of every prompt you have typed, so "go back to where I asked about the cache" is two keystrokes instead of a hunt.

> [!NOTE]
> **Proof of concept (v0.1.x).** The core loop works and is in active use on Claude Code 2.1.288 and 2.1.289 (Windows Terminal, fullscreen): marks with an in-place highlight, jumps, the reading position, and the prompts pane. The code is being rebuilt into a tested core before 1.0, and the key layout may still change. See the [Roadmap](ROADMAP.md) and [issue #1](https://github.com/DazzleML/claude-bookmarks/issues/1). Please [file issues](https://github.com/DazzleML/claude-bookmarks/issues) for anything rough.

## Quick Start

Installing from the DazzleML plugin catalog is coming. Until then, load a local clone:

```bash
# 1. Clone the plugin
git clone https://github.com/DazzleML/claude-bookmarks.git

# 2. Load it. For one session:
claude --plugin-dir /path/to/claude-bookmarks
#    ...or for every session, add it to ~/.claude/settings.json:
#    "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-bookmarks" }

# 3. Bind the chords in ~/.claude/keybindings.json (see "Set up the chords" below)

# 4. Restart Claude Code, and switch to the fullscreen renderer if you are not on it
/tui fullscreen

# 5. Check it loaded
/bm-env
```

When the plugin is loaded, a one-line band sits above the prompt with four buttons: `mark jump prompts read`.

### Set up the chords

A plugin cannot declare keybindings of its own, so it reuses four actions of Claude Code's diff panel, which do nothing in a conversation. Bind them in your `~/.claude/keybindings.json` (back the file up first):

```json
{
  "bindings": [
    {
      "context": "Global",
      "bindings": {
        "ctrl+x m": "app:toggleDiffNoiseFilter",
        "ctrl+x '": "app:toggleDiffPreSession",
        "ctrl+x p": "app:cycleDiffBase",
        "ctrl+x space": "app:diffFileListDown"
      }
    }
  ]
}
```

Restart Claude Code after editing. Without the chords, the band's buttons do the same things with a click.

> [!TIP]
> **New to vim-style keys?** Start with the **[tutorial](docs/tutorial.md)**: it explains chords, leader keys and vim marks in plain terms, then walks you through each feature in about five minutes.

## Documentation

- **[Tutorial](docs/tutorial.md)** - Chords, leader keys and vim marks explained, then a hands-on walkthrough
- **[Using claude-bookmarks](docs/usage.md)** - Each feature in detail: marks, jumps, the reading position, the prompts pane, and what is kept
- **[Troubleshooting](docs/troubleshooting.md)** - The band doesn't appear, a chord does nothing, a jump is refused
- **[Platform support](docs/platform-support.md)** - Terminals and renderers, tested and expected
- **[Claude Code quirks we work around](docs/engine-quirks.md)** - Each limit of the plugin API we hit, what the plugin does about it, and what a proper fix would be

## Features

- **Marks** - Select text in any reply or prompt, press `Ctrl+X m` and a letter (`a`-`z`). With nothing selected, the letter marks your latest prompt
- **In-place highlight** - The marked line lights up where it sits in the conversation for two minutes, so you can see what you marked
- **Jumps** - `Ctrl+X '` and a letter scrolls back to that mark from anywhere in the conversation; the jump pane lists only the marks you have
- **Reading position** - Select a line and press `Ctrl+X Space` to keep your place; press it again from anywhere to go there, and again to return to where you were
- **Prompt history** - `Ctrl+X p` lists every prompt of the conversation, numbered from your first, including prompts from before the plugin was loaded; type a number and Enter to jump
- **Per conversation** - Marks, the reading position and the prompt list belong to the conversation they were made in, and survive restarting Claude Code and `--resume`
- **Display only** - Highlights change what is drawn on screen, never what Claude reads or what is saved in the session file
- **No extra installs** - TypeScript that runs inside Claude Code; the prompt back-fill uses the shell your system already has (PowerShell on Windows, `sh` and `grep` elsewhere)

## Usage

### Keys

| Chord | Band button | What it does |
|-------|-------------|--------------|
| `Ctrl+X m` then `a`-`z` | `mark` | Mark the selected line (or your latest prompt) with that letter |
| `Ctrl+X '` then `a`-`z` | `jump` | Jump to that mark |
| `Ctrl+X '` then `Enter` | `jump` | Jump to the reading position (it heads the jump pane) |
| `Ctrl+X p` then a number, `Enter` | `prompts` | Jump to prompt #N |
| `Ctrl+X Space` | `read` | Set, go to, or return from the reading position |
| `Esc` | | Close a pane |

In the mark pane, letters already in use show as `a: ●`. In the prompts pane, `Tab` steps through the list as well; prompts drawn dimmed are ones Claude Code hasn't drawn on screen, usually from before the last compaction, and a jump to one may be refused (see [Tips](#tips)).

The band also works as a leader with no chords set up: Claude Code's `Ctrl+X Tab`, then `m`, `j`, `p` or `r` (experimental; see [docs/usage.md](docs/usage.md#the-leader-experimental)).

### Common workflows

```text
# Keep an answer you will need again
select a line of it  ->  Ctrl+X m  a           (mark a)
...later, anywhere   ->  Ctrl+X '  a           (back to it)

# Check something above, then come back
select the line you are reading  ->  Ctrl+X Space   (reading position set)
scroll up, read what you needed
Ctrl+X Space                                        (back to the reading position)
Ctrl+X Space again                                  (and back to where you were)

# Go back to where a line of work started
Ctrl+X p  12  Enter                                 (prompt #12)
```

### Commands

The plugin also adds a few diagnostic commands from its proof-of-concept stage:

| Command | What it shows |
|---------|---------------|
| `/bm-env` | Plugin version, session id, and what it has captured |
| `/bm-marks` | The marks set in this conversation |
| `/bm-timeline` | The last few plugin events (draws, panes, jumps) |
| `/bm-pin [N]` | Pin or unpin prompt #N in the prompts pane (`*N` in its `#` field does the same) |

For each feature in detail, see **[docs/usage.md](docs/usage.md)**.

## Tips

The known limits, briefly; **[docs/troubleshooting.md](docs/troubleshooting.md)** has the details.

- **Keep the input box empty when you use a chord.** While it holds text, the pane cannot take the letter or number, and it is typed into your prompt instead ([#17](https://github.com/DazzleML/claude-bookmarks/issues/17)).
- **Chords do nothing while a dialog is up** (a permission prompt, or a question Claude is asking). This is Claude Code's rule for plugin chords; answer the dialog first.
- **Messages from before the last compaction usually can't be jumped to after a restart or resume**, because Claude Code then loads the conversation only from that compaction onward. The plugin copies a phrase of the message to your clipboard and tells you where to look: press `Ctrl+O`, then `[` (writes what Claude Code holds to your terminal's scrollback), then your terminal's Find (`Ctrl+Shift+F` or `Cmd+F`), and paste. Older messages may only be in the session file; opening it in full is planned ([#16](https://github.com/DazzleML/claude-bookmarks/issues/16)).
- **"Where you were" is a whole message.** A plugin cannot read or restore the exact scroll offset, so returning from the reading position brings back the message that was at the top of the screen.
- **If the plugin doesn't load after `/fork`**, the session may be hosted by Claude Code's background daemon, which doesn't load `CLAUDE_CODE_PLUGIN_DIRS`. Stop it with `claude stop <short id>` and resume it from a shell with `claude --resume <session id>`.
- **If you have disabled Claude Code's built-in diff mod**, the borrowed actions belong to the old diff panel and the chords may act on it instead. While the diff panel is open, `Ctrl+X p` and `Ctrl+X Space` may be taken by it.

## Configuration

Nothing to configure yet beyond the chords. Settings are planned ([#7](https://github.com/DazzleML/claude-bookmarks/issues/7)): how long the highlight stays, whether the reading position swaps back or only goes there, and the pane sizes.

### Debug Logging

Every chord press, pane and jump is written to a per-conversation log, kept to its last 400 lines:

```
${CLAUDE_USER_DIR:-~/claude}/bookmarks/debug/<session id>.log
```

Read its last lines first when something behaves oddly; they make a good attachment to an issue.

## Platform Support

| Platform | Status |
|----------|--------|
| Windows 11, Windows Terminal, fullscreen | Tested |
| macOS, fullscreen | Expected to work |
| Linux, fullscreen | Expected to work |
| Classic (non-fullscreen) renderer | Not supported |

Details, including tmux, IDE terminals and the Desktop app: [docs/platform-support.md](docs/platform-support.md).

## Project Structure

```
claude-bookmarks/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest (name: convo-bookmarks)
├── hooks/
│   ├── hooks.json            # Points Claude Code at the mod
│   └── register.tsx          # The mod: chords, panes, highlight, back-fill
├── types/index.d.ts          # Declared $.state values
├── docs/                     # Tutorial, usage guide, troubleshooting, platform support
├── scripts/repokit-common/   # Shared repo tooling (git subtree from DazzleTools/git-repokit-common)
├── tests/
│   ├── checklists/           # Human test checklists
│   └── one-offs/             # Probes and measurements
├── .repokit-common.toml      # Repo tooling settings (version sync into plugin.json)
└── version.py                # Version source for the repo tooling
```

## How It Works

1. **Chords press the plugin's buttons.** Each band button carries one of the four borrowed diff-panel actions; the chord bound to that action in `keybindings.json` presses the button, which opens the plugin's pane or acts directly.

2. **A mark is a message plus a snippet.** Marking reads your mouse selection, finds the message it sits in, and stores the message id and the selected line under the letter, per conversation.

3. **The highlight is drawn, not written.** While a mark is shown, the plugin redraws that message with the marked line coloured. The session file and what Claude reads are untouched.

4. **Jumps ask Claude Code to scroll.** A jump asks Claude Code to reveal the stored message. If the message isn't loaded (it's from before the last compaction and the session was restarted), Claude Code refuses, and the plugin falls back to the clipboard phrase.

5. **The prompt list is back-filled once.** The first time the plugin sees a conversation, it reads the user prompts out of the session's transcript file with one shell command (`Select-String` on Windows, `grep` elsewhere), then keeps the list current as you type.

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for:
- Development setup (`claude --plugin-dir .` reloads the mod live when you save)
- Checks: `claude plugin validate .` and `python -m pytest tests/ -v`
- Version management with `sync-versions.py`
- Human test checklists in `tests/checklists/`

Like the project?

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/djdarcy)

## Related Projects

- [claude-session-logger](https://github.com/DazzleML/claude-session-logger) - Real-time per-session logging of tool calls, prompts and replies
- [Claude-Session-Backup](https://github.com/DazzleML/Claude-Session-Backup) - Git-backed backup, search and restore of Claude Code sessions, including the pre-compaction messages a bookmark can no longer scroll to
- [anthropics/claude-code#94786](https://github.com/anthropics/claude-code/issues/94786) - The feature request this project grew from: linking and anchoring to specific messages in a conversation
- [Claude Code](https://claude.ai/code) - Anthropic's CLI for Claude

## License

claude-bookmarks, copyright (C) 2026 Dustin Darcy

This project is licensed under the GNU General Public License v3.0 or later - see the [LICENSE](LICENSE) file for details.
