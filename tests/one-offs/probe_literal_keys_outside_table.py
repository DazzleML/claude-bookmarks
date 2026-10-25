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

# The hand classification, written down so the count is reproducible (2026-10-22, the 0.6.x
# arc's close). A row matches a hit by file and a substring of its line, never a line number.
# A hit no row names is printed as unclassified and counted as (b): the conservative side.
# (d) is added to the design's three: not a key at all, a parser or a format test.
CLASSES = [
    ("core/band/keymap.ts", "/^[0-9]$/", "a", "the keymap layer's own rule: a digit is a number in a list"),
    ("core/bookmarks/anchor.ts", "startsWith('/')", "d", "a path test in the anchor address"),
    ("core/bookmarks/anchor.ts", "case 'u':", "d", "an anchor kind code in the query string"),
    ("core/bookmarks/anchor.ts", "case 'l':", "d", "an anchor kind code"),
    ("core/bookmarks/anchor.ts", "case 'b':", "d", "an anchor kind code"),
    ("core/bookmarks/anchor.ts", "case 'q':", "d", "an anchor kind code"),
    ("core/bookmarks/anchor.ts", "case 'v':", "d", "an anchor kind code"),
    ("core/bookmarks/anchor.ts", "=== '`'", "d", "counting backticks to place a highlight"),
    ("core/bookmarks/register-file.ts", "startsWith('[')", "d", "the register parser: a list value"),
    ("core/bookmarks/register-file.ts", "c === '\\\\'", "d", "the register parser: an escape"),
    ("core/bookmarks/register-file.ts", "c === '\"'", "d", "the register parser: a quote"),
    ("core/bookmarks/register-file.ts", "c === ','", "d", "the register parser: a separator"),
    ("core/bookmarks/register-file.ts", "startsWith('\"')", "d", "the register parser: a quoted value"),
    ("core/bookmarks/transcript-lines.ts", "=== ' '", "d", "the word break at a row's edge"),
    ("core/kit/continuum.ts", "sign === '-'", "d", "a rational's sign"),
    ("core/kit/continuum.ts", "includes(\"'\")", "d", "quoting a string for a test literal"),
    ("core/marks/highlight.ts", "startsWith('|')", "d", "a markdown table row is not highlighted"),
    ("core/marks/marks.ts", "/^[a-z`]$/", "a", "the letter class a mark command's argument must be in"),
    ("core/marks/marks.ts", "a === 'all'", "d", "a typed command's argument words"),
    ("core/transcript/loader.ts", "endsWith('\\r')", "d", "a CRLF line ending"),
    ("engine/select.ts", "patch === 'H'", "d", "a dcc-patcher signal's value"),
    ("handlers/band.ts", "includes('.')", "c", "the footnote dot in a typed list number (digits-as-numbers)"),
]
NAMES = {"a": "names the table's own key", "b": "a surface holding a key", "c": "an engine key or number syntax", "d": "not a key: a parser or format test"}

def classify(rel: str, text: str):
    for suffix, needle, cls, why in CLASSES:
        if rel.endswith(suffix) and needle in text:
            return cls, why
    return "?", "unclassified: read it, then add a row above"

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
    counts = {"a": 0, "b": 0, "c": 0, "d": 0, "?": 0}
    for f in files:
        hits = list(scan(f))
        if not hits:
            continue
        rel = f.relative_to(ROOT.parent.parent).as_posix()
        for i, kind, text in hits:
            total += 1
            if control:
                print(f"{rel}:{i}  [{kind}]  {text}")
                continue
            cls, why = classify(rel, text)
            counts[cls] += 1
            print(f"{rel}:{i}  [{kind}]  ({cls}) {why}\n    {text}")
    print(f"-- {total} hits in {len(files)} files ({'control: keys.ts' if control else 'outside keys.ts'})")
    if not control:
        surface = counts["b"] + counts["?"]
        print(f"-- class (a) {counts['a']}, (b) {counts['b']}, (c) {counts['c']}, (d) {counts['d']}, unclassified {counts['?']}")
        print(f"-- surface-held keys outside the table (class (b) plus unclassified): {surface}")

if __name__ == "__main__":
    main(sys.argv[1:])
