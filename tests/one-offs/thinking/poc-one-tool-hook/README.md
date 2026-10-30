# POC: one table for the plugin's tools, one tool.call hook

Does generalising the plugin's own tools (bookmark, lists) into one table hold up, and at no cost per call? djdarcy, 2026-10-27: "if things are working I don't want to mess with the internals too much ... less duplication then it's a win so long as it's not hurting our perf."

Built on a scratch copy of plugin/ (the session scratchpad, `poc-tools/candidate`), never on the live plugin/, which hot-reloads the maintainer's sessions. The baseline is `poc-tools/baseline`, an unchanged copy. `candidate.patch` in this folder is the change, so it can be re-applied to a fresh copy.

The measure before it: `../measure-plugin-tools/probe.py` (the census: 18 production lines name the tools; adding a third tool touches 7 places in 2 files) and `../measure-plugin-tools/perf.test.ts` (copied into a copy's tests/ to run).

## The proposal

- core: `PLUGIN_TOOLS`, one row per tool `{ def, word, glyph, line }`; `FOLDED_TOOLS` and the `mcp__bookmarks__<name>` names are built from it.
- register.tsx: `TOOL_HANDLERS` keyed by `def.name` (the handlers need `$`, and the validator follows `$` only into register.tsx); registration loops over `PLUGIN_TOOLS`; one `tool.call` hook on `/^mcp__bookmarks__/` notes the fold, then dispatches by name.

## Predictions, written before running

| | Prediction | Pass criterion | Fallback if it fails |
|---|---|---|---|
| P1 | one pattern hook receives both tools' calls, each reaching its own handler | the whole kit suite green on the candidate (193 + the perf test, whose known-answer check tells the two handlers apart) | keep one hook per tool; table-drive only registration and the fold |
| P2 | no measurable cost per call | per-call within the baseline's 5-run range (bookmark 2.96-3.20 ms, lists 4.36-5.19 ms), over 5 runs | the dispatch costs more than it saves: keep today's two hooks |
| P3 | the validator and the type checker accept it | `claude plugin validate` passes and `tsc --noEmit` is clean on the candidate | if the validator refuses `$` inside the handler table, the handlers become named functions declared in register.tsx |
| C | control: the candidate with `lists` left out of `TOOL_HANDLERS` | predicted to FAIL: the lists kit tests and the perf test go red | if it passes, the method cannot see a broken dispatch: discard every result |

## Results (2026-10-27)

| | Observation | Verdict |
|---|---|---|
| P3, first form | `claude plugin validate` refused it: "`$` is passed to "handler", which is not a function declared at the top of this file". A handler looked up from a table cannot take `$`. The written fallback (named functions) does not help, since the lookup is still a value | refuted |
| P3, ports form | the handlers take ports, built by one declared function `toolPorts($)`; the hook calls `handler(toolPorts($), e)`. Validator: passed. `tsc --noEmit`: clean (after typing the table with the handlers' own return types) | survived |
| P1 | candidate kit suite, 5 runs: 194 pass, 0 fail each time, the perf test's known-answer check (bookmark answers with `tombstones`, lists without) included | survived |
| P2 | per call over 200 calls, 5 runs. bookmark: baseline 2.96-3.20 ms (median 3.03), candidate 2.85-3.51 ms (median 3.20). lists: baseline 4.36-5.19 ms (median 4.46), candidate 4.21-5.86 ms (median 4.28). The ranges overlap and the medians move 0.17-0.18 ms in opposite directions: no regression above the run-to-run noise | survived |
| C | control (lists left out of `TOOL_HANDLERS`): 190 pass, 4 fail -- the three lists-tool kit tests and the perf test | failed as predicted: the method sees a broken dispatch |

Verdict: **survived, in the ports form**. Adding a third tool would touch 4 places in 2 files (its definition, a `PLUGIN_TOOLS` row, a `TOOL_HANDLERS` row, and a `toolPorts` entry when it has ports of its own) instead of 7. The tables cannot share one file, because the validator keeps `$` in register.tsx; a test that both name the same tools would keep them in step.

`candidate.patch` is the change (`diff -u` of baseline vs candidate for `hooks/core/bookmarks/tool-fold.ts` and `hooks/register.tsx`). It is a throwaway: a build would rebuild it with that test, and would likely move `PLUGIN_TOOLS` out of `core/bookmarks/` into a module of its own.
