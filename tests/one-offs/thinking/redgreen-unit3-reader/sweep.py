"""Diff-scoped mutation sweep for unit 3 of the 0.7 groundwork (2026-10-25): the mutants in a spec
JSON (each naming reader.ts or places.ts) applied one at a time to SCRATCH copies, with the same
import rewrites as run.py; the test run with `node --test`; every survivor re-run alone. plugin/
is never edited (it hot-reloads into open Claude Code sessions).

Usage: python sweep.py <spec.json> <report.json>
"""
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
REPO = HERE.parents[3]
HOOKS = REPO / "plugin" / "hooks"
uri = lambda *p: HOOKS.joinpath(*p).as_uri()

READER = (HOOKS / "core" / "places" / "reader.ts").read_text(encoding="utf-8")
READER = READER.replace("from './place.ts'", f"from '{uri('core', 'places', 'place.ts')}'").replace("from '../prompts/text-store.ts'", f"from '{uri('core', 'prompts', 'text-store.ts')}'")
PASS = (HOOKS / "handlers" / "places.ts").read_text(encoding="utf-8")
PASS = (PASS.replace("from '../core/places/reader.ts'", "from './reader.ts'")
        .replace("from '../core/places/place.ts'", f"from '{uri('core', 'places', 'place.ts')}'")
        .replace("from '../core/prompts/text-store.ts'", f"from '{uri('core', 'prompts', 'text-store.ts')}'")
        .replace("from '../engine/ports.ts'", f"from '{uri('engine', 'ports.ts')}'"))
TEST = (REPO / "tests" / "core" / "places-reader.test.ts").read_text(encoding="utf-8")
TEST = (TEST.replace("'../../plugin/hooks/core/places/reader.ts'", "'./reader.ts'")
        .replace("'../../plugin/hooks/handlers/places.ts'", "'./places.ts'")
        .replace("'../../plugin/hooks/engine/ports.ts'", f"'{uri('engine', 'ports.ts')}'"))
WHICH = {"plugin/hooks/core/places/reader.ts": "reader", "plugin/hooks/handlers/places.ts": "pass"}
spec = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["mutations"]
(HERE / "places-reader.test.ts").write_text(TEST, encoding="utf-8")


def run(reader, pas):
    (HERE / "reader.ts").write_text(reader, encoding="utf-8")
    (HERE / "places.ts").write_text(pas, encoding="utf-8")
    try:
        out = subprocess.run(["node", "--test", str(HERE / "places-reader.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    except subprocess.TimeoutExpired:
        return ["TIMEOUT (a hang: investigate as a possible escape)"]
    return [l for l in out.splitlines() if l.startswith("not ok")]


results = []
control = run(READER, PASS)
print(f"control: {len(control)} red (must be 0)")
for m in spec:
    which = WHICH.get(m["file"])
    src = READER if which == "reader" else PASS
    n = src.count(m["original"]) if which else 0
    if n != 1:
        results.append({**m, "verdict": f"apply-failure ({n} occurrences)"})
        print(f"{m['id']}: apply failure ({n}) {m['original'][:60]!r}")
        continue
    mutated = src.replace(m["original"], m["mutated"])
    args = (mutated, PASS) if which == "reader" else (READER, mutated)
    fails = run(*args)
    verdict = "killed" if fails else ("killed-on-reverify" if run(*args) else "survived")
    results.append({**m, "verdict": verdict, "red": fails})
    print(f"{m['id']}: {verdict}  {m['note']}" + (f"  <- {fails[0]}" if fails else ""))
run(READER, PASS)
pathlib.Path(sys.argv[2]).write_text(json.dumps({"control_red": len(control), "results": results}, indent=1), encoding="utf-8")
