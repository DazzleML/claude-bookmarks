"""Diff-scoped mutation sweep for unit 2 of the 0.7 groundwork (2026-10-25): the mutants in a
spec JSON applied one at a time to a SCRATCH copy of plugin/hooks/core/places/place.ts, the
test file run against the copy with `node --test`; every survivor re-run alone to confirm.
plugin/ is never edited (it hot-reloads into open Claude Code sessions).

Usage: python sweep.py <spec.json> <report.json>
"""
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
HOOKS = REPO / "plugin" / "hooks"
SRC = (HOOKS / "core" / "places" / "place.ts").read_text(encoding="utf-8")
SRC = SRC.replace("from '../prompts/prompt-rows.ts'", f"from '{(HOOKS / 'core' / 'prompts' / 'prompt-rows.ts').as_uri()}'")
TEST = (REPO / "tests" / "core" / "places.test.ts").read_text(encoding="utf-8").replace("from '../../plugin/hooks/core/places/place.ts'", "from './place.ts'")
spec = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["mutations"]
(HERE / "places.test.ts").write_text(TEST, encoding="utf-8")


def run(text):
    (HERE / "place.ts").write_text(text, encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "places.test.ts")], capture_output=True, text=True, cwd=REPO).stdout
    return [l for l in out.splitlines() if l.startswith("not ok")]


results = []
control = run(SRC)
print(f"control: {len(control)} red (must be 0)")
for m in spec:
    n = SRC.count(m["original"])
    if n != 1:
        results.append({**m, "verdict": f"apply-failure ({n} occurrences)"})
        print(f"{m['id']}: apply failure ({n})")
        continue
    fails = run(SRC.replace(m["original"], m["mutated"]))
    verdict = "killed" if fails else "survived"
    if not fails:
        verdict = "killed-on-reverify" if run(SRC.replace(m["original"], m["mutated"])) else "survived"
    results.append({**m, "verdict": verdict, "red": fails})
    print(f"{m['id']}: {verdict}  {m['note']}" + (f"  <- {fails[0]}" if fails else ""))
run(SRC)
(HERE / "place.ts").write_text(SRC, encoding="utf-8")
pathlib.Path(sys.argv[2]).write_text(json.dumps({"control_red": len(control), "results": results}, indent=1), encoding="utf-8")
