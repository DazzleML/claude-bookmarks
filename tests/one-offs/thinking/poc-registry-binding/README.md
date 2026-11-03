# POC: the project registry's two-sided binding, and the alias rule

Design under test: `2026-11-02__16-26-45__dev-workflow-process__the-project-registry-and-the-0-8-x-data-layout.md` (project-private), section 6 ("The registry entry", "The rules, in one place"), section 8, and its 16:34 addendum (a mini id as the fallback).

**The candidate:** a registry folder holding one JSON entry per project (`<name>__<id>__<user>.json`), and one folder per project (`projects/<name>__<id>__<user>/`) holding a `project.json` that is the binding's other half. Each half can be rebuilt from the other. References carry ids, never names: an item names a bundle by id within its own project, or `{project, bundle}` across projects. When two machines mint the same project id, an import renumbers the newcomer and records its old id in `aliases`.

**The model is the thing under test.** No plugin code exists for any of this yet, so `poc.mjs` builds the smallest plain-JavaScript model of the rules as written, and runs each arm on a fresh scratch tree.

## Run

```
node tests/one-offs/thinking/poc-registry-binding/poc.mjs <scratch folder>
```

The scratch folder must be outside the repo, `~/claude` and `~/.claude` (the script refuses otherwise). It creates `run-<stamp>/` inside that folder and never writes, deletes or renames anything outside it: every destructive call goes through a guard that throws on a path outside the run folder. The project link is a real directory junction on Windows (a symlink elsewhere), made and re-pointed inside the run folder. Every fixture is synthetic. The run writes `results.md` beside this file, with scratch paths written as `<run>`.

## Predictions, written before running

The Director's predictions (unit P, 2026-11-02 16:4x) come first, then mine where I expect something different. Each arm has a pass criterion fixed here.

| Arm | Prediction | Pass criterion |
|---|---|---|
| 1 rename | Change `name` in the entry, rename the project folder, and re-point the vault's link. Every reference still resolves, both the lists item's bundle id and project 4's cross-project `{project: 7, bundle}`. | 100% resolve, each to the expected project and bundle file. |
| 2 rebuild the entry | Delete the registry entry, then rebuild it from `project.json`. The write-back set (`name`, `sessions`, `position`) is byte-equal to the original, and so are the machine paths. | Equal bytes. I will also report whole-file and file-name equality. |
| 3 rebuild `project.json` | Delete `project.json`, then rebuild it from the entry. | Equal bytes. |
| 4 colliding import | A second machine's registry holds a different project with the same id 7 and the same user. On import the newcomer is renumbered, its old id goes into `aliases`, and references written under the old id (in that machine's lists) resolve to the renumbered project. | Both projects resolve and no reference dangles or resolves to the wrong project. Measure the references that needed rewriting (Director: 0, if aliases are honoured at resolution). |
| control | The same tree with no `project.json`. After arm 2's deletion nothing can rebuild the entry, and the folder is an orphan. | **The control must fail** (no rebuild). If it passes, the instrument is wrong. |
| rename cost | Files touched by the rename when references carry ids, against a variant whose lists files carry the project name. Director: 1 folder rename plus 2 file edits, against one edit per lists file. | A measurement, not pass/fail. |

**Where I expect different results.**

- **Arm 4 fails as the rule is written.** A bare alias (`aliases: [7]`) leaves a reference to 7 with two candidates: the local project, whose canonical id is 7, and the newcomer, whose alias is 7. Canonical-first resolution sends the other machine's references to the local project. That is a dangle when the bundle id is missing there, and a silent wrong answer when it is present: the bundles proof of concept found sequential bundle ids colliding across files today. An alias only works if it is scoped to the machine that wrote the reference (`{id: 7, on: "badbox"}`), resolved in the namespace of the referring project's `minted_on`. Even scoped, I expect it to break on the first reference written after the import, on this machine, into a file from the other machine: canonical 7 then means a different project from 7 in that file's namespace. So I predict:
  - 4a, bare alias: fails;
  - 4b, scoped alias: holds for old references but fails on a later write;
  - 4c, rewrite on import: holds, with rewrites greater than 0;
  - 4d, the mini id fallback from the 16:34 addendum: holds with 0 rewrites, because nothing collides.
- **The rename costs more than 1 folder rename plus 2 edits when references carry ids.** The entry's file name and its `resources.bookmarks` path both carry the project name. So I predict: 1 folder rename; 1 file renamed and edited (the entry); 1 file edited (`project.json`); 1 link re-pointed; 1 stub added. That is 5 operations, with 0 lists files touched. The names variant adds one edit per lists file that names the project (3 here). With those edits left out, its references dangle.
- **The control fails, but only partly.** The folder name `<name>__<id>__<user>` still carries three fields. The write-back set's `sessions` and `position`, the machine paths, `created_at`, `minted_on` and `aliases` are lost.

