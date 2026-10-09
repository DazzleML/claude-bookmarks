# claude-bookmarks

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FDazzleML%2Fclaude-bookmarks%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=brightgreen)](CHANGELOG.md)
[![Claude Code 2.1.287+](https://img.shields.io/badge/Claude%20Code-2.1.287%2B-d97757.svg)](https://code.claude.com/docs)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](docs/platform-support.md)

> **Vim-style marks, a reading position, and a numbered prompt history, inside a Claude Code conversation**

A Claude Code plugin (a mod: it draws in Claude Code's terminal app) that lets you select a line of a conversation, mark it with a letter, and jump back to it later from anywhere in the conversation. The plugin's name is **`convo-bookmarks`**, because third-party plugin names (sadly) starting with the prefix `claude-` are verboten. This is not a claude.ai browser extension, but if you're looking for better web-based navigation [AI Chat Nav](https://chromewebstore.google.com/detail/ai-chatnav/edplgflcieggamnnoecdpckjjhpjlbim?pli=1) might help.

## The Problem

A long Claude Code conversation is hard to move around in. The answer you need is three hundred messages up, the prompt that started this line of work is somewhere above that, and after you scroll up to check something, finding your way back down to where you were reading is a scroll-and-squint exercise. Claude Code can already jump to the top and the bottom, and its transcript view can search, but it has no way to say "remember this spot" and come back to it.

**claude-bookmarks** gives you named spots in the conversation: letters you set on any line, a reading position you can swap to and back from, and a numbered list of every prompt you have typed, so "go back to where I asked about the cache" is two keystrokes instead of a safari.

> [!NOTE]
> **Pre-alpha (v0.2.x).** In daily use on Claude Code 2.1.288 to 2.1.295 (Windows Terminal, fullscreen and shrunk): marks with an in-place highlight, jumps, the reading position, the prompts pane, and now bookmarks with clickable links in Claude's replies. The pure core under `hooks/core/` is tested; the mod itself is verified by hand, and the key layout may still change. See the [Roadmap](ROADMAP.md) and [issue #1](https://github.com/DazzleML/claude-bookmarks/issues/1). Please [file issues](https://github.com/DazzleML/claude-bookmarks/issues) for anything rough.

## Quick Start

Installing from the DazzleML plugin catalog is coming. Until then, load a local clone:

```bash
# 1. Clone the plugin
git clone https://github.com/DazzleML/claude-bookmarks.git

# 2. Load it. For one session:
claude --plugin-dir /path/to/claude-bookmarks
#    ...or for every session, add it to ~/.claude/settings.json:
#    "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-bookmarks" }

# 3. Bind the leader key in ~/.claude/keybindings.json (see "Set up the leader" below)

# 4. Restart Claude Code, and switch to the fullscreen renderer if you are not on it
/tui fullscreen

# 5. Check it loaded
/bm-env
```

When the plugin is loaded, a one-line band sits above the prompt: a small `bm:` field, then four buttons, `mark jump prompts read`.

### Set up the leader

The plugin's keys all start with one **leader** key: Claude Code's own "focus the band" action, `abovePrompt:focus`, which moves the keyboard to the band. Its default key is `Ctrl+X Tab` and works with no setup. I recommend one key instead, `Ctrl+]`, which every terminal passes on. Add it to your `~/.claude/keybindings.json` (back the file up first):

```json
{
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "ctrl+]": "abovePrompt:focus"
      }
    }
  ]
}
```

That's the whole setup. Without it, use `Ctrl+X Tab` as the leader, or click the band's buttons.

> [!TIP]
> **New to vim-style keys?** Start with the **[tutorial](docs/tutorial.md)**: it explains chords, leader keys and vim marks in plain terms, then walks you through each feature in about five minutes.

## Documentation

- **[Tutorial](docs/tutorial.md)** - Chords, leader keys and vim marks explained, then a hands-on walkthrough
- **[Using claude-bookmarks](docs/usage.md)** - Each feature in detail: marks, jumps, the reading position, the prompts pane, and what is kept
- **[Troubleshooting](docs/troubleshooting.md)** - The band doesn't appear, a key does nothing, a jump is refused
- **[Platform support](docs/platform-support.md)** - Terminals and renderers, tested and expected
- **[Claude Code quirks to work around](docs/engine-quirks.md)** - Each limit of the plugin API I hit, what the plugin does about it, and what a proper fix would be

## Features

- **Marks** - Select text in any reply or prompt, press `Ctrl+] m` and a letter (`a`-`z`). With nothing freshly selected, the letter marks the message at the top of your screen
- **In-place highlight** - The marked line lights up where it sits in the conversation for two minutes, so you can see what you marked
- **Jumps** - `Ctrl+] '` and a letter scrolls back to that mark from anywhere in the conversation; the jump pane lists only the marks you have
- **Reading position** - Select a line and press `Ctrl+] Space Space` to keep your place; press it again from anywhere to go there, and again to return to where you were
- **Prompt history** - `Ctrl+] p` lists every prompt of the conversation, numbered from your first, including prompts from before the plugin was loaded; type a number, or browse with `j`/`k` or the arrows, then Enter to jump
- **Bookmarks** - Permanent, addressable places in the conversation, kept as readable files in your own folder. Claude places them while it answers and cites them as links in its reply: click one to jump there with the words highlighted, ctrl-click to open the bookmark's file. Your bookmarks and Claude's are separate lists (`Ctrl+] b`); promote any mark into a bookmark with `Ctrl+] P` and its letter
- **Back and forward** - `Ctrl+] o` returns to where you were before the last jump, `Ctrl+] i` goes forward again, like vim's jumplist
- **Works while you type** - The leader works with a draft in the input box and while Claude is working; your draft is untouched
- **Per conversation** - Marks, the reading position and the prompt list belong to the conversation they were made in, and survive restarting Claude Code and `--resume`
- **Display only** - Highlights change what is drawn on screen, never what Claude reads or what is saved in the session file
- **No extra installs** - TypeScript that runs inside Claude Code; the prompt back-fill uses the shell your system already has (PowerShell on Windows, `sh` and `grep` elsewhere)

## Usage

### Keys

| Keys | Band button | What it does |
|------|-------------|--------------|
| `Ctrl+] m` then `a`-`z` | `mark` | Mark the selected line (or the top of the screen) with that letter; `Enter` cancels |
| `Ctrl+] '` (or `j`) then `a`-`z` | `jump` | Jump to that mark |
| `Ctrl+] '` then `Enter` | `jump` | Jump to the reading position (it heads the jump pane) |
| `Ctrl+] Space Space` | `read` | Set, go to, or return from the reading position |
| `Ctrl+] p` then a number, `Enter` | `prompts` | Jump to prompt #N |
| `Ctrl+] p` then `j`/`k` or Down/Up, `Enter` | `prompts` | Browse the prompts one by one, then jump |
| `Ctrl+] p`, pick a prompt, then `s` | `prompts` | Pin or unpin it (the band stays open to pin more) |
| `Ctrl+] b` then a number, `Enter` | | Open the bookmarks pane (yours, then Claude's) and jump to bookmark #N |
| `Ctrl+] P` then `a`-`z` | | Promote that mark into a bookmark on your list (its link is copied to the clipboard) |
| `Ctrl+] o` / `Ctrl+] i` | | Back to before the last jump / forward again |
| Click a `⚓` link in a reply | | Jump to the bookmarked message, words highlighted; ctrl-click opens its file |
| `Esc` | | Leave the band and go back to typing |

After a command the keyboard stays on the band, ready for the next one; `Esc` returns to the input box. In the mark pane, letters already in use show as `●`. Prompts drawn dimmed in the prompts pane are ones Claude Code hasn't drawn on screen, usually from before the last compaction, and a jump to one may be refused (see [Tips](#tips)).

Power users can add one-step keys that press a band button directly, such as `Ctrl+X Space` for the reading position; they borrow actions of Claude Code's diff panel, so they aren't part of the default setup. See [Optional fast keys](docs/usage.md#optional-fast-keys).

### Common workflows

```text
# Keep an answer you will need again
select a line of it  ->  Ctrl+] m  a           (mark a)
...later, anywhere   ->  Ctrl+] '  a           (back to it)

# Check something above, then come back
select the line you are reading  ->  Ctrl+] Space Space   (reading position set)
scroll up, read what you needed
Ctrl+] Space Space                                        (back to the reading position)
Ctrl+] Space Space again                                  (and back to where you were)

# Go back to where a line of work started
Ctrl+] p  12  Enter                                       (prompt #12)

# Ask Claude where to read, and click your way there
"Where should I read to catch up? Bookmark each place."    (Claude answers with ⚓ links)
click a link                                              (jump; the words light up)
Ctrl+] o                                                  (back to the answer)

# Keep a mark for good
Ctrl+] P  a                                               (mark a becomes a bookmark; link on the clipboard)
```

### Commands

| Command | What it does |
|---------|--------------|
| `/bm-mark`, `/bm-goto`, `/bm-prompts`, `/bm-read` | The same as the leader keys, typed; from an empty input box their pane takes the keyboard |
| `/bm-bookmarks`, `/bm-promote a` | Open the bookmarks pane; promote mark `a` into a bookmark |
| `/bm-delmarks a b`, `/bm-delmarks all` | Delete marks |
| `/bm-pin [N]` | Pin or unpin prompt #N in the prompts pane (`*N` in its `#` field does the same) |
| `/bm-env` | Plugin version, session id, and what it has captured |
| `/bm-debug on\|off` | Echo the plugin's log into this conversation as dim rows (this conversation only; `default on\|off` and `force on\|off` reach every conversation) |
| `/bm-marks` | The marks set in this conversation |
| `/bm-timeline` | The last few plugin events (draws, panes, jumps) |

For each feature in detail, see **[docs/usage.md](docs/usage.md)**.

## Tips

The known limits, briefly; **[docs/troubleshooting.md](docs/troubleshooting.md)** has the details.

- **Press `Esc` to go back to typing.** After a command the keyboard stays on the band; a plugin can't hand it back to the input box itself.
- **The first jump after a Claude Code update asks for `Enter` once,** while the plugin checks what that version allows.
- **The keys do nothing while a dialog is up** (a permission prompt, or a question Claude is asking); answer the dialog first.
- **Messages from before the last compaction usually can't be jumped to after a restart or resume**, because Claude Code then loads the conversation only from that compaction onward. The plugin copies a phrase of the message to your clipboard and tells you where to look: press `Ctrl+O`, then `[` (writes what Claude Code holds to your terminal's scrollback), then your terminal's Find (`Ctrl+Shift+F` or `Cmd+F`), and paste. Older messages may only be in the session file; opening it in full is planned ([#16](https://github.com/DazzleML/claude-bookmarks/issues/16)). The companion patcher below removes this limit (see [Extended history with the patcher](#extended-history-with-the-patcher)).
- **"Where you were" is a whole message.** A plugin cannot read or restore the exact scroll offset, so returning from the reading position brings back the message that was at the top of the screen (or, from the very bottom, the last message's end).
- **If the plugin doesn't load after `/fork`**, the session may be hosted by Claude Code's background daemon, which doesn't load `CLAUDE_CODE_PLUGIN_DIRS`. Stop it with `claude stop <short id>` and resume it from a shell with `claude --resume <session id>`.
- **If you use the optional `Ctrl+X` fast keys** and have disabled Claude Code's built-in diff mod, or have the diff panel open, the diff panel may take those keys.

### Extended history with the patcher

Marks matter most in long conversations, which is exactly where the compaction limit above bites. The companion project **[dazzle-claude-code-patcher](https://github.com/DazzleML/dazzle-claude-code-patcher)** patches a local copy of Claude Code so that a restarted or resumed session keeps its whole conversation in view, from before every compaction. On a patched build, marks and the prompts pane reach every message. It is also where I plan to prototype other fixes this plugin would like Claude Code to have, such as keyboard handoff between a plugin's band and its pane.

claude-bookmarks never depends on it: every feature works on stock Claude Code. The patcher is in development and not yet released. See [Patched builds](docs/engine-quirks.md#patched-builds-trying-the-proper-fix-early) for how the two fit together.

## Configuration

Nothing to configure yet beyond the leader key. Settings are planned ([#7](https://github.com/DazzleML/claude-bookmarks/issues/7)), among them:
- how old a selection may be before a mark uses the top of the screen instead (75 seconds now);
- whether "back" from the bottom returns to the same text or to the newest reply;
- whether a typed prompt number waits for `Enter` (now) or jumps as soon as it's complete;
- how long the highlight stays, and the pane sizes.

### Debug Logging

Every key press, pane and jump is written to a per-conversation log, kept to its last 400 lines:

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
│   └── register.tsx          # The mod: the band, panes, highlight, back-fill
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

1. **The band is the command line.** The leader (`abovePrompt:focus`) moves the keyboard to the band, where a small field takes the next key, any key, `'` and `Space` included. The band then shows what it waits for and takes the rest of the keys itself, as button presses, while a pane beside the conversation shows the list. Claude Code lets a plugin scroll the conversation only from a button press, so every jump is one.

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
