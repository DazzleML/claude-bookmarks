# Claude Code quirks we work around

Building this plugin meant running into places where Claude Code's plugin API (as of 2.1.289) doesn't do what a plugin needs. This page lists each one: what you'd notice, why it happens, what the plugin does about it, and what a proper fix in Claude Code would look like. It's for contributors, for anyone writing their own Claude Code plugin, and for us when Claude Code changes and a workaround can go.

Each entry is marked:

- **Workaround**: the plugin routes around it today.
- **Limit**: nothing the plugin can do; the docs tell you how to live with it.

Unless stated otherwise, the facts come from Claude Code's plugin type declarations and from testing on 2.1.289 (Windows Terminal, fullscreen). Where a fact comes from tracing Claude Code's internals, the entry says so.

- [Keys and the keyboard](#keys-and-the-keyboard)
- [Panes and the band](#panes-and-the-band)
- [Scrolling and history](#scrolling-and-history)
- [Drawing](#drawing)
- [Running and loading](#running-and-loading)

## Keys and the keyboard

### A plugin can't define its own keyboard shortcut — Workaround

**What you notice:** the chords are set up by hand in `keybindings.json`, and they're named after diff-panel actions (`app:toggleDiffNoiseFilter` and so on).

**Why:** a plugin button can only be pressed by a chord through an existing Claude Code action (`Button.action`); an unknown action name is refused. Claude Code 2.1.289 has 15 such actions, of which five belong to the diff panel and do nothing in a conversation.

**What we do:** the four chords borrow four of the five idle diff actions. The fifth is kept free for testing.

**Side effects:** if you've turned off Claude Code's built-in diff mod, or the diff panel is open, those chords may act on the diff panel instead.

**Proper fix:** let a plugin declare its own namespaced actions (for example `plugin:convo-bookmarks/mark`) that users bind like any other.

### The leader needs no borrowed action — (not a quirk; the route we use)

Claude Code's own `abovePrompt:focus` action (default `Ctrl+X Tab`, rebindable) puts the keyboard on the band above the prompt, and a band button's one-letter `hotkey` then presses it. That's how `Ctrl+X Tab` then `m`/`j`/`p`/`r` works without spending any action.

### Some keys never reach Claude Code — Limit (terminal)

**What you notice:** you bind `Ctrl+,` or `Ctrl+;` and nothing happens.

**Why:** those keys have no traditional control code, so most terminals send just `,` or `;` and drop the Ctrl. Only terminals that report extended keys (the Kitty keyboard protocol, or xterm's `modifyOtherKeys`) send the full key, and Claude Code does read those forms. Windows Terminal 1.24 doesn't, without help.

**What to do:** see [Choosing the leader key](usage.md#the-leader-experimental). In Windows Terminal, map the key to a `sendInput` of the extended sequence (`\u001b[59;5u` for `Ctrl+;`).

**Keys that always arrive:**
- `Ctrl+X Tab` (the default);
- `Ctrl+]` (sends its own control code; on some non-US keyboard layouts `]` is hard to type with Ctrl).

### Alt combinations knock vim mode out of insert mode — Limit

A terminal sends `Alt+,` as `Esc` followed by `,`, and Claude Code's vim mode takes the `Esc` as "leave insert mode". Avoid Alt for the leader if you use vim mode.

### Chords do nothing while a dialog is up — Limit

A chord presses a plugin button only when no dialog (a permission prompt, a question) is showing. Answer the dialog first.

**Proper fix:** let a plugin mark a navigation-only button as safe to press while a dialog is open.

### A pane can't take the keyboard while the input box holds text — Limit

`$.ui.open({ focus: true })` is refused while you have text in the input box (or a survey is up), so the pane opens but your next letter goes into the prompt. Keep the input box empty when you use a chord. Tracked in issue #17.

## Panes and the band

### A pane opened from the band can't take the keyboard — Workaround

**What you notice:** you press `Ctrl+X Tab` then `j`, and the jump pane opens, but it isn't focused.

**Why:** Claude Code grants a pane's focus request only while the band isn't holding the keyboard, and it never considers *who* asked, even when the person's own press on the same plugin's band opened the pane. Traced in Claude Code's internals: `ui.open` knows a request came from a person's press, but uses that only to decide where the pane goes. A retry a moment later is refused too.

**What we do:** the band takes the next key itself. It redraws as the row of letters (`jump: reading (Enter)  a: …  b: …`), and the pane stays open beside it as a readable list.

**Proper fix:** grant the focus when a person's press on a plugin's band opens that same plugin's pane.

### Claude Code doesn't say when the band loses the keyboard — Workaround

**What you notice:** before v0.1.6, pressing `Esc` after `Ctrl+X Tab` `j` left the pane open.

**Why:** `Esc` on the band hands the keyboard back to the prompt silently. The plugin's `ui.focus` event only reports moves *within* the band, never the band losing the keyboard.

**What we do:** three exits plus a backstop:
- while the band waits for a key, the plugin asks every 400 ms to focus the element the band's focus is already on; Claude Code refuses that once the band no longer holds the keyboard, and the plugin then closes the pane;
- typing in the prompt also cancels (`prompt.edit`);
- closing the pane resets the band (`ui.close`);
- a 15 s timeout is the backstop.

**Proper fix:** a "keyboard left" event (a new `ui.blur`, origin person), raised when the band or a pane lets the keyboard go.

## Scrolling and history

### A jump can't reach messages from before the last compaction after a restart — Workaround (partial)

**What you notice:** a mark or a prompt from earlier in a long session can't be jumped to; the plugin copies a phrase to your clipboard instead.

**Why:** when a session is restarted or resumed, Claude Code rebuilds the conversation by walking back from the newest message, and it stops at the most recent compaction point. That point is saved with no parent link; its link to the older messages (`logicalParentUuid`) is never followed. The older messages are still in the session file, but not in the view, so scrolling to one is refused (`nothing drawn under that requestId`). Traced in Claude Code's source and confirmed in the 2.1.289 binary. `CLAUDE_CODE_DISABLE_PRECOMPACT_SKIP` doesn't change this: it affects how a large file is read, not what's shown.

**What we do:**
- copy a phrase of the message to the clipboard and explain `Ctrl+O`, `[`, then your terminal's Find;
- prompts the plugin hasn't seen drawn are dimmed in the prompts pane.

**Limits of that fallback:** `[` writes only what Claude Code holds, and your terminal's scrollback has a size limit (Windows Terminal keeps 9,001 lines by default).

**Proper fix:** follow `logicalParentUuid` on resume, or load older history in pages as you scroll back. Opening the full session file outside Claude Code is planned (issue #16).

### A jump shows a tall message from its top — Limit

`$.ui.scroll` reveals a message, and a message taller than the window shows its top, whatever alignment is asked for. In a long reply the marked line may be below the screen; the highlight still marks it.

### "Where you were" is a whole message — Limit

A plugin can reveal a message but can't read or restore the exact scroll offset, so returning from the reading position brings back the message that was at the top of the screen, not the exact line.

### On-screen reports go stale after a big jump — Workaround

Claude Code reports a message as on screen when it's drawn, and on a scroll only at the window's edges, so a message left behind by one big jump may still look visible. The reading position uses only the latest burst of reports (within 1.5 s) together with its own record of where the last press went.

## Drawing

### A button's label can't be coloured at rest — Workaround

**What you notice:** the pinned star is a separate gold character inside the number (`245★)`), not a coloured row.

**Why:** a plain `Button` label takes only `dimColor` at rest. Its `hover` styling applies only while the mouse is over it, and `variant="primary"` doesn't apply to plain buttons. Traced in Claude Code's internals: the label's style list is fixed, and extra props are dropped or refused.

**What we do:** draw the number and the gold star as `Text` beside the button. A `Box` background does paint behind a button at rest, if a coloured band is ever wanted.

**Proper fix:** let `Button` take `color` and `bold` at rest, as it already does on hover.

### Hover can reveal, but can't animate or notify — Limit

Hover styles and reveals are applied by Claude Code itself: no plugin code runs, and a hover effect "settles, never loops". So a scrolling marquee on hover isn't possible, while a hover card showing the full text is.

## Running and loading

### A plugin can't load code on demand — Limit

A plugin's files must be imported with static `import` declarations; a module that uses `import()` doesn't load. Alternative code paths therefore all ship in the plugin and are chosen at run time.

### Sessions moved to the background daemon don't load the plugin — Workaround

**What you notice:** after `/fork`, the band is missing.

**Why:** the original session moves under Claude Code's background daemon, and in our testing a daemon-hosted session didn't load plugins from `CLAUDE_CODE_PLUGIN_DIRS`.

**What to do:** `claude stop <short id>` in another terminal, then `claude --resume <session id>` from a shell. See [Troubleshooting](troubleshooting.md#the-band-doesnt-appear).

### Quotes can vanish from shell commands on Windows — Workaround

A plugin runs programs through `$.process.run` with an argument list. From Windows, double quotes inside one argument were stripped before a Git Bash (MSYS) program saw them. The prompt back-fill therefore passes its PowerShell script with `-EncodedCommand`, and its `grep` pattern through `sh -c`.

### File reads and command output are capped at 4 MiB — Workaround

`$.fs.read` refuses files over 4 MiB, and `$.process.run` returns at most 4 MiB of output. A long session's transcript is far larger (25 MB here), so the plugin filters it with the system's own tools in one pass (`Select-String` on Windows, `grep` elsewhere) and reads only the matching lines.

On Windows, `Select-String -SimpleMatch` ignores case by default, which picks up extra lines; adding `-CaseSensitive` avoids them.

### Read the selection before opening a pane — Workaround

Opening an inline pane shifts the layout, and a selection read afterwards resolves one row too high. The plugin reads your selection when the chord fires, before any pane opens.

### Recently sent messages can be drawn under temporary ids — Workaround

Rows drawn soon after sending can carry ids that differ from the saved message id (a zero-tailed form, or a random one). Marks are keyed on the saved id, which scrolling still resolves.

## Patched builds: trying the proper fix early

Some of these limits sit in Claude Code code that no setting reaches. For those, we also write the proper fix as a patch to our own local copy of Claude Code, using a separate patch tool we're developing, `dcc-patcher` (dazzle-claude-code-patcher; Windows-first, not yet released). It applies structural patches to the native `claude.exe` and writes a patched copy beside the original. It ships patch definitions only, never patched binaries or Anthropic's code. Its first patch lets a resumed session scroll back past its compactions, the fix described under [Scrolling and history](#scrolling-and-history).

How the patcher fits with this plugin:

- **The plugin never depends on it.** Every feature works on stock Claude Code, through the workarounds above. That's the floor, on any machine.
- **A patch implements the fix we'd propose upstream,** in the same shape we'd ask Anthropic for: a person's press on the band hands the keyboard to the pane, an event says when the band lets the keyboard go, and resume follows the link past a compaction. Where the patch matches the proposal, the plugin's "proper fix" code runs on the patched build unchanged, so the patch is a working prototype of the proposal.
- **The plugin picks per feature, at run time,** whichever works: the proper API if Claude Code (stock or patched) offers it, otherwise the workaround. A setting or command can force one path for testing. This is planned as part of the core rebuild (issue #5).
- **Upstream,** Claude Code's source isn't public, so a fix goes to Anthropic as an issue with the proposal and, where useful, a description of the patch. The one part of anthropics/claude-code open to pull requests is the plugin type declarations (`mods/types/claude-code.d.ts`), so a proposed API change can include its documentation.

A workaround in this list is retired when either the patch's proposal ships in Claude Code itself, or the limit is fixed some other way.

## When Claude Code changes

When an entry's proper fix ships, its workaround can be removed: test the new behaviour, delete the workaround, and move the entry to a "fixed in 2.1.x" note at the bottom of this page. The plugin's design keeps each workaround in one place for exactly this reason (issue #5).
