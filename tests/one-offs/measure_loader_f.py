"""Measure, for slice F (the whole-conversation loader): how far the back-fill's 4 MiB
output cap reaches, and what a chunked read by offsets costs, on the largest transcripts
on this machine. Read-only; prints a report. Run: python -I tests/one-offs/measure_loader_f.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

CAP = 4 * 1024 * 1024  # the engine's output cap for a program, and $.fs.read's limit
PROJECTS = Path(os.environ.get("USERPROFILE", "~")).expanduser() / ".claude" / "projects"


def largest(n: int) -> list[Path]:
    files = [p for p in PROJECTS.glob("*/*.jsonl") if p.is_file()]
    files.sort(key=lambda p: p.stat().st_size, reverse=True)
    return files[:n]


def pipeline_rows(path: Path) -> list[bytes]:
    """The sh pipeline the plugin runs (userRows): user or queued_command rows, minus tool_result and meta."""
    out: list[bytes] = []
    with path.open("rb") as f:
        for line in f:
            if b'"type":"user"' in line or b'"type":"queued_command"' in line:
                if b'"type":"tool_result"' in line or b'"isMeta":true' in line:
                    continue
                out.append(line)
    return out


def message_rows(path: Path) -> tuple[int, int, int, int, int]:
    """A direct parse: user prompts (text content, not meta, not tool_result-only), assistant
    replies, the bytes of their text, and the compaction summaries. Returns (prompts, replies,
    prompt_text_bytes, reply_text_bytes, compactions)."""
    prompts = replies = ptext = rtext = compactions = 0
    with path.open("rb") as f:
        for line in f:
            try:
                o = json.loads(line)
            except Exception:
                continue
            t = o.get("type")
            if t == "user":
                if o.get("isMeta") or o.get("isCompactSummary"):
                    if o.get("isCompactSummary"):
                        compactions += 1
                    continue
                c = (o.get("message") or {}).get("content")
                text = None
                if isinstance(c, str):
                    text = c
                elif isinstance(c, list):
                    parts = [b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"]
                    text = "\n".join(parts) if parts else None
                if text:
                    prompts += 1
                    ptext += len(text.encode("utf-8"))
            elif t == "assistant":
                c = (o.get("message") or {}).get("content")
                if isinstance(c, list):
                    parts = [b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"]
                    if parts:
                        replies += 1
                        rtext += len("\n".join(parts).encode("utf-8"))
            elif t == "attachment" and (o.get("attachment") or {}).get("type") == "queued_command":
                prompts += 1
                ptext += len(str((o.get("attachment") or {}).get("prompt", "")).encode("utf-8"))
    return prompts, replies, ptext, rtext, compactions


def reconcile(path: Path) -> dict[str, int]:
    """Why the pipeline's row count and the direct parse's prompt count differ: classify every
    line that either side counts. The known-answer case: pipeline == direct - text_beside_tool_result
    + rows_without_text (a pipeline row whose content carries no text block)."""
    c = {"pipeline": 0, "direct": 0, "text_beside_tool_result": 0, "pipeline_rows_without_text": 0,
         "queued_attachments": 0, "compaction": 0, "meta": 0, "tool_result_only": 0, "unparsed": 0, "lines": 0}
    with path.open("rb") as f:
        for line in f:
            c["lines"] += 1
            in_pipeline = (b'"type":"user"' in line or b'"type":"queued_command"' in line) and not (
                b'"type":"tool_result"' in line or b'"isMeta":true' in line)
            if in_pipeline:
                c["pipeline"] += 1
            try:
                o = json.loads(line)
            except Exception:
                c["unparsed"] += 1
                continue
            t = o.get("type")
            if t == "user":
                if o.get("isCompactSummary"):
                    c["compaction"] += 1
                    continue
                if o.get("isMeta"):
                    c["meta"] += 1
                    continue
                content = (o.get("message") or {}).get("content")
                has_text = isinstance(content, str) and bool(content) or (
                    isinstance(content, list) and any(isinstance(b, dict) and b.get("type") == "text" and b.get("text") for b in content))
                has_tool = isinstance(content, list) and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content)
                if has_text:
                    c["direct"] += 1
                    if has_tool:
                        c["text_beside_tool_result"] += 1
                    # A prompt whose own text quotes a marker (a pasted log with "type":"tool_result"
                    # or "isMeta":true in it) is dropped by the grep pipeline though it is a prompt.
                    if not in_pipeline:
                        c.setdefault("direct_dropped_by_marker_in_text", 0)
                        c["direct_dropped_by_marker_in_text"] += 1
                elif has_tool:
                    c["tool_result_only"] += 1
                if in_pipeline and not has_text:
                    c["pipeline_rows_without_text"] += 1
            elif t == "attachment" and (o.get("attachment") or {}).get("type") == "queued_command":
                c["queued_attachments"] += 1
                c["direct"] += 1
                if not in_pipeline:
                    c.setdefault("direct_dropped_by_marker_in_text", 0)
                    c["direct_dropped_by_marker_in_text"] += 1
                    c.setdefault("dropped_queued", 0)
                    c["dropped_queued"] += 1
    return c


def chunk_timing(path: Path, chunks: int = 8) -> tuple[float, int]:
    """Wall time of `sh -c 'tail -c +N "$1" | head -c CAP'` per chunk, averaged over the first
    `chunks` chunks spread across the file; returns (seconds per chunk, chunk count for the file)."""
    size = path.stat().st_size
    total = (size + CAP - 1) // CAP
    picks = [1 + i * (size // chunks) for i in range(chunks)]
    times = []
    for off in picks:
        started = time.perf_counter()
        r = subprocess.run(["sh", "-c", f'tail -c +{off} "$1" | head -c {CAP}', "sh", str(path)], capture_output=True)
        times.append(time.perf_counter() - started)
        if len(r.stdout) == 0:
            print(f"  (empty chunk at offset {off})", file=sys.stderr)
    return sum(times) / len(times), total


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "--reconcile":
        path = largest(1)[0]
        c = reconcile(path)
        print(f"== reconcile {path.name}: {c}")
        dropped = c.get("direct_dropped_by_marker_in_text", 0)
        # A compaction summary is a user row without isMeta: the pipeline keeps it (parseBackfill drops it later).
        expected = c["direct"] - dropped + c["pipeline_rows_without_text"] + c["compaction"]
        print(f"  pipeline {c['pipeline']} == direct {c['direct']} - dropped-by-a-marker-in-the-text {dropped} "
              f"+ pipeline-rows-without-text {c['pipeline_rows_without_text']} + compaction summaries {c['compaction']} = {expected}: "
              f"{'OK' if expected == c['pipeline'] else 'MISMATCH'}")
        return 0
    for path in largest(3):
        size = path.stat().st_size
        print(f"\n== {path.name} in {path.parent.name}: {size / 1e6:.0f} MB")
        rows = pipeline_rows(path)
        total_bytes = sum(len(r) for r in rows)
        fit = 0
        acc = 0
        for r in rows:
            if acc + len(r) > CAP:
                break
            acc += len(r)
            fit += 1
        print(f"  back-fill pipeline: {len(rows)} rows, {total_bytes / 1e6:.1f} MB; the first 4 MiB holds {fit} rows "
              f"({fit / max(len(rows), 1):.0%}); cut: {'YES' if total_bytes > CAP else 'no'}")
        prompts, replies, ptext, rtext, compactions = message_rows(path)
        print(f"  direct parse: {prompts} prompts ({ptext / 1e6:.2f} MB of text), {replies} replies ({rtext / 1e6:.2f} MB), "
              f"{compactions} compaction summaries")
        per, count = chunk_timing(path)
        print(f"  chunked read: {per * 1000:.0f} ms per 4 MiB chunk (sh tail|head), {count} chunks, "
              f"{per * count:.1f} s for the whole file at that rate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
