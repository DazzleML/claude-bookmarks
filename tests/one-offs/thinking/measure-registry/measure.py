"""Measurements M1 and M2 for the project-registry design. Read-only: reads ~/.claude/projects/*,
~/.claude/session-states/*.json and ~/claude/bookmarks/lists/*.json; writes only its report, to the
folder given as the first argument (outside the repo: the paths are private).

Run: python -I measure.py <report folder>
"""
import json, os, sys
from collections import Counter, defaultdict
from pathlib import Path

HOME = Path.home()
out_dir = Path(sys.argv[1])
out_dir.mkdir(parents=True, exist_ok=True)

def cwd_of(project_dir: Path):
    """The cwd the folder's transcripts record (first line that has one, newest file first)."""
    files = sorted(project_dir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    for f in files[:3]:
        try:
            with open(f, encoding="utf-8", errors="replace") as h:
                for i, line in enumerate(h):
                    if i > 200:
                        break
                    if '"cwd"' in line:
                        try:
                            c = json.loads(line).get("cwd")
                        except Exception:
                            continue
                        if c:
                            return c
        except OSError:
            continue
    return None

def vault_of(cwd: str):
    """The real path of the nearest ancestor (or self) holding private/, and whether cwd is that root."""
    p = Path(cwd)
    for anc in [p, *p.parents]:
        if (anc / "private").is_dir():
            return os.path.realpath(anc / "private"), anc
    return None, None

rows = []
for d in sorted((HOME / ".claude" / "projects").iterdir()):
    if d.is_dir():
        c = cwd_of(d)
        v, root = vault_of(c) if c else (None, None)
        kind = "no cwd found" if not c else ("outside any vault" if not v else ("project root" if Path(c) == root else "subfolder"))
        rows.append((d.name, c, v, kind))

kinds = Counter(r[3] for r in rows)
vaults = defaultdict(list)
for r in rows:
    if r[2]:
        vaults[r[2]].append(r[1])

lists_cwds = {}
for f in (HOME / "claude" / "bookmarks" / "lists").glob("*.json"):
    if f.name.endswith(".bak"):
        continue
    try:
        cwd = json.loads(f.read_text(encoding="utf-8")).get("cwd")
    except Exception:
        cwd = None
    v, root = vault_of(cwd) if cwd else (None, None)
    lists_cwds[f.stem] = (cwd, v, "root" if cwd and root and Path(cwd) == root else ("subfolder" if v else "outside"))

# M2: claude-session-logger's per-session state
states = list((HOME / ".claude" / "session-states").glob("*.json"))
fields = Counter()
per_cwd = Counter()
for s in states:
    try:
        j = json.loads(s.read_text(encoding="utf-8"))
    except Exception:
        continue
    fields.update(j.keys())
    per_cwd[(j.get("cwd") or "").replace("\\", "/").rstrip("/").lower()] += 1
sesslogs = [p for p in (HOME / ".claude" / "sesslogs").iterdir() if p.is_dir()] if (HOME / ".claude" / "sesslogs").is_dir() else []

csb_candidates = [str(p) for base in (HOME / "claude", HOME / ".claude") if base.is_dir()
                  for p in base.glob("*") if any(k in p.name.lower() for k in ("session-set", "sessionset", "csb", "session_sets", "projects.json"))]

report = {
    "M1": {
        "project_folders": len(rows),
        "by_kind": dict(kinds),
        "with_a_vault": sum(1 for r in rows if r[2]),
        "distinct_vaults_by_real_path": len(vaults),
        "vaults_reached_by_more_than_one_cwd": sum(1 for v in vaults.values() if len(set(v)) > 1),
        "lists_bases": {k: {"cwd": c, "vault": v, "kind": kd} for k, (c, v, kd) in lists_cwds.items()},
    },
    "M2": {
        "session_states": len(states),
        "session_state_fields": dict(fields.most_common()),
        "sessions_for_claude_bookmarks_cwd": per_cwd["c:/code/claude-projects/claude-bookmarks"],
        "sessions_for_dazzle_claude_plugins_cwd": per_cwd["c:/code/claude-projects/dazzle-claude-plugins"],
        "sesslog_folders": len(sesslogs),
        "csb_per_project_or_set_files": csb_candidates,
    },
}
(out_dir / "report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
(out_dir / "folders.tsv").write_text("\n".join("\t".join(str(x) for x in r) for r in rows), encoding="utf-8")
print(json.dumps({"M1": {k: v for k, v in report["M1"].items() if k != "lists_bases"}, "lists_bases_kinds": {k: v[2] for k, v in lists_cwds.items()}, "M2": {k: (v if k != "session_state_fields" else list(v)) for k, v in report["M2"].items()}}, indent=1))
