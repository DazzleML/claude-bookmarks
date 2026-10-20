"""Red-green audit of unit 1 on a scratch copy of the tree (never the live plugin/, which hot-reloads).

For each mutant: fresh copy of plugin/ and tests/core, one behaviour revert with the API kept,
then the new core tests and the kit's guard.test.ts. Prints which tests went red.
"""
import os, re, shutil, subprocess, sys

REPO = r"C:\code\claude-projects\claude-bookmarks"
HERE = os.path.dirname(os.path.abspath(__file__))
COPY = os.path.join(HERE, "tree")
CORE = os.path.join("plugin", "hooks", "core", "bookmarks", "register-file.ts")
HANDLER = os.path.join("plugin", "hooks", "handlers", "bookmarks.ts")

MUTANTS = {
    "M1 keepUnknown no-op": (CORE,
        "  for (const [k, v] of Object.entries(from)) if (!known.includes(k) && v !== undefined) onto[k] = v\n",
        "  void onto; void from; void known\n"),
    "M2 newerThanBuild always false": (CORE,
        "  return reg.version > REGISTER_VERSION\n",
        "  return false && reg.version > REGISTER_VERSION\n"),
    "M3 .bak blind copy": (HANDLER,
        "    if (parseRegister(existing)) await ports.fsWrite(`${path}.bak`, existing)\n    else ports.log(`[bm] register: ${path} does not parse; .bak kept as it was`)\n",
        "    await ports.fsWrite(`${path}.bak`, existing)\n"),
}


def fresh_copy():
    if os.path.isdir(COPY):
        shutil.rmtree(COPY)
    os.makedirs(COPY)
    shutil.copytree(os.path.join(REPO, "plugin"), os.path.join(COPY, "plugin"),
                    ignore=shutil.ignore_patterns("node_modules", ".vscode", "images"))
    os.makedirs(os.path.join(COPY, "tests"))
    shutil.copytree(os.path.join(REPO, "tests", "core"), os.path.join(COPY, "tests", "core"))


def apply(path, old, new):
    p = os.path.join(COPY, path)
    s = open(p, encoding="utf-8").read()
    assert s.count(old) == 1, f"anchor not unique in {path}: {s.count(old)}"
    open(p, "w", encoding="utf-8", newline="\n").write(s.replace(old, new))


def run(cmd, cwd):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, shell=True, encoding="utf-8", errors="replace")
    return r.stdout + r.stderr


def core_results(out):
    # node --test TAP: "not ok N - name" / "ok N - name"
    red = re.findall(r"^not ok \d+ - (.+)$", out, re.M)
    total = re.search(r"^# tests (\d+)", out, re.M)
    return red, total.group(1) if total else "?"


def kit_results(out):
    red = re.findall(r"\(fail\) (.+?) \[", out)
    passed = re.search(r"(\d+) pass", out)
    return red, passed.group(1) if passed else "?"


def main():
    only = sys.argv[1:] or list(MUTANTS)
    for name in only:
        path, old, new = MUTANTS[name]
        fresh_copy()
        apply(path, old, new)
        core = run("node --test tests/core/register-file.test.ts", COPY)
        kit = run("claude plugin test plugin", COPY)
        cr, ct = core_results(core)
        kr, kp = kit_results(kit)
        print(f"== {name}")
        print(f"   core ({ct} tests) red: {cr if cr else 'none'}")
        print(f"   kit ({kp} pass) red: {kr if kr else 'none'}")
    # control: unmutated copy must be green
    fresh_copy()
    cr, ct = core_results(run("node --test tests/core/register-file.test.ts", COPY))
    kr, kp = kit_results(run("claude plugin test plugin", COPY))
    print(f"== control (no mutant): core red {cr or 'none'} of {ct}; kit red {kr or 'none'}, {kp} pass")


if __name__ == "__main__":
    main()
