"""Mutation sweep for unit 6a (the 0.7 groundwork, 2026-10-26): applies each mutant of a spec
(from a fresh-context generator) to SCRATCH copies of stars.ts and migrations.ts, with the same
import rewrites as run.py beside this file, and runs tests/core/stars.test.ts against them.
Every survivor is re-run on its own. plugin/ is never edited.

Usage: python sweep.py <spec.json> <report.json>
"""
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run  # noqa: E402  (run.py builds the scratch texts and the rewritten test at import; its mutant loop also runs once, harmlessly, on scratch)

spec = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
report_path = pathlib.Path(sys.argv[2])


def run_one(m):
    texts = {"stars": run.STARS, "mig": run.MIG}
    which = m["file"]
    n = texts[which].count(m["original"])
    if n != 1:
        return {"id": m["id"], "verdict": "harness-error", "why": f"original occurs {n} times"}
    texts[which] = texts[which].replace(m["original"], m["mutated"])
    (HERE / "stars.ts").write_text(texts["stars"], encoding="utf-8")
    (HERE / "migrations.ts").write_text(texts["mig"], encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "stars.test.ts")], capture_output=True, text=True, cwd=run.REPO, timeout=120).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    return {"id": m["id"], "verdict": "killed" if fails else "survived", "red": fails}


results = []
for m in spec["mutations"]:
    r = run_one(m)
    if r["verdict"] == "survived":
        again = run_one(m)
        if again["verdict"] != "survived":
            r = {**again, "verdict": "killed-on-reverify"}
    results.append({**r, "note": m.get("note", ""), "original": m["original"], "mutated": m["mutated"], "file": m["file"]})
    print(f"{m['id']}: {r['verdict']}  -- {m.get('note', '')}")
# Control, and leave the scratch copies as the real code.
(HERE / "stars.ts").write_text(run.STARS, encoding="utf-8")
(HERE / "migrations.ts").write_text(run.MIG, encoding="utf-8")
ctl = subprocess.run(["node", "--test", str(HERE / "stars.test.ts")], capture_output=True, text=True, cwd=run.REPO, timeout=120).stdout
control = "green" if not [l for l in ctl.splitlines() if l.startswith("not ok")] else "RED"
print(f"control: {control}")
report_path.write_text(json.dumps({"control": control, "results": results}, indent=2), encoding="utf-8")
