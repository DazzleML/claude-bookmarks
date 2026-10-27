"""Run the callback-marker POC (README.md here has the arms and the predictions, written first).

Each arm writes a fixture under out/, runs the real `dz md-unwrap` over it (except the control,
which runs a stripping pass instead), then looks for every marker with one pattern per form.
Prints one row per (arm, form): what was predicted, what was found, and the verdict.

Run from the repo root: python tests/one-offs/thinking/poc-callback-markers/run.py
Writes only under this folder's out/.
"""
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"
SID = "8f0f9b27-33fc-4054-806a-22a6d569dfb5"
UUID = "e92204f6-0000-4000-8000-000000000000"
FORMS = ["F1", "F2", "F3", "F4", "F5"]


def marker(form: str, mid: str, split: bool = False) -> str:
    """The marker for entry `mid` in a form; `split` hard-wraps it inside (arm A5)."""
    br = "\n" if split else ""
    if form == "F1":
        return f"[*](bm:8f0f9b27/e92204f6?list=whats-left{br}&id={mid})"
    if form == "F2":
        return f"[*](file:///C:/Users/x/claude/bookmarks/sessions/{SID}/e92204f6.md?u={UUID}&list=whats-left{br}&id={mid}&v=2)"
    if form == "F3":
        return f"<!-- bm list=whats-left{br or ' '}id={mid} -->"
    if form == "F4":
        return f"^{mid}"
    return f"#list/whats-left/{mid}"


PATTERNS = {
    "F1": re.compile(r"\[[^\]\n]*\]\(bm:[^\s)]*?[?&]list=(?P<list>[\w-]+)&id=(?P<id>[\w-]+)[^\s)]*\)"),
    "F2": re.compile(r"\[[^\]\n]*\]\(file:///[^\s)]*?[?&]list=(?P<list>[\w-]+)&id=(?P<id>[\w-]+)[^\s)]*\)"),
    "F3": re.compile(r"<!--\s*bm\s+list=(?P<list>[\w-]+)\s+id=(?P<id>[\w-]+)\s*-->"),
    # A block id is only a block id at the end of its block (one line, after md-unwrap).
    "F4": re.compile(r"(?<=\s)\^(?P<id>[\w-]+)[ \t]*$", re.M),
    "F5": re.compile(r"(?<!\S)#list/(?P<list>[\w-]+)/(?P<id>[\w-]+)"),
}


def found(text: str) -> set[str]:
    return {m.group("id") for p in PATTERNS.values() for m in p.finditer(text)}


def unwrap(src: pathlib.Path, dst: pathlib.Path) -> None:
    subprocess.run(["dz", "md-unwrap", str(src), str(dst)], check=True, capture_output=True)


def strip_pass(text: str) -> str:
    """The control's transform: drop HTML comments and block ids."""
    text = re.sub(r"[ \t]*<!--.*?-->", "", text, flags=re.S)
    return re.sub(r"[ \t]+\^[\w-]+[ \t]*$", "", text, flags=re.M)


def entries_a1(prefix: str, heading: str) -> list[str]:
    blocks = []
    for f in FORMS:
        k = f.lower()
        blocks.append(f"## {heading} {f} {marker(f, f'{prefix}-{k}-h')}\n\n- a bullet entry for {f} {marker(f, f'{prefix}-{k}-b')}\n")
    return blocks


def write(name: str, text: str) -> pathlib.Path:
    p = OUT / name
    p.write_text(text, encoding="ascii", newline="\n")
    return p


def main() -> int:
    OUT.mkdir(exist_ok=True)
    rows = []

    def record(arm, form, ids, predicted_found, text):
        got = all(i in found(text) for i in ids)
        rows.append((arm, form, "found" if predicted_found else "LOST", "found" if got else "LOST", got == predicted_found))

    # A1: markers on headings and bullets; md-unwrap should change nothing.
    a1 = write("a1.md", "# What's left\n\n" + "\n".join(entries_a1("a1", "Entry")))
    check = subprocess.run(["dz", "md-unwrap", "--check", str(a1)], capture_output=True)
    unwrap(a1, OUT / "a1.out.md")
    a1_out = (OUT / "a1.out.md").read_text(encoding="ascii")
    identical = a1_out == a1.read_text(encoding="ascii")
    for f in FORMS:
        record("A1", f, [f"a1-{f.lower()}-h", f"a1-{f.lower()}-b"], True, a1_out)

    # A2: the entries reversed and their headings renamed, then md-unwrap.
    a2 = write("a2.md", "# What's left (renamed)\n\n" + "\n".join(reversed(entries_a1("a2", "Renamed heading for"))))
    unwrap(a2, OUT / "a2.out.md")
    a2_out = (OUT / "a2.out.md").read_text(encoding="ascii")
    for f in FORMS:
        record("A2", f, [f"a2-{f.lower()}-h", f"a2-{f.lower()}-b"], True, a2_out)

    # A3: a marker at the end of a hard-wrapped paragraph.
    a3 = write("a3.md", "".join(
        f"A paragraph about {f} that was hard-wrapped by an editor\nat seventy columns and ends with its marker {marker(f, f'a3-{f.lower()}')}\n\n" for f in FORMS))
    unwrap(a3, OUT / "a3.out.md")
    a3_out = (OUT / "a3.out.md").read_text(encoding="ascii")
    for f in FORMS:
        record("A3", f, [f"a3-{f.lower()}"], True, a3_out)

    # A4: a marker in the middle of a hard-wrapped paragraph.
    a4 = write("a4.md", "".join(
        f"A paragraph about {f} with its marker {marker(f, f'a4-{f.lower()}')} in the\nmiddle, and more words after it on the next line.\n\n" for f in FORMS))
    unwrap(a4, OUT / "a4.out.md")
    a4_out = (OUT / "a4.out.md").read_text(encoding="ascii")
    for f in FORMS:
        record("A4", f, [f"a4-{f.lower()}"], f != "F4", a4_out)

    # A5: the hazard: a marker hard-wrapped inside itself (the forms that can be).
    a5 = write("a5.md", "".join(
        f"Before the marker {marker(f, f'a5-{f.lower()}', split=True)} after it.\n\n" for f in ["F1", "F2", "F3"]))
    unwrap(a5, OUT / "a5.out.md")
    a5_out = (OUT / "a5.out.md").read_text(encoding="ascii")
    for f in ["F1", "F2", "F3"]:
        record("A5", f, [f"a5-{f.lower()}"], f == "F3", a5_out)

    # C: the control: a pass that strips comments and block ids must read as F3, F4 lost.
    c_out = strip_pass(a1_out)
    write("c.out.md", c_out)
    for f in FORMS:
        record("C", f, [f"a1-{f.lower()}-h", f"a1-{f.lower()}-b"], f not in ("F3", "F4"), c_out)

    print(f"A1: md-unwrap --check exit {check.returncode}; output byte-identical to input: {identical}\n")
    print(f"{'arm':4} {'form':5} {'predicted':10} {'observed':10} verdict")
    for arm, form, pred, obs, ok in rows:
        print(f"{arm:4} {form:5} {pred:10} {obs:10} {'as predicted' if ok else 'MISMATCH'}")
    control_ok = all(ok for arm, *_r, ok in rows if arm == "C")
    misses = sum(1 for *_r, ok in rows if not ok)
    print(f"\ncontrol: {'failed as predicted (the checker sees a loss)' if control_ok else 'METHOD BROKEN: the checker did not see the loss'}")
    print(f"{len(rows)} rows, {misses} mismatch(es) with the predictions")
    return 0 if control_ok else 2


if __name__ == "__main__":
    sys.exit(main())
