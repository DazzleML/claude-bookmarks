# POC: can one /config row fold a plugin's other rows away?

Question (keys-and-input design, 2026-10-20, candidate A/B's falsifier): a plugin cannot group or nest its `/config` rows (the manifest schema has no such key; the typings have no such kind). The emulation: one row, "settings: shown | hidden", whose `config.describe` hook answers `isHidden: true` for the plugin's other rows while it reads `hidden`, and which calls `$.ui.invalidate("config.describe")` when it changes. If that works, the keymap can be one `/config` row per command behind one fold. If it does not, the keymap is one row holding the whole map (the palette's shape).

The kit cannot observe this: `$.config.list()` is a stub the harness answers (`plugin/tests/harness.ts:149`), and the describe cache is the engine's. So both arms are a live look, with this throwaway plugin loaded beside nothing else.

## Run it (MANUAL, two minutes, a scratch terminal)

```
claude --plugin-dir C:/code/claude-projects/claude-bookmarks/tests/one-offs/thinking/config-fold
```

Then:

1. `/config`, filter `Fold POC`. Expect five rows: the two fold rows and test rows A, B, C.
2. Set **Fold POC settings (invalidates)** to `hidden`. **Look without closing the menu.** Arm (b).
3. Run `/bmfold-rows` and read the log line. Arm (a).
4. Set it back to `shown` (rows return?). Then set **CONTROL: no invalidate** to `hidden` and look: the rows are predicted to STAY. Run `/bmfold-rows`: predicted to still list A B C (cached). Control arm.
5. Close `/config`, reopen it: are A, B, C hidden now (for the control, still cached; for the fold, if (b) failed, this is the "reopen" question).

## Predictions, pass criteria, fallbacks -- written before running

| arm | prediction | pass criterion | fallback if it fails |
|---|---|---|---|
| (a) `$.config.list()` after the fold is set to hidden | `/bmfold-rows` logs `[fold foldNoInvalidate]`, A B C absent | the log line names no row A/B/C | the describe hook or invalidate is not doing what the typings say: candidate D (one row), and a draft note for the engine |
| (b) the open menu repaints | rows A, B, C vanish from the open menu within a moment of the pick, no close/reopen | seen vanishing while the menu is open | "close and reopen /config" in the fold row's description; still candidate B if (a) and (5) pass |
| control: foldNoInvalidate set to hidden | rows A, B, C STAY in the menu and in `/bmfold-rows` (describe answers cached) | they stay | **if the control passes (rows vanish without invalidate) the method is broken** -- describe is not cached as documented, or the engine re-asks on every draw; discard every result and re-read the typings |
| (5) reopen | after close+reopen with the fold hidden: A B C absent; with only the control hidden: present (cache survives reopen) | as stated | if the control's rows vanish on reopen, the cache is per-menu-open, not per-session: still usable, note it |

## Record (fill in after the look)

| arm | observed | verdict |
|---|---|---|
| (a) | `bmfoldpoc rows drawn now: [fold foldNoInvalidate]  (fold=hidden, control=shown)` | held |
| (b) | Rows A, B, C left the open menu as soon as the fold was set to `hidden`; no close or reopen. They came back on `shown`. | held |
| control | Rows A, B, C left too: `control=hidden, cache NOT invalidated (control arm)`, then `rows drawn now: [fold foldNoInvalidate]  (fold=shown, control=hidden)` | passed, against the prediction |
| (5) | not run (not needed: (b) held in the open menu) | -- |

Why the control passed: every row change reloads the plugin (`bmfoldpoc: options changed — reloaded (4 hooks: config.describe, config.set, session.start, command.run)` after each pick), and the reload asks `config.describe` for every row again. So the reload, not `$.ui.invalidate`, is what hides the rows on this build. The control could not separate the two arms because both go through a reload; it does not break the product question, which is whether one row can hide the others in an open menu, and that held.

Verdict for the design: **survived**, by a different mechanism than predicted. The keymap is rows behind a fold (candidate B). A3 keeps the `$.ui.invalidate("config.describe")` call after a change anyway, so the fold survives a future build that stops reloading on every change. Observed by djdarcy, 2026-10-24, Claude Code 2.1.308, the session resumed with `--plugin-dir` on this folder; the log lines read from the session's own transcript.

Side finding: the poc's `session.start` hook returns the wrong shape (`session.start hook skipped: returned the wrong shape (no result)`); harmless here, and a reminder that a `session.start` hook must return `next(e)`.
