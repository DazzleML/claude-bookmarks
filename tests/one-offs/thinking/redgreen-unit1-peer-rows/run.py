"""Red-green audit of unit 1's tests (the 0.7 groundwork, 2026-10-25).

The tests in tests/core/prompt-rows.test.ts that pin the two guards keeping another
session's or an agent's message out of the prompts list:
  T1 "another session's or an agent's message, as the transcript stores it, is not a prompt"
  T2 "the flag and the text each keep such a message out on their own"
Each guard is reverted on a scratch copy of plugin/hooks/core/prompts/prompt-rows.ts (its own
import pointed at the live transcript-lines.ts, which it only reads); the test file is copied
with its import pointed at the scratch module. plugin/ is never edited: it hot-reloads into
open Claude Code sessions. The copies are rewritten every run.
"""
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
HOOKS = REPO / "plugin" / "hooks"
MOD = (HOOKS / "core" / "prompts" / "prompt-rows.ts").read_text(encoding="utf-8")
TEST = (REPO / "tests" / "core" / "prompt-rows.test.ts").read_text(encoding="utf-8")

MOD = MOD.replace("from '../bookmarks/transcript-lines.ts'", f"from '{(HOOKS / 'core' / 'bookmarks' / 'transcript-lines.ts').as_uri()}'")
TEST = TEST.replace("from '../../plugin/hooks/core/prompts/prompt-rows.ts'", "from './prompt-rows.ts'")

FLAG = ("if (o?.type !== 'user' || o.isMeta || o.isSidechain", "if (o?.type !== 'user' || o.isSidechain")
TEXT = ("|Another Claude session sent a message|", "|")
MUTANTS = {
    "none (control: must be green)": [],
    "1: the isMeta guard removed": [FLAG],
    "2: the text guard removed": [TEXT],
    "3: both removed": [FLAG, TEXT],
}
T1 = "another session's or an agent's message, as the transcript stores it, is not a prompt"
T2 = "the flag and the text each keep such a message out on their own"

(HERE / "prompt-rows.test.ts").write_text(TEST, encoding="utf-8")
for name, edits in MUTANTS.items():
    text = MOD
    for old, new in edits:
        # The isMeta line occurs twice: promptTextOf (line 60, the guard under audit) and
        # footnoteOf (line 129). Only the first is mutated.
        assert text.count(old) >= 1, f"{name}: anchor missing: {old!r}"
        text = text.replace(old, new, 1)
    (HERE / "prompt-rows.ts").write_text(text, encoding="utf-8")
    r = subprocess.run(["node", "--test", "--test-name-pattern", "another session|the flag and the text", str(HERE / "prompt-rows.test.ts")],
                       capture_output=True, text=True, cwd=REPO)
    out = r.stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    msgs = [l.strip() for l in out.splitlines() if l.strip().startswith("message:") or "guard" in l and "'" in l]
    passed = [l for l in out.splitlines() if l.startswith("# pass")]
    print(f"== {name}: {passed[0] if passed else '?'}; {len(fails)} red")
    for l in fails:
        print("   ", l)
    for l in [l for l in out.splitlines() if "text guard" in l or "flag guard" in l or "a cross-session message" in l or "an agent hand-back" in l][:6]:
        print("      ", l.strip())
(HERE / "prompt-rows.ts").write_text(MOD, encoding="utf-8")
