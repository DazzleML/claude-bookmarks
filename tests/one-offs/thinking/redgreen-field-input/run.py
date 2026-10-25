"""Red-green audit of tests/core/field-input.test.ts (input-routing unit 1, 2026-10-25).

Copies plugin/hooks/core/band/field-input.ts and the test into this folder, points their
imports at the scratch module (the module's own imports at the live core files, which it
only reads), applies one behaviour mutant at a time, and runs node --test on the scratch
test. The live plugin/ file is never edited: it hot-reloads open Claude Code sessions.
"""
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
CORE = REPO / "plugin" / "hooks" / "core" / "band"
MOD = (CORE / "field-input.ts").read_text(encoding="utf-8")
TEST = (REPO / "tests" / "core" / "field-input.test.ts").read_text(encoding="utf-8")

core_url = CORE.as_uri()  # file:///C:/... -- node's ESM loader refuses a bare drive path
MOD = MOD.replace("from './band-entry.ts'", f"from '{core_url}/band-entry.ts'").replace("from './keys.ts'", f"from '{core_url}/keys.ts'")
TEST = TEST.replace("from '../../plugin/hooks/core/band/field-input.ts'", "from './field-input.ts'").replace("from '../../plugin/hooks/core/band/keys.ts'", f"from '{core_url}/keys.ts'")

MUTANTS = {
    "none (control: must be green)": [],
    "close never fires": [("=== 'close') return { op: 'close' }", "=== 'close' && false) return { op: 'close' }")],
    "filter always ''": [("const filter = fieldRest(typed, 'list', 'filter', tables) ?? ''", "const filter = ''")],
    "remove never fires": [("=== 'remove') return { op: 'remove'", "=== 'remove' && false) return { op: 'remove'")],
    "bookmarks take the prompts path": [("if (list === 'bookmarks') {", "if (list === 'bookmarks' && false) {")],
}

(HERE / "field-input.test.ts").write_text(TEST, encoding="utf-8")
for name, edits in MUTANTS.items():
    text = MOD
    for old, new in edits:
        assert text.count(old) == 1, f"{name}: anchor not unique: {old!r}"
        text = text.replace(old, new)
    (HERE / "field-input.ts").write_text(text, encoding="utf-8")
    r = subprocess.run(["node", "--test", str(HERE / "field-input.test.ts")], capture_output=True, text=True, cwd=REPO)
    out = r.stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    passed = [l for l in out.splitlines() if l.startswith("# pass")]
    print(f"== {name}: {passed[0] if passed else '?'}; {len(fails)} red")
    for l in fails:
        print("   ", l)
(HERE / "field-input.ts").write_text(MOD, encoding="utf-8")
