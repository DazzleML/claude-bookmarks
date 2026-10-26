"""Red-green audit of unit 2's tests (the 0.7 groundwork, 2026-10-25): tests/core/places.test.ts
against behaviour-neutralising mutants of plugin/hooks/core/places/place.ts, on a scratch copy.

The module's import of ../prompts/prompt-rows.ts is pointed at the live file (only read); the test
is copied with its import pointed at the scratch module. plugin/ is never edited: it hot-reloads
into open Claude Code sessions. The copies are rewritten every run.
"""
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
HOOKS = REPO / "plugin" / "hooks"
MOD = (HOOKS / "core" / "places" / "place.ts").read_text(encoding="utf-8")
TEST = (REPO / "tests" / "core" / "places.test.ts").read_text(encoding="utf-8")

MOD = MOD.replace("from '../prompts/prompt-rows.ts'", f"from '{(HOOKS / 'core' / 'prompts' / 'prompt-rows.ts').as_uri()}'")
TEST = TEST.replace("from '../../plugin/hooks/core/places/place.ts'", "from './place.ts'")

MUTANTS = {
    "none (control: must be green)": [],
    "1: part never set": [("at(found.length > 1 ? i : undefined)", "at(undefined)")],
    "2: the peer branch removed": [("if (o.origin?.kind === 'peer') {", "if (false) {")],
    "3: the file not put in the address": [("...(ctx.file ? { file: ctx.file } : {})", "...({})")],
    "4: empty thinking kept": [("if (String(b.thinking ?? '').trim() !== '') found.push", "found.push")],
    "5: an unknown block dropped": [("} else if (b?.type !== 'redacted_thinking') found.push({ kind: 'other', author, text: textOf([b]) })", "}")],
    "6: the command-output branch removed": [("if (output) return one(", "if (false) return one(")],
    "7: mcp tools not recognised": [("if (tool.startsWith('mcp__')) return 'mcp'", "")],
    "8: samePlace ignores the file": [("&& (a.file ?? '') === (b.file ?? '') ", "")],
}

(HERE / "places.test.ts").write_text(TEST, encoding="utf-8")
for name, edits in MUTANTS.items():
    text = MOD
    for old, new in edits:
        assert text.count(old) == 1, f"{name}: anchor not unique ({text.count(old)}): {old!r}"
        text = text.replace(old, new)
    (HERE / "place.ts").write_text(text, encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "places.test.ts")], capture_output=True, text=True, cwd=REPO).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    passed = [l for l in out.splitlines() if l.startswith("# pass")]
    print(f"== {name}: {passed[0] if passed else '?'}; {len(fails)} red")
    for l in fails:
        print("   ", l)
(HERE / "place.ts").write_text(MOD, encoding="utf-8")
