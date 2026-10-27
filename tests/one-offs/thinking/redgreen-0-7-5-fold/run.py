"""Red-green of 0.7.5's bookmark-call fold: tests/core/tool-fold.test.ts against neutralising
mutants of core/bookmarks/tool-fold.ts, on a SCRATCH copy in this folder (plugin/ hot-reloads into
djdarcy's sessions and is never edited). Every anchor is checked before anything is written, and
the copy ends as the real code."""
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
SRC = REPO / "plugin" / "hooks" / "core" / "bookmarks" / "tool-fold.ts"
TEST_SRC = REPO / "tests" / "core" / "tool-fold.test.ts"


def live(src, text):
    return re.sub(r"from '(\.{1,2}/[^']+)'", lambda m: f"from '{(src.parent / m.group(1)).resolve().as_uri()}'", text)


REAL = live(SRC, SRC.read_text(encoding="utf-8"))
TEST = live(TEST_SRC, TEST_SRC.read_text(encoding="utf-8")).replace(SRC.resolve().as_uri(), "./tool-fold.ts")
MUTANTS = {
    "F1 every call is its turn's first": ("first: this.firstOf.get(turn) === id", "first: true"),
    "F2 a call noted twice counts twice": ("    if (this.turnOf.has(id)) return\n", ""),
    "F3 a result shows with only its call open": ("return place.turn === undefined || this.openTurns.has(place.turn)", "return true"),
    "F4 an ambiguity reads as a plain bookmark": ("  if (r.ambiguous === true) {", "  if (false) {"),
    "F5 the answer inside `result` is not found": ("    if (typeof o.result === 'string') return parse(o.result)\n", ""),
    "F6 a new conversation keeps what was open": ("    this.openCalls.clear()\n  }", "  }"),
}
for name, (old, _new) in MUTANTS.items():
    assert REAL.count(old) == 1, f"{name}: stale anchor ({REAL.count(old)}): {old!r}"
(HERE / "tool-fold.test.ts").write_text(TEST, encoding="utf-8")
for name, text in [("control", REAL), *[(n, REAL.replace(o, w)) for n, (o, w) in MUTANTS.items()]]:
    (HERE / "tool-fold.ts").write_text(text, encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "tool-fold.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    print(f"== {name}: {[l for l in out.splitlines() if l.startswith('# pass')]}; {len(fails)} red")
(HERE / "tool-fold.ts").write_text(REAL, encoding="utf-8")
