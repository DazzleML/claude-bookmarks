# Every key, by where the keyboard is

The plugin has few keys, but what a key does depends on where the keyboard is: the input box, the band, or a pane. This page lists every binding in one place, grouped that way. [Usage](usage.md) explains each feature; this is the reference.

The examples write the leader as `Ctrl+]`, the recommended binding of Claude Code's own `abovePrompt:focus` action (default `Ctrl+X Tab`; see [The leader key](usage.md#the-leader-key)).

## 1. From the input box

| Key | Does |
|-----|------|
| `Ctrl+]` (the leader) | Moves the keyboard to the band. Works with a draft in the input box and while Claude is working. |
| Click a `⚓` link in a reply | Jumps to the bookmarked message and highlights its words |
| Ctrl-click a `⚓` link | Opens the bookmark's own file in your default markdown application |
| Ctrl-click a `▤` link | Opens that file in its default application (Claude Code's own link handling) |
| `/bm-...` typed commands | See [Typed commands](#5-typed-commands) |

## 2. On the band, right after the leader

The band's field takes exactly one key (two for the ones that need a letter). Any other key shows a reminder of this list and does nothing.

| Key | Then | Does |
|-----|------|------|
| `'` or `j` | a letter `a`-`z` | Jumps to that mark |
| `'` or `j` | `Enter` | Jumps to the reading position |
| `m` | a letter `a`-`z` | Marks the selected line (or the message at the top of the screen) with that letter; `Enter` or `Esc` cancels |
| `Space` or `r` | `Space` or `Enter` | Goes to the reading position, or back to where you were; with fresh selected text, sets it there |
| `p` | see section 3 | Opens the prompts pane |
| `b` | see section 3 | Opens the bookmarks pane |
| `P` | a letter `a`-`z`, or `` ` `` | Promotes that mark (or the reading position) into a bookmark on your list; the link goes to your clipboard |
| `o` | | Back to where you were before the last jump |
| `i` | | Forward again |
| `Esc` | | Leaves the band; the keyboard returns to the input box |

After any of these the keyboard stays on the band for the next command; `Esc` returns it to the input box. Arrow keys never reach the band ([#23](https://github.com/DazzleML/claude-bookmarks/issues/23)); a terminal mapping can type the leader and a key for you, see [Back and forward](usage.md#back-and-forward).

## 3. On the band with the prompts or bookmarks pane open

After `p` or `b` the pane shows the list and the band takes the keys:

| Key | Does |
|-----|------|
| digits | Type a number; the pane's `#` field shows it and the list scrolls to it |
| `Enter` | Jumps to the prompt or bookmark under the `▶` (or the typed number) |
| `j` / `k` | Moves the `▶` down (older) / up (newer); the first press starts at the newest |
| `s` | Prompts only: pins or unpins the prompt under the `▶`; the band stays open to pin more |
| `h` / `l` | Bookmarks only: previous / next group (yours, Claude's, all) |
| `Esc` | Closes the pane without jumping |

## 4. In a pane that holds the keyboard itself

A pane opened by a typed command from an **empty** input box takes the keyboard (the band cannot hand it over; Claude Code refuses a pane the keyboard while the input box holds text). Then the pane's own keys work:

| Key | Does |
|-----|------|
| `Tab` / `Shift+Tab` | Steps through the rows |
| `Up` / `Down` | The same |
| `Enter` | Jumps to the row |
| `*21` then `Enter` in the prompts pane's `#` field | Pins or unpins prompt 21 (`*` alone: the newest) |
| a letter in the mark or jump pane | Marks or jumps, as on the band |
| `Esc` | Closes the pane |

## 5. Typed commands

| Command | Does |
|---------|------|
| `/bm-mark` | Opens the mark pane (keyboard in the pane from an empty input box) |
| `/bm-goto` | Opens the jump pane |
| `/bm-prompts` | Opens the prompts pane |
| `/bm-bookmarks` | Opens the bookmarks pane |
| `/bm-read` | Goes to the reading position, or back |
| `/bm-promote a` | Promotes mark `a` into a bookmark on your list |
| `/bm-pin [N]` | Pins or unpins prompt N (the newest without a number) |
| `/bm-delmarks a b`, `/bm-delmarks all` | Deletes marks (the reading position stays) |
| `/bm-env` | The plugin's version, the Claude Code version, the session id, what it has captured, the log echo state |
| `/bm-marks` | The marks set in this conversation |
| `/bm-timeline` | The last few plugin events |
| `/bm-debug on\|off\|reset`, `default on\|off`, `force on\|off`, `status` | The log echo, per conversation; see [The log echo](usage.md#the-log-echo) |
| `/bm-diag-keys` | Logs each key typed in the input box to the file log (lengths and names, never the text) |

The `/bm-` prefix is from the proof of concept and will change ([#7](https://github.com/DazzleML/claude-bookmarks/issues/7), the command prefix setting).

## 6. Optional, not part of the default setup

| Key | Does | Note |
|-----|------|------|
| `Ctrl+X Space` bound to `app:diffFileListDown` | One-step reading position, works over a draft | Borrows a diff-panel action; see [Optional fast keys](usage.md#optional-fast-keys) |
| `Alt+Left` / `Alt+Right` as a terminal `sendInput` of `\u001do` / `\u001di` | Back / forward without the leader | Windows Terminal recipe in [Back and forward](usage.md#back-and-forward) |
| `Ctrl+X m`, `Ctrl+X '`, `Ctrl+X p` (older chords) | Mark, jump, prompts | Do not work over a draft; to be removed |

## 7. For Claude

Claude has one tool, `bookmark`, with the actions `add` (default), `relabel`, `remove`, `share` and `list`, on its own list or yours. It is not a key; it is how the `⚓` links in replies come to exist. See [What Claude's tool does](usage.md#what-claudes-tool-does).

## What may change

The band currently takes the keys for the prompts and bookmarks panes because Claude Code refuses a pane the keyboard over a draft. [#26](https://github.com/DazzleML/claude-bookmarks/issues/26) tracks landing the keyboard in the pane whenever Claude Code allows it, with the band as the fallback; the keys in section 3 would then be the pane's own. [#25](https://github.com/DazzleML/claude-bookmarks/issues/25) adds a way to refer to a mark by name in your prompt. See [Status](status.md) for the whole list.
