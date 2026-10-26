"""Red-green audit of unit 4's tests (the 0.7 groundwork, 2026-10-25): tests/core/search.test.ts
against behaviour-neutralising mutants of plugin/hooks/core/search/{query,search}.ts, on scratch
copies (plugin/ is never edited: it hot-reloads into open Claude Code sessions).

Usage: python run.py            -- the red-green mutants below
       python run.py <spec.json> <report.json>  -- a mutation sweep spec (each mutant names its file)
"""
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[3]
HOOKS = REPO / "plugin" / "hooks"
uri = lambda *p: HOOKS.joinpath(*p).as_uri()

QUERY = (HOOKS / "core" / "search" / "query.ts").read_text(encoding="utf-8").replace("from '../places/place.ts'", f"from '{uri('core', 'places', 'place.ts')}'")
SEARCH = (HOOKS / "core" / "search" / "search.ts").read_text(encoding="utf-8").replace("from '../places/reader.ts'", f"from '{uri('core', 'places', 'reader.ts')}'")
TEST = (REPO / "tests" / "core" / "search.test.ts").read_text(encoding="utf-8")
TEST = (TEST.replace("'../../plugin/hooks/core/search/query.ts'", "'./query.ts'")
        .replace("'../../plugin/hooks/core/search/search.ts'", "'./search.ts'")
        .replace("'../../plugin/hooks/core/places/reader.ts'", f"'{uri('core', 'places', 'reader.ts')}'")
        .replace("'../../plugin/hooks/core/places/place.ts'", f"'{uri('core', 'places', 'place.ts')}'"))

MUTANTS = {
    "none (control: must be green)": [],
    "Q1 a word matched with case": [("query", "if (!lower.includes(t.text.toLowerCase())) return false", "if (!text.includes(t.text)) return false")],
    "Q2 the phraseCase option ignored": [("query", "if (phraseCase ? !text.includes(t.text) :", "if (true ? !text.includes(t.text) :")],
    "Q3 a bare /x/ a regex whatever its flags": [("query", "  if (!FLAGS.test(flags)) return m ? { incomplete: token } : undefined", "  if (false) return m ? { incomplete: token } : undefined")],
    "Q4 an incomplete pattern dropped silently": [("query", "{ q.problems.push(`incomplete pattern ${rx.incomplete}`); continue }", "{ continue }")],
    "Q5 a quoted phrase read as a rule": [("query", "    if (t.quoted) {", "    if (false) {")],
    "Q6 exclusions not checked": [("query", "  if (q.exclude.some(r => ruleAdmits(p, r))) return false", "  if (false) return false")],
    "Q7 rules of one kind ANDed": [("query", "if (!rules.some(r => ruleAdmits(p, r))) return false", "if (!rules.every(r => ruleAdmits(p, r))) return false")],
    "Q8 the toggles ignored": [("query", "  if (!toggles.some(t => inPreset(p, t))) return false", "  if (false) return false")],
    "Q9 agent: by id prefix ignored": [("query", "(p.agent.type?.toLowerCase() === name || p.agent.id.toLowerCase().startsWith(name))", "(p.agent.type?.toLowerCase() === name)")],
    "Q10 tool: by category ignored": [("query", "return p.tool?.toLowerCase() === name || p.category === name", "return p.tool?.toLowerCase() === name")],
    "S1 piecesToRead ignoring scope": [("search", "    if (!inScope(r, q, toggles)) return", "    if (false) return")],
    "S2 a listing that reads text": [("search", "  if (q.terms.length === 0) {", "  if (false) {")],
    "S3 the limit ignored": [("search", "        if (opts.limit && hits.length >= opts.limit) return", "        if (false) return")],
    "S4 the deadline ignored": [("search", "    if (opts.deadline !== undefined && now() > opts.deadline) return", "    if (false) return")],
}
FILES = {"plugin/hooks/core/search/query.ts": "query", "plugin/hooks/core/search/search.ts": "search"}


def run(texts):
    (HERE / "query.ts").write_text(texts["query"], encoding="utf-8")
    (HERE / "search.ts").write_text(texts["search"], encoding="utf-8")
    try:
        out = subprocess.run(["node", "--test", str(HERE / "search.test.ts")], capture_output=True, text=True, cwd=REPO, timeout=120).stdout
    except subprocess.TimeoutExpired:
        return ["TIMEOUT"], "?"
    passed = [l for l in out.splitlines() if l.startswith("# pass")]
    return [l for l in out.splitlines() if l.startswith("not ok")], (passed[0] if passed else "?")


(HERE / "search.test.ts").write_text(TEST, encoding="utf-8")
if len(sys.argv) == 3:
    spec = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))["mutations"]
    MUTANTS = {"none (control: must be green)": []}
    for m in spec:
        MUTANTS[f"{m['id']} {m['note']}"] = [(FILES.get(m["file"], "?"), m["original"], m["mutated"])]
results = []
for name, edits in MUTANTS.items():
    texts = {"query": QUERY, "search": SEARCH}
    ok = True
    for which, old, new in edits:
        if which not in texts or texts[which].count(old) != 1:
            print(f"== {name}: apply failure ({texts.get(which, '').count(old) if which in texts else 'no file'})")
            results.append({"name": name, "verdict": "apply-failure"})
            ok = False
            break
        texts[which] = texts[which].replace(old, new)
    if not ok:
        continue
    fails, passed = run(texts)
    if not fails and edits:
        fails, passed = run(texts)  # re-verify a survivor alone
    verdict = "killed" if fails else ("survived" if edits else "control")
    results.append({"name": name, "verdict": verdict, "red": fails})
    print(f"== {name}: {passed}; {len(fails)} red")
    for l in fails:
        print("   ", l)
run({"query": QUERY, "search": SEARCH})
if len(sys.argv) == 3:
    pathlib.Path(sys.argv[2]).write_text(json.dumps(results, indent=1), encoding="utf-8")
