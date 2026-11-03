# Results: the project registry's two-sided binding and the alias rule

Run 2026-11-02T22:13:11Z, Node v22.22.3, win32, the vault link a junction. Written by `poc.mjs`; the predictions are in `README.md`.

## The arms

| Arm | Pass criterion | Observed | Verdict |
|---|---|---|---|
| 1 rename | 100% resolve | 5/5 resolve (baseline 5/5); the vault link shows the project after re-pointing: true; a stale session's old path reaches the data through the stub: true | held |
| 2 rebuild the entry | write-back set and machine paths byte-equal | after the delete 1/5 resolve; rebuilt 1; write-back set equal: true; machines equal: true; whole file equal: true; same file name: true; then 5/5 resolve | held |
| 3 rebuild project.json | byte-equal | rebuilt 1; byte-equal: true; 5/5 resolve | held |
| control (no project.json) | must FAIL: nothing rebuilds the entry | rebuilt 0; orphans: claude-bookmarks__7__dustin; 1/5 resolve | failed, as designed |
| 4 colliding import (bare alias, as written) | both projects resolve; nothing dangles or misresolves | dazzlecmd renumbered 7 -> 8; 9/11 resolve, 1 dangle, 1 resolve to the wrong project; 0 references rewritten | FAILED |

## The rename's cost

| References carry | folder renames | files renamed and edited | files edited | files added | files removed | links re-pointed | lists files touched | total |
|---|---|---|---|---|---|---|---|---|
| ids | 1 | 1 | 1 | 1 | 0 | 1 | 0 | **5** |
| names | 1 | 1 | 4 | 1 | 0 | 1 | 3 | **8** |

With names, before the lists files are rewritten: 1/5 resolve (4 dangle); after rewriting 3 lists files: 5/5.

Between the stub and the re-point, the old link's target exists (true) but holds no project.json (true): the moved-to stub re-creates the old path, so a dangling check that tests only that the target exists passes on a stale link.

## Arm 4: the colliding import, by rule

| Rule | renumbered | merged | folders renamed | references rewritten | old references | dangle | wrong project | a later write on machine A | verdict |
|---|---|---|---|---|---|---|---|---|---|
| 4a bare alias, canonical first (the rule as written) | 1 | 1 | 1 | 0 | 9/11 | 1 | 1 | resolves | FAILED |
| 4a2 bare alias, alias first | 1 | 1 | 1 | 0 | 10/11 | 0 | 1 | wrong project: DZ 2026-10-16__release.md | FAILED |
| 4b alias scoped to the machine that wrote it | 1 | 1 | 1 | 0 | 11/11 | 0 | 0 | wrong project: DZ 2026-10-16__release.md | old refs hold; the later write FAILS |
| 4c rewrite references on import | 1 | 1 | 1 | 2 | 11/11 | 0 | 0 | resolves | held |
| 4d mini id (the 16:34 fallback) | 0 | 1 | 0 | 0 | 11/11 | 0 | 0 | resolves | held |

4a unresolved:
- `tag-tool__5__dustin/lists/_root/lists.json#i1 -> no bundle d2 in CB`
- `tag-tool__5__dustin/lists/_root/lists.json#i2 -> wrong project: CB 2026-10-30__epic-14.md`

4a2 unresolved:
- `git-repokit-common__4__dustin/lists/_root/lists.json#i2 -> wrong project: DZ 2026-10-16__release.md`

## Extra measurements

- **2b, stale mirror:** a hand edit of `position` in the entry, not yet mirrored, then the entry lost and rebuilt: the edit was LOST.
- **R, reconcile with one `updated_at` per file:** `name` edited in the entry, then `sessions` in project.json. The newer file wins: name LOST, sessions kept. With a stamp per field: name kept, sessions kept.
- **4s, symmetry:** each machine imports the other's registry.
  - newcomer: CB A=7 B=8, RK A=4 B=4, DZ A=8 B=7, TG A=5 B=5 -> the machines DISAGREE
  - older-keeps: CB A=8 B=8, RK A=4 B=4, DZ A=7 B=7, TG A=5 B=5 -> the machines agree
- **4f, file-level sync:** the other machine's registry files copied in with no import step: 4 entries, 2 with id 7; 4/5 references resolve. Unresolved: `git-repokit-common__4__dustin/lists/_root/lists.json#i2 -> ambiguous (2 entries)`
- **The control's folder name** still carries name, id, user; sessions, position, machines, created_at, minted_on and aliases are gone.
