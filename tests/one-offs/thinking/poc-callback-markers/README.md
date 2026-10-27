# POC: do callback markers survive our Markdown rewriters, and can one parser find them again?

For the external link format and callback lines unit (djdarcy, 2026-10-27: "durable links that we can reference in our other markdown files and so we can also have 'callback' lines that work as anchors for our lists"). The stable-links design (`2026-10-27__00-31-27__dev-workflow-process__stable-links-to-any-place-in-a-conversation.md`, project-private) argued that a Markdown link is "the most preserved form" of a marker, but its kill-observations (K5, K6) were never run. This runs them for the one mechanical rewriter of the tracking files, `dz md-unwrap`.

A **callback marker** ties a line in a Markdown file (a heading, a bullet, a paragraph) to a list item: it names the list and the entry's id, so the plugin can find the line again after edits and a list item can point at it.

## Forms tested

| | Form | Example |
|---|---|---|
| F1 | visible `bm:` link (not clickable in Claude Code; text the plugin reads) | `[⚓](bm:8f0f9b27/e92204f6?list=whats-left&id=wl-a)` |
| F2 | visible `file:` link with list/id params (clickable) | `[⚓](file:///C:/Users/x/claude/bookmarks/sessions/8f0f9b27-33fc-4054-806a-22a6d569dfb5/e92204f6.md?u=e92204f6-0000-4000-8000-000000000000&list=whats-left&id=wl-a&v=2)` |
| F3 | HTML comment (invisible when rendered) | `<!-- bm list=whats-left id=wl-a -->` |
| F4 | Obsidian block id at the end of the block | `^wl-a` |
| F5 | nested tag | `#list/whats-left/wl-a` |

The `⚓` is written as `[*]` in the fixture so the fixture stays ASCII (bytes equal characters).

## Arms and predictions, written before running

| | Arm | Prediction | Pass criterion | Fallback if it fails |
|---|---|---|---|---|
| A1 | markers on a heading line and on a bullet, `dz md-unwrap` | the file is unchanged (`--check` exits 0) and all 5 forms are found | 10 of 10 found, file byte-identical | md-unwrap must learn to leave marker lines alone, or markers go on their own line |
| A2 | the same entries after edits: order reversed, heading text renamed | all 5 forms found by id, whatever the heading says or where the line is | 10 of 10 found with the right ids | identity cannot rest on the marker; fall back to the sources design's heading rules |
| A3 | a marker at the END of a hard-wrapped paragraph, then md-unwrap | all 5 found (the join keeps the marker at the paragraph's end) | 5 of 5 | markers only on headings and bullets |
| A4 | a marker in the MIDDLE of a hard-wrapped paragraph, then md-unwrap | F1, F2, F3, F5 found; F4 lost, because a block id is only a block id at the end of its block | 4 of 5, F4 the one lost | F4 is end-of-block only (a rule, not a defect) |
| A5 | hazard: a link's URL hard-wrapped across a line break, then md-unwrap | F1 and F2 LOST (the join puts a space inside the URL); F3 found (a comment tolerates the space) | F1, F2 lost; F3 found | a link marker must never be wrapped; writers keep it on one line |
| C | control: a pass that strips HTML comments and block ids | the checker reports F3 and F4 LOST and the rest found | exactly F3, F4 lost | if the checker still finds them, it cannot see a loss: discard every result |

## Results (2026-10-27, `python run.py`; fixtures and outputs in `out/`)

28 rows, 0 mismatches with the predictions; the control failed as predicted.

| | Observation | Verdict |
|---|---|---|
| A1 | `md-unwrap --check` exit 0; output byte-identical to the input; 10 of 10 markers found | survived |
| A2 | entries reversed and headings renamed: 10 of 10 found by id | survived: identity rides on the marker, not the heading text or the line's position |
| A3 | marker at the end of a wrapped paragraph: 5 of 5 found after the join | survived |
| A4 | marker mid-paragraph: F1, F2, F3, F5 found; F4 (block id) lost, as predicted | survived; F4 is end-of-block only |
| A5 | URL wrapped across a line: md-unwrap joined with a space inside the URL (`list=whats-left &id=a5-f1`), so F1 and F2 are lost as links; F3 (comment) found | survived as a hazard: a link marker must never be hard-wrapped |
| C | stripping comments and block ids: F3 and F4 reported lost, the rest found | the checker can see a loss: the results above stand |

What it settles: every form survives md-unwrap when it is on one line, and an id in the marker finds the entry after moves and renames. What it does not settle: how Obsidian, VS Code or GitHub show each form (F3 is hidden when rendered, F4 is Obsidian-only, F1's `bm:` is not clickable in Claude Code), and what a person or a Claude edit does to a marker it does not recognise. Those are judgements for the design and questions for the maintainer, not things this fixture can measure.
