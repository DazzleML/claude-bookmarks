# Troubleshooting

Most of what goes wrong comes from a small set of Claude Code rules about when a plugin may take keys or scroll the conversation. This page lists each one, how to recognise it, and what to do.

- [The band doesn't appear](#the-band-doesnt-appear)
- [A key does nothing](#a-key-does-nothing)
- [Typing goes to the band instead of my prompt](#typing-goes-to-the-band-instead-of-my-prompt)
- [A jump asks me to press Enter](#a-jump-asks-me-to-press-enter)
- [The view moves when a pane opens](#the-view-moves-when-a-pane-opens)
- [A jump says it can't go there](#a-jump-says-it-cant-go-there)
- [The reading position goes somewhere unexpected](#the-reading-position-goes-somewhere-unexpected)
- [The diff panel reacts instead](#the-diff-panel-reacts-instead)
- [The debug log](#the-debug-log)

## The band doesn't appear

The band (`bm: ' j m p ␣   m: mark  j: jump  p: prompts  r: read`) above the prompt means the plugin is loaded. If it's missing:

1. **Check the renderer.** Run `/tui fullscreen`. The classic renderer is not supported.
2. **Check the version.** Run `claude --version`; plugins of this kind need Claude Code 2.1.287 or later.
3. **Check how it is loaded.** With `--plugin-dir`, it loads for that session only. For every session, set `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, then start Claude Code again. Either way the path is the repository's `plugin/` folder (the one holding `.claude-plugin/plugin.json`), not the repository root.
4. **Check whether the session is daemon-hosted.** A session that was moved to Claude Code's background daemon, for example after `/fork`, did not load `CLAUDE_CODE_PLUGIN_DIRS` in our testing, even after `claude --resume`. To bring it back as an ordinary session, run `claude stop <short id>` in another terminal (the short id, not the full one), then `claude --resume <session id>` from a shell.
5. **Run `/bm-env`.** If Claude Code says it is an unknown command, the plugin isn't loaded.

## A key does nothing

- **A dialog is up.** While Claude Code shows a permission prompt or a question, the band can't take the keyboard and plugin keys don't fire. Answer the dialog first.
- **The leader isn't bound.** Check that `~/.claude/keybindings.json` binds your leader to `abovePrompt:focus` in the `Chat` context ([Set up the leader](../README.md#set-up-the-leader)). Claude Code's default, `Ctrl+X Tab`, works without any binding.
- **The leader key never reaches Claude Code.** Some keys, such as `Ctrl+;` and `Ctrl+,`, aren't sent by most terminals; see [A leader on `Ctrl+;`](usage.md#a-leader-on-ctrl). `Ctrl+]` and `Ctrl+X Tab` always arrive.
- **A key starts a chord.** A key can't be both a leader on its own and the start of a chord. If you bind `ctrl+]` to `abovePrompt:focus` and also `ctrl+] space` to something, `Ctrl+]` alone stops working.
- **A click on a band button seems lost.** Now and then a click doesn't reach the plugin at all; click again. If you can say what you did just before, that helps us find the cause.

You can always click the band's buttons instead.

## Typing goes to the band instead of my prompt

After a command the keyboard stays on the band, ready for the next command, and what you type goes into its `bm:` field. Press `Esc` to return to the input box. A plugin can't hand the keyboard back by itself, so this is the one key to remember.

## A bookmark link does nothing on ctrl-click

Windows will not open a `file:` link whose address carries a `#`. Bookmark links written since v0.2.0 put their position in a `?` query string instead, which does open; a link written by hand with a `#` still jumps on a plain click but can't be opened outside. Rewrite it with `?` in place of `#`.

## Alt+arrow doesn't go back

Arrow keys never reach the band, so `Ctrl+] ←` can't work. Use `Ctrl+] o` (back) and `Ctrl+] i` (forward), or add the terminal mapping in [Back and forward](usage.md#back-and-forward), which types the leader and the key for you.

## The view moves when a pane opens

The pane on the right narrows the conversation, so its text rewraps and what's on screen shifts. After a mark, the plugin scrolls back to the message that was at the top before the pane opened. Jumps move the view anyway.

## A pane doesn't open in a narrow terminal

Claude Code refuses to draw a pane when the terminal is too narrow for one beside the conversation (under roughly 110 columns on 2.1.295: a shrunk window, or a remote desktop at a large font). The plugin says so in a toast with Claude Code's reason. Widen the window or reduce the terminal font a step; the pane then opens as usual. The band and the typed commands keep working without a pane.

## A jump says it can't go there

```
Can't jump there: that message isn't on screen (older than a compaction?). Copied "...": press Ctrl+O, then [ ...
```

Claude Code can only scroll to messages it has loaded. When a session is restarted or resumed, it loads the conversation only from the last compaction onward: earlier messages are still in the session file, but they aren't in the view, so a jump to one is refused. Nothing in Claude Code loads them back into view; `CLAUDE_CODE_DISABLE_PRECOMPACT_SKIP` doesn't change this.

The plugin then copies a short phrase of the message to your clipboard. To look for it:

1. Press `Ctrl+O` to open the transcript view.
2. Press `[`. This writes the conversation Claude Code holds to your terminal's scrollback.
3. Use your terminal's Find (`Ctrl+Shift+F` in Windows Terminal, `Cmd+F` on macOS), and paste.

The transcript view's own search (`/`) only searches what the view holds. If the message is older than what Claude Code has loaded, it may still be in your terminal's scrollback from earlier output (Windows Terminal keeps 9,001 lines by default), or only in the session file. Opening the whole conversation from the session file is planned ([#16](https://github.com/DazzleML/claude-bookmarks/issues/16)).

In the prompts pane, prompts that are likely to be refused are drawn dimmed.

## The reading position goes somewhere unexpected

- **"Back" lands a little above or below where you were.** "Back" returns to the message that was at the top of your screen when you jumped (or, from the very bottom, to the last message's end), not to your exact scroll offset. A plugin cannot read or restore the scroll position. Occasionally, from the bottom, Claude Code hasn't reported the last message's end, and back uses the top message instead.
- **It stays put and says "You're at the reading position".** The reading position is already on screen and there is nowhere to go back to, because you scrolled there yourself rather than jumping. Scroll away and press again.
- **A press moved the reading position instead of going there.** A selection made within the last 75 seconds, in a different message, sets a new reading position. Wait, or select nothing, before pressing to go there.

If it still misbehaves, the [debug log](#the-debug-log) records each press and what it decided; its last lines make a good issue report.

## The diff panel reacts instead

This only concerns the [optional fast keys](usage.md#optional-fast-keys) and the older `Ctrl+X` chords, which are bound to actions of Claude Code's diff panel that do nothing in a conversation. The leader borrows nothing. Two things can change that:

- **While the diff panel is open**, `Ctrl+X p` and `Ctrl+X Space` may act on it instead. Close the diff panel first.
- **If you have turned off Claude Code's built-in diff mod**, the actions belong to the old diff panel, and the keys may act on it.

## The debug log

Every key press, pane, jump and decision is written to a log, one file per conversation, kept to its last 400 lines:

```
${CLAUDE_USER_DIR:-~/claude}/bookmarks/debug/<session id>.log
```

`/bm-env` shows the session id. When something behaves oddly, the last lines of this file show what the plugin saw and did, and they are the most useful thing to attach to an [issue](https://github.com/DazzleML/claude-bookmarks/issues).

To watch the same lines appear in the conversation as you reproduce a problem, type `/bm-debug on`; it affects this conversation only, and `/bm-debug off` ends it. The other forms (`default`, `force`) are in [usage](usage.md#the-log-echo).
