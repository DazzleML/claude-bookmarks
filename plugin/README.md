# Bookmarks

Vim-style marks, a reading position, a numbered prompt history and durable bookmarks inside a Claude Code conversation. Mark a line with a letter and jump back to it from anywhere; keep your place while you scroll; let Claude cite earlier places in the conversation as links you can click to jump there.

This folder is the plugin as Claude Code installs it: the manifest (`.claude-plugin/plugin.json`), the mod (`hooks/register.tsx` and its pure core under `hooks/core/`), the PowerShell fallbacks (`hooks/scripts/`) and the declared state (`types/`). Everything else, the documentation, the tests and the repository tooling, lives one level up in the [claude-bookmarks repository](https://github.com/DazzleML/claude-bookmarks).

Install it in one step on Claude Code 2.1.275 or later (this repository is also a marketplace):

```
/plugin install bookmarks --marketplace DazzleML/claude-bookmarks
```

Or load this folder directly for one session with `claude --plugin-dir /path/to/claude-bookmarks/plugin`.

Start with the repository's [README](../README.md), then [docs/status.md](../docs/status.md) for what works today and what is coming, [docs/keys.md](../docs/keys.md) for every key, and [docs/usage.md](../docs/usage.md) for each feature in detail.

Pre-alpha. Windows is the only tested platform. Licence: GPL-3.0 (see [LICENSE](LICENSE)).
