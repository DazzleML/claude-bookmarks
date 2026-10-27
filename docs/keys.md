# Every key, by where the keyboard is

The plugin has few keys, but what a key does depends on where the keyboard is: the input box, the band, or a pane. This page lists every binding in one place, grouped that way. [Usage](usage.md) explains each feature; this is the reference.

The leader is `Ctrl+]`, Claude Code's own `abovePrompt:focus` action bound to one key (see [The leader key](usage.md#the-leader-key) for the one-line binding; until it is in place, Claude Code's built-in `Ctrl+X Tab` does the same).

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
| `'` or `j` | a letter `a`-`z` | Opens the jump pane listing your marks, then jumps to that mark |
| `'` or `j` | `Enter` | Jumps to the reading position |
| `m` | a letter `a`-`z` | Marks the selected line (or the message at the top of the screen) with that letter; `Enter` or `Esc` cancels |
| `Space` or `r` | `Space` or `Enter` | Goes to the reading position, or back to where you were; with fresh selected text, sets it there |
| `p` | see section 3 | Opens the prompts pane |
| `b` | see section 3 | Opens the bookmarks pane |
| `l` | -- | Opens the lists pane beside the conversation, or closes it ([Lists](usage.md#lists)); on the bar between `prompts` and `/search` |
| `/` | see section 3 | Opens the search pane: the whole conversation, every kind of row ([Searching the conversation](usage.md#searching-the-conversation)) |
| `P` | a letter `a`-`z`, or `` ` `` | Promotes that mark (or the reading position) into a bookmark on your list; the link goes to your clipboard |
| `d` | a letter `a`-`z` | Clears that mark: the letter points at nothing, and its history is kept |
| `D` | a letter `a`-`z` | Forgets that mark: its record goes too, outright when nothing else refers to it |
| `o` | | Back to where you were before the last jump |
| `i` | | Forward again |
| `?` | | Shows every command and list key, and how the band's switches are set, in the band; `Enter` or `Esc` closes it |
| `q` | | Closes the plugin's pane and ends whatever the band is doing (for a list left open after a jump) |
| `Esc` | | Leaves the band; the keyboard returns to the input box |

### Why some commands have two keys

`'` and `Space` are the keys the commands were designed around: `'` is vim's jump-to-mark, and `Space` is one easy press for the reading position. But the band's buttons can only be pressed from the keyboard by a single letter or digit (a limit of Claude Code's buttons), so the clickable `jump` and `read` buttons carry `j` and `r` instead. Typed after the leader, either spelling works, because the band's field takes any key; the bar shows the letter, because that is what its button answers to.

The same letter can mean something else once a list is open: after `p` or `b`, `j` and `k` move through the list (vim's down and up), so `j` is "jump" at the start of a command and "next" inside a list.

These are the default keys. You can choose your own, or take a button off the bar, in `/config`: see [Choosing your own keys](#choosing-your-own-keys).

**A bar button closes the pane it opened.** Clicking `prompts` or `bookmarks` on the bar while its pane is open closes the pane. The key never does: `p` after the leader may be the start of `p 12`, so typing it with the pane open leaves the pane open.

After any of these the keyboard stays on the band for the next command; `Esc` returns it to the input box. Arrow keys never reach the band ([#23](https://github.com/DazzleML/claude-bookmarks/issues/23)); a terminal mapping can type the leader and a key for you, see [Back and forward](usage.md#back-and-forward).

## 3. On the band with the prompts or bookmarks pane open

After `p` or `b` the pane shows the list, and the band draws a `#` field of its own that takes the keys. It is an ordinary text field, so you can correct what you type:

| Key | Does |
|-----|------|
| digits | Type a number; the pane's `#` field shows it and the list scrolls to it |
| `Backspace` | Takes the last character off what you typed |
| `/words` | Prompts only: filters the list, as in the pane's own field |
| `*21`, then `Enter` | Prompts only: pins or unpins prompt 21 |
| `Enter` | Jumps to the prompt or bookmark under the `▶` (or the typed number) |
| `j` / `k` | Moves the `▶` down (older) / up (newer); the first press starts at the newest. After a step the field is empty again, with the number shown dim in it; `12j` steps from 12 |
| `Tab` / `Shift+Tab` | The same as `j` / `k` |
| `Down` / `Up` | The same, once you add the binding below |
| `s` | Prompts only: pins or unpins the prompt under the `▶`; the band stays open to pin more |
| `h` / `l` | Bookmarks only: previous / next group (yours, Claude's, all) |
| `c` | Bookmarks only: moves Claude's bookmark under the `▶` onto your list |
| a number, then `d` | Bookmarks only: removes that bookmark from your list; the bookmarks file keeps a tombstone in its place |
| `q` | Closes the pane (also typed alone in the pane's own `#` field) |
| `Esc` | Closes the pane without jumping |

**In search,** the band's field is the query, so every letter is text and the list keys above are not keys there:

| Key | Does |
|-----|------|
| letters, words, `"a phrase"`, `m/re/`, `in:tools` | The query; the results narrow as you type |
| `Tab` / `Shift+Tab` (or `Down` / `Up` with the binding below) | Moves the `▶` down / up; the first step lands on 1, the newest |
| `Enter` | Goes to the result under the `▶`, or the newest |
| `#12`, then `Enter` | Goes to result 12 |
| `*12`, then `Enter` | Pins or unpins result 12 |

**Up and Down in the band's field.** A text field in the band keeps the arrow keys to itself, so out of the box they do nothing there. One entry in `~/.claude/keybindings.json`, beside your leader's, makes them move off the field, which the band reads as a step:

```json
{ "context": "AbovePromptInput", "bindings": { "up": "abovePrompt:previous", "down": "abovePrompt:next" } }
```

Start a new session after adding it. The plugin never writes this file for you.

**The digit buttons instead.** "Typing a list number" in `/config` (under **▸ Bookmarks**) set to `buttons` brings back the earlier band: one button per digit, no field. `auto`, the default, uses the field.

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
| `/bm-search [words]` | Opens the search pane, searching for the words when given |
| `/bm-read` | Goes to the reading position, or back |
| `/bm-promote a` | Promotes mark `a` into a bookmark on your list |
| `/bm-pin [N]` | Pins or unpins prompt N (the newest without a number) |
| `/bm-delmarks a b`, `/bm-delmarks all` | Deletes marks (the reading position stays) |
| `/bm-env` | The plugin's version, the Claude Code version, the session id, what it has captured, the log echo state |
| `/bm-check` | The bookmark files on disk checked: formats, backups, the index, the store; reports only |
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

## Choosing your own keys

Open `/config`, type `bookmarks` in its search box, press `Enter` on **Bookmarks** so it reads `true` (every setting of the plugin is folded behind it), then on **Keys: show the key rows**. One row appears for each command in section 2, one for the list keys in section 3, and a row for the leader. Press `Enter` on the fold again to put them away; the keys you chose stay as set.

**A command's row** takes its keys separated by spaces, in the order the hint and the help should name them:

| You type | Means |
|---|---|
| (empty) | The default keys, the ones in the tables above |
| `x` | The command answers `x` instead |
| `' x` | Either key; the bar's button presses with `x` |
| `Space r` | `Space` spells the space key |
| `m hidden` | The keys stay `m`, and the button leaves the bar (type the key to use the command) |
| `o` on **Keys: back** | Any value puts the command's button on the bar, so back, forward and close, which have no button by default, gain one this way |

**The bar's buttons** can be pressed from the keyboard only with one lowercase letter or one digit, a limit of Claude Code's buttons. A command whose keys are all something else (`'`, `?`, `P`, `Space`) still works typed after the leader, and its button is click-only.

**The list row** renames the list keys by position, in this order: next, previous, pin, previous group, next group, claim, remove, close (default `j k s h l c d q`). The pane field's `/` (filter) and `*` (pin) stay as they are. A digit is refused there, since a digit is a number in a list.

**What is refused, and why.** A change that would give two commands on the band the same key, use a key the band never receives (an arrow, `Tab`, `Enter`, `Esc`, `Backspace`), or leave a command with no key is refused in `/config` with the reason, and the keys stay as they were. A value set by hand in `settings.json` that cannot be used keeps the default for that command, and the debug log names it at the next start. The same key may mean one thing on the band and another in a list, as `j` already does.

**The leader** is a Claude Code keybinding, not a plugin setting, so its row only says which chord is bound now. To change it, edit `~/.claude/keybindings.json` and bind your chord to `abovePrompt:focus` in the `Chat` context (the recipe is in [The leader key](usage.md#the-leader-key)), then start a new session.

## What may change

The band currently takes the keys for the prompts and bookmarks panes because Claude Code refuses a pane the keyboard over a draft. [#26](https://github.com/DazzleML/claude-bookmarks/issues/26) tracks landing the keyboard in the pane whenever Claude Code allows it, with the band as the fallback; the keys in section 3 would then be the pane's own. [#25](https://github.com/DazzleML/claude-bookmarks/issues/25) adds a way to refer to a mark by name in your prompt. See [Status](status.md) for the whole list.
