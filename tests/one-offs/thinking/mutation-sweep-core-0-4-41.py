"""A scoped mutation sweep over the core modules the register.tsx split produced (0.4.33-0.4.40).

Run against a COPY of the tree (never plugin/ itself: a save there hot-reloads the live
session): python tests/one-offs/thinking/mutation-sweep-core-0-4-41.py <copy root>

Each mutant is one textual change to a module; the module's own test file runs; the file is
restored whatever happens. A mutant the tests fail on is "killed" (the tests bite); one they
pass on "survived" (a gap, or an equivalent mutant). Test-plan 2026-10-12__15-25-30, "Not
doing": mutate the extracted core modules as each lands.
"""
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
core = root / "plugin" / "hooks" / "core"
tests = root / "tests" / "core"

MUTANTS = {
    "log-ring": [
        ("ring cap off by one", "if (this.items.length > this.cap)", "if (this.items.length >= this.cap)"),
        ("forced echo inverted", "if (policy.forced) return policy.default", "if (policy.forced) return !policy.default"),
        ("choice ignored", "return choice ?? policy.default", "return policy.default"),
    ],
    "diagnostics": [
        ("pfx classified as text", "return 'pfx  '", "return 'text '"),
        ("empty arg counts as a number", "/^\\d+$/.test(arg)", "/^\\d*$/.test(arg)"),
        ("force never sets forced", "forced: a === 'force'", "forced: a === 'default'"),
    ],
    "prompt-store": [
        ("merge keeps the oldest instead of the newest", "looksLikePrompt(p.head))].slice(-cap)", "looksLikePrompt(p.head))].slice(0, cap)"),
        ("merge duplicates file prompts", "kept.filter(p => !have.has(p.uuid) && looksLikePrompt(p.head))", "kept.filter(p => looksLikePrompt(p.head))"),
        ("footnotes lose their prompt", "after: found.at(-1)?.uuid ?? null", "after: null"),
    ],
    "highlight": [
        ("fence parity inverted", "if (fences % 2 === 1) return undefined", "if (fences % 2 === 0) return undefined"),
        ("length guard loosened", "if (after.length > 9000) return undefined", "if (after.length > 90000) return undefined"),
        ("markup check dropped", "if (s && !/[*`_]/.test(s) && text.includes(s))", "if (s && text.includes(s))"),
    ],
    "screen-model": [
        ("repeat refreshes the time", "at: same ? before.at : now", "at: now"),
        ("growth off by one", "const grew = !!before && onScreen.of > before.of", "const grew = !!before && onScreen.of >= before.of"),
        ("self-redraw window inclusive", "return this.sinceSelfRedraw(now) < ScreenModel.SELF_REDRAW_MS", "return this.sinceSelfRedraw(now) <= ScreenModel.SELF_REDRAW_MS"),
    ],
    "bookmark-tool": [
        ("tier default swapped", "asked ?? (owner === 'claude' ? 'perma' : 'bookmark')", "asked ?? (owner === 'claude' ? 'bookmark' : 'perma')"),
        ("claim acts on owner's list", "(action === 'claim' ? 'claude' : owner)", "owner"),
        ("owner always claude", "input.owner === 'user' ? 'user' : 'claude'", "'claude'"),
    ],
    "marks": [
        ("any source shows", "m.source === 'selection' &&", ""),
        ("cut at any space", "return space > 16 ? cut.slice(0, space) : cut", "return space > 0 ? cut.slice(0, space) : cut"),
    ],
    "list-model": [
        ("oldest first", "all.map((r, i) => ({ ...r, n: i + 1 })).reverse()", "all.map((r, i) => ({ ...r, n: i + 1 }))"),
        ("unfold ignored", "if (mode === 'folded' && !unfolded) return 'folded'", "if (mode === 'folded') return 'folded'"),
        ("dim by exact id", "!drawnFour.has(firstFour(uuid))", "!drawnFour.has(uuid)"),
        ("minutes cap", "return m < 60 ?", "return m < 600 ?"),
    ],
}

rows = []
for module, mutants in MUTANTS.items():
    src = core / f"{module}.ts"
    test = tests / f"{module}.test.ts"
    original = src.read_text(encoding="utf-8")
    for name, old, new in mutants:
        if original.count(old) != 1:
            rows.append((module, name, "NO ANCHOR" if original.count(old) == 0 else "AMBIGUOUS"))
            continue
        try:
            src.write_text(original.replace(old, new), encoding="utf-8")
            r = subprocess.run(["node", "--test", str(test)], capture_output=True, text=True, cwd=root, timeout=120)
            out = r.stdout + r.stderr
            failed = "# fail 0" not in out or r.returncode != 0
            rows.append((module, name, "killed" if failed else "SURVIVED"))
        finally:
            src.write_text(original, encoding="utf-8")
    assert src.read_text(encoding="utf-8") == original, f"{src} not restored"

width = max(len(f"{m}: {n}") for m, n, _ in rows)
for m, n, s in rows:
    print(f"{(m + ': ' + n).ljust(width)}  {s}")
killed = sum(1 for *_, s in rows if s == "killed")
print(f"\n{killed} killed, {sum(1 for *_, s in rows if s == 'SURVIVED')} survived, {sum(1 for *_, s in rows if s not in ('killed', 'SURVIVED'))} without an anchor, of {len(rows)}")
