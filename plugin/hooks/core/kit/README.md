# core/kit/

Building blocks more than one cluster uses: what is on screen, how to tell two ids of one message apart, where the view goes back to, and the continuum primitive.

| File | What it is |
|---|---|
| `screen-model.ts` | `ScreenModel`: what is on screen, as the render hooks last reported it (each message's visible lines), and which reports count as news. |
| `latest-burst.ts` | Which on-screen reports are trusted as "on screen now": Claude Code reports a row when it draws it, and on a scroll only the rows at the edges, so a row left behind by a jump can still look visible. |
| `message-id.ts` | Matching one message across the ids Claude Code gives it: the transcript's uuid and the render hooks' id share their first four groups (`firstFour`, `sameMessage`). |
| `pane-position.ts` | `PanePosition`: where the view was when a pane opened, and where it goes back to after the pane closes or after a highlight redraws a message. Only a pane's own moments (its opening, its closing, an action taken in it) use the pane's position; anything else keeps the view where it is. |
| `continuum.ts` | The continuum: an axis whose states are ordered around a neutral zero (for example hidden < folded < shown, or transient < mark < perma < bookmark), with steps and thresholds; several settings and the mark tiers are built on it. |
