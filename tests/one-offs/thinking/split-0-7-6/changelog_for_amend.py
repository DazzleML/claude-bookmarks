"""The pre-commit hook's version sync re-stages CHANGELOG.md from the working tree (`--auto` runs
git add), so 281a1ed took the tree's CHANGELOG, lists entry and all, instead of the 0.7.6 one
stage_landing.py had put in the index. For the amend the tree must hold the 0.7.6 CHANGELOG:
`save` copies the tree's CHANGELOG aside and writes the 0.7.6 one (HEAD~1's plus the [0.7.6] Fixed
section and link); `restore` puts the tree's back. Run from the repo root."""
import subprocess
import sys

SAVED = "tests/one-offs/thinking/split-0-7-6/CHANGELOG.tree.md"

def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()

def write(path, text):
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)

if sys.argv[1:] == ["save"]:
    raw = read("CHANGELOG.md")
    write(SAVED, raw)
    # The hook's sync writes the tree's copy with CRLF; git keeps LF. Match on LF, write back as found.
    crlf = "\r\n" in raw
    tree = raw.replace("\r\n", "\n")
    base = subprocess.run(["git", "show", "HEAD~1:CHANGELOG.md"], capture_output=True, check=True).stdout.decode("utf-8")
    start = tree.index("### Fixed\n\n- **A link to a tool call that Claude Code draws no row for still lands.**")
    fixed = tree[start:tree.index("\n\n", tree.index("- **A link", start))]
    assert base.count("## [Unreleased]\n\n## [0.7.5]") == 1 and base.count("compare/v0.7.5...HEAD") == 1
    out = base.replace("## [Unreleased]\n\n## [0.7.5]", f"## [Unreleased]\n\n## [0.7.6] - 2026-10-26\n\n{fixed}\n\n## [0.7.5]").replace("compare/v0.7.5...HEAD", "compare/v0.7.6...HEAD")
    write("CHANGELOG.md", out.replace("\n", "\r\n") if crlf else out)
    print("CHANGELOG.md now holds 0.7.6's; the tree's is in", SAVED)
elif sys.argv[1:] == ["restore"]:
    write("CHANGELOG.md", read(SAVED))
    print("CHANGELOG.md restored from", SAVED)
else:
    sys.exit("usage: changelog_for_amend.py save|restore")
