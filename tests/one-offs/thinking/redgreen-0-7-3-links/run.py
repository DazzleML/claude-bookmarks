"""Red-green audit of 0.7.3's records keyed by place (the search-pane-and-links design, unit U-L):
tests/core/record-places.test.ts against behaviour-neutralising mutants of anchor.ts,
register-file.ts and register-ops.ts, on SCRATCH copies in this folder. The three copies import
each other; every other import points at the live module (only read). plugin/ is never edited:
it hot-reloads into open sessions. The copies are written back as the real code at the end.
"""
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
BM = REPO / "plugin" / "hooks" / "core" / "bookmarks"
COPIED = {"anchor.ts", "register-file.ts", "register-ops.ts"}


def localised(name):
    text = (BM / name).read_text(encoding="utf-8")

    def fix(m):
        spec = m.group(1)
        if spec.startswith("./") and spec[2:] in COPIED:
            return m.group(0)
        return f"from '{(BM / spec).resolve().as_uri()}'"

    return re.sub(r"from '(\.{1,2}/[^']+)'", fix, text)


REAL = {n: localised(n) for n in COPIED}
TEST = (REPO / "tests" / "core" / "record-places.test.ts").read_text(encoding="utf-8")
for n in COPIED:
    TEST = TEST.replace(f"'../../plugin/hooks/core/bookmarks/{n}'", f"'./{n}'")

MUTANTS = {
    "none (control: must be green)": [],
    "R1 addOrRelabel ignores the place": [("register-file.ts", "matchesPrefix(r.uuid, mint.uuid)) && samePlaceOf(r, mint))", "matchesPrefix(r.uuid, mint.uuid)))")],
    "R2 the note name ignores the part": [("anchor.ts", "return place.part !== undefined && place.file === undefined ? `${uuid8(uuid)}.p${place.part}.md` : `${uuid8(uuid)}.md`", "return `${uuid8(uuid)}.md`")],
    "R3 findRecord without the message-first order": [("register-file.ts", ".sort((a, b) => Number(a.part !== undefined || a.file !== undefined) - Number(b.part !== undefined || b.file !== undefined))", "")],
    "R4 recordsOn ignores the place": [("register-file.ts", " && (place === undefined || samePlaceOf(r, place)))", ")")],
    "R5a remove without the record's place": [("register-ops.ts", "op.removedBy, now, placeOfRecord(rec))", "op.removedBy, now)")],
    "R5b share without the record's place": [("register-ops.ts", "return share(reg, rec.uuid, ownerOf(rec), op.to, now, placeOfRecord(rec))", "return share(reg, rec.uuid, ownerOf(rec), op.to, now)")],
    "R5c claim without the record's place": [("register-ops.ts", "return claim(reg, rec.uuid, now, placeOfRecord(rec))", "return claim(reg, rec.uuid, now)")],
    "R6 parseAnchor ignores p": [("anchor.ts", "if (/^\\d+$/.test(v)) blockPart = Number(v)", "")],
    "R7 anchorHref omits f": [("anchor.ts", "if (record.file !== undefined) params.push(`f=${encodeURIComponent(record.file)}`)", "")],
}

(HERE / "record-places.test.ts").write_text(TEST, encoding="utf-8")
for name, edits in MUTANTS.items():
    texts = dict(REAL)
    for which, old, new in edits:
        assert texts[which].count(old) == 1, f"{name}: anchor not unique ({texts[which].count(old)}): {old!r}"
        texts[which] = texts[which].replace(old, new)
    for n, t in texts.items():
        (HERE / n).write_text(t, encoding="utf-8")
    out = subprocess.run(["node", "--test", str(HERE / "record-places.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    fails = [l for l in out.splitlines() if l.startswith("not ok")]
    passed = [l for l in out.splitlines() if l.startswith("# pass")]
    print(f"== {name}: {passed[0] if passed else '?'}; {len(fails)} red")
    for l in fails:
        print("   ", l)
# Leave the scratch copies as the real code, never as the last mutant.
for n, t in REAL.items():
    (HERE / n).write_text(t, encoding="utf-8")
