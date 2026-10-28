# Probe: where a prompt hook's context lands, and which door a prompt takes

Unit 0 of the design `2026-10-27__14-00-02__dev-workflow-process__the-bm-short-reference-end-to-end.md` (project-private). It decides where unit 5b keeps a prompt's `bm:` bindings.

**Method.** `plugin/` is a throwaway plugin (`bmprobe`): its `prompt.submit` hook attaches a marker (`BMPROBE-20261027-CTX`) as `context`, and rewrites `REWRITE-ME` in the text to `REWRITTEN-BY-HOOK`; its `session.append` hook records every row's door, uuid, type and name, and whether the row's text holds the marker or the rewrite. It was loaded only with `--plugin-dir`, from a scratch working folder, under `claude -p` (Claude Code 2.1.312, 2026-10-27):

```
cd cwd && claude -p --plugin-dir ../plugin --output-format json "Reply with the single word OK."
cd cwd && claude -p --plugin-dir ../plugin --output-format json "REWRITE-ME: reply with the single word OK."
cd cwd && MSYS_NO_PATHCONV=1 claude -p --plugin-dir ../plugin "/bm-env"
```

(Git Bash rewrites a leading `/` into a Windows path; `MSYS_NO_PATHCONV=1` stops it.)

**Answers.**

1. **A hook may rewrite the prompt's text.** The prompt's row came through `session.append` door `prompt` (uuid `102203fc...`) holding `REWRITTEN-BY-HOOK`.
2. **The context is written to the transcript, as its own row.** Door `hook-context`, type `attachment`, name `hook_additional_context`, its own uuid (`5e00e71d...`), holding the marker; found in the transcript file in both runs (`grep -c BMPROBE-20261027-CTX` = 2 per file, the row and the request log).
3. **Its `parentUuid` is not the prompt.** It is the row just before it (the last of the prompt's attachment rows: environment, model, tools, agents, MCP, skills). Walking the parents back from the context row reaches the prompt as the nearest typed (non-meta) user row.
4. **A local slash command raises no `prompt.submit`.** `/bm-env`'s rows came through door `command` (a caveat row and the `<command-name>` row) and no submit event fired, so no context can be attached to it. A model-backed command (a skill) goes through `prompt.submit` with `command` set, per the typings; not run here (a model turn, and it changes nothing: the design binds both doors).

**What it decides (unit 5b).** The binding lives where the prompt lives: the context row the engine writes is durable, so 5a's `bm-binding v1:` lines in it are the binding, and a reader finds a prompt's bindings by walking from a context row to its prompt. No plugin-side store is built.

The `out/` log and `cwd/` folder were scratch and are not kept.
