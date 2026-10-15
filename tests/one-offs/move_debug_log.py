"""Slice 0 (goal 2026-10-12__02-27-47): move the debug log out of register.tsx.

A pure move: the screen channel, the timeline, the log, the echo policy, the
channels and the flush go to plugin/hooks/engine/debug-log.ts; dataRoot goes to
plugin/hooks/engine/data-root.ts (the bookmark file uses it too). Top-level
declarations gain `export`; register.tsx imports the names it still uses.
Every range edge is asserted, so a shifted line stops the script instead of
cutting the wrong code.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REG = ROOT / "plugin" / "hooks" / "register.tsx"
ENGINE = ROOT / "plugin" / "hooks" / "engine"

lines = REG.read_text(encoding="utf-8").split("\n")


def at(n):  # 1-based
    return lines[n - 1]


def expect(n, prefix):
    if not at(n).startswith(prefix):
        sys.exit(f"line {n} does not start with {prefix!r}: {at(n)!r}")


expect(255, "// The `screen` debug channel")
expect(287, "}")
expect(314, "// A timeline of what the mod saw")
expect(424, "")
expect(425, "// The data root:")
expect(433, "}")
expect(435, "async function flushLog")
expect(449, "const clock = ")

screen = lines[254:287]          # 255..287
logging = lines[313:424]         # 314..424
data_root = lines[424:433]       # 425..433
flush = lines[434:449]           # 435..449

DECL = re.compile(r"^(async function|function|const|let|type) ")


def exported(block):
    return [("export " + l) if DECL.match(l) else l for l in block]


debug_log = "\n".join(
    [
        "// The plugin's debug log, its echo into the conversation, the debug channels and",
        "// the timeline: everything the [bm] lines go through. Moved out of register.tsx",
        "// unchanged (goal 2026-10-12__02-27-47, slice 0); register.tsx imports what it uses.",
        "",
        "import type { EngineInterface } from 'claude-code'",
        "",
        "import { formatDebugEnv, parseDebugEnv, screenMirror, type Channel } from '../core/debug'",
        "import { dataRoot } from './data-root'",
        "",
    ]
    + exported(screen)
    + [""]
    + exported(logging)
    + exported(flush)
    + [""]
)

data_root_mod = "\n".join(
    [
        "import type { EngineInterface } from 'claude-code'",
        "",
    ]
    + exported(data_root)
    + [""]
)

names = sorted(
    {m.group(1) for l in exported(screen + logging + flush) for m in [re.match(r"^export (?:async function|function|const|let|type) (\w+)", l)] if m}
)

rest = lines[:254] + lines[287:313] + lines[449:]
body = "\n".join(rest)
used = [n for n in names if re.search(rf"\b{n}\b", body)]
needs_data_root = re.search(r"\bdataRoot\b", body) is not None

import_lines = [
    "import { " + ", ".join(sorted(used, key=str.lower)) + " } from './engine/debug-log'",
]
if needs_data_root:
    import_lines.append("import { dataRoot } from './engine/data-root'")

# After the last import from ./core/...
last_import = max(i for i, l in enumerate(rest) if l.startswith("import ") or l.startswith("} from '"))
rest = rest[: last_import + 1] + import_lines + rest[last_import + 1 :]

(ENGINE / "debug-log.ts").write_text(debug_log, encoding="utf-8")
(ENGINE / "data-root.ts").write_text(data_root_mod, encoding="utf-8")
REG.write_text("\n".join(rest), encoding="utf-8")

print("moved", len(screen) + len(logging) + len(flush), "lines to engine/debug-log.ts,", len(data_root), "to engine/data-root.ts")
print("register imports:", ", ".join(used), "| dataRoot" if needs_data_root else "")
unused = sorted(set(names) - set(used))
print("exported but unused by register:", ", ".join(unused))
