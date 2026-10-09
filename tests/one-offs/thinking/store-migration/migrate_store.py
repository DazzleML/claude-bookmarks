"""One-time merge of the plugin's Claude Code store after the rename to `bookmarks` (v0.3.0).

Claude Code keeps a plugin's `$.store` in ~/.claude/plugins/store/<plugin name>_inline-<hash>.json.
The 0.2.x plugin was named convo-bookmarks; its store holds the marks, pins, reading positions,
prompt lists, jumplists and the debug-echo policy of every conversation on this machine. The
renamed plugin writes a new file, so without this merge those are lost (the bookmark files under
~/claude/bookmarks/ are not in the store and are unaffected).

Run it ONCE, after the first interactive session has loaded the renamed plugin (so the new file
exists), with no Claude Code session open that still has the old plugin loaded:

    python tests/one-offs/thinking/store-migration/migrate_store.py            # dry run: shows what would move
    python tests/one-offs/thinking/store-migration/migrate_store.py --apply    # writes, after a .bak of the new file

Keys already present in the new file win (they are newer); every other key of the old file is
copied. The old file is left in place.
"""
from __future__ import annotations

import glob
import json
import os
import shutil
import sys
import time

STORE = os.path.join(os.path.expanduser("~"), ".claude", "plugins", "store")
OLD_PREFIX = "convo-bookmarks_inline-"
NEW_PREFIX = "bookmarks_inline-"


def main(argv: list[str]) -> int:
    apply = "--apply" in argv
    old = sorted(glob.glob(os.path.join(STORE, OLD_PREFIX + "*.json")))
    new = sorted(glob.glob(os.path.join(STORE, NEW_PREFIX + "*.json")))
    if len(old) != 1:
        print(f"expected one old store, found {len(old)}: {old}")
        return 2
    if len(new) != 1:
        print(f"expected one new store, found {len(new)}: {new}")
        print("start one interactive Claude Code session with the renamed plugin first, then run again")
        return 2
    with open(old[0], encoding="utf-8") as fh:
        old_data = json.load(fh)
    with open(new[0], encoding="utf-8") as fh:
        new_data = json.load(fh)
    moved = [k for k in old_data if k not in new_data]
    kept = [k for k in old_data if k in new_data]
    print(f"old: {os.path.basename(old[0])} ({len(old_data)} keys)")
    print(f"new: {os.path.basename(new[0])} ({len(new_data)} keys)")
    print(f"would copy {len(moved)} keys; {len(kept)} already present in the new file are left as they are")
    by_kind: dict[str, int] = {}
    for k in moved:
        by_kind[k.split(":", 1)[0]] = by_kind.get(k.split(":", 1)[0], 0) + 1
    for kind, n in sorted(by_kind.items()):
        print(f"  {kind}: {n}")
    if not apply:
        print("dry run; add --apply to write")
        return 0
    backup = new[0] + "." + time.strftime("%Y%m%d-%H%M%S") + ".bak"
    shutil.copy2(new[0], backup)
    merged = dict(new_data)
    for k in moved:
        merged[k] = old_data[k]
    tmp = new[0] + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(merged, fh, indent=2)
    os.replace(tmp, new[0])
    print(f"wrote {len(merged)} keys to {os.path.basename(new[0])}; backup at {os.path.basename(backup)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
