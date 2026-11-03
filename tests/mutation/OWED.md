# Mutation sweeps owed

Commits shipped without a diff-scoped mutation sweep on file in this folder. Each was tested (its own unit and kit tests, most with a red-green audit of the new tests); the sweep, which asks whether the whole suite would notice the code being wrong, is owed and runs later as one round. Decided 2026-10-30: during feature work the sweep is optional, with a few chosen checks where they matter; the rest is booked here.

When a sweep is run, add its report beside the others (`vX.Y.Z__sweep__<slug>.md`) and tick the row.

| Done | Version | Commit | What |
|---|---|---|---|
| [ ] | 0.7.2 | 197850a | pins by one name; register format v5, migrated on load |
| [ ] | 0.7.3 | 36d841d | links to any row the chat draws; the place reader on demand |
| [ ] | 0.7.4 | eaa2ba2 | the search pane |
| [ ] | 0.7.5 | fd21704 | fold Claude's bookmark calls into one line per reply |
| [ ] | 0.7.6 | 1bad856 | a link to a tool row with nothing drawn still lands |
| [ ] | 0.7.7 | e9d09aa | lists per project, in a pane |
| [ ] | 0.7.8 | f4bf564 | `<leader> l` and the lists button |
| [ ] | 0.7.9 | 37189cd | the lists tool's calls fold; quotes of bold or code text |
| [ ] | 0.7.10 | e56a97c | an item holds several typed links; one link parser |
| [ ] | 0.7.11 | be461ef | callback markers in Markdown files |
| [ ] | 0.7.12 | ab60447 | several links through the tool; a place's note |
| [ ] | 0.7.13 | 2de272d | a place in another conversation, named or missing |
| [ ] | 0.7.15 | 340d489 | several links in one call; no link twice |
| [ ] | 0.7.17 | b3d0d33 | `~ ( ) ! * '` kept in a link's words and file name |
| [ ] | 0.7.18 | 223bad9 | the short reference's grammar |
| [ ] | 0.7.19 | 5dabf56 | resolving a short reference |
| [ ] | 0.7.20 | 12d4877 | the bookmark tool takes a short reference |
| [ ] | 0.7.21 | 72ea3ce | a `bm:` reference in a reply drawn as a link |
| [ ] | 0.7.22 | eee0dec | every tool answer carries its short references |
| [ ] | 0.7.23 | 7062e83 | a short reference in a prompt is bound for Claude |
| [ ] | 0.7.24 | 349cb5d | a prompt's bindings read back from the conversation |
| [ ] | 0.7.25 | 483b899 | a `bm:` reference as a list item's link |
| [ ] | 0.7.26 | cd94395 | a note expands the `bm:` references it quotes |
| [ ] | 0.7.28 | d552dba | a list place naming an earlier session id lands here |
| [ ] | 0.7.30 | ccd06d0 | the session-lineage rule |
| [ ] | 0.7.31 | d38f99f | the background lineage scan |
| [ ] | 0.7.33 | d553f2c | copying the earlier sessions' bookmarks |
| [ ] | 0.7.34 | 78ab0ae | on by default; the jumplist |
| [ ] | 0.7.35 | b82e6f5 | a link's identity: the lists `link` duplicate check |
| [ ] | 0.7.36 | 9092ab3 | bundles in the lists file: settle, the face-first copy, auto-bundle |
| [ ] | 0.7.37 | f6c1b4e | the pane's opened view of every link; the tool's bundle, attach, face |
| [ ] | 0.7.38 | a6bc81f | a link's `about`: stored, merged by identity, shown on its row |
| [ ] | 0.7.39 | cc3c91e | the listLinkClick setting and the copy button; the ● face mark |
| [ ] | 0.7.40 | 9ba5015 | the band order; the Prompts fold in `/config`; `q` closes the lists pane |
| [ ] | 0.7.41 | eddf8a4 | the three pane rules and bringing a pane forward; a band command through the list's field; the tools-used note on a queued row |
| [ ] | 0.7.42 | 944380e | the lineage scan through PowerShell on Windows, and at the first look after a load; `<leader> q` closes and reopens the panes |
| [ ] | 0.8.0 | f95e2f4 | the age ladder `since()`; the bookmarks pane's `age()` becomes it (red-green: 10 behaviour mutants, 14 of 15 tests caught one; `tests/one-offs/thinking/redgreen-080-since/run.mjs`) |
| [ ] | 0.8.1 | 1d70694 | the lists pane's per-draw freshness check (red-green: 4 kit mutants on a scratch copy of plugin/, all killed; `tests/one-offs/thinking/redgreen-080b-freshness/run.mjs`) |
| [ ] | 0.8.2 | 014b16b | the registry core: identity, placement, `project.json`, membership, reconcile, rebuild, import (red-green: 15 mutants, all killed; `tests/one-offs/thinking/redgreen-unit1-registry/run.mjs`) |
| [ ] | 0.8.3 | 409e796 | lists format 3, the pure step and its inverse (red-green: 8 mutants, all killed; `tests/one-offs/thinking/redgreen-unit2-format3/run.mjs`) |
| [ ] | 0.8.4 | 3c9f0a9 | the link script, `link-project.ps1` and `.sh` (red-green: 8 mutants of the `.ps1`, all killed through the scratch shell test; the `.sh` not mutated; `tests/one-offs/thinking/redgreen-unit6a-link/run.mjs`) |
| [ ] | 0.8.5 | c091787 | the bundle set and cross-project references (red-green: 10 mutants, all killed; `tests/one-offs/thinking/redgreen-unit4-bundle-set/run.mjs`) |
| [ ] | 0.8.6 | 297adb6 | the bundle file: regions, end line, write-back (red-green: 10 mutants, all killed; `tests/one-offs/thinking/redgreen-unit3-bundle-file/run.mjs`) |
| [ ] | 0.8.7 | 13821c1 | unit 5's pure layer: layout, split, link state, write verdict, the 2->3 guard (red-green: 7 mutants, all killed; `tests/one-offs/thinking/redgreen-unit5-pure/run.mjs`) |
| [ ] | 0.8.8 | c9230d3 | unit 5's live switch: the format-3 layer (`handlers/lists-layout.ts`) and the handler wiring (red-green: 16 mutants on core and 6 through the kit at version 3, all killed; `tests/one-offs/thinking/redgreen-unit5-layer/run.mjs`, `v3-trial/run.mjs --mutant`). The mtime re-check before a bundle-file write is not a sweep: it is the design's retry rule for two writers a tick apart, built in unit 6b or 8 (the Director's ruling, 2026-11-03) |
| [ ] | 0.8.9 | acc12ec | unit 5b, an item's own links beside its bundle (red-green: 8 mutants, all killed after one test strengthened; `tests/one-offs/thinking/redgreen-unit5b-own/run.mjs`) |
| [ ] | 0.8.15 | (this commit) | the session home: `home` in the bookmark file, its operation, adoption, the layout reading it first, `/bm-project home` (red-green on scratch copies, 9 mutants caught: home dropped on read, never cleared, adoption ignoring it, an earlier home winning -- a test rewritten after this one survived --, home ignored by the layout, a home using its own lists folder, an unknown home answered, the write doing nothing, `where` ignoring it) |
| [ ] | 0.8.14 | eeebd28 | wide roots: `exclude` on the placement, `membershipOf` honouring each project's own exclusions by depth, the register dry run and `--yes`, `exclude`/`include`, `where`'s exclusions (red-green on scratch copies, 12 mutants caught: an exclusion ignored, every project's exclusions applied to each other, depth ignored, no default for older placements, no confirmation, the dry run's folders unfiltered, an already-excluded folder accepted, the left-behind note dropped, `--yes` ignored, `.` kept in a folder argument, the kit case's `--yes` ignored and its exclude not written) |
| [ ] | 0.8.13 | c68594b | the `/config` rows indented by fold depth, a visible mark per level, a fold row one mark fewer (red-green on scratch copies: inner rows at depth 1 turns both depth tests red; a fold row keeping its full mark count, and a plain-space indent, each turn the label test red) |
| [ ] | 0.8.12 | 821417d | relations between projects (`projects`, per-edge `since`, a union by id), the identity's `members` dropped, the edge axis with poles at +-2 (`core/kit/edge-state.ts`) (red-green on scratch copies, 7 mutants caught: a newest-list-wins merge, `members` kept as an extra key, the older `since` winning, the rank range unchecked, absent read as neutral, the ranks squeezed to +-1, an unknown key read as a relation) |
| [ ] | 0.8.11 | 081d1b9 | unit 6b's first half: `/bm-project` where, register, rename; three `/config` rows; the cross-project guard (red-green: the adopt rule and the guard are anchors, on scratch copies) |
| [ ] | 0.8.10 | cd890f9 | a new bundle's face defaults to the bundle's first link (red-green: the old default turns the new assertion red, on a scratch copy) |

Not listed: 0.7.29 (59eb80d) and 0.7.32 (bf66372) add tests only; docs and build commits.
