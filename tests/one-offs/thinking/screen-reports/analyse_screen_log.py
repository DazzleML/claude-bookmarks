"""Line up Claude Code's raw onScreen reports against the prompts pane's numbering.

Measurement for the yellow-row jumps (2026-10-12): while djdarcy scrolls near #324-#326
with the prompts pane open, the yellow row flips to the newest prompt (#351) and back.
The plugin's temporary probe (`rawScreen` in plugin/hooks/register.tsx) writes every raw
report to <debug>/<session>.screen.log; this script gives each report the exchange (#)
its message belongs to and groups reports into bursts, so the far-away reports show.

Reads only: the screen log, the transcript, the plugin store. Writes nothing.

    python analyse_screen_log.py [--since HH:MM:SS] [--gap-ms 60] [--far 5]
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

SESSION = "8f0f9b27-33fc-4054-806a-22a6d569dfb5"
HOME = Path(os.environ.get("USERPROFILE") or os.environ["HOME"])
DATA = Path(os.environ.get("CLAUDE_USER_DIR") or HOME / "claude")
SCREEN_LOG = DATA / "bookmarks" / "debug" / f"{SESSION}.screen.log"
STORE = HOME / ".claude" / "plugins" / "store" / "bookmarks_inline-2b3395bbdcfb.json"
TRANSCRIPT = HOME / ".claude" / "projects" / "C--code-claude-projects-dazzle-claude-plugins" / f"{SESSION}.jsonl"

LINE = re.compile(r"^(\d\d:\d\d:\d\d\.\d{3}) (U|A|TU|TR|TG|CO|TD|IN) (\S+) (\S+)$")
MARK = re.compile(r"^(\d\d:\d\d:\d\d\.\d{3}) >>> (.*)$")


def ms(clock: str) -> int:
    h, m, s = clock.split(":")
    return int((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)


def prompt_numbers() -> dict[str, int]:
    rows = json.loads(STORE.read_text(encoding="utf-8"))[f"prompts:{SESSION}"]
    return {r["uuid"]: i + 1 for i, r in enumerate(rows)}


def exchange_of(numbers: dict[str, int]) -> dict[str, int]:
    """Every transcript uuid -> the # of the prompt at or before it, in file order."""
    out, current = {}, 0
    with TRANSCRIPT.open(encoding="utf-8") as f:
        for raw in f:
            try:
                entry = json.loads(raw)
            except json.JSONDecodeError:
                continue
            uuid = entry.get("uuid")
            if not uuid:
                continue
            current = numbers.get(uuid, current)
            # Render ids keep the first four groups and zero the fifth (…-000000000000),
            # so key by the first four, as register.tsx's firstFour does.
            out[first_four(uuid)] = current
            # ToolUse and ToolResult rows report under the tool call's id (toolu_…).
            content = (entry.get("message") or {}).get("content")
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        tool_id = block.get("id") if block.get("type") == "tool_use" else block.get("tool_use_id")
                        if tool_id:
                            out.setdefault(tool_id, current)
    return out


def first_four(uuid: str) -> str:
    # A ToolGroup's id is its first message's, prefixed `collapsed-`.
    return "-".join(uuid.removeprefix("collapsed-").split("-")[:4])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="HH:MM:SS (UTC); earlier lines are skipped")
    ap.add_argument("--gap-ms", type=int, default=60, help="a pause this long starts a new burst")
    ap.add_argument("--far", type=int, default=5, help="exchanges away from the burst's lowest # to flag")
    args = ap.parse_args()

    numbers = prompt_numbers()
    exch = exchange_of(numbers)

    # Known-answer check: the pane's own numbering must put these prompts where djdarcy saw them.
    known = {"408510b0": 351, "70f2a222": 324, "59ec5ce8": 325}
    for short, want in known.items():
        got = next((n for u, n in numbers.items() if u.startswith(short)), None)
        if got != want:
            print(f"KNOWN-ANSWER FAIL: {short} is #{got}, expected #{want}", file=sys.stderr)
            return 2

    lines = SCREEN_LOG.read_text(encoding="utf-8").splitlines()
    since = ms(args.since + ".000") if args.since else -1
    counts = {"report": 0, "marker": 0, "reload": 0, "skipped-early": 0, "unparsed": 0}
    unknown_ids: set[str] = set()
    bursts: list[dict] = []
    last_t = None
    for line in lines:
        if line == "--- reload ---":
            counts["reload"] += 1
            last_t = None
            continue
        m, k = LINE.match(line), MARK.match(line)
        if not m and not k:
            counts["unparsed"] += 1
            continue
        t = ms((m or k).group(1))
        if t < since:
            counts["skipped-early"] += 1
            continue
        if k:
            counts["marker"] += 1
            bursts.append({"t": (m or k).group(1), "marker": k.group(2)})
            last_t = None
            continue
        counts["report"] += 1
        clock, comp, uuid, rng = m.groups()
        n = exch.get(uuid) if uuid.startswith("toolu_") else exch.get(first_four(uuid))
        if n is None:
            unknown_ids.add(uuid)
        if last_t is None or t - last_t > args.gap_ms or "marker" in bursts[-1]:
            bursts.append({"t": clock, "items": []})
        bursts[-1]["items"].append((comp, uuid[:8], rng, n))
        last_t = t

    for b in bursts:
        if "marker" in b:
            print(f"{b['t']}   {b['marker']}")
            continue
        nums = [n for *_, n in b["items"] if n is not None and _[2] not in ("null", "absent")]
        low = min(nums) if nums else None
        parts = []
        for comp, short, rng, n in b["items"]:
            far = low is not None and n is not None and rng not in ("null", "absent") and n - low >= args.far
            parts.append(f"{'!' if far else ''}#{n if n is not None else '?'}{comp}:{short}:{rng}")
        print(f"{b['t']} [{len(b['items'])}] " + " ".join(parts))

    total = sum(counts.values())
    print(f"\nreconcile: {counts} = {total} of {len(lines)} lines", file=sys.stderr)
    if unknown_ids:
        print(f"ids not in the transcript: {len(unknown_ids)} ({', '.join(sorted(u[:8] for u in unknown_ids)[:6])})", file=sys.stderr)
    return 0 if total == len(lines) else 1


if __name__ == "__main__":
    sys.exit(main())
