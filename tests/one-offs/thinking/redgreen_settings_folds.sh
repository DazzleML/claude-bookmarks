#!/bin/sh
# Red-green audit of the settings folds (0.6.25), on a scratch copy of plugin/ and tests/core
# (never the live plugin/, which hot-reloads open sessions). Each mutant reverts one
# behaviour, keeps every signature, runs the fold tests, then restores the file.
# Usage: sh redgreen_settings_folds.sh <scratch dir holding plugin/ and tests/core/>
S="$1"
FOLD="$S/plugin/hooks/core/settings-fold.ts"
SET="$S/plugin/hooks/core/settings.ts"

core() { (cd "$S" && node --test tests/core/settings-fold.test.ts tests/core/keymap-config.test.ts 2>&1 | grep -E "^# (pass|fail)|^not ok" ); }
kit() { (cd "$S" && claude plugin test plugin 2>&1 | grep -E "^\(fail\)|^ *[0-9]+ (pass|fail)$" ); }

mutant() {
  name="$1"; file="$2"; from="$3"; to="$4"
  cp "$file" "$file.orig"
  python - "$file" "$from" "$to" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path, encoding="utf-8").read()
assert text.count(old) == 1, f"anchor not unique: {old!r} ({text.count(old)})"
open(path, "w", encoding="utf-8").write(text.replace(old, new))
PY
  echo "=== $name"
  core
  kit
  mv "$file.orig" "$file"
}

echo "=== baseline"; core; kit

mutant "M1 a fold opens on 'shown', the old value" "$FOLD" \
  "values[fold] === true" "values[fold] === 'shown'"
mutant "M2 the Bookmarks fold hides nothing" "$FOLD" \
  "  if (!open(values, SETTINGS_SHOWN_FIELD)) return true" "  if (false) return true"
mutant "M3 the debug rows ignore their fold" "$FOLD" \
  "  if (DEBUG_ROWS.has(field)) return !open(values, DEBUG_SHOWN_FIELD)" "  if (false) return !open(values, DEBUG_SHOWN_FIELD)"
mutant "M4 a fold's arrow never opens" "$FOLD" \
  "open(values, field) ? FOLD_OPEN : FOLD_CLOSED" "FOLD_CLOSED"
mutant "M5 the Bookmarks fold is a choice row again" "$SET" \
  "  settingsShown: {
    kind: 'boolean',
    default: false," "  settingsShown: {
    kind: 'enum',
    values: ['false', 'true'],
    default: 'false',"

echo "=== restored"; core; kit
grep -c "'shown'\|if (false)" "$FOLD"
