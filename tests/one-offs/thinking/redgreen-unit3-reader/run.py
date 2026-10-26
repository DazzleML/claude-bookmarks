"""Red-green audit of unit 3's tests (the 0.7 groundwork, 2026-10-25): tests/core/places-reader.test.ts
against behaviour-neutralising mutants of plugin/hooks/core/places/reader.ts and
plugin/hooks/handlers/places.ts, on scratch copies.

The scratch reader.ts imports the live place.ts and text-store.ts (only read); the scratch
places.ts imports the scratch reader.ts and the live others; the test imports the scratch
copies. plugin/ is never edited: it hot-reloads into open Claude Code sessions.
"""
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
HOOKS = REPO / "plugin" / "hooks"
uri = lambda *p: HOOKS.joinpath(*p).as_uri()

READER = (HOOKS / "core" / "places" / "reader.ts").read_text(encoding="utf-8")
READER = READER.replace("from './place.ts'", f"from '{uri('core', 'places', 'place.ts')}'").replace("from '../prompts/text-store.ts'", f"from '{uri('core', 'prompts', 'text-store.ts')}'")
PASS = (HOOKS / "handlers" / "places.ts").read_text(encoding="utf-8")
PASS = (PASS.replace("from '../core/places/reader.ts'", "from './reader.ts'")
        .replace("from '../core/places/place.ts'", f"from '{uri('core', 'places', 'place.ts')}'")
        .replace("from '../core/prompts/text-store.ts'", f"from '{uri('core', 'prompts', 'text-store.ts')}'")
        .replace("from '../engine/ports.ts'", f"from '{uri('engine', 'ports.ts')}'"))
TEST = (REPO / "tests" / "core" / "places-reader.test.ts").read_text(encoding="utf-8")
TEST = (TEST.replace("'../../plugin/hooks/core/places/reader.ts'", "'./reader.ts'")
        .replace("'../../plugin/hooks/handlers/places.ts'", "'./places.ts'")
        .replace("'../../plugin/hooks/engine/ports.ts'", f"'{uri('engine', 'ports.ts')}'"))

MUTANTS = {
    "none (control: must be green)": [],
    "R1 the carry dropped": [("reader", "    cur.carry = last\n", "    cur.carry = ''\n")],
    "R2 the watermark not counting newlines": [("reader", "cur.bytes += utf8Bytes(raw) + (newline ? 1 : 0)", "cur.bytes += utf8Bytes(raw)")],
    "R3 no dedupe in addPlace": [("reader", "if (idx.byKey.has(key)) return false", "if (false) return false")],
    "R4 no seal at the piece size": [("reader", "if (idx.open.bytes > 0 && idx.open.bytes + size > PIECE_BYTES) seal(idx)", "if (false) seal(idx)")],
    "R5 takeSealed not clearing": [("reader", "  idx.sealed = []\n  return out", "  return out")],
    "R6 continued-in ignored": [("reader", "if (!idx.continuedIn.includes(o.continuedInSessionId)) idx.continuedIn.push", "if (false) idx.continuedIn.push")],
    "R7a an agent's meta file taken for its transcript": [("reader", "e.kind === 'file' && /^agent-[^/]+\\.jsonl$/.test(e.name)", "e.kind === 'file' && e.name.startsWith('agent-')")],
    "R7b a directory among the stored outputs": [("reader", "    .filter(e => e.kind === 'file')\n    .map(e => ({ name", "    .filter(e => true)\n    .map(e => ({ name")],
    "P1 never resume": [("pass", "if (usable && read.kind === 'ok') {", "if (false) {")],
    "P2 the shorter-file check removed": [("pass", "if (size === undefined || size < saved.bytes) { usable = false; break }", "if (size === undefined) { usable = false; break }")],
    "P3 agents' files not read": [("pass", "for (const a of agents) {", "for (const a of agents.slice(0, 0)) {")],
    "P4 stored outputs skipped": [("pass", "    for (const r of p.results) {", "    for (const r of p.results.slice(0, 0)) {")],
    "P5 finishedAt not set": [("pass", "    p.finishedAt = Date.now()\n", "")],
    # Re-anchored 2026-10-26: unit 5 replaced agentTypeOf with agentMetaOf (the type and the starting call).
    "P6 the agent's meta not read": [("pass", "const meta = agentMetaOf(await readIfExists(ports, a.meta))", "const meta = agentMetaOf(undefined)")],
    # 2026-10-26, the head built from a prefix (the memory fix, measure_places_memory.ts):
    "H1 the prefix never grown": [("reader", "if (h.length >= HEAD_CHARS || n >= text.length) return", "if (true) return")],
    "H2 the head's whitespace not trimmed": [("reader", "const h = text.slice(0, n).replace(/\\s+/g, ' ').trim()", "const h = text.slice(0, n).replace(/\\s+/g, ' ')")],
}

(HERE / "places-reader.test.ts").write_text(TEST, encoding="utf-8")
for name, edits in MUTANTS.items():
    texts = {"reader": READER, "pass": PASS}
    for which, old, new in edits:
        assert texts[which].count(old) == 1, f"{name}: anchor not unique ({texts[which].count(old)}): {old!r}"
        texts[which] = texts[which].replace(old, new)
    (HERE / "reader.ts").write_text(texts["reader"], encoding="utf-8")
    (HERE / "places.ts").write_text(texts["pass"], encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "places-reader.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    passed = [l for l in out.splitlines() if l.startswith("# pass")]
    print(f"== {name}: {passed[0] if passed else '?'}; {len(fails)} red")
    for l in fails:
        print("   ", l)
(HERE / "reader.ts").write_text(READER, encoding="utf-8")
(HERE / "places.ts").write_text(PASS, encoding="utf-8")
