"""Red-green audit of the band field (input routing, units 3 and 3b, 2026-10-25).

Mirrors plugin/ (and tests/core/keys.test.ts) into a scratch folder outside the repo, keeps
only the band-field kit test and its harness, applies one behaviour mutant at a time to the
copy, and runs `claude plugin test` (and node --test for the focus rule) on it. The live
plugin/ is never edited: it hot-reloads open Claude Code sessions.
Usage: python run.py <scratch dir>
"""
import pathlib
import shutil
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[4]
SCRATCH = pathlib.Path(sys.argv[1]).resolve()

if SCRATCH.exists():
    shutil.rmtree(SCRATCH)
shutil.copytree(REPO / "plugin", SCRATCH / "plugin", ignore=shutil.ignore_patterns(".vscode", "node_modules"))
for t in (SCRATCH / "plugin" / "tests").glob("*.test.ts*"):
    if t.name != "band-field.test.ts":
        t.unlink()
(SCRATCH / "tests" / "core").mkdir(parents=True)
CORE_TESTS = ["keys.test.ts", "band-focus.test.ts"]
for name in CORE_TESTS:
    shutil.copy2(REPO / "tests" / "core" / name, SCRATCH / "tests" / "core" / name)

BAND = SCRATCH / "plugin" / "hooks" / "handlers" / "band.ts"
VIEW = SCRATCH / "plugin" / "hooks" / "views" / "band.tsx"
KEYS = SCRATCH / "plugin" / "hooks" / "core" / "band" / "keys.ts"

MUTANTS = {
    "none (control: must be green)": [],
    "the field never stores the number": [(BAND, "  await ports.setBandNum(typed)\n  if (list === 'list' && ports.setPromptFilter", "  await ports.setBandNum('')\n  if (list === 'list' && ports.setPromptFilter")],
    "the view always draws the buttons": [(VIEW, "if (m.listInput === 'band-field' && Input) {", "if (m.listInput === 'band-field' && Input && false) {")],
    "the key step ignored": [(BAND, "    return bandListKey(ports, step.operation)\n  }\n  await ports.setBandNum(typed)", "    return\n  }\n  await ports.setBandNum(typed)")],
    "close ignored": [(BAND, "if (step.op === 'close') return void (await closeAll(ports, 'band field'))", "if (step.op === 'close') return")],
    "the filter not applied": [(BAND, "if (list === 'list' && ports.setPromptFilter(step.filter ?? ''))", "if (list === 'list' && false && ports.setPromptFilter(step.filter ?? ''))")],
    "Enter not calling go": [(BAND, "  await ports.setBandNum(typed)\n  return bandNumberGo(ports)", "  await ports.setBandNum(typed)\n  return")],
    "the field focus rule removed": [(KEYS, "if (f.byPerson && f.ring?.startsWith('band-num-field')", "if (false && f.byPerson && f.ring?.startsWith('band-num-field')")],
    "the field is never renewed (the 1j5 bug)": [(BAND, "  await focusBand(ports, await ports.renewBandField())", "  return")],
    "a key steps from the typed text only (the 07:31 bug)": [(BAND, "const from = step.number !== '' ? step.number : await ports.bandNum()", "const from = step.number")],
    "the plugin's own focus move unrecorded (the up-first bug)": [(BAND, "  if (!deny) ports.band.ringMoved(key)\n", "")],
    "Enter on an empty field wipes the number":[(BAND, "  if (typed !== '') await ports.setBandNum(typed)\n  return bandNumberGo(ports)", "  await ports.setBandNum(typed)\n  return bandNumberGo(ports)")],
}
ONLY = sys.argv[2:]  # mutant names to run (default: all)
if ONLY:
    MUTANTS = {k: v for k, v in MUTANTS.items() if k.startswith("none") or any(k.startswith(o) for o in ONLY)}

originals = {p: p.read_text(encoding="utf-8") for p in (BAND, VIEW, KEYS)}
for name, edits in MUTANTS.items():
    for p, text in originals.items():
        p.write_text(text, encoding="utf-8")
    for p, old, new in edits:
        t = p.read_text(encoding="utf-8")
        assert t.count(old) == 1, f"{name}: anchor not unique in {p.name}: {old!r} ({t.count(old)})"
        p.write_text(t.replace(old, new), encoding="utf-8")
    kit = subprocess.run(["claude", "plugin", "test", str(SCRATCH / "plugin")], capture_output=True, text=True, cwd=SCRATCH, shell=False)
    kit_out = kit.stdout + kit.stderr
    reds = [l for l in kit_out.splitlines() if l.startswith("(fail)")]
    core = subprocess.run(["node", "--test", *[str(SCRATCH / "tests" / "core" / n) for n in CORE_TESTS]], capture_output=True, text=True, cwd=SCRATCH)
    core_reds = [l for l in core.stdout.splitlines() if l.startswith("not ok")]
    print(f"== {name}: kit {len(reds)} red, core {len(core_reds)} red")
    for l in reds + core_reds:
        print("   ", l[:150])
for p, text in originals.items():
    p.write_text(text, encoding="utf-8")
