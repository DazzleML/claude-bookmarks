"""Red-green of the lists core (#45, first slice): tests/core/lists.test.ts against neutralising
mutants of core/lists/lists.ts, on a SCRATCH copy in this folder (plugin/ hot-reloads into
djdarcy's sessions and is never edited). Every anchor is checked before anything is written, and
the copy ends as the real code."""
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
SRC = REPO / "plugin" / "hooks" / "core" / "lists" / "lists.ts"
TEST_SRC = REPO / "tests" / "core" / "lists.test.ts"


def live(src, text):
    return re.sub(r"from '(\.{1,2}/[^']+)'", lambda m: f"from '{(src.parent / m.group(1)).resolve().as_uri()}'", text)


REAL = live(SRC, SRC.read_text(encoding="utf-8"))
TEST = live(TEST_SRC, TEST_SRC.read_text(encoding="utf-8")).replace(SRC.resolve().as_uri(), "./lists.ts")
# The test reads the page's template relative to itself; from this folder that path is wrong, so
# it is pointed at the real plugin folder (added with the template, 2026-10-27).
TEST = TEST.replace("new URL(`../../plugin/", f"new URL(`{(REPO / 'plugin').resolve().as_uri()}/")
assert "new URL(`file:" in TEST, "the template path was not redirected"
MUTANTS = {
    "M1 move ignores the item's place": ("items: [...rest.slice(0, to), item, ...rest.slice(to)]", "items: [...rest, item]"),
    "M2 add always appends": ("const at = op.at === undefined ? list.items.length : clamp(op.at - 1, 0, list.items.length)", "const at = list.items.length"),
    "M3 a duplicate name is accepted": ("    if (f.lists.some(l => l.owner === op.owner && l.name.toLowerCase() === name.toLowerCase())) return", "    if (false) return"),
    "M4 done never unticks": ("const done = op.done ?? !item.done", "const done = op.done ?? true"),
    "M5 an id is reused": ("const item: ListItem = { ...op.item, label, id: `i${list.next}`, addedAt: now }", "const item: ListItem = { ...op.item, label, id: `i${list.items.length + 1}`, addedAt: now }"),
    "M6 a newer file is read": ("  if (f.version > LISTS_VERSION) return { kind: 'newer', version: f.version }\n", ""),
    "M7 delete keeps nothing": ("removed: [...f.removed, { ...list, removedAt: now }]", "removed: f.removed"),
    "M8 a collision gets no hash": ("  if (holder === undefined || sameFolder(holder, cwd)) return base\n", "  return base\n"),
    "M9 share keeps the owner": ("const to: AnchorOwner = list.owner === 'user' ? 'claude' : 'user'", "const to: AnchorOwner = list.owner"),
}
for name, (old, _new) in MUTANTS.items():
    assert REAL.count(old) == 1, f"{name}: stale anchor ({REAL.count(old)}): {old!r}"
(HERE / "lists.test.ts").write_text(TEST, encoding="utf-8")
for name, text in [("control", REAL), *[(n, REAL.replace(o, w)) for n, (o, w) in MUTANTS.items()]]:
    (HERE / "lists.ts").write_text(text, encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "lists.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    print(f"== {name}: {[l for l in out.splitlines() if l.startswith('# pass')]}; {len(fails)} red")
(HERE / "lists.ts").write_text(REAL, encoding="utf-8")
