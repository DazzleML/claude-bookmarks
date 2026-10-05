"""Why does PowerShell's user-row arm return more bytes than sh + grep's? Line counts and
the lines one arm has that the other lacks, keyed by uuid.

usage: python reconcile_u.py <transcript .jsonl>
"""
import json
import sys

import measure_search as m

m.TRANSCRIPT = sys.argv[1]
a = m.arms()
outs = {k: m.run(v)[1] for k, v in a.items() if k.startswith("U ")}
for name, out in outs.items():
    lines = [l for l in out.decode("utf-8", errors="replace").splitlines() if l.strip()]
    crlf = out.count(b"\r\n")
    print(f"{name}: {len(out):,} bytes, {len(lines)} lines, {crlf} CRLF")
keyed = {}
for name, out in outs.items():
    d = {}
    for l in out.decode("utf-8", errors="replace").splitlines():
        if l.strip():
            o = json.loads(l)
            d[o.get("uuid")] = l
    keyed[name] = d
(n1, d1), (n2, d2) = keyed.items()
only2 = set(d2) - set(d1)
print(f"only in {n2}: {len(only2)} lines, {sum(len(d2[k].encode()) for k in only2):,} bytes")
for k in list(only2)[:5]:
    print("  sample:", d2[k][:160])
