# Results (written by poc.mjs)

Run 2026-11-02T17:29:30.800Z over 4 lists files, 27 bundles.

| Arm | Prediction | Observed | Verdict |
|---|---|---|---|
| P1 round trip | 27/27 equal | 27/27 equal | held |
| P2 notes kept | 27/27 byte-identical after 3 regenerations | 27/27 | held |
| P3a control: no count | >= 1 cut parses as a bundle with fewer links (predicted to fail) | 0 of 1701 cuts parsed with fewer links | FAILED |
| P3b count on | 0 cuts parse with fewer links | 0 of 1701 cuts | held |
| P3c notes cut, count only | >= 1 cut parses with shorter notes (predicted gap) | 226 of 1701 cuts parsed with shorter notes | held |
| P3d end line | 0 cuts accepted as anything but the full file | 0 of 1701 cuts accepted short | held |
| P4 ids | today > 0 collisions across files; minted 0 | today 9 ids shared across files (b1: ck3-save-migrator.json+dazzle-claude-plugins.json+git-repokit-common.json; b2: ck3-save-migrator.json+git-repokit-common.json; b3: ck3-save-migrator.json+git-repokit-common.json; b4: ck3-save-migrator.json+git-repokit-common.json; b5: ck3-save-migrator.json+git-repokit-common.json; b6: ck3-save-migrator.json+git-repokit-common.json; b7: ck3-save-migrator.json+git-repokit-common.json; b8: ck3-save-migrator.json+git-repokit-common.json; b9: ck3-save-migrator.json+git-repokit-common.json); minted 0 collisions of 27 | held |
| P5 file names | 0 collisions per project | 0 collisions | held |
| P6 size | < 65,536 bytes | largest 4527 bytes; median 1686 | held |

"held" means the arm came out as predicted; for P3a and P3c the prediction is a failure of the format, so "held" there means the failure was found.
