# Session lineage: which Claude Code sessions are one conversation

A Claude Code conversation can carry on under a new session id. The messages come along with their ids unchanged, but the session id -- the name of the transcript file -- is new. Anything keyed by the session id (bookmarks, marks, a backup index) then loses the conversation unless it can tell which earlier sessions the new one continues.

This spec says how to read that from a transcript, so every tool that keys data by session id answers the same way. It is written for two readers: the claude-bookmarks plugin (TypeScript, `plugin/hooks/core/lineage/lineage.ts`) and Claude-Session-Backup (Python). Both run the cases in `cases/`.

## What a transcript records

A transcript is a JSON-lines file, one object per row. Three fields carry the lineage (measured on 413 transcripts, 2026-10-30):

| Field | On which rows | Means |
|---|---|---|
| `session_id` | message and attachment rows | the session the row was **born** in. Rows copied into a new session keep their birth session here, while `sessionId` names the session that holds them now. |
| `forkedFrom` | rows of a forked session (`/branch`, `/rewind` continuation, `--fork-session`) | `{"sessionId": <parent>, "messageUuid": <the row it forked at>}` |
| `continuedInSessionId` | one row of `type: "continued-in"`, written in the **old** transcript | the session that continued this one |

The first two point backward, from the new transcript to its ancestors. The third points forward, from the old transcript to its successor. A `continued-in` row does not mean the old session ended: one measured session carried on for weeks after a background hand-off continued it under another id, so an old session and its successor can both grow, like a fork and its parent. A forked transcript can carry its own id as `session_id` on copied rows and still name its parent in `forkedFrom`, and a transcript can hold rows born in several sessions, so both backward pointers are read and their answers combined.

## The rule

Given a transcript's rows in file order and its own session id (`self`):

1. **Ancestors.** Every session id other than `self` that appears as a row's `session_id` (via `copied`) or as a row's `forkedFrom.sessionId` (via `forked`). An id found both ways carries both, `["copied", "forked"]` in that order.
2. **Order.** Ancestors are listed by the first row that names them, oldest first.
3. **Fork point.** For a `forked` ancestor, `forkPoint` is the `messageUuid` of the first `forkedFrom` that names it.
4. **Successors.** `continuedIn` lists every `continuedInSessionId` in the transcript, in file order, without repeats.
5. **Ignored.** Rows that are not JSON objects, fields that are not strings, empty strings, and `self` itself.

The answer:

```json
{
  "self": "<session id>",
  "ancestors": [
    { "sessionId": "<id>", "via": ["copied"] },
    { "sessionId": "<id>", "via": ["forked"], "forkPoint": "<message uuid>" }
  ],
  "continuedIn": ["<id>"]
}
```

## Reading a large transcript without parsing it

Transcripts reach hundreds of megabytes. The answer depends only on the three fields, in order, so a reader may extract them with one pattern instead of parsing every row:

```sh
grep -o -E '"session_id":"[0-9a-f-]+"|"forkedFrom":\{[^}]*\}|"continuedInSessionId":"[0-9a-f-]+"' <transcript> | uniq
```

Each output line is one field, in file order (`uniq` drops runs of the same line, which changes nothing in the answer). Read each line as the fragment of a row it is, and apply the same rule. Measured: about 1.2 s on a 98 MB transcript and 4.1 s on 662 MB. Both readings must give the same answer for every case; the tests check that.

## The cases

`cases/<name>.jsonl` is a transcript, cut down to the rows and fields that matter, in the shapes measured on real transcripts. `cases/<name>.expected.json` is the answer. The `self` of each case is in its expected answer.

| Case | Shape |
|---|---|
| `continuation-chain` | a session continued twice: rows born in two earlier sessions, then its own (the shape that broke bookmarks in a real conversation) |
| `fork` | a fork whose copied rows carry its own id: only `forkedFrom` names the parent |
| `fork-of-a-continuation` | rows born in a grandparent, then a `forkedFrom` naming a different parent |
| `fork-named-both-ways` | the parent named by `session_id` and by `forkedFrom`, and a later `forkedFrom` with another fork point (the first one counts) |
| `old-transcript-continued` | the old side: its own rows, then a `continued-in` row naming the successor, twice (listed once), the session carrying on between them |
| `no-lineage` | a plain session |
| `noise` | lines that are not JSON, fields of the wrong type, an empty id, `self` named in `forkedFrom` |

## Changing the rule

A change to the rule changes `cases/` first: a new case, or a changed expected answer, in one commit with the code that passes it, so both readers can follow.
