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
| [ ] | 0.8.4 | (this commit) | the link script, `link-project.ps1` and `.sh` (red-green: 8 mutants of the `.ps1`, all killed through the scratch shell test; the `.sh` not mutated; `tests/one-offs/thinking/redgreen-unit6a-link/run.mjs`) |

Not listed: 0.7.29 (59eb80d) and 0.7.32 (bf66372) add tests only; docs and build commits.
