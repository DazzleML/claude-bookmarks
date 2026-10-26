"""Red-green audit of unit 6a's tests (the 0.7 groundwork, 2026-10-26): tests/core/stars.test.ts
against behaviour-neutralising mutants of plugin/hooks/core/bookmarks/stars.ts and the v3-to-v4
step in plugin/hooks/core/bookmarks/migrations.ts, on scratch copies.

The scratch stars.ts and migrations.ts import the live modules (only read); the test imports the
scratch copies for stars.ts and migrations.ts and the live register-file.ts and register-ops.ts
(whose union and star op therefore use the LIVE stars.ts: mutants of unionStars are judged by the
test's direct unionStars cases only). plugin/ is never edited: it hot-reloads into open sessions.
"""
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
BM = REPO / "plugin" / "hooks" / "core" / "bookmarks"
uri = lambda *p: BM.joinpath(*p).as_uri()

STARS = (BM / "stars.ts").read_text(encoding="utf-8").replace("from './anchor.ts'", f"from '{uri('anchor.ts')}'")
MIG = (BM / "migrations.ts").read_text(encoding="utf-8")
for mod in ["../kit/paths.ts", "./register-file.ts", "./register-ops.ts", "./anchor.ts", "./stars.ts"]:
    target = (BM / mod).resolve().as_uri()
    MIG = MIG.replace(f"from '{mod}'", f"from '{target}'")
TEST = (REPO / "tests" / "core" / "stars.test.ts").read_text(encoding="utf-8")
TEST = (TEST.replace("'../../plugin/hooks/core/bookmarks/stars.ts'", "'./stars.ts'")
        .replace("'../../plugin/hooks/core/bookmarks/migrations.ts'", "'./migrations.ts'")
        .replace("'../../plugin/hooks/core/bookmarks/register-file.ts'", f"'{uri('register-file.ts')}'")
        .replace("'../../plugin/hooks/core/bookmarks/register-ops.ts'", f"'{uri('register-ops.ts')}'")
        .replace("'../../plugin/hooks/handlers/bookmarks.ts'", f"'{(REPO / 'plugin' / 'hooks' / 'handlers' / 'bookmarks.ts').as_uri()}'"))

MUTANTS = {
    "none (control: must be green)": [],
    "S1 here shows every list's stars": [("stars", "(scope === 'everywhere' || s.from === from))\n}", "(scope === 'everywhere' || true))\n}")],
    "S2 another owner's star shows": [("stars", "isOn(s) && s.owner === owner && starPlaceKey(s) === at &&", "isOn(s) && starPlaceKey(s) === at &&")],
    "S3 off does not stamp": [("stars", "    list[i] = { ...s, off: now }\n", "")],
    # Re-anchored 2026-10-26 (6b): starring again now moves the star to the end instead of replacing it in place.
    "S4 on again keeps the old star": [("stars", "    if (i >= 0) list.splice(i, 1)\n", "")],
    "S5 off everywhere only this list's": [("stars", "    if (scope === 'here' && s.from !== from) continue\n", "    if (s.from !== from) continue\n")],
    "S6 the earlier touch wins": [("stars", "if (lastTouch(s) > lastTouch(out[i]!))", "if (lastTouch(s) < lastTouch(out[i]!))")],
    "S7 a stamp is not a touch": [("stars", "const lastTouch = (s: Star): number => Math.max(s.at, s.off ?? -Infinity)", "const lastTouch = (s: Star): number => s.at")],
    "S8 the part ignored": [("stars", "`${p.file ?? ''}|${p.uuid}|${p.part ?? 0}`", "`${p.file ?? ''}|${p.uuid}`")],
    "S9 a malformed star kept": [("stars", "return typeof s.uuid === 'string' && typeof s.owner === 'string'", "return true || typeof s.uuid === 'string' && typeof s.owner === 'string'")],
    "M1 the pins kept": [("mig", "return { ...rest, version: 4,", "return { ...reg, version: 4,")],
    "M2 pins become search stars": [("mig", "stars.push({ uuid, owner, from: 'prompts', at: reg.updatedAt })", "stars.push({ uuid, owner, from: 'search', at: reg.updatedAt })")],
    "M3 a pin already a star doubled": [("mig", "        if (stars.some(s => s.owner === owner && s.from === 'prompts' && s.uuid === uuid && s.file === undefined && s.part === undefined)) continue\n", "")],
    "M4 junk in the pins taken": [("mig", "        if (typeof uuid !== 'string') continue\n", "")],
    # Inverted 2026-10-26 (6b): the step is registered now, so the mutant leaves it out.
    "M5 the step not registered": [("mig", "export const MIGRATIONS: readonly Migration[] = [v1to2, v2to3, v3to4]", "export const MIGRATIONS: readonly Migration[] = [v1to2, v2to3]")],
}

(HERE / "stars.test.ts").write_text(TEST, encoding="utf-8")
for name, edits in (MUTANTS.items() if __name__ == "__main__" else []):
    texts = {"stars": STARS, "mig": MIG}
    for which, old, new in edits:
        assert texts[which].count(old) == 1, f"{name}: anchor not unique ({texts[which].count(old)}): {old!r}"
        texts[which] = texts[which].replace(old, new)
    (HERE / "stars.ts").write_text(texts["stars"], encoding="utf-8")
    (HERE / "migrations.ts").write_text(texts["mig"], encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "stars.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    passed = [l for l in out.splitlines() if l.startswith("# pass")]
    print(f"== {name}: {passed[0] if passed else '?'}; {len(fails)} red")
    for l in fails:
        print("   ", l)
# Leave the scratch copies as the real code, never as the last mutant.
(HERE / "stars.ts").write_text(STARS, encoding="utf-8")
(HERE / "migrations.ts").write_text(MIG, encoding="utf-8")
