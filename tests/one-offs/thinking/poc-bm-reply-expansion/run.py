"""POC runner: the control arm (unmodified plugin copy) and the candidate arm (the reply hook
expands bm: references first). Never touches the live plugin/. See README.md for the prediction."""
import pathlib
import shutil
import subprocess

LIVE = pathlib.Path("C:/code/claude-projects/claude-bookmarks")
HERE = pathlib.Path(__file__).parent
ARMS = HERE / "arms"
TEST = HERE / "poc-bm.test.ts"

HOOK = "  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {\n"
INSERT = (
    "    { // POC: expand bm: references to file: anchors before drawing (D5)\n"
    "      const sid = await $.session.id()\n"
    "      const root = await dataRoot($)\n"
    "      const text0 = e.props.text ?? ''\n"
    "      const expanded = root ? pocExpandBm(text0, sid, root) : text0\n"
    "      if (expanded !== text0) e = { ...e, props: { ...e.props, text: expanded } }\n"
    "    }\n"
)
HELPER_AT = "async function dataRoot($: EngineInterface): Promise<string | undefined> {"
HELPER = (
    "// POC: the exact form for the current session only; the real resolver is design unit 1.\n"
    "function pocExpandBm(text: string, sid: string, root: string): string {\n"
    "  const sid8 = sid.slice(0, 8).toLowerCase()\n"
    "  const href = (row: string) => `file:///${root.replace(/^\\/+/, '')}/sessions/${sid}/${row}.md?u=${row}&v=1`\n"
    "  const re = /\\[([^\\]\\n]*)\\]\\((bm:[^)\\s]+)\\)|(?<![\\w(\\/])(bm:[0-9a-f]{8}\\/[0-9a-f]{8,36})/gi\n"
    "  return text.replace(re, (m: string, label: string | undefined, inLink: string | undefined, bare: string | undefined) => {\n"
    "    const ref = (inLink ?? bare) as string\n"
    "    const mm = /^bm:([0-9a-f]{8})\\/([0-9a-f]{8,36})$/i.exec(ref)\n"
    "    if (!mm || mm[1]!.toLowerCase() !== sid8) return m\n"
    "    const row = mm[2]!.toLowerCase()\n"
    "    return inLink ? `[${label}](${href(row)})` : `[${ref}](${href(row)})`\n"
    "  })\n"
    "}\n\n"
)


def make(arm: str, patch: bool) -> pathlib.Path:
    root = ARMS / arm
    if root.exists():
        shutil.rmtree(root)
    shutil.copytree(LIVE / "plugin", root / "plugin", ignore=shutil.ignore_patterns("node_modules"))
    shutil.copy(TEST, root / "plugin/tests/poc-bm.test.ts")
    if patch:
        reg = root / "plugin/hooks/register.tsx"
        src = reg.read_text(encoding="utf-8")
        assert src.count(HOOK) == 1 and src.count(HELPER_AT) == 1, "anchor missing or not unique"
        src = src.replace(HOOK, HOOK + INSERT).replace(HELPER_AT, HELPER + HELPER_AT)
        reg.write_text(src, encoding="utf-8")
    return root


def run(root: pathlib.Path) -> tuple[list[str], list[str]]:
    out = subprocess.run(["claude", "plugin", "test", "plugin"], cwd=root, capture_output=True, text=True, encoding="utf-8", errors="replace")
    lines = out.stdout.splitlines() + out.stderr.splitlines()
    poc = [l for l in lines if "POC P" in l and l.lstrip().startswith(("(fail)", "(pass)", "✓", "✗"))]
    tail = [l for l in lines if l.strip().endswith((" pass", " fail")) or "error" in l.lower()][-6:]
    return poc, tail


for arm, patch in (("control", False), ("candidate", True)):
    poc, tail = run(make(arm, patch))
    print(f"=== {arm}")
    print(*poc, sep="\n")
    print(*tail, sep="\n")
