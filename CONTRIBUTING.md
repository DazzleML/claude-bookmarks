# Contributing to claude-bookmarks

Thank you for considering contributing to claude-bookmarks!

## Development Setup

### Prerequisites

- **Claude Code 2.1.287+**, fullscreen renderer (`/tui fullscreen`)
- **Git**
- **Python 3.10+** (repo tooling and its checks only; the plugin itself has no Python)
- **Node 22.6+** (optional: runs the TypeScript core tests directly, and lets you step through them in a debugger)

### Clone and run

```bash
git clone https://github.com/DazzleML/claude-bookmarks.git
cd claude-bookmarks
bash scripts/repokit-common/install-hooks.sh
claude --plugin-dir ./plugin # the mod reloads live when you save a file
```

### Checks

```bash
claude plugin validate ./plugin    # manifest + hooks module, as Claude Code reads them
claude plugin validate .           # the repository as a marketplace (.claude-plugin/marketplace.json)
npx tsc -p plugin --noEmit         # type-check the mod against the engine's generated types
node --test plugin/hooks/core/anchor.test.ts plugin/hooks/core/transcript-lines.test.ts plugin/hooks/core/register-file.test.ts
python -m pytest tests/ -v         # version.py and plugin.json stay in step
```

## Project Structure

```
plugin/.claude-plugin/plugin.json   # plugin manifest (name: bookmarks)
plugin/hooks/hooks.json             # points Claude Code at the hooks module
plugin/hooks/register.tsx           # the mod
plugin/types/index.d.ts             # declared $.state values
version.py                   # version source for the repo tooling
tests/                       # tooling checks; one-offs/ for quick probes
scripts/repokit-common/      # shared tooling (git subtree)
```

## Key Design Principles

1. **Display only**: the mod may change what is drawn, never what Claude reads or what the session file stores.
2. **No runtime dependencies**: the mod runs in Claude Code's own environment (no Node, no npm); libraries are bundled at build time when they earn their place.
3. **Readable data**: bookmarks live in plain JSON and markdown files; any index is derived from them.
4. **Tests are important**: keep logic in plain functions that can be tested and stepped through outside Claude Code.
5. **Clean commits**: one change per commit, version bumped with each.
