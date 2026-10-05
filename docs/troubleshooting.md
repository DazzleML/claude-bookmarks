# Troubleshooting

Most of what goes wrong comes from a small set of Claude Code rules about when a plugin may take keys or scroll the conversation. This page lists each one, how to recognise it, and what to do.

- [The band doesn't appear](#the-band-doesnt-appear)
- [A chord does nothing](#a-chord-does-nothing)
- [The letter or number went into my prompt](#the-letter-or-number-went-into-my-prompt)
- [A jump says it can't go there](#a-jump-says-it-cant-go-there)
- [The reading position goes somewhere unexpected](#the-reading-position-goes-somewhere-unexpected)
- [The diff panel reacts instead](#the-diff-panel-reacts-instead)
- [The debug log](#the-debug-log)

## The band doesn't appear

The band (`bm: m: mark j: jump p: prompts r: read`) above the prompt means the plugin is loaded. If it's missing:

1. **Check the renderer.** Run `/tui fullscreen`. The classic renderer is not supported.
2. **Check the version.** Run `claude --version`; plugins of this kind need Claude Code 2.1.287 or later.
3. **Check how it is loaded.** With `--plugin-dir`, it loads for that session only. For every session, set `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, then start Claude Code again.
4. **Check whether the session is daemon-hosted.** A session that was moved to Claude Code's background daemon, for example after `/fork`, did not load `CLAUDE_CODE_PLUGIN_DIRS` in our testing, even after `claude --resume`. To bring it back as an ordinary session, run `claude stop <short id>` in another terminal (the short id, not the full one), then `claude --resume <session id>` from a shell.
5. **Run `/bm-env`.** If Claude Code says it is an unknown command, the plugin isn't loaded.

## A chord does nothing

- **A dialog is up.** While Claude Code shows a permission prompt or a question, plugin chords don't fire at all. This is Claude Code's rule for chords that press a plugin's buttons, and nothing in the plugin or `keybindings.json` can get around it. Answer the dialog first.
- **The chord isn't bound.** Check `~/.claude/keybindings.json` has the four bindings from the [Quick Start](../README.md#set-up-the-chords) in the `Global` context, and that you restarted Claude Code after editing it.
- **Another binding takes the chord.** If you have bound `ctrl+x` chords of your own, make sure none of them use `m`, `'`, `p` or `space`.

You can always click the band's buttons instead.

## The letter or number went into my prompt

Claude Code won't give a plugin's pane the keyboard while the input box holds text (or while a survey is showing), so the pane opens, but the letter or number you press next is typed into your prompt.

Keep the input box empty when you use a chord. If you were halfway through typing, cut the text, use the chord, then paste it back. A fix is being designed in [#17](https://github.com/DazzleML/claude-bookmarks/issues/17).

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

- **"Back" lands a little above or below where you were.** "Back" returns to the message that was at the top of your screen when you jumped, not to your exact scroll offset. A plugin cannot read or restore the scroll position.
- **It stays put and says "You're at the reading position".** The reading position is already on screen and there is nowhere to go back to, because you scrolled there yourself rather than jumping. Scroll away and press again.
- **A press moved the reading position instead of going there.** A selection in a different message sets a new reading position. Clear the selection (click once in empty space) before pressing to go there.

If it still misbehaves, the [debug log](#the-debug-log) records each press and what it decided; its last lines make a good issue report.

## The diff panel reacts instead

The chords are bound to four actions of Claude Code's diff panel, which do nothing in a conversation. Two things can change that:

- **While the diff panel is open**, `Ctrl+X p` and `Ctrl+X Space` may act on it instead. Close the diff panel first.
- **If you have turned off Claude Code's built-in diff mod**, the actions belong to the old diff panel, and the chords may act on it.

## The debug log

Every chord press, pane, jump and decision is written to a log, one file per conversation, kept to its last 400 lines:

```
${CLAUDE_USER_DIR:-~/claude}/bookmarks/debug/<session id>.log
```

`/bm-env` shows the session id. When something behaves oddly, the last lines of this file show what the plugin saw and did, and they are the most useful thing to attach to an [issue](https://github.com/DazzleML/claude-bookmarks/issues).
