"""Can one shell pass return a conversation's whole searchable text under the 4 MiB cap?

Question (claude-bookmarks search design, 2026-10-04): a search pane could load every
prompt and every reply's text once, then filter live in memory -- if the platform's own
tool (sh + grep, or Windows PowerShell 5.1) can return those lines under $.process.run's
4 MiB stdout cap, quickly. Decides "live over the whole log" vs "drawn messages live,
whole log only on Enter".

Arms run as $.process.run would (an argv, no shell of its own), RUNS times each:
  U   user rows minus tool results (the prompt back-fill's filter, unchanged)
  A   assistant rows that carry a text block
  UA  both in one process
  CTL every line (control: must exceed the cap, or the method is broken)
Known-answer check: the uuids each arm yields are compared with a full Python parse.

usage: python measure_search.py <path to a session transcript .jsonl>
"""
import base64
import json
import os
import shutil
import statistics
import subprocess
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "prompt-history"))
from prompt_index import prompt_text  # noqa: E402  the back-fill's own reference rule

CAP = 4 * 1024 * 1024
RUNS = 3
USER = '"type":"user"'
TOOL_RESULT = '"type":"tool_result"'
ASSISTANT = '"type":"assistant"'
TEXT_BLOCK = '"type":"text"'

if len(sys.argv) < 2:
    sys.exit(__doc__.strip().splitlines()[-1])
TRANSCRIPT = sys.argv[1]


def reply_text(o):
    """An assistant row's text blocks joined, or None (tool use, thinking, sidechain)."""
    if o.get("type") != "assistant" or o.get("isSidechain"):
        return None
    content = (o.get("message") or {}).get("content")
    if not isinstance(content, list):
        return None
    texts = [str(b.get("text", "")) for b in content if isinstance(b, dict) and b.get("type") == "text"]
    return " ".join(texts) if texts else None


def reference():
    prompts, replies, lines, longest = {}, {}, 0, 0
    with open(TRANSCRIPT, encoding="utf-8") as f:
        for line in f:
            lines += 1
            longest = max(longest, len(line.encode("utf-8")))
            o = json.loads(line)
            p, r = prompt_text(o), reply_text(o)
            if p is not None:
                prompts[o["uuid"]] = p
            if r is not None:
                replies[o["uuid"]] = r
    return prompts, replies, lines, longest


def ps(script):
    full = "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); " + script
    enc = base64.b64encode(full.encode("utf-16-le")).decode("ascii")
    return ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", enc]


def arms():
    t = TRANSCRIPT.replace("'", "''")
    sel = f"Select-String -LiteralPath '{t}' -SimpleMatch -Encoding UTF8"
    u_ps = f"{sel} -Pattern '{USER}' | Where-Object {{ -not $_.Line.Contains('{TOOL_RESULT}') }} | ForEach-Object {{ $_.Line }}"
    a_ps = f"{sel} -Pattern '{ASSISTANT}' | Where-Object {{ $_.Line.Contains('{TEXT_BLOCK}') }} | ForEach-Object {{ $_.Line }}"
    u_sh = f"grep -F '{USER}' \"$1\" | grep -vF '{TOOL_RESULT}'"
    a_sh = f"grep -F '{ASSISTANT}' \"$1\" | grep -F '{TEXT_BLOCK}'"
    out = {}
    if shutil.which("sh"):
        out["U   sh+grep"] = ["sh", "-c", u_sh, "sh", TRANSCRIPT]
        out["A   sh+grep"] = ["sh", "-c", a_sh, "sh", TRANSCRIPT]
        out["UA  sh+grep"] = ["sh", "-c", f"{{ {u_sh}; {a_sh}; }}", "sh", TRANSCRIPT]
        out["CTL sh cat"] = ["sh", "-c", 'cat "$1"', "sh", TRANSCRIPT]
    if shutil.which("powershell"):
        out["U   powershell"] = ps(u_ps)
        out["A   powershell"] = ps(a_ps)
        out["UA  powershell"] = ps(f"& {{ {u_ps}; {a_ps} }}")
    return out


def run(argv):
    times, stdout = [], b""
    for _ in range(RUNS):
        t0 = time.perf_counter()
        r = subprocess.run(argv, capture_output=True)
        times.append((time.perf_counter() - t0) * 1000)
        stdout = r.stdout
    return statistics.median(times), stdout


def yielded(stdout):
    """uuids of prompts and replies parsed out of an arm's lines, plus unparsable lines."""
    prompts, replies, bad = set(), set(), 0
    for line in stdout.decode("utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            o = json.loads(line)
        except json.JSONDecodeError:
            bad += 1
            continue
        if prompt_text(o) is not None:
            prompts.add(o["uuid"])
        if reply_text(o) is not None:
            replies.add(o["uuid"])
    return prompts, replies, bad


def main():
    ref_p, ref_r, lines, longest = reference()
    text_bytes = sum(len(v.encode("utf-8")) for v in list(ref_p.values()) + list(ref_r.values()))
    size = os.path.getsize(TRANSCRIPT)
    print(f"transcript: {size:,} bytes, {lines:,} lines, longest line {longest:,} bytes")
    print(f"reference:  {len(ref_p)} prompts + {len(ref_r)} replies; their text {text_bytes:,} bytes")
    print(f"cap:        {CAP:,} bytes\n")
    print(f"{'arm':16} {'median ms':>9} {'stdout bytes':>13} {'<cap':>5} {'prompts':>9} {'replies':>9} {'bad':>4}")
    for name, argv in arms().items():
        ms, out = run(argv)
        p, r, bad = yielded(out)
        print(f"{name:16} {ms:9.0f} {len(out):13,} {'yes' if len(out) <= CAP else 'NO':>5} "
              f"{len(p & ref_p.keys()):4}/{len(ref_p):<4} {len(r & ref_r.keys()):4}/{len(ref_r):<4} {bad:4}")


if __name__ == "__main__":
    main()
