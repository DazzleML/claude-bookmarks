"""Red-green audit of unit 5's tests (the 0.7 groundwork, 2026-10-25): tests/core/landing.test.ts
against behaviour mutants of plugin/hooks/core/places/landing.ts, and tests/core/places.test.ts
against two mutants of place.ts's stored-output field, on scratch copies. plugin/ is never edited.
"""
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
HOOKS = REPO / "plugin" / "hooks"
uri = lambda *p: HOOKS.joinpath(*p).as_uri()

LANDING = (HOOKS / "core" / "places" / "landing.ts").read_text(encoding="utf-8").replace("from './reader.ts'", f"from '{uri('core', 'places', 'reader.ts')}'")
LTEST = (REPO / "tests" / "core" / "landing.test.ts").read_text(encoding="utf-8")
LTEST = (LTEST.replace("'../../plugin/hooks/core/places/landing.ts'", "'./landing.ts'")
         .replace("'../../plugin/hooks/core/places/reader.ts'", f"'{uri('core', 'places', 'reader.ts')}'")
         .replace("'../../plugin/hooks/core/places/place.ts'", f"'{uri('core', 'places', 'place.ts')}'")
         .replace("'../../plugin/hooks/engine/select.ts'", f"'{uri('engine', 'select.ts')}'"))
PLACE = (HOOKS / "core" / "places" / "place.ts").read_text(encoding="utf-8").replace("from '../prompts/prompt-rows.ts'", f"from '{uri('core', 'prompts', 'prompt-rows.ts')}'")
PTEST = (REPO / "tests" / "core" / "places.test.ts").read_text(encoding="utf-8").replace("'../../plugin/hooks/core/places/place.ts'", "'./place.ts'")

SETS = {
    "landing": ("landing.ts", LANDING, "landing.test.ts", LTEST, {
        "L1 a message not landed on itself": ("  if (isMessage(target)) return { on: 'row', uuid: target.at.uuid }", "  if (false) return { on: 'row', uuid: target.at.uuid }"),
        "L2 the toolRow route ignored": ("    if (routes.toolRow) return", "    if (false) return"),
        "L3 messageBefore searching forward": ("  for (let j = i; j >= 0; j--) {", "  for (let j = i; j < rows.length; j++) {"),
        "L4 the agent's call lookup removed": ("    const call = agent?.call ? rows.findIndex(", "    const call = false ? rows.findIndex("),
        "L5 the agentRow route ignored": ("    if (routes.agentRow) return", "    if (false) return"),
        "L6 the report fallback removed": ("    if (report >= 0) return", "    if (false) return"),
        "L7 the stored-output lookup main-only": ("r.kind === 'tool-result' && r.stored === name && !r.at.file?.startsWith('tool-result:')", "isMain(r) && r.kind === 'tool-result' && r.stored === name"),
        # L8 found that a reply in a multi-block record is a message; the fix removed the part
        # condition, so the mutant is now its return.
        "L8 a part row not counted as a message": ("isMain(r) && MESSAGE_KINDS.has(r.kind)", "isMain(r) && MESSAGE_KINDS.has(r.kind) && r.at.part === undefined"),
    }),
    "place": ("place.ts", PLACE, "places.test.ts", PTEST, {
        "P1 the persisted path ignored": ("const path = typeof persisted === 'string' && persisted ? persisted :", "const path = false ? persisted :"),
        "P2 the text fallback ignored": ("/Full output saved to: ([^\\r\\n]+)/.exec(text)?.[1]?.trim()", "undefined"),
    }),
}

for label, (mod_name, src, test_name, test, mutants) in SETS.items():
    (HERE / test_name).write_text(test, encoding="utf-8")
    for name, (old, new) in [("none (control: must be green)", ("", ""))] + list(mutants.items()):
        text = src
        if old:
            assert text.count(old) == 1, f"{name}: anchor not unique ({text.count(old)}): {old!r}"
            text = text.replace(old, new)
        (HERE / mod_name).write_text(text, encoding="utf-8")
        out = subprocess.run(["node", "--test", str(HERE / test_name)], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
        fails = [l for l in out.splitlines() if l.startswith("not ok")]
        passed = [l for l in out.splitlines() if l.startswith("# pass")]
        print(f"== [{label}] {name}: {passed[0] if passed else '?'}; {len(fails)} red")
        for l in fails:
            print("   ", l)
    (HERE / mod_name).write_text(src, encoding="utf-8")
