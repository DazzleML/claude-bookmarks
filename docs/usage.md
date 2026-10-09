# Using claude-bookmarks

This guide explains each feature in turn: what it does, how to use it, and what it shows you along the way. It assumes the plugin is loaded and the leader key is bound; see the [Quick Start](../README.md#quick-start) if not.

- [The leader key](#the-leader-key)
- [The band](#the-band)
- [Marks](#marks)
- [Jumping to a mark](#jumping-to-a-mark)
- [The reading position](#the-reading-position)
- [The prompts pane](#the-prompts-pane)
- [Optional fast keys](#optional-fast-keys)
- [Typed commands](#typed-commands)
- [What is kept, and where](#what-is-kept-and-where)
- [Diagnostic commands](#diagnostic-commands)

For the known limits and what to do when something doesn't work, see [Troubleshooting](troubleshooting.md).

## The leader key

Every key of the plugin starts with one **leader** key, followed by one or two more keys. Vim users will know the idea; the [tutorial](tutorial.md) explains it from scratch.

The leader is Claude Code's own "focus the band" action, `abovePrompt:focus`. It moves the keyboard from the input box to the plugin's band above it. Its default key is `Ctrl+X Tab`, and it works without any setup. We recommend binding it to a single key, `Ctrl+]`, in `~/.claude/keybindings.json`:

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

If the file already has a `Chat` block, add the one line to it. The examples below write the leader as `Ctrl+]`.

| Keys | Does |
|------|------|
| `Ctrl+] '` (or `j`), then a letter | Jumps to that mark |
| `Ctrl+] m`, then a letter | Marks the selected line, or the top of the screen, with that letter |
| `Ctrl+] Space`, then `Space` (or `Enter`) | Goes to the reading position, or back to where you were |
| `Ctrl+] p`, then a number and `Enter` | Jumps to prompt #N |
| `Ctrl+] p`, then `j`/`k` or the arrow keys, then `Enter` | Browses the prompts one by one, then jumps |
| `Ctrl+] p`, then pick a prompt, then `s` | Pins or unpins the prompt under the `▶` |

**It works with text in the input box,** and while Claude is working. The leader moves the keyboard to the band without touching your draft.

**Why `Ctrl+]`:** it sends a control code that every terminal passes on, so it needs no terminal setup, over SSH as well. Keys such as `Ctrl+;` or `Ctrl+,` reach Claude Code only if your terminal reports them; see [A leader on `Ctrl+;`](#a-leader-on-ctrl) below. On some non-US keyboard layouts `]` is hard to type with Ctrl; pick another key there.

**Getting back to typing:** after a command the keyboard stays on the band, ready for the next one. Press `Esc` to return to the input box. A plugin can't hand the keyboard back by itself.

**The first jump after an update to Claude Code** ends with a toast asking you to press `Enter`. The plugin is checking, once per Claude Code version, whether it may jump straight from what you type. On current Claude Code it may not, so from then on `'` hands the letter to the band's buttons, which may. A future Claude Code that allows it gets one-step jumps automatically.

### A leader on `Ctrl+;`

To use a key your terminal doesn't report by default, map it in the terminal to the code Claude Code expects. In Windows Terminal, map the key to a `sendInput` of `\u001b[59;5u` (for `Ctrl+;`) in its settings, then bind `"ctrl+;": "abovePrompt:focus"`.

## The band

When the plugin is loaded, a one-line band sits just above the prompt:

```
bm: ' j m p ␣   m: mark  j: jump  p: prompts  r: read
```

The first part is a small field. When the leader puts the keyboard on the band, the field takes the next key, any key, including `'` and `Space`. The words after it are buttons you can click: `mark`, `jump` and `prompts` open their panes, and `read` goes to the reading position. A pane opened by a click stays open as a list to click in; close it with its `×`.

When a mark has just been set or jumped to, the band also shows it after a bar, as `| a ▸ the marked line`, until the highlight clears.

After the first key, the band shows what it is waiting for, for example `mark as: cancel (Enter) · · ● · …`, with a pane beside it as the readable list. The band goes back to its field after a jump or mark, when you send a prompt, after 15 seconds, or when you press `Esc`.

Typing a key that isn't a command after the leader shows a reminder of the keys, and does nothing else.

## Marks

A mark is a letter, `a` to `z`, attached to a line of the conversation.

**To set one:**

1. Select some text with the mouse in a reply or a prompt, or just scroll to where you want the mark.
2. Press `Ctrl+] m`. The mark pane opens, listing the marks you have:

   ```
   mark as: cancel (Enter) · · ● · · …
   ```

   Free letters are drawn as `·`, letters in use as `●`.
3. Press a letter. The pane closes, a message confirms the mark, and the marked line lights up in place. `Enter` (or `Esc`) cancels without marking.

**What gets marked:**

| You have... | The mark goes on |
|-------------|------------------|
| Text selected within the last 75 seconds | The selected line (`[selection]`) |
| An older selection, or none | The message at the top of the screen (`[top of screen]`), its first line highlighted |

Claude Code remembers the last text you selected even after its highlight is gone. The 75 seconds stop an old selection, perhaps one you made to copy a quote, from deciding where a new mark goes. The time will be a setting.

**The view stays where it was.** Opening the pane narrows the conversation, which shifts what's on screen. After the mark, the plugin scrolls back to the message that was at the top before the pane opened.

**Pressing a letter that is already in use moves it**: the old mark under that letter is replaced, as in vim.

**To delete marks:** `/bm-delmarks m`, `/bm-delmarks a b c`, or `/bm-delmarks all`. The reading position isn't a letter and stays.

**The highlight** stays for two minutes, or until you send your next prompt, whichever comes first. It only changes what is drawn on your screen: Claude never sees it, and the session file is not changed.

## Jumping to a mark

1. Press `Ctrl+]`, then `'` (or `j`), from anywhere in the conversation. The jump pane lists the marks you have, plus the reading position when you have one.
2. Press the mark's letter. The conversation scrolls so the marked message is at the top of the screen, and the marked line lights up again.

`Enter` instead of a letter goes to the reading position.

If the mark points at a message Claude Code no longer has on screen (usually one from before the last compaction, after the session was restarted or resumed), the jump can't happen. The plugin says so, copies a phrase of the message to your clipboard, and tells you how to find it; see [Troubleshooting](troubleshooting.md#a-jump-says-it-cant-go-there).

## The reading position

The reading position is a single bookmark for "this is where I was reading". It works like a two-way switch: one press takes you there, the next takes you back.

The keys are `Ctrl+] Space Space`: the first `Space` asks for the reading position, and the second presses it (`Enter` works too). `r` does the same as the first `Space`.

**To set it:** select some text in the message you are reading and press `Ctrl+] Space Space`. The message says `reading position set: ...`. As with marks, only a selection made within the last 75 seconds counts.

**To use it:** scroll anywhere you like, then press `Ctrl+] Space Space` with nothing freshly selected:

| You are... | `Ctrl+] Space Space` does |
|------------|---------------------------|
| Somewhere else in the conversation | Goes to the reading position, and remembers where you were |
| At the reading position, having just jumped there | Goes back to where you were |
| At the reading position, having scrolled there yourself | Stays put, and says so: there is nowhere to go back to |

**"Where you were"** is the message at the top of your screen, or, when you were at the very bottom, the last message's end. So going back from the bottom returns you to the same text you were reading, even if new replies have arrived below it. The plugin can't read or restore the exact scroll position, only show a message at the top or bottom of the window. So in the middle of a long message, back lands on that message's start.

**To move it**, select text in a different message and press `Ctrl+] Space Space` again. A selection inside the message that already holds the reading position doesn't move it; that press counts as "go there".

The reading position is kept apart from the letters: it never takes up a letter, and the mark pane doesn't list it.

## The prompts pane

`Ctrl+] p` opens a list of every prompt you have typed in this conversation, newest first, numbered from your first:

```
# 12
  153) Looks good, let's do a small commit for that
  152) Then a recap and a what-next
...
▶ 12) Our readme feels a bit weak
```

The band takes the keys, and the pane shows where you are:

| Key | Does |
|-----|------|
| Digits | Type a prompt number; it shows in the pane's `#` field, and the list scrolls to that prompt, marked `▶` |
| `j` / Down | Moves the `▶` one prompt down the list (older); the first press starts at the newest |
| `k` / Up | Moves it one prompt up (newer) |
| `Enter` | Jumps to the prompt under the `▶` |
| `s` | Pins or unpins the prompt under the `▶` (see [Pinned prompts](#pinned-prompts)) |
| `Esc` | Closes without jumping |

The list includes prompts from before the plugin was loaded. The first time it sees a conversation, the plugin reads the prompts from the conversation's transcript file in one pass. After that it adds each prompt as you send it.

**Dimmed prompts** are ones Claude Code hasn't drawn on screen since the plugin loaded. Usually that means they are from before the last compaction, which Claude Code no longer loads after a restart or resume, and a jump to one will be refused. A prompt that simply hasn't been scrolled past yet is also dim until it is drawn, so treat the dimming as a hint, not a promise.

**With an empty input box,** the typed command `/bm-prompts` opens the same pane with the keyboard in the pane itself. Then `Tab`/`Shift+Tab` step through the list, and the `#` field takes `*21` to pin.

### Pinned prompts

Pin the prompts you want to come back to, and they stay at the top of the pane:

| To | Do |
|----|----|
| Pin or unpin a prompt while browsing | `Ctrl+] p`, move the `▶` to it (`j`/`k`, the arrows, or its number), then `s`; the band stays open to pin more |
| Pin or unpin prompt #21 | `/bm-pin 21` |
| Pin or unpin your newest prompt | `/bm-pin` |
| Pin from the pane | Type `*21` (or `*` for the newest) in the pane's `#` field and press `Enter`; this needs the keyboard in the pane (`/bm-prompts` from an empty input box) |

A pinned prompt shows a gold star inside its number, `245★) `, both in a **★ pinned** group at the top of the pane (in the order you pinned them) and in its place in the full list. Pins are kept per conversation, like marks.

## Bookmarks

A mark is a letter you can reassign in a second. A **bookmark** is permanent: a durable address of one message in this conversation, kept in a readable file under your own folder, that still resolves in a later session and that a link can point at. Claude places bookmarks while it answers, and you can promote any mark into one.

### Links in Claude's replies

When Claude cites an earlier place in the conversation, it writes an ordinary markdown link, drawn with a `⚓` marker and a legend line under the reply:

```
As you said when we chose the name (⚓ the catalog name decision), ...
⚓ click: jump there · ctrl-click: open the bookmark's file
```

| On the link | Does |
|-------------|------|
| Click | Jumps to that message and highlights the words the bookmark names (the same colours as a mark) |
| Ctrl-click | Opens the bookmark's own file in your default markdown application |
| Hover (Windows Terminal) | Shows the full address |

A `▤` marker on a link means it opens a file (a document, a source file); web links carry no marker. The markers are added when the reply is drawn; nothing in the transcript changes.

### Two lists

Bookmarks come in two lists that never mix: **yours** and **Claude's**. Claude bookmarks places for its own discussion without touching your list; when you ask it to "bookmark this for me", it goes on yours. Claude can also relabel or remove a bookmark on request (a removal is archived, not deleted), and **share** one of its own onto your list.

### The bookmarks pane

`Ctrl+] b` opens the list on your own bookmarks, numbered in the order they were made (so a number stays good), and `l` / `h` switch the group: yours, Claude's, all:

```
# _
[yours] · Claude's · all   (h/l switch group; or Tab / Shift+Tab, Enter)
  3) ⚓ Set a mark on any message
     (12m, you said it)
```

The band takes the keys, as for prompts: digits type a number, `j`/`k` move the `▶`, `l`/`h` switch the group (the band shows which), `Enter` jumps and highlights the bookmark's words, `Esc` closes. Numbers are shared across the groups, so #3 is #3 in every view. `/bm-bookmarks` from an empty input box puts the keyboard in the pane itself.

### Promote a mark into a bookmark

`Ctrl+] P` then the mark's letter (`` ` `` for the reading position) makes a bookmark of that mark's message, with the mark's words, on your list. The letter stays as it was. The bookmark's markdown link is copied to your clipboard, ready to paste into a note or an issue. `/bm-promote a` does the same.

### Back and forward

Every jump (a bookmark link, a mark, a prompt number, the reading position) is remembered, like vim's jumplist:

| Keys | Does |
|------|------|
| `Ctrl+] o` | Back to where you were before the last jump |
| `Ctrl+] i` | Forward again |

The reading position is separate and is never moved by a jump. Arrow keys can't reach the band, so for `Alt+←` / `Alt+→` add a terminal mapping that types the leader and the key for you; in Windows Terminal's `settings.json`, under `actions`:

```json
{ "command": { "action": "sendInput", "input": "\u001do" }, "keys": "alt+left" },
{ "command": { "action": "sendInput", "input": "\u001di" }, "keys": "alt+right" }
```

(`\u001d` is `Ctrl+]`.) The same trick works for any leader command.

### What Claude's tool does

Claude has a `bookmark` tool. It gives a verbatim fragment of the message (or its uuid) and a label, and gets back the markdown link to cite with. The tool resolves the fragment against the conversation's transcript (the earliest message that contains it; if several do, it asks rather than guessing), records the bookmark, writes its file, and returns the link. Its other actions: `relabel`, `remove`, `share`, and `list` (both lists with their links).

### Where bookmarks live

Under your own folder, never under `~/.claude` (Claude Code cleans that):

```
~/claude/bookmarks/sessions/<session id>.json        the register: every bookmark of the conversation, readable JSON
~/claude/bookmarks/sessions/<session id>/<uuid8>.md  one file per bookmarked message: the text, every field, a verify recipe, and a Notes section
```

(`CLAUDE_USER_DIR`, if set, replaces `~/claude`.) The link's address names that file, with the message's uuid, its line in the transcript and its byte range in the query string:

```
file:///C:/Users/you/claude/bookmarks/sessions/<session>/12d637fb.md?u=<uuid>&l=5768&b=9763906-9765751&q=the%20words&v=1
```

The file's **Notes** section is yours: anything below its marker line survives when the bookmark is relabelled. Add context, links, or your own notes there.

**By hand, with no plugin:** a bookmark is only a transcript line. `grep -n` the words in the session's `.jsonl` for the line number, `head -n <line-1> | wc -c` for the byte offset, and write the link in the form above; the plugin recognises it when drawn and records it.

## Optional fast keys

For one-step actions, a key can press a band button directly. It goes through one of the few actions of Claude Code's diff panel that do nothing in a conversation:

```json
"ctrl+x space": "app:diffFileListDown"
```

in the same `Chat` block gives one-step reading: `Ctrl+X Space` goes to the reading position and back, and works with text in the input box too.

These are for power users, and not part of the recommended setup:
- **They borrow Claude Code's diff-panel actions.** While the diff panel is open, it takes them over, and a future Claude Code may remove them.
- **Only about four exist,** so they are reserved for the most common one-step actions.

**The older chords** `Ctrl+X m` (`app:toggleDiffNoiseFilter`), `Ctrl+X '` (`app:toggleDiffPreSession`) and `Ctrl+X p` (`app:cycleDiffBase`) still work if bound, but they don't work with text in the input box. The leader replaces them, and they will be removed in a later version.

## Typed commands

| Command | Does |
|---------|------|
| `/bm-mark` | Opens the mark pane |
| `/bm-goto` | Opens the jump pane |
| `/bm-prompts` | Opens the prompts pane |
| `/bm-read` | Goes to the reading position, or back |
| `/bm-bookmarks` | Opens the bookmarks pane |
| `/bm-promote a` | Promotes mark `a` into a bookmark on your list |
| `/bm-delmarks a b`, `/bm-delmarks all` | Deletes marks |
| `/bm-pin [N]` | Pins or unpins prompt #N (the newest without a number) |

From an empty input box, a pane opened by a command takes the keyboard, so its own keys work: the arrows, `Tab`, `Enter`. A command typed into the input box can't open a pane over other text, so for that the leader is the route.

## What is kept, and where

| What | Kept for | Notes |
|------|----------|-------|
| Marks `a`-`z` | This conversation | Survive restarting Claude Code and `claude --resume` |
| Reading position | This conversation | The same |
| The prompt list | This conversation | Up to 5000 prompts |
| Pinned prompts | This conversation | Survive restarting Claude Code and `claude --resume` |
| Bookmarks (yours and Claude's) | Forever | In `~/claude/bookmarks/sessions/`, readable JSON and markdown; never under `~/.claude` |
| The jumplist (back/forward) | This conversation | Up to 100 jumps |
| The highlight | Two minutes, or until your next prompt | Display only |

Each conversation has its own marks: `a` in one conversation is unrelated to `a` in another. Marks, pins and the reading position live in Claude Code's own plugin storage; bookmarks live in your own folder (see [Where bookmarks live](#where-bookmarks-live)). Nothing is written to the session file.

## Diagnostic commands

The plugin adds a few commands from its proof-of-concept stage. They are useful when reporting a problem:

| Command | Shows |
|---------|-------|
| `/bm-env` | The plugin's version, the Claude Code version, the session id, and what the plugin has captured |
| `/bm-marks` | The marks set in this conversation |
| `/bm-timeline` | The last few plugin events: draws, panes, jumps, toasts |
| `/bm-diag-keys` | Turns on (or off) logging of each key typed in the input box, to the plugin's debug log: lengths and key names, never the text |
| `/bm-debug ...` | Whether the plugin's log lines are also drawn in the conversation as dim rows (see below) |

These commands are left over from the proof of concept and will be renamed in the rebuild.

### The log echo

The plugin always writes its log to a file, one per conversation (see [the debug log](troubleshooting.md#the-debug-log)). It can also echo each line into the conversation as a dim row while you watch it work. The echo is off unless asked for, and it is asked for per conversation:

| Command | Effect |
|---------|--------|
| `/bm-debug on`, `/bm-debug off` | This conversation only. The choice is kept in this session's own environment, so it survives the plugin reloading, reaches any process this session starts, and ends when the session does: a resumed conversation starts from the default again. |
| `/bm-debug reset` | This conversation follows the default again. |
| `/bm-debug default on`, `/bm-debug default off` | The default for every conversation that has made no choice of its own. |
| `/bm-debug force on`, `/bm-debug force off` | Every conversation, no exceptions, until lifted with `/bm-debug default on` or `off`. Use it to watch every open session at once, or to guarantee silence everywhere. A session's own `on` is remembered and applies once the force is lifted. |
| `/bm-debug status` | Which of these is in effect, and the log file's path. |

The same per-conversation signal can be given from the shell: `CONVO_BOOKMARKS_DEBUG=1 claude` starts a session with the echo on (`0`, `off` or `false` for an explicit off). The default and the force are the only settings written to disk; a conversation's choice never is.
