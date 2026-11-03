# scripts/

PowerShell helpers the plugin runs on Windows, where `sh` and `grep` may be missing, and one `sh` script, the link script's POSIX form. Each is started with `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <script> ...`, from `register.tsx`, where the command line is written out literally so a reader (and the validator) can see exactly what runs.

| Script | Does |
|---|---|
| `user-rows.ps1` | Prints the user rows of a Claude Code transcript, one JSON line each (the prompts list's back-fill) |
| `grep-offsets.ps1` | `grep -bn` without grep: each matching line as `<line>:<byte offset>:<text>`, the offset in UTF-8 bytes (finding a message in the transcript) |
| `read-chunk.ps1` | One piece of the transcript by byte offset, as raw bytes cut back to a UTF-8 character boundary (the whole-conversation loader; `tail -c` and `head -c` do the same where `sh` exists) |
| `lineage-scan.ps1` | `grep -o -E <pattern> <file> \| uniq` without grep: every match of the pattern, one per line, a repeat of the line before left out (finding the earlier sessions a conversation continues) |
| `link-project.ps1`, `link-project.sh` | Links a project's data folder into its vault: refuses a network target, a non-empty target, a folder already linked or one with no `project.json`; makes a junction (a symbolic link on macOS and Linux) under a temporary name and proves it with a marker; moves the contents entry by entry; renames the emptied folder aside, never deleting it; prints one JSON line. `-DryRun` (`--dry-run`) prints the steps and acts on nothing. Shipped in 0.8.4 and not yet run by the plugin; a later 0.8 release runs it on a person's command |

ASCII only, as in every script run by a Windows shell: the shells' default code pages do not read UTF-8 reliably.
