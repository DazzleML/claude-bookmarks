"""Measure: is an 8-hex prefix of a message uuid unique within one transcript?

Decision it feeds: whether `bm:<sid8>/<uuid8>` (the short row reference) can name a row
without the full uuid, or needs a longer prefix / a fallback when two rows share 8 chars.

Population: every transcript under ~/.claude/projects/*/*.jsonl. Each line is parsed as
JSON and its TOP-LEVEL "uuid" is the row's id (nested uuids, e.g. inside tool results or
quoted text, are not rows and are ignored). Lines that do not parse are counted apart.

Prints counts only -- no message text.

Usage: python probe.py [--check <small transcript>]
  --check: the known-answer case -- prints this probe's distinct-uuid count for one file,
           to compare with: jq -r '.uuid // empty' <file> | sort -u | wc -l
"""
import glob
import json
import os
import sys
from collections import defaultdict

ROOT = os.path.expanduser('~/.claude/projects')


def rows(path):
    """Yield (uuid or None, parsed_ok) per line."""
    with open(path, 'rb') as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except Exception:
                yield None, False
                continue
            u = obj.get('uuid') if isinstance(obj, dict) else None
            yield (u if isinstance(u, str) else None), True


def per_file(path):
    uuids = set()
    lines = bad = no_uuid = 0
    for u, ok in rows(path):
        lines += 1
        if not ok:
            bad += 1
        elif u is None:
            no_uuid += 1
        else:
            uuids.add(u.lower())
    return uuids, lines, bad, no_uuid


def collisions(uuids, n):
    by = defaultdict(set)
    for u in uuids:
        by[u.replace('-', '')[:n]].add(u)
    return sum(1 for s in by.values() if len(s) > 1)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--check':
        uuids, lines, bad, no_uuid = per_file(sys.argv[2])
        print(f'check: {len(uuids)} distinct uuids; lines {lines} = with uuid + {no_uuid} without + {bad} unparsed')
        return
    files = sorted(glob.glob(os.path.join(ROOT, '*', '*.jsonl')))
    total_lines = total_bad = total_no = 0
    total_uuids = 0
    files_with_c8 = 0
    c = {6: 0, 7: 0, 8: 0, 10: 0, 12: 0}
    worst = (0, None, 0)  # (collisions at 8, file, distinct uuids)
    biggest = (0, None)
    seen_in = defaultdict(int)  # uuid -> number of transcripts holding it
    sids = []
    for p in files:
        sid = os.path.basename(p)[:-6].lower()
        sids.append(sid)
        uuids, lines, bad, no_uuid = per_file(p)
        total_lines += lines
        total_bad += bad
        total_no += no_uuid
        total_uuids += len(uuids)
        for u in uuids:
            seen_in[u] += 1
        for n in c:
            c[n] += collisions(uuids, n)
        k8 = collisions(uuids, 8)
        if k8:
            files_with_c8 += 1
        if k8 > worst[0]:
            worst = (k8, sid[:8], len(uuids))
        if len(uuids) > biggest[0]:
            biggest = (len(uuids), sid[:8])
    sid8 = defaultdict(set)
    for s in sids:
        sid8[s.replace('-', '')[:8]].add(s)
    shared = sum(1 for v in seen_in.values() if v > 1)
    print(f'transcripts: {len(files)}; distinct session ids: {len(set(sids))}; sid8 prefixes shared: {sum(1 for v in sid8.values() if len(v) > 1)}')
    print(f'lines: {total_lines} = rows with a uuid + {total_no} without + {total_bad} unparsed')
    print(f'distinct uuids summed per transcript: {total_uuids}; distinct across all: {len(seen_in)}; uuids in 2+ transcripts (forks/copies): {shared}')
    print(f'largest transcript by distinct uuids: {biggest[1]} with {biggest[0]}')
    for n in sorted(c):
        print(f'prefix {n:>2} hex chars: prefixes shared within a transcript, summed: {c[n]}')
    print(f'transcripts with any 8-char collision: {files_with_c8}; worst: {worst[1]} with {worst[0]} (of {worst[2]} uuids)')


if __name__ == '__main__':
    main()