**Extra measurements (not in the contract, cheap, and they test rules the arms lean on):**

- **2b, stale mirror.** A hand edit to the entry that has not yet been mirrored into `project.json` is lost when the entry is deleted and rebuilt. Predicted: lost.
- **R, "the newer `updated_at`, field by field".** There is only one `updated_at` per file. Suppose `name` is edited in the entry and then `sessions` in `project.json`. Newest-wins can only take whole files, so the older side's edit is lost. Predicted: the entry's `name` edit is lost; per-field stamps keep both.
- **4s, symmetry.** Each machine imports the other's registry under "the newcomer is renumbered". Predicted: the two machines give different projects the id 7. A deterministic tie-break ("the older `created_at` keeps the id") makes them agree.
- **4f, file-level sync.** If ccs copies the registry folder (Q261102-08), both `*__7__dustin.json` files land side by side with no import step at all. Predicted: the load sees two entries with id 7, and whatever the import rule is has to run at load too.

## Result

See `results.md`, written by the run.

## Verdict: the two-sided binding survived; the alias rule as written is refuted

One line per arm, from the run of 2026-11-02 22:11 UTC (Node 22.22.3, Windows, the vault link a real junction):

- **Arm 1, rename: survived.** 5/5 references resolve after the rename, and the vault link shows the project again once it is re-pointed. A stale session's old path reaches the data through the stub. The cost is **5 operations, with 0 lists files touched**: 1 folder rename, the entry renamed and edited, `project.json` edited, the stub added, and 1 link re-pointed. My prediction held and the Director's 1 + 2 did not, because the entry's file name and its `resources` path both carry the name. With names in the lists files the cost is 8 operations, 3 of them lists files. Until those 3 are rewritten, 4 of 5 references dangle.
- **Arm 2, rebuild the entry: survived.** The write-back set, the machine paths, the whole file and the file name are all byte-equal. **2b: a hand edit to the entry that was not yet mirrored is lost** when the entry is deleted and rebuilt. The rebuild recovers the last mirror, not the entry.
- **Arm 3, rebuild `project.json`: survived.** Byte-equal, and 5/5 resolve.
- **Control: failed, as designed,** so the instrument can fail. Nothing was rebuilt, the folder is an orphan, and 1 of 5 references resolves. The folder name alone still carries the name, id and user.
- **Arm 4, colliding import: refuted, as I predicted and against the Director's prediction.**
  - **4a, the bare alias with canonical-first resolution (the rule as written):** 9 of 11 references resolve and 0 were rewritten. Of tag-tool's two references to the old 7, one dangles. The other **resolves silently to the wrong project**, claude-bookmarks' `b1`, because sequential bundle ids collide.
  - **4a2, alias-first resolution:** this moves the failure to the local reference instead, repokit's `{project: 7}`.
  - **4b, an alias scoped to the machine that wrote it:** this fixes the old references (11/11). **The first reference written afterwards on this machine into the imported file goes to the wrong project.**
  - **Two rules hold:**
    - **4c, rewrite on import,** with 2 rewrites, where the Director predicted 0;
    - **4d, the mini id from the 16:34 addendum,** with 0 renumbered, 0 rewritten and 0 folders renamed.

**Also measured, with what each means for the design:**

- **The dangling check must read the project, not test that the path exists.** Between the stub and the re-point, the old link's target exists, because the stub re-creates the old path. It just holds no `project.json`. A check that only tests "exists" passes on a stale link. It has to read `project.json` and compare the id.
- **"The newer `updated_at`, field by field" cannot be done with one stamp per file.** In arm R, a `name` edit in the entry was lost to a later `sessions` edit in `project.json`. With one stamp per field, both edits are kept.
- **"The newcomer is renumbered" is not symmetric (4s).** When each machine imports the other, they give id 7 to different projects. With "the older `created_at` keeps the id", the two machines agree.
- **A file-level sync of the registry folder (4f) puts two id-7 entries side by side** with no import step at all. Repokit's reference to 7 becomes ambiguous. Whatever the collision rule is, it has to run at load as well.
- **Not run, inferred:** under "the older `created_at` keeps the id", claude-bookmarks is the one renumbered on machine A. The rewrite then falls on machine A's own references as well, so 4c's cost grows with the local project's age.

**For the gate:** the binding (C-6) can be built as designed. Either the id becomes the 16:34 fallback (a mini id), or I-A needs three more rules: rewrite on import, a deterministic tie-break, and the collision check at load. Copies of the old references on the other machine stay unrewritten until that machine imports in turn.
