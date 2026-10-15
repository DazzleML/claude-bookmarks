# core/marks/

Lettered marks and the reading position, without the engine. `handlers/marks.ts` sets, shows and jumps to them; `views/marks-pane.tsx` and `views/marked-message.tsx` draw them.

| File | What it is |
|---|---|
| `marks.ts` | A mark's shape (the message's uuid, its head, the selected snippet), which mark is shown on a row, the phrase copied when a jump is refused, `MarkCache` (the conversation's marks in memory, with one owner), and what `/bm-delmarks` deletes. |
| `mark-state.ts` | `MarkState`, the marks cluster's own state with one owner: the highlight's clear timer, the selection as it stood when the mark chord fired, and when the current selection was first seen (so a stale selection is ignored). |
| `highlight.ts` | Where a marked line sits in a message's text, and the bold `«a»` form used when the line cannot be drawn on its own. |

The reading position is the mark stored under the backtick letter (`` ` ``).
