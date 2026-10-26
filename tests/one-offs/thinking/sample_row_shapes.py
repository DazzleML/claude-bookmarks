"""One sample of each row shape the Place classifier (0.7 groundwork, unit 2) must handle,
with its keys and a short head, from a real transcript and its first agent file.

Usage: python sample_row_shapes.py <session.jsonl>
Read only.
"""
import glob
import json
import os
import sys

main = sys.argv[1]
sid = os.path.basename(main)[:-6]
agents = sorted(glob.glob(os.path.join(os.path.dirname(main), sid, "subagents", "agent-*.jsonl")))
WANT = {
    ("system", "compact_boundary"), ("system", "local_command"), ("system", "away_summary"), ("system", "turn_duration"),
    ("system", "informational"), ("attachment", "edited_text_file"), ("attachment", "goal_status"), ("attachment", "queued_command"),
}


def head(v, n=140):
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return s[:n]


def show(path, label, limit_types):
    seen = set()
    for raw in open(path, "rb"):
        try:
            o = json.loads(raw)
        except Exception:
            continue
        t = o.get("type")
        sub = o.get("subtype") if t == "system" else (o.get("attachment") or {}).get("type") if t == "attachment" else None
        key = (t, sub)
        if t in ("user", "assistant"):
            c = (o.get("message") or {}).get("content")
            if isinstance(c, list):
                bt = tuple(sorted({b.get("type") for b in c if isinstance(b, dict)}))
                key = (t, bt, bool(o.get("isMeta")), bool(o.get("isSidechain")))
            else:
                key = (t, "str", bool(o.get("isMeta")), bool(o.get("isSidechain")))
        elif key not in limit_types:
            continue
        if key in seen:
            continue
        seen.add(key)
        rest = {k: head(o[k], 90) for k in o if k not in ("message", "parentUuid", "cwd", "gitBranch", "version", "entrypoint", "userType", "permissionMode", "promptId")}
        print(f"[{label}] {key}")
        print(f"   keys: {rest}")
        if "message" in o:
            m = o["message"]
            c = m.get("content")
            if isinstance(c, list):
                for b in c[:2]:
                    if isinstance(b, dict):
                        print(f"   block {b.get('type')}: { {k: head(v, 80) for k, v in b.items() if k not in ('type',)} }")
            else:
                print(f"   content: {head(c)}")


show(main, "main", WANT)
if agents:
    show(agents[0], "agent", set())
