"""Red-green audit of unit P1's new code (the pins-by-name design, 2026-10-26): the version-aware
serialize/parse that tells the pins' shapes apart (register-file.ts) and the v4to5 step
(migrations.ts), judged by tests/core/pins.test.ts, on scratch copies that import the live
modules (only read). plugin/ is never edited: it hot-reloads into open sessions.
"""
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
BM = REPO / "plugin" / "hooks" / "core" / "bookmarks"
uri = lambda *p: BM.joinpath(*p).as_uri()

RF = (BM / "register-file.ts").read_text(encoding="utf-8")
RF = (RF.replace("from './anchor.ts'", f"from '{uri('anchor.ts')}'")
      .replace("from '../kit/message-id.ts'", f"from '{(BM.parent / 'kit' / 'message-id.ts').as_uri()}'")
      .replace("from './note.ts'", f"from '{uri('note.ts')}'")
      .replace("from './pins.ts'", f"from '{uri('pins.ts')}'"))
MIG = (BM / "migrations.ts").read_text(encoding="utf-8")
for mod, tgt in [("../kit/paths.ts", (BM.parent / 'kit' / 'paths.ts')), ("./register-file.ts", HERE / "register-file.ts"),
                 ("./register-ops.ts", BM / "register-ops.ts"), ("./anchor.ts", BM / "anchor.ts"), ("./pins.ts", BM / "pins.ts")]:
    MIG = MIG.replace(f"from '{mod}'", f"from '{pathlib.Path(tgt).as_uri()}'")
TEST = (REPO / "tests" / "core" / "pins.test.ts").read_text(encoding="utf-8")
TEST = (TEST.replace("'../../plugin/hooks/core/bookmarks/register-file.ts'", "'./register-file.ts'")
        .replace("'../../plugin/hooks/core/bookmarks/migrations.ts'", "'./migrations.ts'")
        .replace("'../../plugin/hooks/core/bookmarks/pins.ts'", f"'{uri('pins.ts')}'")
        .replace("'../../plugin/hooks/core/bookmarks/register-ops.ts'", f"'{uri('register-ops.ts')}'")
        .replace("'../../plugin/hooks/handlers/bookmarks.ts'", f"'{(BM.parent.parent / 'handlers' / 'bookmarks.ts').as_uri()}'"))

MUTANTS = {
    "none (control: must be green)": [],
    "F1 v4 writes the list under pins, not stars": [("rf", "if (key === 'stars') return reg.version === 4 ? reg.pins : undefined", "if (key === 'stars') return undefined")],
    "F2 v5 does not write the list": [("rf", "return reg.version >= 5 ? reg.pins : reg.version >= 4 ? undefined : reg.pinsV3", "return reg.version >= 4 ? undefined : reg.pinsV3")],
    "F3 a pins object read as the list": [("rf", "...(o.pins && typeof o.pins === 'object' && !Array.isArray(o.pins) ? { pinsV3: o.pins } : {}),", "")],
    "F4 a pins array ignored, only stars": [("rf", "...(Array.isArray(o.pins) ? { pins: o.pins.filter(isPin) } : Array.isArray(o.stars) ? { pins: o.stars.filter(isPin) } : {}),", "...(Array.isArray(o.stars) ? { pins: o.stars.filter(isPin) } : {}),")],
    "M5 v4to5 does not change the version": [("mig", "    return { ...reg, version: 5 }", "    return { ...reg }")],
}

(HERE / "pins.test.ts").write_text(TEST, encoding="utf-8")
for name, edits in MUTANTS.items():
    texts = {"rf": RF, "mig": MIG}
    for which, old, new in edits:
        assert texts[which].count(old) == 1, f"{name}: anchor not unique ({texts[which].count(old)}): {old!r}"
        texts[which] = texts[which].replace(old, new)
    (HERE / "register-file.ts").write_text(texts["rf"], encoding="utf-8")
    (HERE / "migrations.ts").write_text(texts["mig"], encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "pins.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    passed = [l for l in out.splitlines() if l.startswith("# pass")]
    print(f"== {name}: {passed[0] if passed else '?'}; {len(fails)} red")
    for l in fails[:3]:
        print("   ", l)
# Leave the scratch copies as the real code.
(HERE / "register-file.ts").write_text(RF, encoding="utf-8")
(HERE / "migrations.ts").write_text(MIG, encoding="utf-8")
