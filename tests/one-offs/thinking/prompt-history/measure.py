"""Measure each way of getting a session's prompt history against a reference.

Runs every arm as $.process.run would (an argv, no shell of its own), three times,
on the real transcript; reports median time, output bytes against the 4 MiB cap,
and whether the prompts it yields match the reference: same uuids, same first
200 characters. See README.md for the predictions written before the first run.
"""
import base64
import json
import os
import shutil
import statistics
import subprocess
import sys
import time

from prompt_index import prompt_text

HERE = os.path.dirname(os.path.abspath(__file__))
CAP = 4 * 1024 * 1024
if len(sys.argv) < 2:
    sys.exit("usage: python measure.py <path to a session transcript .jsonl>\n"
             "  (under ~/.claude/projects/<project>/<session id>.jsonl)")
TRANSCRIPT = sys.argv[1]
RUNS = 3

USER = '"type":"user"'
TOOL_RESULT = '"type":"tool_result"'


def reference():
    """uuid -> first 200 chars, from a full parse of every line, plus line counts."""
    ref, user_lines, lines = {}, 0, 0
    with open(TRANSCRIPT, encoding="utf-8") as f:
        for line in f:
            lines += 1
            o = json.loads(line)
            if o.get("type") == "user":
                user_lines += 1
            text = prompt_text(o)
            if text is not None:
                ref[o["uuid"]] = text[:200]
    return ref, user_lines, lines


def powershell_argv():
    script = (
        "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); "
        f"Select-String -LiteralPath '{TRANSCRIPT}' -SimpleMatch -Pattern '{USER}' -Encoding UTF8 | "
        f"Where-Object {{ -not $_.Line.Contains('{TOOL_RESULT}') }} | ForEach-Object {{ $_.Line }}"
    )
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    return ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]


def arms():
    sh, grep = shutil.which("sh"), shutil.which("grep")
    return {
        # Through `sh -c` like A2. First run passed the pattern as its own argv entry:
        # from a Windows process its double quotes were stripped on the way into the
        # MSYS grep, which then matched nothing (0 bytes, exit 1) -- method-broken, and a
        # hazard for the mod's own argv calls on Windows.
        "C control: grep type user only": (
            [sh, "-c", f"grep -F '{USER}' \"$1\"", "sh", TRANSCRIPT], "lines"),
        "C' quoting probe: grep argv direct": ([grep, "-F", USER, TRANSCRIPT], "lines"),
        "A1 Windows PowerShell 5.1": (powershell_argv(), "lines"),
        "A2 sh + grep | grep -v": (
            [sh, "-c", f"grep -F '{USER}' \"$1\" | grep -vF '{TOOL_RESULT}'", "sh", TRANSCRIPT], "lines"),
        "B python prompt_index.py": ([sys.executable, os.path.join(HERE, "prompt_index.py"), TRANSCRIPT], "index"),
    }


def parse(out_bytes, kind):
    """What the mod would get: uuid -> first 200 chars, from (at most) the capped stdout."""
    text = out_bytes[:CAP].decode("utf-8", errors="replace")
    got, bad = {}, 0
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            o = json.loads(line)
        except ValueError:
            bad += 1  # a line cut off at the cap, or mangled
            continue
        if kind == "index":
            got[o["uuid"]] = o["text"]
        else:
            t = prompt_text(o)
            if t is not None:
                got[o["uuid"]] = t[:200]
    return got, bad, text.count("�")


def main():
    ref, user_lines, lines = reference()
    print(f"transcript: {os.path.getsize(TRANSCRIPT):,} bytes, {lines} lines, "
          f"{user_lines} with type user, {len(ref)} prompts (reference)")
    # Known answers: the conversation's first prompt and a recent one must be in the reference.
    first = next(iter(ref.values()), "")
    print(f"known answer, first prompt starts: {first[:60]!r}")
    print(f"known answer, recent prompt present: {any(v.startswith('Lovely your new input') for v in ref.values())}")
    print()
    print(f"{'arm':34} {'median ms':>9} {'out bytes':>11} {'>cap':>5} {'prompts':>7} "
          f"{'missing':>7} {'extra':>5} {'text≠':>5} {'U+FFFD':>6} {'bad':>4}")
    for name, (argv, kind) in arms().items():
        times, out = [], b""
        for _ in range(RUNS):
            start = time.perf_counter()
            proc = subprocess.run(argv, capture_output=True)
            times.append((time.perf_counter() - start) * 1000)
            out = proc.stdout
        got, bad, fffd = parse(out, kind)
        missing = [u for u in ref if u not in got]
        extra = [u for u in got if u not in ref]
        text_diff = sum(1 for u in ref if u in got and got[u] != ref[u])
        print(f"{name:34} {statistics.median(times):9.0f} {len(out):11,} {str(len(out) > CAP):>5} "
              f"{len(got):7} {len(missing):7} {len(extra):5} {text_diff:5} {fffd:6} {bad:4}")
        if proc.returncode not in (0, 1):
            print(f"    exit {proc.returncode}: {proc.stderr[:300]!r}")
        for u in missing[:3]:
            print(f"    missing {u}: {ref[u][:70]!r}")
        if text_diff:
            u = next(u for u in ref if u in got and got[u] != ref[u])
            print(f"    text differs {u}:\n      ref {ref[u][:80]!r}\n      got {got[u][:80]!r}")


if __name__ == "__main__":
    main()
