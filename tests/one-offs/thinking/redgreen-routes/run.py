"""Red-green audit of tests/core/routes.test.ts (input-routing unit 2, 2026-10-25).

Same pattern as ../redgreen-field-input/run.py: a scratch copy of
plugin/hooks/core/band/routes.ts and the test, the test pointed at the scratch module (and at
the live select.ts / settings.ts, which it only reads), one behaviour mutant at a time.
The live plugin/ files are never edited: they hot-reload open Claude Code sessions.
"""
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
HOOKS = REPO / "plugin" / "hooks"
MOD = (HOOKS / "core" / "band" / "routes.ts").read_text(encoding="utf-8")
TEST = (REPO / "tests" / "core" / "routes.test.ts").read_text(encoding="utf-8")

MOD = MOD.replace("from '../../engine/select.ts'", f"from '{(HOOKS / 'engine' / 'select.ts').as_uri()}'")
TEST = (
    TEST.replace("from '../../plugin/hooks/core/band/routes.ts'", "from './routes.ts'")
    .replace("from '../../plugin/hooks/engine/select.ts'", f"from '{(HOOKS / 'engine' / 'select.ts').as_uri()}'")
    .replace("from '../../plugin/hooks/core/settings.ts'", f"from '{(HOOKS / 'core' / 'settings.ts').as_uri()}'")
)

MUTANTS = {
    "none (control: must be green)": [],
    "the pane-holds-keyboard branch removed": [("if (situation.paneHasKeyboard) return", "if (situation.paneHasKeyboard && false) return")],
    "buttons treated as field": [("if (setting === 'buttons') return", "if (setting === 'buttons' && false) return")],
    "the hand-off branch removed": [("if (handoff === 'patched' || handoff === 'ideal') return", "if ((handoff === 'patched' || handoff === 'ideal') && false) return")],
    "auto mapped to buttons": [("if (setting === 'buttons') return", "if (setting === 'buttons' || setting === 'auto') return")],
}

(HERE / "routes.test.ts").write_text(TEST, encoding="utf-8")
for name, edits in MUTANTS.items():
    text = MOD
    for old, new in edits:
        assert text.count(old) == 1, f"{name}: anchor not unique: {old!r}"
        text = text.replace(old, new)
    (HERE / "routes.ts").write_text(text, encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "routes.test.ts")], capture_output=True, text=True, cwd=REPO).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    passed = [l for l in out.splitlines() if l.startswith("# pass")]
    print(f"== {name}: {passed[0] if passed else '?'}; {len(fails)} red")
    for l in fails:
        print("   ", l)
(HERE / "routes.ts").write_text(MOD, encoding="utf-8")
