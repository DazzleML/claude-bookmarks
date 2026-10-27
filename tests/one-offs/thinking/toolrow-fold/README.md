# POC: can a plugin fold its own tool's rows away?

Question (0.7.5, the bookmark-call fold; djdarcy, 2026-10-26: "I want everything that's presented to be tucked away in a single "fold" that a user can expand to see the rows as normal"): a plugin's `ui.render` hooks on `ToolUse` and `ToolResult` can rewrite a tool row. Can they

- (a) draw a row and its result as **nothing**, so the row disappears;
- (b) draw the **first** row of a run as one pressable line (`⚓ 3 pocecho calls ▸`) and the others as nothing, where a press opens them all as normal;
- (c) step aside under **ctrl+o**, where the hook passes the row through because `isExpanded` is true?

The kit cannot answer this: it shows the element a hook returns, not what the TUI draws for an empty one, nor whether a Button on a tool row takes a press. So every arm is a live look, in a scratch session, with this throwaway plugin. It touches only its own tool, `pocecho`; the real bookmark rows are never redrawn.

## Run it (MANUAL, about five minutes, a scratch terminal)

```
claude --plugin-dir C:/code/claude-projects/claude-bookmarks/tests/one-offs/thinking/toolrow-fold
```

1. Ask: "Call the pocecho tool three times, with the texts one, two, three." Each call draws a normal tool row and its result (the mode starts at `pass`, the baseline).
2. `/tfpoc control`. Look. Then `/tfpoc hide`. Look. Then `/tfpoc fold`. Look, press the `⚓ … ▸` line, look, press it again.
3. With `/tfpoc fold` on and the fold closed, press ctrl+o (the transcript view). Look, then ctrl+o again to leave.
4. The probe writes one dim row, `tfpoc ToolUse: tool=… isExpanded=…`, the first time it draws each call (`$.ui.log`). Copy those lines, and the one drawn under ctrl+o if a new one appears there.

## Predictions, pass criteria, fallbacks (written before running)

| arm | prediction | pass criterion | fallback if it fails |
|---|---|---|---|
| **control** (`/tfpoc control`: hides only `nosuchtool`, which is never called) | the three pocecho rows and results **stay exactly as in `pass`** | nothing changes on screen | **if the rows change, the method is broken**: something other than the probe's hide (the engine's own folding of MCP rows, a stale render) is moving them; discard every result and find out what |
| (a) hide | the three rows and their results vanish; at most a blank line each | no `pocecho` row or result text on screen | an empty Box is drawn as a blank line, or refused: the fold keeps one thin line per call (still worth it), or draws a one-character Text instead |
| (b) fold, closed | one line `⚓ 3 pocecho calls ▸` where the first call was; nothing for the other two or for any result | that one line, nothing else | a press does not reach a Button on a tool row: the fold opens from a band key or a `/bm-` command instead |
| (b) fold, pressed | the line becomes `▾` and the three rows and results draw as in `pass`, below it and in their places | all three rows readable | the redraw does not reach the other rows (each reads the atom in its own hook): note it; the open state may need `$.ui.invalidate` |
| (c) ctrl+o | in the transcript view every row draws in full even with the fold closed; the log shows `isExpanded=true` | full rows under ctrl+o | `isExpanded` absent or false there: the fold must be opened by hand before ctrl+o shows the calls |
| the name | the log's `tool=` is `mcp__bmtoolfoldpoc__pocecho` | as stated | match on whatever the log shows (for the bookmark tool, likely `mcp__bookmarks__bookmark`) |

## Record (fill in after the look)

Run by djdarcy, 2026-10-26 21:19, in a forked scratch session (`csb resume CCBookmarksTest__2026.10.3__1st-test -- --fork-session -n "CCBookmarksTest__2026.10.26__2nd-test" --plugin-dir …/toolrow-fold`), `/tfpoc control` first, then the three calls.

| arm | observed | verdict |
|---|---|---|
| control | Not looked at on its own: the calls were made under `control` but the first paste was taken after `/tfpoc hide`. Its role is filled by the fold arm instead: in one mode, with nothing else changing, the rows vanish while the fold is closed and come back when it is pressed open, so it is the probe's own state that hides them. | inconclusive on its own; covered by (b) |
| (a) hide | Between the prompt and the reply, nothing: no pocecho row, no result, no blank lines. | held |
| (b) closed | `⚓ 3 pocecho calls ▸` alone where the calls were. | held |
| (b) pressed | `⚓ 3 pocecho calls ▾`, then the three rows `● bmtoolfoldpoc - pocecho (MCP)(text: "one")` with their results, as Claude Code draws them, in place; pressing again closes it. | held |
| (c) ctrl+o | The rows drew in full and logged `isExpanded=true`, but **their results did not**: the probe's ToolResult hook hid them by the fold's state without checking its own `isExpanded` (the typings give ToolResult one too, line 10567). | held for rows; a probe bug for results, fixed in the real build |
| the name | `tool=mcp__bmtoolfoldpoc__pocecho`, `requestId` = the `tool_use` id | held: the bookmark tool's rows are `mcp__bookmarks__bookmark` |

**Verdict: survived.** A plugin can draw its own tool's rows and results as nothing, put one pressable line in their place, open them in place on a press, and step aside under ctrl+o. For the real build: the ToolResult hook passes through on its own `isExpanded`; the fold is per run of calls, keyed by the first call's id.
