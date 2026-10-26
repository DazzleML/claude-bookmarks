"""Red-green of the search fold (0.7.4): tests/core/settings-fold.test.ts against a scratch copy of
core/settings-fold.ts whose search rule is removed. The copy's other imports point at the live
modules (read only); plugin/ is never edited. The copy ends as the real code."""
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
SRC = REPO / "plugin" / "hooks" / "core" / "settings-fold.ts"
TEST_SRC = REPO / "tests" / "core" / "settings-fold.test.ts"


def live(src, text):
    return re.sub(r"from '(\.{1,2}/[^']+)'", lambda m: f"from '{(src.parent / m.group(1)).resolve().as_uri()}'", text)


REAL = live(SRC, SRC.read_text(encoding="utf-8"))
TEST = live(TEST_SRC, TEST_SRC.read_text(encoding="utf-8")).replace(SRC.resolve().as_uri(), "./settings-fold.ts")
ANCHOR = "  if (SEARCH_ROWS.has(field)) return !open(values, SEARCH_SHOWN_FIELD)\n"
CUSTOM = "  if (CUSTOM_ROWS.has(field)) return !open(values, SEARCH_SHOWN_FIELD) || values.searchView !== CUSTOM_VIEW\n"
LETTERS = "  if (field === 'searchShortLength') return !open(values, SEARCH_SHOWN_FIELD) || values.searchLabels !== 'short'\n"
for a in (ANCHOR, CUSTOM, LETTERS):
    assert REAL.count(a) == 1, f"stale anchor: {a!r}"
(HERE / "settings-fold.test.ts").write_text(TEST, encoding="utf-8")
for name, text in [
    ("control", REAL),
    ("the search rows not folded", REAL.replace(ANCHOR, "")),
    ("the custom rows shown for every view", REAL.replace(CUSTOM, CUSTOM.replace(" || values.searchView !== CUSTOM_VIEW", ""))),
    ("the letters row shown with words", REAL.replace(LETTERS, LETTERS.replace(" || values.searchLabels !== 'short'", ""))),
]:
    (HERE / "settings-fold.ts").write_text(text, encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "settings-fold.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    print(f"== {name}: {[l for l in out.splitlines() if l.startswith('# pass')]}; {[l for l in out.splitlines() if l.startswith('not ok')]}")
(HERE / "settings-fold.ts").write_text(REAL, encoding="utf-8")
