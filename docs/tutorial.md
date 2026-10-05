# Tutorial: marks, chords and leader keys

claude-bookmarks borrows its keys from the [vim text editor](https://www.vim.org/). If you've never used vim, the keys can look arbitrary: why `m`, why an apostrophe, why does everything start with `Ctrl+X`? This page explains the three ideas behind them, then walks you through each feature in a few minutes of hands-on practice.

You don't need to know vim to use the plugin. The ideas are small, and once you've seen them the keys make sense.

## Idea 1: a chord is a sequence, not a shortcut

Most keyboard shortcuts are pressed all at once: `Ctrl+C` means "hold Ctrl, press C". A **chord** (some programs call it a key sequence) is several presses **one after another**:

```
Ctrl+X m      means:  hold Ctrl and press X, let go of both, then press m
```

Written out, `Ctrl+X m a` is three steps: `Ctrl+X`, then `m`, then `a`. You don't need to be fast; Claude Code waits for the next key.

## Idea 2: a leader (or prefix) key frees up the whole keyboard

In Claude Code's prompt, every plain key types a character. If the plugin took the `m` key, you could never type an "m" again. So the plugin's keys sit behind a **prefix**: a key that says "the next key is a command, not text".

Many programs use the same trick:

| Program | Prefix | Example |
|---------|--------|---------|
| Emacs | `Ctrl+X` | `Ctrl+X Ctrl+S` saves the file |
| tmux | `Ctrl+B` | `Ctrl+B c` opens a new window |
| vim | the *leader*, often `\` or `Space` | `\w` might save, depending on your setup |
| claude-bookmarks | `Ctrl+X` | `Ctrl+X m` opens the mark pane |

Vim calls its version the **leader key**: a key you choose, which "leads" a short sequence of your own commands. The point is the same everywhere: one prefix gives you a whole keyboard of commands without clashing with ordinary typing.

claude-bookmarks uses `Ctrl+X` as its prefix because Claude Code already supports `Ctrl+X` chords in its `keybindings.json`. A single leader chord that opens every bookmark action from one menu is planned ([#8](https://github.com/DazzleML/claude-bookmarks/issues/8)).

## Idea 3: vim marks are bookmarks named by one letter

In vim, you can drop a **mark** on a line and come back to it later:

| In vim | What it does |
|--------|--------------|
| `m` then `a` | Remember this spot as mark `a` |
| `'` (apostrophe) then `a` | Jump back to the line of mark `a` |
| `''` (two apostrophes) | Jump back to where you were before your last jump |
| `:marks` | List your marks |

Marks are meant to be cheap and disposable: one letter, no name to think up, no menu to open. You set one the moment you think "I'll want this again", and overwrite it without a second thought when you need the letter for something else.

claude-bookmarks keeps the same letters, behind the `Ctrl+X` prefix:

| In vim | In claude-bookmarks |
|--------|---------------------|
| `ma` | Select a line with the mouse, then `Ctrl+X m a` |
| `'a` | `Ctrl+X ' a` |
| `''` (back to where you were) | `Ctrl+X Space`, the [reading position](usage.md#the-reading-position), which swaps between a spot you choose and where you came from |
| `:marks` | `Ctrl+X m` shows which letters are in use; `/bm-marks` lists them |

One difference: vim marks point at a cursor position, while a conversation has no cursor. So you **select** text with the mouse to say where the mark goes, and a jump brings that **message** to the top of the screen, with the marked line lit up so you can spot it.

## Try it: five minutes, in any long conversation

You'll need the plugin loaded, the chords bound (see the [Quick Start](../README.md#quick-start)), and a conversation with a few screens of history. Keep the input box **empty** throughout; the chords can't take keys while it holds text.

### 1. Set a mark

1. Scroll up to any reply you might want again. Select a few words of it with the mouse.
2. Press `Ctrl+X`, then `m`. A small pane opens, showing the letters `a` to `z`.
3. Press `a`.

The pane closes, a message says `mark a [selection] -> ...`, and the line you selected is highlighted. The band above the prompt shows `| a ▸ ...` too.

### 2. Jump back to it

1. Scroll to the bottom of the conversation (`Ctrl+End`, or the mouse wheel).
2. Press `Ctrl+X`, then `'` (the apostrophe key). The jump pane lists your marks.
3. Press `a`.

You're back at the reply, with the line lit up again.

### 3. Mark a second spot, and see the letters in use

1. Select a few words of a different message and press `Ctrl+X m`. This time `a` shows as `●` (in use), and the list underneath shows what `a` holds.
2. Press `b`.

Now try `Ctrl+X '`: the jump pane lists both `a` and `b`.

### 4. Keep your place while you look around

This is the reading position, the plugin's version of vim's "back to where I was".

1. Select a few words of the message you're reading, and press `Ctrl+X Space`. A message says `reading position set: ...`.
2. Scroll far away: up to the top, or down to the end.
3. Press `Ctrl+X Space` with nothing selected. You're back at your reading position.
4. Press `Ctrl+X Space` again. You're back where you were in step 3.

Press it again and again to swap between the two. To move your reading position, select text in a different message and press `Ctrl+X Space`.

### 5. Find an earlier prompt by number

1. Press `Ctrl+X p`. The prompts pane lists every prompt you've typed here, newest first, numbered from your first.
2. Type `1` and press `Enter`. You're at the very first prompt of the conversation.

You can also press `Tab` to step down the list and `Enter` to jump to the one in focus.

### 6. See the one rule that trips everyone up

1. Type a few letters into the input box. Don't send them.
2. Press `Ctrl+X '`, then `a`.

The `a` lands in your prompt instead of jumping. While the input box holds text, Claude Code keeps the keyboard there, so the pane can't take the letter. Clear the input box and it works again. (Chords also do nothing while Claude Code is showing a dialog, such as a permission prompt.)

## Where next

- [Using claude-bookmarks](usage.md): each feature in detail, including what's kept and for how long.
- [Troubleshooting](troubleshooting.md): what to do when a chord does nothing, a jump is refused, or the band doesn't appear.
