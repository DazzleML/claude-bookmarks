# POC: can the directory's reader name the programs if argv is literal at the call?

Date: 2026-10-09, evening. Subject: `plugin/hooks/register.tsx`, `userRows()` and `grepTranscript()`.

## Question

The Anthropic plugin directory's static reader reports, for bookmarks 0.3.4 (`a3c64c7`): "Programs: At least one program is started with a command the directory couldn't read", and holds `MOD_PROCESS_COMMAND_COMPUTED` ("runs a program whose name or arguments are not all written as fixed text at the call"). Both `$.process.run` calls received an `argv` variable built by a closure (`const sh = () => [...]`, `const powershell = () => [...psScript($, name), ...]`) and iterated in a `for` loop.

If each call instead receives a literal array, with the program name and every fixed flag as string literals and only the transcript path, the search text and `${$.plugin.root}` as variables, can the reader name the programs?

## Arms

| arm | shape at the call | prediction | observation | verdict |
|---|---|---|---|---|
| control (0.3.4, `a3c64c7`) | `$.process.run(argv, ...)` with `argv` from a closure through a loop variable | reader cannot name a program | "At least one program is started with a command the directory couldn't read"; Programs lists none | control fails as predicted (observed before the change) |
| experiment (0.3.5, `bdc8fbb`) | `$.process.run(['sh', '-c', '...', 'sh', pattern, path], ...)` and `$.process.run(['powershell', '-NoProfile', ..., '-File', \`${$.plugin.root}/hooks/scripts/x.ps1\`, ...], ...)`, four calls, no loop | Programs lists `sh` and `powershell`; the "couldn't read" sentence goes | Programs: `powershell`, `sh`. The sentence "At least one program is started with a command the directory couldn't read" stays (the path, the search text and `${$.plugin.root}` are still variables). One new finding appeared among the holds: "Run the one program the mod needs, by name, with fixed arguments; use the http call for requests." (read as: the reader can now see `sh -c '<pipeline>'`, a shell rather than the program itself). | **survived** on the pass criterion (both programs named); the second half of the prediction (sentence gone) was wrong, as the fallback anticipated |

## What the result teaches

Making the argv literal is what lets the reader list the programs. The remaining "couldn't read" is about the variable elements, which cannot become fixed text (the transcript path and the search text are data). The new finding is the price of legibility: the reader now sees that `sh` is a shell wrapper around `grep`, and asks for the program itself with fixed arguments. Two follow-ups, neither for the submission night:

1. `grepTranscript()` can call `grep` directly: `['grep', '-bnF', '--', pattern, path]`, no `sh -c`. Same behaviour where grep exists (Git Bash puts it on PATH on Windows; a spawn without a shell still finds it).
2. `userRows()` uses a pipeline (`grep -F user | grep -vF tool_result`) to keep tool-result rows out of the 4 MiB stdout cap. Dropping the shell means either a single `grep` with the filter done in-process (risking the cap on long transcripts) or `grep -F '"type":"user"'` piped nowhere and parsed with `promptTextOf()`, which already discards tool-result rows. Measure the stdout size on the 18 MB transcript before choosing.

Pass criterion: the Programs section names at least `sh` and `powershell`. The hold `MOD_PROCESS_COMMAND_COMPUTED` may stay (path and pattern are still variables); its disappearance is not required.

Fallback if refuted: keep the literal form (it is also the clearer code and the argument discipline is unchanged), accept the wording, and carry the structural question (engine-held conversation instead of the file; uuid-only addresses) to the pending `/rethink`.

## Behaviour held constant

Same fallback order (user rows: PowerShell first on a Windows path, then sh; grep: sh first, then PowerShell), same 60 s timeout, same accept conditions (exit 0 or stdout; grep also exit 1), same return shape `{ via, ms, exitCode, stdout, stderr, isStdoutTruncated }`. `psScript()` removed. The row markers `"type":"user"` and `"type":"tool_result"` are spelled out at the call so the command is fixed text; the constants `USER_ROW` / `TOOL_RESULT_ROW` remain for the parser.

Checks before pushing: `npx tsc -p plugin --noEmit`, `node --test plugin/hooks/core/*.test.ts` (32), `claude plugin validate ./plugin`, and a live `Ctrl+] p` (prompts pane back-fill, the user-rows path) plus one `bookmark` tool call (the grep path) after hot reload.
