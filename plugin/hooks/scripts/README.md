# scripts/

PowerShell helpers the plugin runs on Windows, where `sh` and `grep` may be missing. Each is started with `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <script> ...`, from `register.tsx`, where the command line is written out literally so a reader (and the validator) can see exactly what runs.

| Script | Does |
|---|---|
| `user-rows.ps1` | Prints the user rows of a Claude Code transcript, one JSON line each (the prompts list's back-fill) |
| `grep-offsets.ps1` | `grep -bn` without grep: each matching line as `<line>:<byte offset>:<text>`, the offset in UTF-8 bytes (finding a message in the transcript) |
| `read-chunk.ps1` | One piece of the transcript by byte offset, as raw bytes cut back to a UTF-8 character boundary (the whole-conversation loader; `tail -c` and `head -c` do the same where `sh` exists) |

ASCII only, as in every script run by a Windows shell: the shells' default code pages do not read UTF-8 reliably.
