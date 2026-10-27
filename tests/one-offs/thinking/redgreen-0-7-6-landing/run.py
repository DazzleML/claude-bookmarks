"""Red-green of 0.7.6's landing fallback: tests/core/landing.test.ts against neutralising mutants of
handlers/bookmarks.ts jumpToRecord and core/places/resolve.ts messageOf, on SCRATCH copies in this
folder (plugin/ hot-reloads into djdarcy's sessions and is never edited). Every anchor is checked
before anything is written, and the copies end as the real code."""
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
HOOKS = REPO / "plugin" / "hooks"
FILES = {"bookmarks.ts": HOOKS / "handlers" / "bookmarks.ts", "resolve.ts": HOOKS / "core" / "places" / "resolve.ts"}
TEST_SRC = REPO / "tests" / "core" / "landing.test.ts"


def live(src, text):
    return re.sub(r"from '(\.{1,2}/[^']+)'", lambda m: f"from '{(src.parent / m.group(1)).resolve().as_uri()}'", text)


REAL = {name: live(src, src.read_text(encoding="utf-8")) for name, src in FILES.items()}
TEST = live(TEST_SRC, TEST_SRC.read_text(encoding="utf-8"))
for name, src in FILES.items():
    TEST = TEST.replace(src.resolve().as_uri(), f"./{name}")
MUTANTS = {
    "L1 the drawn id's try is not quiet": ("bookmarks.ts", "ports.jumpTo(record.drawn, via, label, words, true)", "ports.jumpTo(record.drawn, via, label, words, false)"),
    "L2 no fallback past the drawn id": ("bookmarks.ts", "  if (!nothingDrawn(first)) return { deny: first }\n", "  return { deny: first }\n"),
    "L3 no message step after the uuid": ("bookmarks.ts", "if (!nothingDrawn(second) || !before) return { deny: second }", "return { deny: second }"),
    "L4 an agent's row tries its own uuid": ("bookmarks.ts", "  if (record.file === undefined) {\n    ports.log", "  if (true) {\n    ports.log"),
    "L5 the uuid try is loud with a message to follow": ("bookmarks.ts", "words, before !== undefined)", "words, false)"),
    "L6 messageOf drops what the row was": ("resolve.ts", "l.on === 'message' ? { uuid: l.uuid, why: l.why } : { uuid: l.uuid }", "{ uuid: l.uuid }"),
}
for name, (file, old, _new) in MUTANTS.items():
    assert REAL[file].count(old) == 1, f"{name}: stale anchor ({REAL[file].count(old)}): {old!r}"
assert TEST.count("./bookmarks.ts") == 1 and TEST.count("./resolve.ts") == 1, "test imports not redirected"
(HERE / "landing.test.ts").write_text(TEST, encoding="utf-8")
runs = [("control", None)] + [(n, m) for n, m in MUTANTS.items()]
for name, m in runs:
    for f, text in REAL.items():
        (HERE / f).write_text(text if not m or m[0] != f else text.replace(m[1], m[2]), encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "landing.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    print(f"== {name}: {[l for l in out.splitlines() if l.startswith('# pass')]}; {len(fails)} red {[l[7:70] for l in fails]}")
for f, text in REAL.items():
    (HERE / f).write_text(text, encoding="utf-8")
