"""Two numbers for the 0.7 design (search, tabs, links to anything), 2026-10-25.

(1) Bytes of searchable text per kind of place, over one whole conversation:
    the main transcript, its subagents/*.jsonl and its tool-results/*.txt.
    Kinds: prompt text, agent-message rows, task notifications, assistant text,
    thinking text, tool_use input, tool_result content (inline), tool_result files.
    The same over the three largest other transcripts in the projects folder (main file only).
(2) Identity in agent files: per subagents/agent-*.jsonl, whether rows carry uuid,
    sessionId (equal to the parent's?), agentId, isSidechain, parentUuid; whether
    meta.json's toolUseId names a tool_use id in the main transcript.

Known-answer check: the tool_use block count for the main file must match
transcript_population_0_7.py's count (12,384 at 07:3x; it grows as the session runs).
Reconciliation: every line is either a message record (classified) or skipped (counted
by type), and classified + skipped == lines.

Usage: python measure_places_text_and_agent_identity.py <main transcript.jsonl>
Read only.
"""
import collections
import glob
import json
import os
import sys

MAIN = sys.argv[1]
SID = os.path.basename(MAIN)[:-len(".jsonl")]
SESSION_DIR = os.path.join(os.path.dirname(MAIN), SID)


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        out = []
        for b in content:
            if isinstance(b, dict) and b.get("type") == "text":
                out.append(b.get("text", ""))
            elif isinstance(b, str):
                out.append(b)
        return "\n".join(out)
    return ""


def nbytes(s):
    return len(s.encode("utf-8"))


def scan(path):
    kinds = collections.Counter()   # bytes per kind
    counts = collections.Counter()  # blocks per kind
    skipped = collections.Counter()
    tool_use_ids = set()
    lines = classified = 0
    with open(path, "rb") as f:
        for raw in f:
            lines += 1
            try:
                r = json.loads(raw)
            except Exception:
                skipped["<unparsed>"] += 1
                continue
            t = r.get("type")
            msg = r.get("message") if isinstance(r.get("message"), dict) else None
            if t not in ("user", "assistant") or not msg:
                skipped[t or "<none>"] += 1
                continue
            classified += 1
            content = msg.get("content")
            if t == "user":
                if isinstance(content, list) and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
                    for b in content:
                        if isinstance(b, dict) and b.get("type") == "tool_result":
                            kinds["tool_result (inline)"] += nbytes(text_of(b.get("content")))
                            counts["tool_result (inline)"] += 1
                    continue
                s = text_of(content)
                k = "agent-message" if "<agent-message" in s else "task-notification" if "<task-notification" in s else "prompt text"
                kinds[k] += nbytes(s)
                counts[k] += 1
            else:
                for b in content if isinstance(content, list) else []:
                    if not isinstance(b, dict):
                        continue
                    bt = b.get("type")
                    if bt == "text":
                        kinds["assistant text"] += nbytes(b.get("text", ""))
                        counts["assistant text"] += 1
                    elif bt == "thinking":
                        kinds["thinking text"] += nbytes(b.get("thinking", "") or "")
                        counts["thinking text"] += 1
                    elif bt == "tool_use":
                        kinds["tool_use input"] += nbytes(json.dumps(b.get("input", {}), ensure_ascii=False))
                        counts["tool_use input"] += 1
                        if b.get("id"):
                            tool_use_ids.add(b["id"])
    return dict(lines=lines, classified=classified, skipped=skipped, kinds=kinds, counts=counts, tool_use_ids=tool_use_ids)


def mb(n):
    return f"{n / 1e6:8.2f} MB"


def report(title, s, extra=None):
    print(f"\n== {title}")
    print(f"   lines {s['lines']}; message records {s['classified']}; skipped {sum(s['skipped'].values())}; "
          f"reconciles: {s['classified'] + sum(s['skipped'].values()) == s['lines']}")
    total = 0
    for k, v in sorted(s["kinds"].items(), key=lambda kv: -kv[1]):
        print(f"   {k:24} {mb(v)}  ({s['counts'][k]} blocks)")
        total += v
    if extra:
        for k, v in extra.items():
            print(f"   {k:24} {mb(v)}")
            total += v
    print(f"   {'TOTAL searchable':24} {mb(total)}")
    return total


main = scan(MAIN)
tr_bytes = sum(os.path.getsize(p) for p in glob.glob(os.path.join(SESSION_DIR, "tool-results", "*")))
report(f"main transcript {SID[:8]} (file {os.path.getsize(MAIN) / 1e6:.0f} MB)", main, {"tool_result (files)": tr_bytes})
print(f"   known-answer: tool_use blocks = {main['counts']['tool_use input']} (07:3x probe saw 12,384)")

agg = collections.Counter()
agg_counts = collections.Counter()
ident = collections.Counter()
meta_match = collections.Counter()
agent_files = sorted(glob.glob(os.path.join(SESSION_DIR, "subagents", "agent-*.jsonl")))
for p in agent_files:
    s = scan(p)
    agg.update(s["kinds"])
    agg_counts.update(s["counts"])
    with open(p, "rb") as f:
        for raw in f:
            try:
                r = json.loads(raw)
            except Exception:
                continue
            if r.get("type") not in ("user", "assistant"):
                continue
            ident["rows"] += 1
            ident["uuid"] += bool(r.get("uuid"))
            ident["agentId"] += bool(r.get("agentId"))
            ident["isSidechain true"] += r.get("isSidechain") is True
            ident["parentUuid set"] += bool(r.get("parentUuid"))
            ident["sessionId == parent"] += r.get("sessionId") == SID
    meta = p[:-len(".jsonl")] + ".meta.json"
    if os.path.exists(meta):
        try:
            tid = json.load(open(meta, encoding="utf-8")).get("toolUseId")
        except Exception:
            tid = None
        meta_match["toolUseId in main" if tid in main["tool_use_ids"] else ("toolUseId missing" if not tid else "toolUseId not in main")] += 1
    else:
        meta_match["no meta.json"] += 1
agent_total = sum(agg.values())
print(f"\n== {len(agent_files)} agent files (subagents/, {sum(os.path.getsize(p) for p in agent_files) / 1e6:.0f} MB on disk)")
for k, v in sorted(agg.items(), key=lambda kv: -kv[1]):
    print(f"   {k:24} {mb(v)}  ({agg_counts[k]} blocks)")
print(f"   {'TOTAL searchable':24} {mb(agent_total)}")
print("   identity:", dict(ident))
print("   meta.json:", dict(meta_match), f"(of {len(agent_files)})")

projects = os.path.dirname(os.path.dirname(MAIN))
others = sorted((p for p in glob.glob(os.path.join(projects, "*", "*.jsonl")) if os.path.abspath(p) != os.path.abspath(MAIN)),
                key=os.path.getsize, reverse=True)[:3]
for p in others:
    report(f"other: {os.path.basename(os.path.dirname(p))[:40]}/{os.path.basename(p)[:8]} (file {os.path.getsize(p) / 1e6:.0f} MB)", scan(p))
