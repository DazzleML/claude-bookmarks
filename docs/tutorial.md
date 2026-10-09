# Tutorial: marks, chords and leader keys

claude-bookmarks borrows its keys from the [vim text editor](https://www.vim.org/). If you've never used vim, the keys can look arbitrary: why `m`, why an apostrophe, why does everything start with `Ctrl+]`? This page explains the three ideas behind them, then walks you through each feature in a few minutes of hands-on practice.

You don't need to know vim to use the plugin. The ideas are small, and once you've seen them the keys make sense.

## Idea 1: a chord is a sequence, not a shortcut

Most keyboard shortcuts are pressed all at once: `Ctrl+C` means "hold Ctrl, press C". A **chord** (some programs call it a key sequence) is several presses **one after another**:

```
Ctrl+] m      means:  hold Ctrl and press ], let go of both, then press m
```

Written out, `Ctrl+] m a` is three steps: `Ctrl+]`, then `m`, then `a`. You don't need to be fast; Claude Code waits for the next key.

## Idea 2: a leader (or prefix) key frees up the whole keyboard

In Claude Code's prompt, every plain key types a character. If the plugin took the `m` key, you could never type an "m" again. So the plugin's keys sit behind a **prefix**: a key that says "the next key is a command, not text".

Many programs use the same trick:

| Program | Prefix | Example |
|---------|--------|---------|
| Emacs | `Ctrl+X` | `Ctrl+X Ctrl+S` saves the file |
| tmux | `Ctrl+B` | `Ctrl+B c` opens a new window |
| vim | the *leader*, often `\` or `Space` | `\w` might save, depending on your setup |
| claude-bookmarks | `Ctrl+]` | `Ctrl+] m` opens the mark pane |

Vim calls its version the **leader key**: a key you choose, which "leads" a short sequence of your own commands. The point is the same everywhere: one prefix gives you a whole keyboard of commands without clashing with ordinary typing.

claude-bookmarks recommends `Ctrl+]` as its leader because every terminal passes it on to Claude Code unchanged, so it works without any terminal setup. It's bound to Claude Code's own "focus the band" action, which moves the keyboard to the plugin's one-line band above the input box; Claude Code's default key for that, `Ctrl+X Tab`, works too. See [The leader key](usage.md#the-leader-key).

## Idea 3: vim marks are bookmarks named by one letter

In vim, you can drop a **mark** on a line and come back to it later:

| In vim | What it does |
|--------|--------------|
| `m` then `a` | Remember this spot as mark `a` |
| `'` (apostrophe) then `a` | Jump back to the line of mark `a` |
| `''` (two apostrophes) | Jump back to where you were before your last jump |
| `:marks` | List your marks |

Marks are meant to be cheap and disposable: one letter, no name to think up, no menu to open. You set one the moment you think "I'll want this again", and overwrite it without a second thought when you need the letter for something else.

claude-bookmarks keeps the same letters, behind the `Ctrl+]` leader:

| In vim | In claude-bookmarks |
|--------|---------------------|
| `ma` | Select a line with the mouse, then `Ctrl+] m a` |
| `'a` | `Ctrl+] ' a` (or `Ctrl+] j a`) |
| `''` (back to where you were) | `Ctrl+] Space Space`, the [reading position](usage.md#the-reading-position), which swaps between a spot you choose and where you came from |
| `:marks` | `Ctrl+] m` shows which letters are in use; `/bm-marks` lists them |

One difference: vim marks point at a cursor position, while a conversation has no cursor. So you **select** text with the mouse to say where the mark goes, and a jump brings that **message** to the top of the screen, with the marked line lit up so you can spot it.

## Try it: five minutes, in any long conversation

You'll need the plugin loaded, the leader bound (see the [Quick Start](../README.md#quick-start)), and a conversation with a few screens of history. After each step the keyboard stays on the band, ready for the next command; press `Esc` to go back to typing.

### 1. Set a mark

1. Scroll up to any reply you might want again. Select a few words of it with the mouse.
2. Press `Ctrl+]`, then `m`. The band shows the letters `a` to `z`, and a pane opens beside the conversation.
3. Press `a`.

The pane closes, a message says `mark a [selection] -> ...`, and the line you selected is highlighted. The band above the prompt shows `| a ▸ ...` too.

With nothing selected, `m` marks the message at the top of your screen instead. The same happens if your selection is more than 75 seconds old, so a selection left over from copying something doesn't decide where a mark goes.

### 2. Jump back to it

1. Scroll to the bottom of the conversation (`Ctrl+End`, or the mouse wheel).
2. Press `Ctrl+]`, then `'` (the apostrophe key). The jump pane lists your marks.
3. Press `a`.

You're back at the reply, with the line lit up again.

### 3. Mark a second spot, and see the letters in use

1. Select a few words of a different message and press `Ctrl+] m`. This time `a` shows as `●` (in use), and the list underneath shows what `a` holds.
2. Press `b`.

Now try `Ctrl+] '`: the jump pane lists both `a` and `b`.

### 4. Keep your place while you look around

This is the reading position, the plugin's version of vim's "back to where I was".

1. Select a few words of the message you're reading, and press `Ctrl+]`, `Space`, `Space`. A message says `reading position set: ...`.
2. Scroll far away: up to the top, or down to the end.
3. Press `Ctrl+] Space Space`. You're back at your reading position.
4. Press `Ctrl+] Space Space` again. You're back where you were in step 3.

Press it again and again to swap between the two. To move your reading position, select text in a different message and press `Ctrl+] Space Space`. (The first `Space` asks for the reading position, and the second confirms it; `Enter` works as the second key too.)

### 5. Find an earlier prompt by number

1. Press `Ctrl+] p`. The prompts pane lists every prompt you've typed here, newest first, numbered from your first.
2. Type `1` and press `Enter`. You're at the very first prompt of the conversation.

To browse instead, press `Ctrl+] p`, then `j` (or Down) to move a `▶` down the list and `k` (or Up) to move it back up, then `Enter` to jump to the prompt it points at.

### 6. Use the keys while you're typing

1. Type a few words into the input box. Don't send them.
2. Press `Ctrl+] '`, then `a`.

You jump to mark `a`, and your words are still in the input box, untouched. The leader moves the keyboard to the band without touching your draft, and `Esc` brings you back to it. (The keys do nothing while Claude Code is showing a dialog, such as a permission prompt.)

### 7. Let Claude bookmark the places that matter

Ask: *"Where should I read in this conversation to catch up? Bookmark each place."* Claude answers with a list, each item a link drawn with a `⚓` marker. Click one: the view jumps to that message and the words the link names light up. `Ctrl+] o` brings you back to the list; `Ctrl+] i` goes forward again. Ctrl-click the same link and the bookmark's own file opens in your markdown editor, with the message and a Notes section for you.

Those bookmarks are permanent and separate from your marks. `Ctrl+] b` lists yours and Claude's. To keep a mark of your own for good, `Ctrl+] P` then its letter promotes it into a bookmark and copies its link to your clipboard.

## Where next

- [Using claude-bookmarks](usage.md): each feature in detail, including what's kept and for how long.
- [Troubleshooting](troubleshooting.md): what to do when a key does nothing, a jump is refused, or the band doesn't appear.
