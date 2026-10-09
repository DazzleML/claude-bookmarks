# Claude Code quirks we work around

Building this plugin meant running into places where Claude Code's plugin API (as of 2.1.290) doesn't do what a plugin needs. This page lists each one: what you'd notice, why it happens, what the plugin does about it, and what a proper fix in Claude Code would look like. It's for contributors, for anyone writing their own Claude Code plugin, and for us when Claude Code changes and a workaround can go.

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

**What you notice:** the leader is set up by hand in `keybindings.json`, and it's bound to a Claude Code action, not to the plugin.

**Why:** a plugin can't add keybindings, and a plugin button can only be pressed by a key through an existing Claude Code action (`Button.action`); an unknown action name is refused.

**What we do (since 0.1.7):** the leader is Claude Code's own `abovePrompt:focus` (default `Ctrl+X Tab`; we suggest `Ctrl+]`), which moves the keyboard to the band. It borrows nothing, and it's the only route that works with a draft in the input box. The band's first element is a field (`autoFocus`), which takes the next key, any printable one, `'` and `Space` included; the band then takes the rest itself. See the next entries for why.

**Also available, and undocumented:** `keybindings.json` accepts `command:<name>`, which runs a slash command "as if typed" (the 2.1.290 schema's words; the keybindings docs don't mention it; `Chat` context only). The plugin's typed commands (`/bm-mark`, `/bm-goto`, `/bm-prompts`, `/bm-read`) can be bound that way. A pane opened by one takes the keyboard from an empty input box, but nothing catches the key when Claude Code refuses it (over a draft). So that route was tried as the leader (2026-10-06) and set aside.

**Before 0.1.7:** four chords borrowed four of the five diff-panel actions that do nothing in a conversation (`app:toggleDiffNoiseFilter` and so on), and the band buttons carry those actions still, for optional one-step keys. If you've turned off Claude Code's built-in diff mod, or the diff panel is open, those keys may act on the diff panel instead.

**Proper fix:** let a plugin declare its own namespaced actions (for example `plugin:convo-bookmarks/mark`) that users bind like any other, and document `command:` bindings.

### A key can't be both a leader and the start of a chord — Limit

Binding `ctrl+]` to `abovePrompt:focus` and also `ctrl+] space` to something makes `Ctrl+]` alone stop working: Claude Code waits for the chord's second key, and the single binding is shadowed (measured 2026-10-07). So one-step keys use a different prefix (`Ctrl+X Space`).

### A chord pressing a band button doesn't move the keyboard over a draft — Limit

A chord bound to a band button's action presses the button even with a draft in the input box, but the keyboard stays in the input box, so the band can't take a second key (log 2026-10-07, `band focus … DENY that site does not hold the keyboard`). With an empty input box, the band does hold the keyboard after the press. So a borrowed-action key is only useful for a one-step action, such as the reading position.

### Some keys never reach Claude Code — Limit (terminal)

**What you notice:** you bind `Ctrl+,` or `Ctrl+;` and nothing happens.

**Why:** those keys have no traditional control code, so most terminals send just `,` or `;` and drop the Ctrl. Only terminals that report extended keys (the Kitty keyboard protocol, or xterm's `modifyOtherKeys`) send the full key, and Claude Code does read those forms. Windows Terminal 1.24 doesn't, without help.

**What to do:** see [The leader key](usage.md#the-leader-key). In Windows Terminal, map the key to a `sendInput` of the extended sequence (`\u001b[59;5u` for `Ctrl+;`).

**Keys that always arrive:**
- `Ctrl+X Tab` (the default);
- `Ctrl+]` (sends its own control code; on some non-US keyboard layouts `]` is hard to type with Ctrl).

### Alt combinations knock vim mode out of insert mode — Limit

A terminal sends `Alt+,` as `Esc` followed by `,`, and Claude Code's vim mode takes the `Esc` as "leave insert mode". Avoid Alt for the leader if you use vim mode.

### Keys do nothing while a dialog is up — Limit

A chord presses a plugin button only when no dialog (a permission prompt, a question) is showing, and the band can't be focused then either (not yet tested for the leader). Answer the dialog first.

**Proper fix:** let a plugin mark a navigation-only button as safe to press while a dialog is open.

### A pane can't take the keyboard over a draft, or often just after a selection — Workaround

**What you notice:** nothing; the band takes the keys and the pane shows the list.

**Why:** `$.ui.open({ focus: true })` is refused while you have text in the input box (or a dialog or survey is up, or an element of the band holds the keyboard). It is also often refused right after you select text with the mouse, even with an empty input box. That happened on every route, including the older `Ctrl+X m` chord (2026-10-07).

**What we do:** the band leader holds the keyboard by the person's own focus move, draft or not, and the pane only displays. Typed commands from an empty input box still give a pane the real keyboard. A click into a pane also hands it over (the band steps back, and the pane keeps the keyboard).

**Tried and dropped:** taking the key from the input box. A `prompt.edit` hook can consume a key, but a jump from it is refused (next entry). Setting the draft aside, emptying the box and asking again was refused too. Tracked in issue #17.

### A plugin's work counts as the person's only while the handler is still running — Rule (was a misread)

**What you notice:** before 2026-10-09, every band command logged `view back ... -> DENY: not person-initiated`, and in a narrow terminal (under about 110 columns) `Ctrl+] p` opened nothing at all. Both are gone.

**Why:** `$.ui.scroll` on a conversation row, and placing a pane in a narrow terminal, are allowed only while the plugin is answering the person's own input: a button press, a click on a link the plugin drew, typing or `Enter` in the plugin's field. The credit lasts exactly as long as the control's handler runs. The band's field used to hand its work off as fire-and-forget (`onInput={(typed) => void runCommandLine(...)}`), so the handler had returned before the scroll or the pane open ran, and the engine saw a plugin acting on its own. Earlier versions of this page blamed the field itself ("typing in a plugin's field is refused though it comes from the person's own key"); that was the misread. Returning the promise from `onInput` and `onSubmit` fixed both symptoms in the same shrunk terminal (log 2026-10-09 11:41–11:49: `view back ... -> ok`, `pane was dock, 48 body columns`, a jump to the conversation's first prompt `ok`).

Still true: a timer, a `prompt.edit` hook and anything else the person did not press cannot scroll the conversation. Also verified 2026-10-09: a plain click on a link in the plugin's own `Markdown` (its `onLinkPress`) is the person's input, so a link in a reply can jump; and the engine's `$.ui.open` answer says whether the pane was placed, so the plugin can now say why it wasn't.

**What we do:** every handler on the band's field returns its promise; the pane-open result is read and a toast names the engine's reason when the pane isn't drawn. The one-time `Enter` probe per Claude Code version is no longer needed and will be removed.

**Proper fix:** none needed from Claude Code; this one was ours.

### Windows won't open a `file:` link that carries a `#` fragment — Limit (OS)

