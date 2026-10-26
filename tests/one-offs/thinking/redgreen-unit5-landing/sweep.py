"""Diff-scoped mutation sweep for unit 5 of the 0.7 groundwork (2026-10-25): the mutants in a spec
JSON applied one at a time to a SCRATCH copy of plugin/hooks/core/places/landing.ts, with
tests/core/landing.test.ts run against it; every survivor re-run alone. plugin/ is never edited.

Usage: python sweep.py <spec.json> <report.json>
"""
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
HOOKS = REPO / "plugin" / "hooks"
uri = lambda *p: HOOKS.joinpath(*p).as_uri()
SRC = (HOOKS / "core" / "places" / "landing.ts").read_text(encoding="utf-8").replace("from './reader.ts'", f"from '{uri('core', 'places', 'reader.ts')}'")
TEST = (REPO / "tests" / "core" / "landing.test.ts").read_text(encoding="utf-8")
TEST = (TEST.replace("'../../plugin/hooks/core/places/landing.ts'", "'./landing.ts'")
        .replace("'../../plugin/hooks/core/places/reader.ts'", f"'{uri('core', 'places', 'reader.ts')}'")
        .replace("'../../plugin/hooks/core/places/place.ts'", f"'{uri('core', 'places', 'place.ts')}'")
        .replace("'../../plugin/hooks/engine/select.ts'", f"'{uri('engine', 'select.ts')}'"))
spec = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["mutations"]
(HERE / "landing.test.ts").write_text(TEST, encoding="utf-8")


def run(text):
    (HERE / "landing.ts").write_text(text, encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "landing.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    return [l for l in out.splitlines() if l.startswith("not ok")]


results = []
print(f"control: {len(run(SRC))} red (must be 0)")
for m in spec:
    n = SRC.count(m["original"])
    if n != 1:
        print(f"{m['id']}: apply failure ({n})")
        results.append({**m, "verdict": f"apply-failure ({n})"})
        continue
    fails = run(SRC.replace(m["original"], m["mutated"]))
    verdict = "killed" if fails else ("killed-on-reverify" if run(SRC.replace(m["original"], m["mutated"])) else "survived")
    results.append({**m, "verdict": verdict, "red": fails})
    print(f"{m['id']}: {verdict}  {m['note']}" + (f"  <- {fails[0]}" if fails else ""))
run(SRC)
pathlib.Path(sys.argv[2]).write_text(json.dumps(results, indent=1), encoding="utf-8")
