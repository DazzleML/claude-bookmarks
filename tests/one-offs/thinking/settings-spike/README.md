# Settings spike: does `userConfig` serve as the plugin's settings?

Goal slice 1 (2026-10-11). The probe is a throwaway plugin, `bookmarks-spike`, in `plugin/` beside this file: a separate plugin name, so it cannot disturb the live plugin or its store. Its whole source is `hooks/register.tsx` (about 60 lines) and a `plugin.json` declaring two `userConfig` fields: `followHere` (a string with `options: when-idle | always | never`) and `paneAfterJump` (a boolean). `claude plugin validate` passes on it, including the `options` list.

## Already known before running

- Claude Code's manifest schema (local 2.1.273 source, `utils/plugins/schemas.ts:587-650`) types a field as `string | number | boolean | directory | file` with `title`, `description`, `required`, `default`, `multiple`, `sensitive`, `min`, `max`; **keys must be identifiers** (they become `CLAUDE_PLUGIN_OPTION_<KEY>` environment variables in hooks). Values are saved to `settings.json` under `pluginConfigs[<plugin>].options`. "Users are prompted at enable time."
- The 2.1.273 schema is strict and has no `options`; the current typings (`index.d.ts:7654-7666`) say a string field that declares `options` is drawn as a picker. The validator on this machine accepted `options` (2026-10-11), so the installed build knows it.

## Predictions (written before the run)

| # | Question | Prediction |
|---|---|---|
| P1 | Does `/config` list both fields? | Yes, under the plugin's name |
| P2 | Is `followHere` drawn as a picker of three? | Yes (the typings say so; the validator accepts `options`) |
| P3 | Do the values reach `register(on, options)`? | Yes, with defaults filled in: `{"followHere":"when-idle","paneAfterJump":false}` |
| P4 | Does changing a field in `/config` reload the module? | Yes: the next `/bm-spike` shows a new "module loaded" time and the new value (the typings say values are validated "before the module loads") |
| P5 | Can a typed command change a field with `$.config.set`? | Yes, `{ value }` returned, followed by a reload |
| P6 | Can a pane button change a field with `$.config.set`? | Yes, and the reload closes the pane |
| P7 | Is the person prompted for the fields when the plugin is enabled? | No, because none is `required` and each has a default |

## How to run it (the maintainer, about five minutes)

1. Start a **shell-started** session (a daemon-hosted one does not load plugin folders) with only the spike loaded, in any folder:

   **cmd.exe**
   ```cmd
   set CLAUDE_CODE_PLUGIN_DIRS=C:\code\claude-projects\claude-bookmarks\tests\one-offs\thinking\settings-spike\plugin
   claude
   ```
   **PowerShell**
   ```powershell
   $env:CLAUDE_CODE_PLUGIN_DIRS = "C:\code\claude-projects\claude-bookmarks\tests\one-offs\thinking\settings-spike\plugin"
   claude
   ```
   **POSIX (Git Bash)**
   ```bash
   CLAUDE_CODE_PLUGIN_DIRS="/c/code/claude-projects/claude-bookmarks/tests/one-offs/thinking/settings-spike/plugin" claude
   ```
2. Note whether you were asked anything about the plugin's settings on start (P7).
3. Type `/bm-spike`. A dim row shows the load time, `options`, and the plugin's `/config` rows (P3).
4. Open `/config`, find "Prompts pane follows the view": is it a picker of three (P1, P2)? Change it to `always`, leave `/config`, type `/bm-spike` again: did the load time change, and does `options` show `always` (P4)?
5. Type `/bm-spike set followHere never`, then `/bm-spike` (P5).
6. Type `/bm-spike pane`, press "paneAfterJump = true": did the pane close, and what does `/bm-spike` show now (P6)?
7. Paste the dim rows here, or say "done" and the session reads them from the transcript.

## Decision rule

- P4, P5, P6 all **no reload**: `userConfig` holds every setting.
- **Reload** on change: `userConfig` holds the preferences set rarely (where the list opens, follow, closeness, focus, the debug default); the plugin store holds anything a pane toggles live, both behind `core/settings.ts`'s `resolve()`. A reload resets the module's state (the marks cache, the on-screen record, timers), which is tolerable for a `/config` visit and not for a pane button.
- P1 or P3 **no**: write up and stop before slice 2 (the goal's stop rule).

## Results

(to be filled in from the run)