**What you notice:** a ctrl-click on a plain `file:///C:/...md` link in a reply opens the file in its default application (verified 2026-10-09, Windows Terminal); the same link with anything after a `#` does nothing, whether the link is the surface's own or one the plugin answers.

**Why:** the terminal hands the URL to the OS, and the OS open fails on the fragment. The plugin never sees a ctrl-click (it is the terminal's by design), so it can't strip the fragment.

**What we do:** a bookmark link's position rides in a **query string**, which Windows does open: `.../bookmarks/sessions/<session>/<uuid8>.md?u=<uuid>&l=<line>&b=<start>-<end>&q=<words>` (an encoded `%23` fails too; `?v=1` and `?u=...&l=...` both opened, 2026-10-09). The default application ignores the query, so a ctrl-click lands at the top of the file; the plain click, which the plugin answers, is what uses the position. See the anchors design (`2026-10-09__06-55-30__dev-workflow-process__claude-anchors-persistent-marks-and-click-to-jump.md`).

### Arrow keys never reach the band — Limit

**What you notice:** `Ctrl+]` then `←` does nothing, and the log shows the leader press with nothing after it (2026-10-09).

**Why:** the band's field is a text input; the engine consumes arrows as caret movement and never reports them as typed text, and a `Button.hotkey` takes only a letter or a digit.

**What we do:** `o` and `i` (vim's jumplist keys) carry back and forward. For `Alt+←` / `Alt+→`, a terminal mapping sends the leader byte (`\u001d`, which is `Ctrl+]`) followed by the key: see `docs/usage.md`, "Back and forward". No engine change is needed for that.

**Proper fix:** let a band `Input` report arrow and other non-text keys to the plugin (an `onKey`), or allow arrow names as `Button.hotkey` values.

### No editor opens a markdown file at a position from the outside — Limit (editors)

**What you notice:** a ctrl-click on a bookmark link opens its file at the top, not at the bookmarked words.

**Why:** Typora takes `file.md#heading` on its command line as a filename ("This file cannot be opened in Typora", 2026-10-09) and registers no URL scheme; Windows won't pass a `#` fragment anyway. VS Code (`--goto path:line`) and Vim (`+line`) do take a line, but only from a launcher, which is the plugin's plain-click path with pillar 4's handlers, not the terminal's ctrl-click.

**What we do:** the export puts the quoted message right under the title with the bookmarked words in bold, and for a long message a link to a heading just above them that Typora follows within the document.

### A plugin can't hand the keyboard back to the input box — Workaround

**What you notice:** after a command the keyboard stays on the band; `Esc` returns it.

**Why:** no API returns the keyboard to the composer; only the person's `Esc` does. A second `Ctrl+]` while the band holds the keyboard moves the focus along the band instead of starting fresh. Once that landed on the `mark` button, and `Space`, then `Enter`, overwrote mark `a` (2026-10-07).

**What we do:** while the band is idle, a `ui.focus` hook keeps the focus on the field (a move onto a button is redirected back to it). In mark mode the default focus is a `cancel` button, so a stray `Enter` cancels. In prompt mode, a focus move off `go` onto its neighbour is read as an arrow key (`k` before it, `j` after it), which gives Up/Down browsing.

**Proper fix:** a call that returns the keyboard to the composer, and keyboard handoff between a plugin's own band and pane.

### A click on a band button doesn't move the keyboard over a draft — Workaround

A click presses the button, but with a draft in the input box the band never gets the keyboard. The band's keyboard check then took that for "the band lost the keyboard" and closed the pane at once. Now the plugin notices that the band never held the keyboard and leaves the pane open as a clickable list.

## Panes and the band

### A pane opened from the band can't take the keyboard — Workaround

**What you notice:** you press `Ctrl+X Tab` then `j`, and the jump pane opens, but it isn't focused.

**Why:** Claude Code grants a pane's focus request only while the band isn't holding the keyboard, and it never considers *who* asked, even when the person's own press on the same plugin's band opened the pane. Traced in Claude Code's internals: `ui.open` knows a request came from a person's press, but uses that only to decide where the pane goes. A retry a moment later is refused too.

**What we do:** the band takes the next key itself. It redraws as the row of letters (`jump: reading (Enter)  a: …  b: …`), and the pane stays open beside it as a readable list. In prompt mode the band takes digits, `j`/`k` and the arrows, and the pane shows the number and a `▶` on the prompt.

**Proper fix:** grant the focus when a person's press on a plugin's band opens that same plugin's pane, or let `$.ui.focus` move the keyboard between a plugin's own band and pane.

### Claude Code doesn't say when the band loses the keyboard — Workaround

**What you notice:** before v0.1.6, pressing `Esc` after `Ctrl+X Tab` `j` left the pane open.

**Why:** `Esc` on the band hands the keyboard back to the prompt silently. The plugin's `ui.focus` event only reports moves *within* the band, never the band losing the keyboard.

**What we do:** three exits plus a backstop:
- while the band waits for a key, the plugin asks every 400 ms to focus the element the band's focus is already on; Claude Code refuses that once the band no longer holds the keyboard, and the plugin then closes the pane, unless the keyboard went into the pane (a click in it), which then keeps it;
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

A plugin can reveal a message (its top, middle or bottom at an edge of the window) but can't read or restore the exact scroll offset. So returning from the reading position brings back the message that was at the top of the screen, not the exact line. From the very bottom, the plugin anchors to the last message's end instead, which is exact there; occasionally the reports don't say the last line showed, and it falls back to the top message.

**Proper fix:** a scroll target with a line offset (`{ requestId, line }`), since `onScreen` already says which lines were showing.

### On-screen reports go stale after a big jump — Workaround

Claude Code reports a message as on screen when it's drawn, and on a scroll only at the window's edges, so a message left behind by one big jump may still look visible. The reading position uses only the latest burst of reports (within 1.5 s) together with its own record of where the last press went.

A redraw also repeats a message's last report, even when the message is off screen. Clearing the reading position's highlight after "back" redrew it with its old lines, which made it look freshly on screen, and the next press "stayed put" (2026-10-07). Only a report whose lines changed now counts as fresh.

### Opening a pane shifts the conversation — Workaround

**What you notice:** the conversation jumps when a pane opens or closes.

**Why:** the docked pane takes columns from the conversation, which rewraps narrower, so what's on screen shifts; closing it shifts it again.

**What we do:** note where the view is just before the pane opens (the top message, or the last message's end at the bottom), and scroll back to it: at once where Claude Code allows the scroll (the pane was opened by a press), otherwise at the next press, such as the mark's letter. A jump cancels the return. A mark set from "the top of the screen" uses the position from before the pane opened.

**Proper fix:** keep the conversation anchored on its top visible line across a width change.

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

### Read the selection after opening the pane — Workaround

Awaiting anything before `$.ui.open({ focus: true })` appears to cost the pane the keyboard. The mark pane, which read your selection first, was refused in 8 of 12 runs; the jump pane, which didn't, almost never was (2026-10-06/07). So the plugin opens the pane first and reads the selection after. The original reason for reading it first was an inline pane shifting the layout, which made the selection resolve one row too high. The pane is docked now, and a mark resolves by the selection's message id, not its screen position.

The selection is what you **last** selected, until you select again, dismiss it, or send your next prompt or command. A keypress takes the highlight down before the plugin runs, so the plugin can't tell a visible selection from an old one. No event says when the selection changes, so the plugin polls it once a second and notes when it changes. A selection older than 75 seconds is ignored, and the mark goes on the message at the top of the screen instead.

### Recently sent messages can be drawn under temporary ids — Workaround

Rows drawn soon after sending can carry ids that differ from the saved message id (a zero-tailed form, or a random one). Marks are keyed on the saved id, which scrolling still resolves.

A command run from a key (a `command:` binding) is drawn for a moment under a `placeholder…` id. The plugin ignores those ids when it notes what is on screen; otherwise "where you were" pointed at a message that vanished a moment later.

## Patched builds: trying the proper fix early

Some of these limits sit in Claude Code code that no setting reaches. For those, we also write the proper fix as a patch to our own local copy of Claude Code, using a separate patch tool we're developing, `dcc-patcher` ([dazzle-claude-code-patcher](https://github.com/DazzleML/dazzle-claude-code-patcher); Windows-first, not yet released). It applies structural patches to the native `claude.exe` and writes a patched copy beside the original. It ships patch definitions only, never patched binaries or Anthropic's code. Its first patch lets a resumed session scroll back past its compactions, the fix described under [Scrolling and history](#scrolling-and-history).

How the patcher fits with this plugin:

- **The plugin never depends on it.** Every feature works on stock Claude Code, through the workarounds above. That's the floor, on any machine.
- **A patch implements the fix we'd propose upstream,** in the same shape we'd ask Anthropic for: a person's press on the band hands the keyboard to the pane, an event says when the band lets the keyboard go, and resume follows the link past a compaction. Where the patch matches the proposal, the plugin's "proper fix" code runs on the patched build unchanged, so the patch is a working prototype of the proposal.
- **The plugin picks per feature, at run time,** whichever works: the proper API if Claude Code (stock or patched) offers it, otherwise the workaround. A setting or command can force one path for testing. This is planned as part of the core rebuild (issue #5).
- **Upstream,** Claude Code's source isn't public, so a fix goes to Anthropic as an issue with the proposal and, where useful, a description of the patch. The one part of anthropics/claude-code open to pull requests is the plugin type declarations (`mods/types/claude-code.d.ts`), so a proposed API change can include its documentation.

A workaround in this list is retired when either the patch's proposal ships in Claude Code itself, or the limit is fixed some other way.

## When Claude Code changes

When an entry's proper fix ships, its workaround can be removed: test the new behaviour, delete the workaround, and move the entry to a "fixed in 2.1.x" note at the bottom of this page. The plugin's design keeps each workaround in one place for exactly this reason (issue #5).
