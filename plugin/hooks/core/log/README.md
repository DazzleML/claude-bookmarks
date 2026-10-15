# core/log/

The debug log and the diagnostic commands, without the engine. `handlers/log.ts` owns the log's state (the echo, the channels, the files); `handlers/debug-command.ts` and `handlers/diagnostics-commands.ts` are the commands.

| File | What it is |
|---|---|
| `log-ring.ts` | A bounded ring of lines, the debug log's file names, the timestamp forms, and the echo policy (whether this conversation's log lines are also shown as dim rows: a machine-wide default, optionally forced, and a conversation's own choice). |
| `debug.ts` | Debug channels (#35): heavier diagnostics a person turns on by name, off by default; how the channels and the echo choice are kept in one environment variable; and whether a log line may quote conversation text. |
| `diagnostics.ts` | What the `/bm-*` diagnostic commands decide and say (`/bm-ids`, `/bm-jump`, `/bm-sel`, `/bm-config`, `/bm-env`, `/bm-debug`'s arguments), as pure formatters. |
