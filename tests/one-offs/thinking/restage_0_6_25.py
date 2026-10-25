"""Put the index's CHANGELOG.md, plugin.json and version.py back to the 0.6.25 commit's content.

sync-versions.py --auto staged the 0.6.26 working tree into the index that held the staged
0.6.25 commit (2026-10-24). This writes the 0.6.25 forms as blobs and points the index at
them; the working tree is not touched.
"""
import re
import subprocess

REPO = "C:/code/claude-projects/claude-bookmarks"


def git(*args, input_bytes=None):
    return subprocess.run(["git", "-C", REPO, *args], input=input_bytes, capture_output=True, check=True).stdout


def stage(path, text, filtered=False):
    # filtered: the text came from the working tree, so let git apply the path's line-ending
    # conversion, as `git add` would; text from a HEAD blob is already in the index's form.
    where = [f"--path={path}"] if filtered else ["--no-filters"]
    blob = git("hash-object", "-w", "--stdin", *where, input_bytes=text.encode("utf-8")).decode().strip()
    mode = git("ls-files", "-s", "--", path).decode().split()[0]
    git("update-index", "--cacheinfo", f"{mode},{blob},{path}")
    print(path, blob)


# version.py: HEAD's file at PATCH 25.
head = git("show", "HEAD:version.py").decode("utf-8")
v = head.replace("PATCH = 24", "PATCH = 25")
v = re.sub(r'__version__ = "0\.6\.24_', '__version__ = "0.6.25_', v)
assert "PATCH = 25" in v and '"0.6.25_' in v
stage("version.py", v)

# plugin.json: HEAD's manifest at version 0.6.25 (no fold or Debug: titles).
head = git("show", "HEAD:plugin/.claude-plugin/plugin.json").decode("utf-8")
p = head.replace('"version": "0.6.24"', '"version": "0.6.25"', 1)
assert '"version": "0.6.25"' in p
stage("plugin/.claude-plugin/plugin.json", p)

# CHANGELOG.md: the working tree without its [0.6.26] section.
with open(f"{REPO}/CHANGELOG.md", encoding="utf-8", newline="") as f:
    c = f.read()
start = c.index("## [0.6.26]")
end = c.index("## [0.6.25]")
c = c[:start] + c[end:]
c = c.replace("compare/v0.6.26...HEAD", "compare/v0.6.25...HEAD")
assert "compare/v0.6.25...HEAD" in c
assert "## [0.6.26]" not in c and "## [0.6.25]" in c
stage("CHANGELOG.md", c, filtered=True)
