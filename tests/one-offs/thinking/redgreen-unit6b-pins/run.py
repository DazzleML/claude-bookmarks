"""Red-green audit of unit 6b's core tests (the 0.7 groundwork, 2026-10-26): the prompts list's pins
read from stars (`pinnedOf`) and the v3 read bridge (`starsOf`) in plugin/hooks/handlers/bookmarks.ts,
judged by tests/core/stars.test.ts, on a SCRATCH copy of the handler whose relative imports point
at the live modules (only read). plugin/ is never edited: it hot-reloads into open sessions.

The kit tests (plugin/tests/stars.test.ts) run the live plugin and cannot be audited this way;
they are guards over the wiring (togglePinned's op, the starScope setting), checked live.
"""
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
HANDLERS = REPO / "plugin" / "hooks" / "handlers"

def live(m):
    return f"from '{(HANDLERS / m.group(1)).resolve().as_uri()}'"

HANDLER = re.sub(r"from '(\.\./[^']+)'", live, (HANDLERS / "bookmarks.ts").read_text(encoding="utf-8"))
TEST = (REPO / "tests" / "core" / "stars.test.ts").read_text(encoding="utf-8")
TEST = re.sub(r"'\.\./\.\./plugin/hooks/([^']+)'", lambda m: f"'{(REPO / 'plugin' / 'hooks' / m.group(1)).resolve().as_uri()}'", TEST)
TEST = TEST.replace(f"'{(HANDLERS / 'bookmarks.ts').resolve().as_uri()}'", "'./bookmarks.ts'")

MUTANTS = {
    "none (control: must be green)": [],
    "B1 here shows stars from any list": [("if (scope === 'here' && s.from !== PROMPTS_LIST) continue", "if (false) continue")],
    "B2 an off star still pins": [("if (!isOn(s) || s.owner !== 'user' || s.file !== undefined || s.part !== undefined) continue", "if (s.owner !== 'user' || s.file !== undefined || s.part !== undefined) continue")],
    "B3 Claude's stars pin the person's list": [("if (!isOn(s) || s.owner !== 'user' || s.file !== undefined || s.part !== undefined) continue", "if (!isOn(s) || s.file !== undefined || s.part !== undefined) continue")],
    "B4 a row in another file pins a prompt": [("if (!isOn(s) || s.owner !== 'user' || s.file !== undefined || s.part !== undefined) continue", "if (!isOn(s) || s.owner !== 'user' || s.part !== undefined) continue")],
    "B5 a prompt listed twice": [("    if (!out.includes(s.uuid)) out.push(s.uuid)\n", "    out.push(s.uuid)\n")],
    "B6 no bridge: a v3 file shows its stars key only": [("  if (reg.version >= 4) return reg.stars\n", "  return reg.stars\n")],
    "B7 the bridge always: a v4 file read as v3": [("  if (reg.version >= 4) return reg.stars\n", "")],
}

(HERE / "stars.test.ts").write_text(TEST, encoding="utf-8")
for name, edits in MUTANTS.items():
    text = HANDLER
    for old, new in edits:
        assert text.count(old) == 1, f"{name}: anchor not unique ({text.count(old)}): {old!r}"
        text = text.replace(old, new)
    (HERE / "bookmarks.ts").write_text(text, encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "stars.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    passed = [l for l in out.splitlines() if l.startswith("# pass")]
    print(f"== {name}: {passed[0] if passed else '?'}; {len(fails)} red")
    for l in fails:
        print("   ", l)
# Leave the scratch copy as the real code, never as the last mutant.
(HERE / "bookmarks.ts").write_text(HANDLER, encoding="utf-8")
