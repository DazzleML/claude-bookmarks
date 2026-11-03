#!/bin/sh
# Links a project's data folder into its vault (0.8.x unit 6a): the POSIX form of
# link-project.ps1, with a symbolic link where Windows makes a junction. The folder's contents
# move into the vault's junction point, and the link takes the folder's place. Nothing is ever
# deleted: the emptied folder is renamed aside, and a failure stops with both halves readable.
# Run by the mod as
#   sh link-project.sh <source> <target> <id> [--dry-run]
# Prints one JSON line: { ok, dryRun, steps, refused?, failedAt?, realPath?, movedAside?, moved }.
# ASCII only in this file.

SRC=${1%/}
TGT=${2%/}
ID=$3
DRY=false
[ "$4" = "--dry-run" ] && DRY=true
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
STEPS=""

esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
step() { STEPS="${STEPS}${STEPS:+,}\"$(esc "$1")\""; }
finish() { # ok, then extra JSON members (already formed), then moved
  printf '{"ok":%s,"dryRun":%s,"steps":[%s]%s,"moved":%s}\n' "$1" "$DRY" "$STEPS" "$2" "${3:-0}"
  exit 0
}
refuse() { finish false ",\"refused\":\"$(esc "$1")\"" 0; }

[ -n "$SRC" ] && [ -n "$TGT" ] && [ -n "$ID" ] || refuse 'usage: link-project.sh <source> <target> <id> [--dry-run]'

# --- checks: nothing is made or moved before all of these pass ---
# 1. the target must be on a local file system, not a network mount.
case "$TGT" in //*) refuse 'the target is a network path' ;; /*) ;; *) refuse 'the target is not an absolute path' ;; esac
probe=$TGT
while [ ! -e "$probe" ] && [ "$probe" != "/" ]; do probe=$(dirname "$probe"); done
fstype=$(stat -f -c %T "$probe" 2>/dev/null)
case "$fstype" in
  nfs*|cifs|smb*|fuse.sshfs|afpfs|9p) refuse "the target's file system is $fstype, not a local one" ;;
  "") step "1. the target's file system type could not be read here; going on" ;;
  *) step "1. the target is on a local file system ($fstype)" ;;
esac

[ -d "$SRC" ] || refuse 'the source folder does not exist'
[ -L "$SRC" ] && refuse "the source is already a link (to $(readlink "$SRC"))"
[ -f "$SRC/project.json" ] || refuse 'the source has no project.json: not a project folder'

# 2. the target is created when absent, and refused when it holds anything.
if [ -e "$TGT" ]; then
  [ -L "$TGT" ] && refuse 'the target is a link'
  [ -d "$TGT" ] || refuse 'the target is a file'
  [ -z "$(ls -A "$TGT")" ] || refuse 'the target is not empty'
  step '2. the target exists and is empty'
else
  step "2. the target will be created: $TGT"
fi

COUNT=$(ls -A "$SRC" | wc -l | tr -d ' ')
LINKTMP="$SRC.__link-$STAMP"
ASIDE="$(dirname "$SRC")/$ID.__moved-$STAMP"
step "3. a link will be made at $LINKTMP to the target, and checked with a marker"
step "4. $COUNT entries will move from the source into the target, one by one"
step "5. the emptied source will be renamed to $ASIDE, and the link into the source's place"
step '6. project.json will be read through the link'
$DRY && finish true "" 0

# --- the work ---
[ -e "$TGT" ] || mkdir -p "$TGT" || finish false ",\"failedAt\":2,\"error\":\"the target could not be created\"" 0

# 3. the link, proven by a marker written through it and read at the target itself.
ln -s "$TGT" "$LINKTMP" 2>/dev/null || finish false ",\"failedAt\":3,\"error\":\"the link could not be made\"" 0
MARK=".bm-link-check-$STAMP"
printf '%s' "$ID" > "$LINKTMP/$MARK" 2>/dev/null
seen=false
[ -f "$TGT/$MARK" ] && seen=true
rm -f "$TGT/$MARK" 2>/dev/null
$seen || finish false ",\"failedAt\":3,\"error\":\"the marker written through the link was not at the target\",\"linkAt\":\"$(esc "$LINKTMP")\"" 0

# 4. the contents, entry by entry; the first failure stops with both halves readable.
MOVED=0
for e in "$SRC"/* "$SRC"/.[!.]* "$SRC"/..?*; do
  [ -e "$e" ] || [ -L "$e" ] || continue
  mv "$e" "$TGT/" 2>/dev/null || finish false ",\"failedAt\":4,\"error\":\"$(esc "$(basename "$e")") could not be moved\",\"linkAt\":\"$(esc "$LINKTMP")\"" "$MOVED"
  MOVED=$((MOVED + 1))
done

# 5. the emptied source aside (never deleted), then the link into its place.
mv "$SRC" "$ASIDE" 2>/dev/null || finish false ",\"failedAt\":5,\"error\":\"the emptied source could not be renamed aside\",\"linkAt\":\"$(esc "$LINKTMP")\"" "$MOVED"
mv "$LINKTMP" "$SRC" 2>/dev/null || finish false ",\"failedAt\":5,\"error\":\"the link could not take the source's name; it is still at its temporary name\",\"linkAt\":\"$(esc "$LINKTMP")\",\"movedAside\":\"$(esc "$ASIDE")\"" "$MOVED"

# 6. project.json through the link, and where the link leads.
[ -f "$SRC/project.json" ] || finish false ",\"failedAt\":6,\"error\":\"project.json cannot be read through the link\",\"movedAside\":\"$(esc "$ASIDE")\"" "$MOVED"
finish true ",\"realPath\":\"$(esc "$(readlink "$SRC")")\",\"movedAside\":\"$(esc "$ASIDE")\"" "$MOVED"
