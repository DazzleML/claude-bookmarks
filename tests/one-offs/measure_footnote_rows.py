"""Slice 4, unit 2 (design 2026-10-12__04-04-37): what non-prompt user rows real transcripts hold.

Read-only over Claude Code's transcripts (~/.claude/projects/*/*.jsonl, or the paths
given). Mirrors core/prompt-rows.ts's promptTextOf to tell prompts from the rest, then
counts each non-prompt kind, how many come before the first prompt, and the largest
number of footnotes one exchange collects. Prints a short report.
"""
import glob
import json
import os
import re
import sys
from collections import Counter

NOT_A_PROMPT = re.compile(
    r"^\s*(<bash-(input|stdout|stderr)>|<command-name>|<command-message>|<local-command-(stdout|stderr)>"
    r"|<teammate-message[\s>]|<task-notification>|\[Request interrupted by user"
    r"|This session is being continued from a previous conversation)"
)
KIND = [
    ("bash", re.compile(r"^\s*<bash-")),
    ("slash-command", re.compile(r"^\s*<command-(name|message)>")),
    ("local-command-output", re.compile(r"^\s*<local-command-")),
    ("task-notification", re.compile(r"^\s*<task-notification>")),
    ("teammate", re.compile(r"^\s*<teammate-message")),
    ("interrupted", re.compile(r"^\s*\[Request interrupted by user")),
]


def text_of(o):
    c = (o.get("message") or {}).get("content")
    if isinstance(c, str):
        return c, False
    if isinstance(c, list):
        if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c):
            return None, True
        t = [str(b.get("text", "")) for b in c if isinstance(b, dict) and b.get("type") == "text"]
        return (" ".join(t) if t else None), False
    return None, False


def classify(o):
    """'prompt', a non-prompt kind, or None for rows that are not the person's at all."""
    if o.get("type") == "attachment":
        a = o.get("attachment") or {}
        if a.get("type") == "queued_command" and a.get("humanTurn") and isinstance(a.get("prompt"), str) and not o.get("isSidechain"):
            return "prompt" if a["prompt"].strip() and not NOT_A_PROMPT.match(a["prompt"]) else "queued-non-prompt"
        return None
    if o.get("type") != "user" or o.get("isSidechain"):
        return None
    if o.get("isCompactSummary"):
        return "compact-summary"
    if o.get("isMeta"):
        return "meta"
    text, is_tool = text_of(o)
    if is_tool:
        return None  # a tool result is Claude's, not the person's
    if text is None or not text.strip():
        return "empty"
    if not NOT_A_PROMPT.match(text):
        return "prompt"
    for name, pat in KIND:
        if pat.match(text):
            return name
    return "other"


def main(paths):
    files = paths or glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl"))
    kinds, before_first, per_exchange_max, transcripts = Counter(), Counter(), 0, 0
    person_max = 0
    PERSON = {"slash-command", "bash", "interrupted", "local-command-output"}
    for f in files:
        transcripts += 1
        seen_prompt, run, person_run = False, 0, 0
        try:
            with open(f, encoding="utf-8") as fh:
                for line in fh:
                    try:
                        o = json.loads(line)
                    except ValueError:
                        continue
                    k = classify(o)
                    if k is None:
                        continue
                    if k == "prompt":
                        seen_prompt, run, person_run = True, 0, 0
                        continue
                    kinds[k] += 1
                    if not seen_prompt:
                        before_first[k] += 1
                    run += 1
                    per_exchange_max = max(per_exchange_max, run)
                    if k in PERSON:
                        person_run += 1
                        person_max = max(person_max, person_run)
        except OSError:
            continue
    print(f"transcripts: {transcripts}")
    print("non-prompt user rows by kind:", dict(kinds.most_common()))
    print("of those, before the first prompt:", dict(before_first.most_common()))
    print("most footnotes in one exchange:", per_exchange_max)
    print("most footnotes in one exchange, the person's own actions only (slash commands, ! shell, interruptions, command output):", person_max)


if __name__ == "__main__":
    main(sys.argv[1:])
