#!/bin/bash
# Run the kit suite on Linux (WSL Ubuntu) against a throwaway copy of plugin/, with the
# harness's file stubs logging every path Claude Code hands them. Measures why the kit
# fails on Linux CI (66 of 145 on run 40133392990, 2026-10-24) and passes on Windows.
#
# Run from Windows:  wsl.exe -d Ubuntu-22.04 -- bash /mnt/c/code/claude-projects/claude-bookmarks/tests/one-offs/thinking/kit_linux_probe.sh [test-file-glob]
# Installs Claude Code locally into ~/kitprobe on first run (WSL clears /tmp when the distro
# stops between calls). Writes only under ~/kitprobe; never touches the repo's plugin/.
set -e
P="$HOME/kitprobe"
REPO=/mnt/c/code/claude-projects/claude-bookmarks
mkdir -p "$P/cfg"
cd "$P"
if [ ! -x node_modules/.bin/claude ]; then
  [ -f package.json ] || npm init -y >/dev/null
  npm install --silent @anthropic-ai/claude-code@2.1.308 >/dev/null 2>&1
fi
rm -rf plugin
cp -r "$REPO/plugin" ./plugin
rm -rf plugin/.vscode
# PROBE=1: add the probe test (it fails on purpose and prints the paths; console.log output
# does not reach the kit's report).
if [ -n "$PROBE" ]; then
  cp "$REPO/tests/one-offs/thinking/kit_linux_probe.test.ts" plugin/tests/zz-probe.test.ts
fi
if [ -n "$1" ]; then
  # Keep only the named test files.
  for f in plugin/tests/*.test.ts plugin/tests/*.test.tsx; do
    [ -e "$f" ] || continue
    case "$(basename "$f")" in $1) ;; *) rm -f "$f" ;; esac
  done
fi
CLAUDE_CONFIG_DIR="$P/cfg" ./node_modules/.bin/claude plugin test plugin 2>&1
