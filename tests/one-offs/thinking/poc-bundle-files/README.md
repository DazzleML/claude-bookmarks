# POC: bundles as files -- does the file format hold on the real bundles?

Design under test: `2026-11-02__12-19-55__dev-workflow-process__bundles-as-files-in-the-project.md` (project-private), section 4, "The bundle file". A bundle file is:

1. front matter, simple fields only (read the way the plugin's `parseFrontMatter` reads notes);
2. a fenced `bm-links` block holding JSON: `rev`, `count`, the links, the times;
3. a regenerated `## Links` section for people;
4. a marker line, then the person's notes, never rewritten.

## Data

A copy of the four real lists files (`~/claude/bookmarks/lists/*.json`, 27 bundles), made 2026-11-02 into a temp folder **outside the repo**, since the files hold private list content. The script takes that folder as its argument and writes nothing anywhere else. Run:

```
node tests/one-offs/thinking/poc-bundle-files/poc.mjs <folder holding the copied lists files>
```

## Predictions, written before running

| Arm | Prediction | Pass criterion | Fallback if it fails |
|---|---|---|---|
| P1 round trip | every one of the 27 bundles renders and parses back with equal scalars and links equal by identity (`linkKey`) | 27/27 equal | the renderer or parser is wrong for some link kind: fix that kind before unit 1 |
| P2 notes kept | the notes region is byte-identical after three regenerations, including a notes text with a fenced block, a `---` line and a marker-like line in it | identical bytes after each of 3 regenerations | the marker split is wrong: anchor the split on the first marker after the block, not the last |
| P3a control (count off) | **predicted to fail:** with no `count` in the block, at least one truncation point (each 1/64 of the file's length) of some bundle parses as a valid bundle with fewer links than the original | >= 1 such cut found | if no cut is found, the method cannot detect a short read: the instrument is broken and P3b means nothing |
| P3b count on | with `count`, every truncation at each 1/64 of the length is rejected as bad, or parses as the full bundle | 0 cuts parse as a shorter bundle | a short read can pass `count`: add a closing checksum line to the block |
| P3c notes cut (count on, no end line) | **predicted to fail, a real gap:** a cut inside the notes region parses as a valid bundle whose notes are shorter -- `count` guards only the block. A plugin that took that read would write the shortened notes back: data loss | >= 1 such cut found (confirms the gap) | -- (P3d is the fix under test) |
| P3d end line | with a plugin-owned last line (`<!-- bm end: <rev> -->`) required, every cut at each 1/64 of the length, notes included, is rejected | 0 cuts accepted as anything but the full file | read twice and accept only when both reads are equal (a stable read); measure the cost |
| P4 ids | today's sequential ids collide across files (`b1` in ck3 and repokit at least) -- measured collisions > 0; ids minted as short random strings collide 0 times across the 27 | collisions > 0 today, = 0 minted | -- (the measurement is the point) |
| P5 file names | `<YYYY-MM-DD>__<slug>.md` from each bundle's created date and label is unique within each project | collisions per project = 0, or a rule (append a short id) that makes them 0 | add the id to every name |
| P6 size | the largest rendered bundle file is under 64 KB, far under the 4 MiB read cap | max bytes < 65,536 | -- |

## Result

See `results.md`, written by the run (2026-11-02 17:29 UTC, 4 files, 27 bundles, 1,701 cuts per sweep).

## Verdict: survived, with two changes to the design

- **P1, P2, P5, P6 held.** All 27 bundles round-trip with links equal by identity; notes are byte-identical after three regenerations, even with a fenced block, a `---` line and a marker-like line inside them; no file-name collisions; the largest file is 4,527 bytes.
- **P3a, the control, did not fail as predicted, and that is a finding about the format, not a broken instrument.** With no `count`, not one cut parsed as a bundle with fewer links. The block is one line of JSON closed by a fence, so a cut either breaks `JSON.parse` or leaves the block unclosed; a short block cannot parse. The instrument does detect short reads: the same sweep found P3c's 226. **So `count` is redundant; drop it** (or keep it as a cheap belt, but nothing rests on it).
- **P3c found the real gap: 226 of 1,701 cuts (13%) parsed as a valid bundle with shorter notes.** The design as written would have taken such a torn read, and its next write would have saved the shortened notes. Data loss.
- **P3d closed it: with a plugin-owned last line, `<!-- bm end: <rev> -->`, 0 cuts were accepted.** The rule to build: a read is whole only when an end line follows the marker. Text a person adds after the end line is notes (a torn read can only end before the end line, never after it), and the next write moves the end line back to the bottom. A file whose end line a person deleted is accepted only on a stable read (two reads equal, or the same size and mtime before and after the read), and the next write adds the end line back.
- **P4 held as predicted:** today 9 ids are shared across files (`b1` in three files, `b2`-`b9` in two); minted ids collided 0 times in 27.

Not tested here: Obsidian's handling of the block (the hand test before unit 1), concurrency between processes (measured separately by the consultant, 3.5% torn reads), and the migration itself.
