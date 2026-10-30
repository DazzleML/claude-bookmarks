"""How a continued or forked Claude Code conversation names its predecessors (the continuation fix,
half 2; first-mile entry evidence, 2026-10-30). Prints counts and ids only, never message text.

    python -I probe.py                       # every transcript under ~/.claude/projects
    python -I probe.py <old.jsonl> <new.jsonl>  # one pair: shared rows and the two pointers

Measured 2026-10-30 (the CK3 pair, fe8a1041 -> 432b5fd1):
- forward: the old transcript has one row {type: "continued-in", sessionId: old, continuedInSessionId: new}
- backward: rows copied into the new transcript keep `session_id` = the session they were born in,
  while `sessionId` is the new one; the new file carried two ancestors (8ed53c04: 3128 rows,
  fe8a1041: 16167) -- a chain 8ed53c04 -> fe8a1041 -> 432b5fd1
- the copied history is the new file's prefix (the first new-only uuid at row 19903 of 21917)
- machine-wide: 413 transcripts, 7 with a continued-in row, 25 with forkedFrom, 52 whose rows
  carry a session_id other than their own
"""
import collections
import glob
import json
import os
import sys


def rows(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                yield json.loads(line)
            except ValueError:
                continue


def pair(old, new):
    old_id = os.path.basename(old)[:-6]
    new_id = os.path.basename(new)[:-6]
    uo = [o["uuid"] for o in rows(old) if o.get("uuid")]
    un = [o["uuid"] for o in rows(new) if o.get("uuid")]
    so = set(uo)
    print("rows with uuid: old", len(uo), "new", len(un), "shared", len(so & set(un)))
    first_new = next((i for i, u in enumerate(un) if u not in so), None)
    print("first new-only uuid at row", first_new, "of", len(un))
    origins = collections.Counter((o.get("session_id", "")[:8], o.get("sessionId", "")[:8]) for o in rows(new) if "session_id" in o)
    print("new file (session_id, sessionId):", dict(origins))
    for o in rows(old):
        if o.get("type") == "continued-in":
            print("continued-in:", {k: o[k] for k in ("sessionId", "continuedInSessionId", "timestamp") if k in o})
    print("ids:", old_id[:8], "->", new_id[:8])


def census(root):
    files = glob.glob(os.path.join(root, "*", "*.jsonl"))
    cont = fork = foreign = 0
    for f in files:
        sid = os.path.basename(f)[:-6]
        t = open(f, encoding="utf-8", errors="replace").read()
        cont += '"continued-in"' in t
        fork += '"forkedFrom"' in t
        foreign += t.count('"session_id":"') > t.count('"session_id":"' + sid)
    print("transcripts", len(files), "continued-in", cont, "forkedFrom", fork, "foreign session_id", foreign)


if __name__ == "__main__":
    if len(sys.argv) == 3:
        pair(sys.argv[1], sys.argv[2])
    else:
        census(os.path.expanduser("~/.claude/projects"))
