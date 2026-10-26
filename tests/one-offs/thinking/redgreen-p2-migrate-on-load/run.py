"""Red-green audit of unit P2 (migrate on load; the pins-by-name design, 2026-10-26): the kit tests in
plugin/tests/migrate-on-load.test.ts against behaviour-neutralising mutants of
plugin/hooks/handlers/bookmarks.ts, each run on a SCRATCH COPY of the whole plugin folder in the
system temp directory (the kit runs a plugin folder, and plugin/ itself hot-reloads into open
sessions, so it is only read). The copy keeps the harness and this one test file.
"""
import pathlib
import shutil
import subprocess
import tempfile

REPO = pathlib.Path(__file__).resolve().parents[4]
PLUGIN = REPO / "plugin"
HANDLER = "hooks/handlers/bookmarks.ts"
KEEP_TESTS = {"harness.ts", "migrate-on-load.test.ts"}

MUTANTS = {
    "none (control: must be green)": [],
    "L1 no migration on load": [("  } else if (reg.version < CURRENT) {", "  } else if (false) {")],
    "L2 migrated from the .bak too": [("const fromMain = text !== undefined && parseRegister(text) !== undefined", "const fromMain = text !== undefined")],
    "L3 a failed migration not read-only": [("  if (registerCache?.session === session && registerCache.readOnly) {", "  if (false) {")],
    "L4 the failure not caught": [("  } catch (err) {\n    ports.logAlways(`[bm] migrate on load failed", "  } catch (err) {\n    throw err\n    ports.logAlways(`[bm] migrate on load failed")],
}

base = pathlib.Path(tempfile.mkdtemp(prefix="bm-redgreen-p2-"))
original = (PLUGIN / HANDLER).read_text(encoding="utf-8")
for name, edits in MUTANTS.items():
    copy = base / name.split(" ")[0]
    shutil.copytree(PLUGIN, copy, ignore=shutil.ignore_patterns(".vscode"))
    for t in (copy / "tests").glob("*.ts*"):
        if t.name not in KEEP_TESTS:
            t.unlink()  # the scratch copy only
    text = original
    for old, new in edits:
        assert text.count(old) == 1, f"{name}: anchor not unique ({text.count(old)}): {old!r}"
        text = text.replace(old, new)
    (copy / HANDLER).write_text(text, encoding="utf-8")
    out = subprocess.run(["claude", "plugin", "test", str(copy)], capture_output=True, text=True, timeout=600, shell=False)
    lines = (out.stdout + out.stderr).splitlines()
    fails = [l for l in lines if l.startswith("(fail)")]
    total = [l.strip() for l in lines if l.strip().endswith(" pass") or l.strip().endswith(" fail")]
    print(f"== {name}: {', '.join(total)}; {len(fails)} red")
    for l in fails:
        print("   ", l)
print(f"scratch copies under {base}")
