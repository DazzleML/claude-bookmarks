"""Diff-scoped mutation sweep for unit 1, on scratch copies of the tree (never the live plugin/).

Each mutant gets a FRESH copy of plugin/ and tests/core (so no build or module cache can carry
over between mutants), one text substitution (asserted unique), then the focused suites:
  node --test tests/core/register-file.test.ts
  claude plugin test plugin          (guard.test.ts, tool.test.ts and the rest of the kit)
A mutant is killed when either suite reports a failure. Survivors are re-verified in isolation
(a second fresh copy). The report is JSON.

usage: python sweep.py <spec.json> <report.json>
"""
import json, os, re, shutil, subprocess, sys, tempfile

REPO = r"C:\code\claude-projects\claude-bookmarks"
HERE = os.path.dirname(os.path.abspath(__file__))
# The per-mutant copy lives under the system temp dir, never in the repository tree
# (it was tests/one-offs/tree until 2026-10-20, which left a stray folder after each run).
COPY = os.path.join(tempfile.gettempdir(), "claude-bookmarks-sweep-tree")


def fresh_copy():
    if os.path.isdir(COPY):
        shutil.rmtree(COPY)
    os.makedirs(COPY)
    shutil.copytree(os.path.join(REPO, "plugin"), os.path.join(COPY, "plugin"),
                    ignore=shutil.ignore_patterns("node_modules", ".vscode", "images"))
    os.makedirs(os.path.join(COPY, "tests"))
    shutil.copytree(os.path.join(REPO, "tests", "core"), os.path.join(COPY, "tests", "core"))


def apply(m):
    p = os.path.join(COPY, m["file"].replace("/", os.sep))
    s = open(p, encoding="utf-8").read()
    n = s.count(m["original"])
    if n != 1:
        return f"apply-failed: original occurs {n} times"
    open(p, "w", encoding="utf-8", newline="\n").write(s.replace(m["original"], m["mutated"]))
    return None


def run(cmd):
    r = subprocess.run(cmd, cwd=COPY, capture_output=True, text=True, shell=True, encoding="utf-8", errors="replace")
    return r.stdout + r.stderr


def verdict():
    # The focused core suite: SWEEP_CORE names the test files (space-separated paths under
    # tests/core), else the register-file suite this script was first written for.
    core = run("node --test " + os.environ.get("SWEEP_CORE", "tests/core/register-file.test.ts"))
    core_red = re.findall(r"^not ok \d+ - (.+)$", core, re.M)
    core_total = re.search(r"^# tests (\d+)", core, re.M)
    if not core_total:
        return "harness-error", {"core": core[-800:]}
    kit = run("claude plugin test plugin")
    kit_red = re.findall(r"\(fail\) (.+?) \[", kit)
    kit_pass = re.search(r"(\d+) pass", kit)
    if not kit_pass:
        return "harness-error", {"kit": kit[-800:]}
    killed_by = core_red + kit_red
    return ("killed" if killed_by else "survived"), {"core_red": core_red, "kit_red": kit_red, "kit_pass": kit_pass.group(1)}


def main():
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    out = []
    for m in spec["mutations"]:
        fresh_copy()
        err = apply(m)
        if err:
            out.append({**m, "verdict": err})
            print(m["id"], err)
            continue
        v, detail = verdict()
        row = {**m, "verdict": v, **detail}
        if v == "survived":
            fresh_copy()
            apply(m)
            v2, d2 = verdict()
            if v2 != "survived":
                row["verdict"] = "killed-on-reverify"
                row["reverify"] = d2
        out.append(row)
        print(m["id"], row["verdict"], (detail.get("core_red") or []) + (detail.get("kit_red") or []))
    fresh_copy()
    v, detail = verdict()
    out.append({"id": "control", "verdict": v, **detail})
    print("control", v, detail)
    json.dump({"mutations": out}, open(sys.argv[2], "w", encoding="utf-8"), indent=2)


if __name__ == "__main__":
    main()
