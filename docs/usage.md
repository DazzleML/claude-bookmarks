# Using claude-bookmarks

This guide explains each feature in turn: what it does, how to use it, and what it shows you along the way. It assumes the plugin is loaded and the chords are bound; see the [Quick Start](../README.md#quick-start) if not.

- [The band](#the-band)
- [Marks](#marks)
- [Jumping to a mark](#jumping-to-a-mark)
- [The reading position](#the-reading-position)
- [The prompts pane](#the-prompts-pane)
- [What is kept, and where](#what-is-kept-and-where)
- [Diagnostic commands](#diagnostic-commands)

For the known limits and what to do when something doesn't work, see [Troubleshooting](troubleshooting.md).

## The band

When the plugin is loaded, a one-line band sits just above the prompt:

```
bm: m: mark j: jump p: prompts r: read
```

Each word is a button, and each chord presses one of them:

| Button | Chord | Opens or does |
|--------|-------|---------------|
| `mark` | `Ctrl+X m` | The mark pane |
| `jump` | `Ctrl+X '` | The jump pane |
| `prompts` | `Ctrl+X p` | The prompts pane |
| `read` | `Ctrl+X Space` | The reading position (no pane) |

You can click the buttons instead of using the chords; they do the same things. When a mark has just been set or jumped to, the band also shows it after a bar, as `| a ▸ the marked line`, until the highlight clears.

Every pane closes with `Esc`, and closes by itself once it has done its job.

### The leader (experimental)

The band also works as a leader, without any chords set up. Claude Code's own `Ctrl+X Tab` puts the keyboard on the band, and then the button's letter presses it: `Ctrl+X Tab` then `j` opens the jump pane, `m` the mark pane, `p` the prompts pane, and `r` goes to the reading position.

A pane opened this way can't take the keyboard (Claude Code keeps it on the band), so the band itself takes the next key: it shows the letters to press (`jump: reading (Enter)  a: …  b: …`), and the pane stays open beside it as the list. The band goes back to its buttons after a jump or mark, when you send a prompt, or after 15 seconds.

To use a different key for the leader, rebind Claude Code's `abovePrompt:focus` action in `~/.claude/keybindings.json` (context `Chat`), for example `"ctrl+;": "abovePrompt:focus"`. Keys such as `Ctrl+;` and `Ctrl+,` reach Claude Code only if your terminal reports them; in Windows Terminal, map the key to a `sendInput` of `\u001b[59;5u` (for `Ctrl+;`) in its settings.

Known rough edges: `Esc` doesn't close a pane opened from the band, since the pane never holds the keyboard; the pane closes after a jump or mark, or with its `×`.

## Marks

A mark is a letter, `a` to `z`, attached to a line of the conversation.

**To set one:**

1. Select some text with the mouse in a reply or a prompt. A few words are enough; the line you select is what gets highlighted later.
2. Press `Ctrl+X m`. The mark pane opens:

   ```
   Mark as: (Esc)
   a b ● d e f g ...
   c ▸ the line you marked earlier
   ```

   Free letters are drawn dim. A letter already in use shows as `●`, and the marks you have are listed underneath with their text.
3. Press a letter. The pane closes, a message confirms the mark (`mark a [selection] -> ...`), and the selected line lights up in place.

**With nothing selected**, the letter marks your latest prompt instead, and the message says `[latest prompt]`. This is a quick way to mark "the question I just asked".

**Pressing a letter that is already in use moves it**: the old mark under that letter is replaced, as in vim.

**The highlight** stays for two minutes, or until you send your next prompt, whichever comes first. It only changes what is drawn on your screen: Claude never sees it, and the session file is not changed.

## Jumping to a mark

1. Press `Ctrl+X '` from anywhere in the conversation. The jump pane lists only the marks you have, one per line, plus the reading position at the top when you have one.
2. Press the mark's letter. The conversation scrolls so the marked message is at the top of the screen, and the marked line lights up again.

To go to the reading position from this pane, press `Enter`: the pane opens with its focus on the reading-position entry.

If the mark points at a message Claude Code no longer has on screen (usually one from before the last compaction, after the session was restarted or resumed), the jump can't happen. The plugin says so, copies a phrase of the message to your clipboard, and tells you how to find it; see [Troubleshooting](troubleshooting.md#a-jump-says-it-cant-go-there).

## The reading position

The reading position is a single bookmark with its own key, `Ctrl+X Space`, for "this is where I was reading". It works like a two-way switch: one press takes you there, the next takes you back.

**To set it:** select some text in the message you are reading and press `Ctrl+X Space`. The message says `reading position set: ...`.

**To use it:** scroll anywhere you like (up to check an earlier answer, down to the newest reply), then press `Ctrl+X Space` with nothing selected:

| You are... | `Ctrl+X Space` does |
|------------|---------------------|
| Somewhere else in the conversation | Goes to the reading position, and remembers the message that was at the top of your screen |
| At the reading position, having just jumped there | Goes back to the message you jumped from |
| At the reading position, having scrolled there yourself | Stays put, and says so: there is nowhere to go back to |

So the common rhythm is: set it once, then press `Ctrl+X Space` to visit it and `Ctrl+X Space` again to come back.

**To move it**, select text in a different message and press `Ctrl+X Space` again. A selection inside the message that already holds the reading position doesn't move it; that press counts as "go there". This stops a stray click or half-finished drag from moving your place by accident.

"Back" returns to a whole message, the one at the top of your screen when you jumped, not to your exact scroll offset. A plugin can ask Claude Code to show a message, but it cannot read or restore the scroll position itself.

The reading position is kept apart from the letters: it never takes up a letter, and the mark pane doesn't list it.

## The prompts pane

`Ctrl+X p` opens a list of every prompt you have typed in this conversation, newest first, numbered from your first. At the top is a `#` field for a number (its hint shows the range, such as `1-153`), and under it the list:

```
or Tab / Shift+Tab, Enter
153) Looks good, let's do a small commit for that
152) Then a recap and a what-next
...
```

**To jump by number**, type it into the `#` field. It jumps on `Enter`, or as soon as the digits you have typed can't be the start of a larger prompt number. With 25 prompts, typing `3` jumps at once to #3, while `2` waits, since you might mean #21.

**To pick from the list**, press `Tab` to step down through the prompts from the newest, `Shift+Tab` to step back up, and `Enter` to jump to the one in focus.

The list includes prompts from before the plugin was loaded. The first time it sees a conversation, the plugin reads the prompts from the conversation's transcript file in one pass. After that it adds each prompt as you send it.

**Dimmed prompts** are ones Claude Code hasn't drawn on screen since the plugin loaded. Usually that means they are from before the last compaction, which Claude Code no longer loads after a restart or resume, and a jump to one will be refused. A prompt that simply hasn't been scrolled past yet is also dim until it is drawn, so treat the dimming as a hint, not a promise.

## What is kept, and where

| What | Kept for | Notes |
|------|----------|-------|
| Marks `a`-`z` | This conversation | Survive restarting Claude Code and `claude --resume` |
| Reading position | This conversation | The same |
| The prompt list | This conversation | Up to 5000 prompts |
| The highlight | Two minutes, or until your next prompt | Display only |

Each conversation has its own marks: `a` in one conversation is unrelated to `a` in another. The plugin stores them in Claude Code's own plugin storage, not in the session file.

## Diagnostic commands

The plugin adds a few commands from its proof-of-concept stage. They are useful when reporting a problem:

| Command | Shows |
|---------|-------|
| `/bm-env` | The plugin's version, the Claude Code version, the session id, and what the plugin has captured |
| `/bm-marks` | The marks set in this conversation |
| `/bm-timeline` | The last few plugin events: draws, panes, jumps, toasts |

These commands are left over from the proof of concept and will be renamed in the rebuild.
