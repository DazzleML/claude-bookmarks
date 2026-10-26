"""Red-green audit of 0.7.4's search pane (the search-pane-and-links design, unit U-S):
tests/core/search-pane.test.ts against behaviour-neutralising mutants of core/search/results.ts
and handlers/search.ts, on SCRATCH copies in this folder. The two copies import each other;
every other import points at the live module (only read), and the test uses the same live
places.ts the copy of search.ts uses, so the place reader's pass is one module instance.
plugin/ is never edited: it hot-reloads into open sessions. The copies end as the real code.
"""
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
HOOKS = REPO / "plugin" / "hooks"
SOURCES = {"results.ts": HOOKS / "core" / "search" / "results.ts", "search.ts": HOOKS / "handlers" / "search.ts"}
OWN = {(HOOKS / "core" / "search" / "results.ts").resolve(): "./results.ts", (HOOKS / "handlers" / "search.ts").resolve(): "./search.ts"}


def localised(src):
    text = src.read_text(encoding="utf-8")

    def fix(m):
        target = (src.parent / m.group(1)).resolve()
        return f"from '{OWN.get(target) or target.as_uri()}'"

    return re.sub(r"from '(\.{1,2}/[^']+)'", fix, text)


REAL = {n: localised(p) for n, p in SOURCES.items()}
TEST_SRC = REPO / "tests" / "core" / "search-pane.test.ts"
TEST = localised(TEST_SRC)

MUTANTS = {
    "none (control: must be green)": [],
    "S1 results numbered oldest first": [("results.ts", "if (wa !== wb) return wa < wb ? 1 : -1", "if (wa !== wb) return wa < wb ? -1 : 1"), ("results.ts", "    return b - a\n", "    return a - b\n")],
    "S2 the field ignores #": [("results.ts", "const num = /^#(\\d*)$/.exec(typed.trim())", "const num = null as RegExpExecArray | null")],
    "S3 a toggle never drops everything": [("results.ts", "const rest = on.filter(p => p !== 'everything')", "const rest = [...on]")],
    "S4 the first step lands on the last": [("results.ts", "return !typed || !cur ? 1 :", "return !typed || !cur ? count :")],
    "S5 a search ignores a newer keystroke": [("search.ts", "    const piece = await readPlacesPiece(ports, n)\n    if (gen !== state.gen) return\n", "    const piece = await readPlacesPiece(ports, n)\n"),("search.ts", "      const text = await readPlacesPiece(ports, n)\n      if (gen !== state.gen) return\n", "      const text = await readPlacesPiece(ports, n)\n"), ("search.ts", "  const pinned = await ports.pinned()\n  if (gen !== state.gen) return\n", "  const pinned = await ports.pinned()\n")],
    "S6 a landing never uses the drawn id": [("search.ts", "const drawn = row.message ? undefined : drawnOf(rows, row.i)", "const drawn = undefined as string | undefined")],
    "S7 a message with no query words carries no phrase": [("search.ts", "const words = row.message ? (wordsOf(state.query) ?? head) : drawn !== undefined ? head : undefined", "const words = row.message ? wordsOf(state.query) : drawn !== undefined ? head : undefined")],
    "S7b a drawn row carries no phrase": [("search.ts", "const words = row.message ? (wordsOf(state.query) ?? head) : drawn !== undefined ? head : undefined", "const words = row.message ? (wordsOf(state.query) ?? head) : undefined")],
    "S8 *N always pins on": [("search.ts", "const on = !state.pinned.has(pinPlaceKey(pick.target.place))", "const on = true")],
    "S9 a message keeps its block": [("results.ts", "  if (isMessage(r)) return { uuid: r.at.uuid }\n", "")],
    "S11 the setting's view overrides the person's toggles": [("search.ts", "  if (!state.toggled) state.toggles = viewToggles(view, custom)", "  state.toggles = viewToggles(view, custom)")],
    "S12 a view name opens on everything": [("results.ts", "  return [...(SEARCH_VIEWS[name] ?? ['everything'])]", "  return ['everything']")],
    "S13 the custom view ignores its rows": [("results.ts", "  if (name === CUSTOM_VIEW) {", "  if (name === CUSTOM_VIEW && false) {")],
    "S14 a short label ignores the letters asked for": [("results.ts", "  const n = Math.max(1, Math.floor(letters))", "  const n = 2")],
    "S15 a label is never implied": [("results.ts", "  return mode === 'implied' && toggles.length === 1", "  return false && toggles.length === 1")],
    "S16 a thinking block's label is implied under claude": [("results.ts", "    case 'thinking': return 'thinking'\n    case 'tool-result'", "    case 'thinking': return 'claude'\n    case 'tool-result'")],
    "S10 a tool row keeps its name in the head": [("results.ts", "  return named ? flat.slice(named[0].length) : flat", "  return flat")],
}

(HERE / "search-pane.test.ts").write_text(TEST, encoding="utf-8")
# Every anchor is checked before anything is written, so a stale one stops the run with the
# copies still the real code (a stop mid-run once left the last mutant on disk).
for name, edits in MUTANTS.items():
    for which, old, new in edits:
        assert REAL[which].count(old) == 1, f"{name}: anchor not unique ({REAL[which].count(old)}): {old!r}"
for n, t in REAL.items():
    (HERE / n).write_text(t, encoding="utf-8")
for name, edits in MUTANTS.items():
    texts = dict(REAL)
    for which, old, new in edits:
        texts[which] = texts[which].replace(old, new)
    for n, t in texts.items():
        (HERE / n).write_text(t, encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "search-pane.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=180).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    passed = [l for l in out.splitlines() if l.startswith("# pass")]
    print(f"== {name}: {passed[0] if passed else '?'}; {len(fails)} red")
    for l in fails:
        print("   ", l)
# Leave the scratch copies as the real code, never as the last mutant.
for n, t in REAL.items():
    (HERE / n).write_text(t, encoding="utf-8")
