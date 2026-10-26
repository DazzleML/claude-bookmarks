"""What a Claude Code transcript actually holds, for the 0.7 design (search, tabs, links to anything).

Counts, over one transcript (JSON lines): the record types, and inside message records
the content block types (text, tool_use, tool_result, thinking, image), how many user
rows are tool results, and how many user rows carry another session's message
(<agent-message ...>), a task notification, or a queued command. Also whether tool_use
blocks carry an id and tool_result blocks a tool_use_id (the identity a link would need).

Usage: python transcript_population_0_7.py <transcript.jsonl>
Read only.
"""
import collections
import json
import sys

path = sys.argv[1]
rec_types = collections.Counter()
blocks = collections.Counter()
user_kinds = collections.Counter()
ids = collections.Counter()
lines = 0
with open(path, "rb") as f:
    for raw in f:
        lines += 1
        try:
            r = json.loads(raw)
        except Exception:
            rec_types["<unparsed>"] += 1
            continue
        t = r.get("type", "<none>")
        rec_types[t] += 1
        msg = r.get("message") if isinstance(r.get("message"), dict) else None
        if not msg:
            continue
        content = msg.get("content")
        if isinstance(content, str):
            blocks[f"{t}:str"] += 1
            if t == "user":
                if "<agent-message" in content:
                    user_kinds["agent-message"] += 1
                elif "<task-notification" in content:
                    user_kinds["task-notification"] += 1
                else:
                    user_kinds["text"] += 1
            continue
        if isinstance(content, list):
            for b in content:
                if not isinstance(b, dict):
                    continue
                bt = b.get("type", "?")
                blocks[f"{t}:{bt}"] += 1
                if bt == "tool_use":
                    ids["tool_use with id" if b.get("id") else "tool_use without id"] += 1
                if bt == "tool_result":
                    ids["tool_result with tool_use_id" if b.get("tool_use_id") else "tool_result without tool_use_id"] += 1
                if t == "user" and bt == "text":
                    s = b.get("text", "")
                    if "<agent-message" in s:
                        user_kinds["agent-message (block)"] += 1
                    elif "<task-notification" in s:
                        user_kinds["task-notification (block)"] += 1

sub = collections.Counter()
with open(path, "rb") as f:
    for raw in f:
        try:
            r = json.loads(raw)
        except Exception:
            continue
        t = r.get("type")
        if t == "attachment":
            a = r.get("attachment") if isinstance(r.get("attachment"), dict) else {}
            sub[f"attachment:{a.get('type', '?')}"] += 1
        elif t == "system":
            sub[f"system:{r.get('subtype', '?')}"] += 1
        elif t == "queue-operation":
            sub[f"queue-operation:{r.get('operation', '?')}"] += 1

print(f"lines: {lines}")
print("subtypes:", dict(sub.most_common()))
print("record types:", dict(rec_types.most_common()))
print("content blocks:", dict(blocks.most_common()))
print("user rows by kind:", dict(user_kinds.most_common()))
print("ids:", dict(ids.most_common()))
