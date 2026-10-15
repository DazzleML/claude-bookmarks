# core/prompts/

The prompts list: which transcript rows are your prompts, how they are numbered and kept, how the list is filtered, and which prompt you are nearest to. `handlers/prompts.ts` keeps them; `views/prompts-pane.tsx` draws the pane.

| File | What it is |
|---|---|
| `prompt-rows.ts` | Which transcript rows are the person's prompts (the transcript also stores tool results, shell input and output, command echoes under the same row type), their text, and the non-prompt rows kept as footnotes (`N.1`, `N.2`, ...). |
| `prompt-store.ts` | The store keys, what a transcript read (the back-fill) yields, how it merges with what the live capture already holds, and the list the pane draws. |
| `list-model.ts` | The list's model: numbering from the first prompt, footnotes under their prompt and whether they show, the pinned group, the pointer, group headers. |
| `filter.ts` | The filter (#28): words in any order, case-insensitive, matched against each prompt's kept text; a prompt keeps its number. |
| `text-store.ts` | How much prompt text the filter keeps, and how it is split into files under the data root. |
| `view-position.ts` | Which prompt the person is nearest to, for the pane's yellow row: the exchange (a prompt and its replies) that takes the most screen lines, with redraws that are not a view change ignored. |
