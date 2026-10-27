"""Stage 0.7.6 (the landing fallback) apart from the lists work that shares four files with it.

The working tree holds both, and plugin/ hot-reloads into djdarcy's live sessions, so the tree is
never rewritten for the split: each shared file's 0.7.6 version is built from HEAD plus the landing
hunks (each taken verbatim from the working tree), written as a blob, and put in the index with
`git update-index --cacheinfo`. Files only the landing fix touched are staged whole. Every anchor is
checked before anything is staged. Run from the repo root; prints `git diff --cached --stat`."""
import subprocess

def git(*args, data=None):
    return subprocess.run(["git", *args], input=data, capture_output=True, check=True).stdout

def head(path):
    return git("show", f"HEAD:{path}").decode("utf-8")

def work(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()

def swap(text, old, new, what):
    assert text.count(old) == 1, f"{what}: anchor found {text.count(old)} times: {old[:80]!r}"
    return text.replace(old, new)

def between(text, start, end, what):
    """The working tree's text from `start` up to (not including) `end`, each found once."""
    assert text.count(start) == 1 and text.count(end) >= 1, f"{what}: block anchors"
    i = text.index(start)
    return text[i:text.index(end, i)]

staged = {}

# register.tsx: the import, the jumpTo wrapper's `quiet`, the bookmarks ports' jumpTo and messageOf.
p = "plugin/hooks/register.tsx"
h, w = head(p), work(p)
h = swap(h, "import type { FoundPlace } from './core/places/resolve'", "import { messageOf, type FoundPlace } from './core/places/resolve'", p)
old_wrap = between(h, "async function jumpTo($: EngineInterface, uuid: string, via: string, label: string, words?: string, probe = false,", "\n}\n", p)
new_wrap = between(w, "async function jumpTo($: EngineInterface, uuid: string, via: string, label: string, words?: string, probe = false,", "\n}\n", p)
h = swap(h, old_wrap, new_wrap, p)
h = swap(h, "    jumpTo: (uuid, via, label, words) => jumpTo($, uuid, via, label, words),\n    loadMarks: () => loadMarks($),",
         between(w, "    jumpTo: (uuid, via, label, words, quiet) => jumpTo(", "    loadMarks: () => loadMarks($),", p) + "    loadMarks: () => loadMarks($),", p)
staged[p] = h

# ports.ts: BookmarksPorts' jumpTo (quiet) and messageOf.
p = "plugin/hooks/engine/ports.ts"
h, w = head(p), work(p)
h = swap(h, "  jumpTo: (uuid: string, via: string, label: string, words?: string) => Promise<string | undefined>\n  loadMarks:",
         between(w, "  /** `quiet`: a first try;", "  loadMarks: () => Promise<import('../core/marks/marks.ts').Marks>", p) + "  loadMarks:", p)
staged[p] = h

# CHANGELOG.md: the [0.7.6] section (its Fixed entry as written in the tree) and the Unreleased link.
p = "CHANGELOG.md"
h, w = head(p), work(p)
fixed = between(w, "### Fixed\n\n- **A link to a tool call that Claude Code draws no row for still lands.**", "\n\n", p)
h = swap(h, "## [Unreleased]\n\n## [0.7.5]", f"## [Unreleased]\n\n## [0.7.6] - 2026-10-26\n\n{fixed}\n\n## [0.7.5]", p)
h = swap(h, "compare/v0.7.5...HEAD", "compare/v0.7.6...HEAD", p)
staged[p] = h

# docs/usage.md: the bookmark tool paragraph's landing sentence.
p = "docs/usage.md"
h = swap(head(p), "A link to a tool row lands on that row, or on the folded line that holds it, and its file",
         "A link to a tool row lands on that row, or on the folded line that holds it; for a tool Claude Code draws no row of its own for (an `AskUserQuestion` call, for one), it lands on the reply the call was made in and says so. Its file", p)
staged[p] = h

for path, text in staged.items():
    sha = git("hash-object", "-w", "--stdin", data=text.encode("utf-8")).decode().strip()
    mode = git("ls-files", "-s", path).decode().split()[0]
    git("update-index", "--cacheinfo", f"{mode},{sha},{path}")

whole = [
    "plugin/hooks/handlers/navigation.ts", "plugin/hooks/handlers/bookmarks.ts", "plugin/hooks/core/places/resolve.ts",
    "tests/core/landing.test.ts", "tests/one-offs/thinking/redgreen-0-7-6-landing", "tests/one-offs/thinking/split-0-7-6",
    "version.py", "plugin/.claude-plugin/plugin.json",
]
git("add", "--", *whole)
print(git("diff", "--cached", "--stat").decode())
