"""Census: every production line that names one of the plugin's own tools (bookmark, lists).

Question: before generalising the tools into one table, how many places name them by hand,
and what does each do? The decision: whether a table removes real duplication or only moves it.

Run from the repo root: python tests/one-offs/thinking/measure-plugin-tools/probe.py
Read-only.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
PROD = ROOT / "plugin" / "hooks"
PATTERN = re.compile(r"mcp__bookmarks__|\bBOOKMARK_TOOL(_NAME)?\b|\bLISTS_TOOL(_NAME)?\b|tool\.register|on\('tool\.call'")

# Each hit is classed by what the line does; anything unclassed is printed so nothing hides.
ROLES = [
    ("definition", re.compile(r"export const (BOOKMARK|LISTS)_TOOL = ")),
    ("name constant", re.compile(r"export const (BOOKMARK|LISTS)_TOOL_NAME = ")),
    ("fold table row", re.compile(r"\[(BOOKMARK|LISTS)_TOOL_NAME\]: \{")),
    ("fold default arg", re.compile(r"= BOOKMARK_TOOL_NAME\)|\[BOOKMARK_TOOL_NAME\]: count")),
    ("registration list", re.compile(r"for \(const def of \[")),
    ("register call", re.compile(r"\$\.tool\.register\(")),
    ("call hook", re.compile(r"on\('tool\.call'")),
    ("fold note in hook", re.compile(r"noteFoldedCall\(\$, e, 'mcp__bookmarks__")),
    ("import", re.compile(r"^\s*import ")),
    ("comment", re.compile(r"^\s*(//|\*|/\*\*)")),
]


def main() -> int:
    hits = []
    for path in sorted(PROD.rglob("*.ts*")):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if PATTERN.search(line):
                role = next((r for r, rx in ROLES if rx.search(line)), "UNCLASSED")
                hits.append((role, path.relative_to(ROOT).as_posix(), n, line.strip()[:110]))

    # Known answer: the engine's register call happens in exactly one place (one loop).
    registers = [h for h in hits if h[0] == "register call"]
    if len(registers) != 1:
        print(f"METHOD CHECK FAILED: expected 1 register call, found {len(registers)}")
        return 1

    by_role: dict[str, list] = {}
    for h in hits:
        by_role.setdefault(h[0], []).append(h)
    for role, rows in by_role.items():
        print(f"\n{role} ({len(rows)})")
        for _, f, n, text in rows:
            print(f"  {f}:{n}  {text}")
    total = sum(len(v) for v in by_role.values())
    print(f"\nreconcile: {' + '.join(f'{len(v)} {k}' for k, v in by_role.items())} = {total} = {len(hits)} hits")
    return 0


if __name__ == "__main__":
    sys.exit(main())
