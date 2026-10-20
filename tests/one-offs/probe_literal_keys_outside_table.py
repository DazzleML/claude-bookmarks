"""Probe: where is a key compared or dispatched by its literal value, outside the key table?

Question (keys-and-input design, #36): every place a surface holds a key of its own is a
place a user keymap would silently not reach. The key table (core/band/keys.ts) is the one
place keys are meant to live; this lists every other candidate line so each can be
classified by hand: (a) names the table's own key only (a hint, a test, a glyph);
(b) a surface holding a key the keymap would have to reach; (c) an engine key (Esc, Enter,
Tab, arrows, digits-as-numbers) that is not a keymap concern.

Known-answer case: run with --control to scan keys.ts itself, which must report many hits
(it IS the table); a zero there means the patterns are wrong, not the code clean.

Read-only. Usage:  python tests/one-offs/probe_literal_keys_outside_table.py [--control]
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2] / "plugin" / "hooks"
TABLE = ROOT / "core" / "band" / "keys.ts"

KEY = r"(?:[^'\\]|\\u001b|\\u001d|\\r|\\n|\\t|Escape|Enter|Tab|Backspace|Space|Up|Down|Left|Right)"
PATTERNS = [
    (re.compile(rf"(===|!==)\s*'{KEY}'"), "compare"),
    (re.compile(rf"'{KEY}'\s*(===|!==)"), "compare"),
    (re.compile(rf"\bcase\s+'{KEY}'\s*:"), "case"),
    (re.compile(rf"\bhotkey:\s*'{KEY}'"), "hotkey"),
    (re.compile(rf"\bkey:\s*'{KEY}'"), "key-field"),
    (re.compile(rf"\.(includes|startsWith|endsWith)\('{KEY}'\)"), "text-test"),
    (re.compile(r"/\^\[0-9\]\$/|/\^\\d\$/|/\^\[a-z\]\$/"), "class-regex"),
]

def scan(path: pathlib.Path):
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.lstrip().startswith("//") or line.lstrip().startswith("*"):
            continue
        for rx, kind in PATTERNS:
            if rx.search(line):
                yield i, kind, line.strip()[:110]
                break

def main(argv):
    # The table's button labels carry glyphs (j↓, k↑); a cp1252 console would crash on them.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    control = "--control" in argv
    files = [TABLE] if control else sorted(
        p for p in ROOT.rglob("*.ts*")
        if p != TABLE and ".test." not in p.name and p.suffix in (".ts", ".tsx")
        and "node_modules" not in p.parts
    )
    total = 0
    for f in files:
        hits = list(scan(f))
        if not hits:
            continue
        rel = f.relative_to(ROOT.parent.parent).as_posix()
        for i, kind, text in hits:
            total += 1
            print(f"{rel}:{i}  [{kind}]  {text}")
    print(f"-- {total} hits in {len(files)} files ({'control: keys.ts' if control else 'outside keys.ts'})")

if __name__ == "__main__":
    main(sys.argv[1:])
