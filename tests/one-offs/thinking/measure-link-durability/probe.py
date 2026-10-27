"""Census: do the bookmark links already written still resolve?

Question: of every claude-bookmarks link written on this machine -- in Markdown files (C:/code,
~/claude) and in conversation transcripts (~/.claude/projects, read-only) -- how many still open
their target, and when one does not, why? Decision it feeds: what a durable link must carry, and
what it must not depend on (the external link format design, 2026-10-27).

A link is `file:///<data root>/bookmarks/sessions/<session>/<uuid8>[.pN].md?u=<uuid>&...&v=N`
(plugin/hooks/core/bookmarks/anchor.ts anchorHref). A ctrl-click opens that export file; a click
lands in the conversation by `u=`. Classified per unique (session, uuid, export path):

  resolves                  the export file exists
  missing: regenerable      no export file, but the transcript still holds the uuid
  missing: uuid gone        the transcript exists and no longer holds the uuid
  missing: session gone     no transcript for the session on this machine
  unreachable               the path could not be checked (an error, not a "no")

Run: python tests/one-offs/thinking/measure-link-durability/probe.py [--known <uuid>]
Read-only. Uses rg for the scan.
"""
import collections
import os
import pathlib
import re
import subprocess
import sys
import urllib.parse

HOME = pathlib.Path(os.environ.get("USERPROFILE", str(pathlib.Path.home())))
MD_ROOTS = [pathlib.Path("C:/code"), HOME / "claude"]
TRANSCRIPTS = HOME / ".claude" / "projects"
DATA_ROOT = (HOME / "claude").as_posix()
LINK = r"file:///[^\s\"')\\\]<>]*/bookmarks/sessions/[^\s\"')\\\]<>]*"
# `?` is today's form; `#` the older one (the position in a fragment, which Windows drops; see
# docs/engine-quirks.md), still found in old replies.
PARSE = re.compile(r"file:///(?P<path>[^?#]*/bookmarks/sessions/(?P<sid>[0-9a-f-]{36})/[^?#]*)(?:(?P<sep>[?#])(?P<q>.*))?")


def scan(roots, globs):
    """Every link occurrence under roots, as (href, source kind)."""
    args = ["rg", "-o", "-N", "--no-filename", "--no-messages", "-e", LINK]
    for g in globs:
        args += ["-g", g]
    out = subprocess.run(args + [str(r) for r in roots], capture_output=True, text=True, encoding="utf-8", errors="replace")
    return [line for line in out.stdout.splitlines() if line]


def parse(href):
    m = PARSE.match(href)
    if not m:
        return None
    q = urllib.parse.parse_qs(m.group("q") or "")
    uuid = (q.get("u") or [None])[0]
    path = urllib.parse.unquote(m.group("path"))
    v = (q.get("v") or ["?"])[0].rstrip("`")
    return {"href": href, "path": path, "sid": m.group("sid"), "uuid": uuid, "v": f"{v}{' (#-form)' if m.group('sep') == '#' else ''}"}


def transcript_index():
    idx = {}
    for p in TRANSCRIPTS.rglob("*.jsonl"):
        idx.setdefault(p.stem, p)
    return idx


def main() -> int:
    known = sys.argv[sys.argv.index("--known") + 1] if "--known" in sys.argv else None
    md_hits = scan(MD_ROOTS, ["*.md", "!**/node_modules/**", "!**/.git/**"])
    tr_hits = scan([TRANSCRIPTS], ["*.jsonl"])
    occurrences = {"markdown": len(md_hits), "transcripts": len(tr_hits)}

    links = {}
    unparsed = 0
    unparsed_shapes = collections.Counter()
    where = collections.defaultdict(set)
    for kind, hits in (("markdown", md_hits), ("transcripts", tr_hits)):
        for h in hits:
            p = parse(h)
            if not p or not p["uuid"]:
                unparsed += 1
                shape = re.sub(r"[0-9a-f]{8}-[0-9a-f-]{27}", "<id>", h)[:110]
                unparsed_shapes[shape] += 1
                continue
            key = (p["sid"], p["uuid"], p["path"])
            links.setdefault(key, p)
            where[key].add(kind)

    idx = transcript_index()
    # Each transcript read once, for every uuid its links name.
    want = collections.defaultdict(set)
    for (sid, uuid, _), _p in links.items():
        want[sid].add(uuid)
    present = {}
    for sid, uuids in want.items():
        t = idx.get(sid)
        if t is None:
            continue
        try:
            text = t.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for u in uuids:
            present[(sid, u)] = f'"uuid":"{u}"' in text

    classes = collections.Counter()
    by_class_where = collections.Counter()
    roots = collections.Counter()
    versions = collections.Counter()
    examples = {}
    for key, p in links.items():
        sid, uuid, path = key
        roots[path.split("/bookmarks/sessions/")[0]] += 1
        versions[p["v"]] += 1
        try:
            exists = pathlib.Path(path).exists()
        except OSError as err:
            c = f"unreachable ({type(err).__name__})"
        else:
            if exists:
                c = "resolves"
            elif sid not in idx:
                c = "missing: session gone"
            elif present.get((sid, uuid)):
                c = "missing: regenerable"
            else:
                c = "missing: uuid gone"
        classes[c] += 1
        for k in where[key]:
            by_class_where[(c, k)] += 1
        examples.setdefault(c, p["href"][:150])

    # Known answer: the link minted for this census must resolve.
    if known:
        hit = [k for k in links if k[1] == known]
        verdicts = {classes_of for classes_of in []}
        if not hit:
            print(f"METHOD CHECK FAILED: the known link {known} was not found by the scan")
            return 1
        k = hit[0]
        if not pathlib.Path(k[2]).exists() or not present.get((k[0], k[1])):
            print(f"METHOD CHECK FAILED: the known link {known} does not resolve ({k[2]})")
            return 1
        print(f"known answer: {known} found, export exists, uuid in its transcript -- method ok")

    if "--dump" in sys.argv:
        # One href per unique link, for through_ref.ts (B1's check that ref.ts reads them all).
        out = pathlib.Path(__file__).with_name("links.txt")
        out.write_text("\n".join(p["href"] for p in links.values()) + "\n", encoding="utf-8")
        print(f"dumped {len(links)} links to {out}")

    total = len(links)
    print(f"\noccurrences: {occurrences['markdown']} in Markdown, {occurrences['transcripts']} in transcripts; {unparsed} unparsed")
    print(f"unique links (session, uuid, export path): {total}")
    for c, n in classes.most_common():
        md = by_class_where[(c, 'markdown')]
        tr = by_class_where[(c, 'transcripts')]
        print(f"  {n:6}  {c:28}  (in Markdown {md}, in transcripts {tr})")
    print(f"reconcile: {' + '.join(str(n) for n in classes.values())} = {sum(classes.values())} = {total}")
    print("\ndata roots in the links:")
    for r, n in roots.most_common():
        print(f"  {n:6}  {r}{'  (the current one)' if r == DATA_ROOT else ''}")
    print("link format versions (v=):", dict(versions))
    print(f"\nunparsed occurrences by shape ({unparsed}):")
    for s, n in unparsed_shapes.most_common(8):
        print(f"  {n:6}  {s}")
    print("\nan example of each class:")
    for c, e in examples.items():
        print(f"  {c}: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
