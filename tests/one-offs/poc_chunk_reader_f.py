"""Proof of concept for slice F: an offset-resumed chunk reader over a transcript, through the
same shape of program the plugin can run (`sh -c 'tail -c +N "$1" | head -c CAP'`), carrying
each chunk's partial last line into the next. Prediction: with the carry, the reader yields
exactly the file's lines and every line parses; the control arm (no carry) loses or breaks
lines at every chunk boundary. Run: python -I tests/one-offs/poc_chunk_reader_f.py [path]
Reads a scratch copy of a real transcript (copied to the session scratchpad), never the live file.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

CAP = 4 * 1024 * 1024
PROJECTS = Path(os.environ.get("USERPROFILE", "~")).expanduser() / ".claude" / "projects"
SCRATCH = Path(os.environ.get("POC_SCRATCH", Path(os.environ.get("TEMP", ".")) / "claude-poc-f"))


def pick_source(lo: int = 20_000_000, hi: int = 60_000_000) -> Path:
    files = sorted((p for p in PROJECTS.glob("*/*.jsonl") if lo <= p.stat().st_size <= hi), key=lambda p: p.stat().st_size)
    if not files:
        raise SystemExit("no transcript between 20 and 60 MB")
    return files[len(files) // 2]


def read_chunk(path: Path, offset: int) -> bytes:
    """What the plugin would get back from one $.process.run: at most CAP bytes from `offset` (1-based for tail)."""
    r = subprocess.run(["sh", "-c", f'tail -c +{offset + 1} "$1" | head -c {CAP}', "sh", str(path)], capture_output=True)
    return r.stdout


def chunked_lines(path: Path, carry: bool) -> tuple[list[bytes], int]:
    """Yield the file's lines chunk by chunk. With `carry`, the partial last line of a chunk is
    prefixed to the next chunk; the control arm drops it (what a naive reader does)."""
    lines: list[bytes] = []
    offset = 0
    pending = b""
    calls = 0
    while True:
        chunk = read_chunk(path, offset)
        calls += 1
        if not chunk:
            break
        offset += len(chunk)
        data = (pending + chunk) if carry else chunk
        parts = data.split(b"\n")
        pending = parts.pop()  # the partial last line (empty when the chunk ended on a newline)
        lines.extend(p for p in parts)
        if len(chunk) < CAP:
            break
    if pending:
        lines.append(pending)
    return lines, calls


def parse_failures(lines: list[bytes]) -> int:
    bad = 0
    for ln in lines:
        if not ln.strip():
            continue
        try:
            json.loads(ln)
        except Exception:
            bad += 1
    return bad


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else pick_source()
    SCRATCH.mkdir(parents=True, exist_ok=True)
    copy = SCRATCH / src.name
    shutil.copyfile(src, copy)
    size = copy.stat().st_size
    direct = [ln for ln in copy.read_bytes().split(b"\n") if ln]
    direct_bad = parse_failures(direct)
    print(f"source {src.name} ({size / 1e6:.1f} MB) copied to {copy}; direct read: {len(direct)} lines, {direct_bad} unparsable")

    started = time.perf_counter()
    with_carry, calls = chunked_lines(copy, carry=True)
    t_carry = time.perf_counter() - started
    nonempty = [ln for ln in with_carry if ln]
    bad = parse_failures(nonempty)
    print(f"with carry:    {len(nonempty)} lines, {bad} unparsable, {calls} calls, {t_carry:.2f} s "
          f"-> {'PASS' if len(nonempty) == len(direct) and bad == direct_bad and nonempty == direct else 'FAIL'}")

    control, calls_c = chunked_lines(copy, carry=False)
    nonempty_c = [ln for ln in control if ln]
    bad_c = parse_failures(nonempty_c)
    print(f"control (no carry): {len(nonempty_c)} lines, {bad_c} unparsable, {calls_c} calls "
          f"-> {'fails as predicted' if (bad_c > direct_bad or len(nonempty_c) != len(direct)) else 'CONTROL PASSED: the method cannot tell'}")
    copy.unlink()
    return 0


if __name__ == "__main__":
    sys.exit(main())
