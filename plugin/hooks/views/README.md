# views/

What the plugin draws, as JSX. A view gets everything it shows already resolved (the marks, the prompts, the palette's styles) and the actions its buttons call, from the render hook in `register.tsx`. It reads no store and calls no engine API, so a view can be checked by drawing it with fixed data.

| File | Draws |
|---|---|
| `band.tsx` | The band: the one-line strip above the prompt, in its idle, help, jump, mark and number modes |
| `prompts-pane.tsx` | The prompts pane: the numbered prompts, their footnotes, pins and the filter |
| `bookmarks-pane.tsx` | The bookmarks pane |
| `marks-pane.tsx` | The mark and jump panes |
| `marked-message.tsx` | A marked line inside a prompt or reply |

Colours come from roles (`core/palette.ts`), never from colour names written here; `tests/core/palette.test.ts` checks that nothing that draws names a colour of its own.
