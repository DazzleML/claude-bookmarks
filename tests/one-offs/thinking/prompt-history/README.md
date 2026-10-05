# POC: full prompt history for the `Ctrl+X p` pane, with no second tool

**Question (2026-10-04).** The mod lists only the prompts it saw arrive. Older ones are in the session transcript (`~/.claude/projects/<project>/<session>.jsonl`), which `$.fs.read` cannot read (over 4 MiB; this one is 18.5 MB). `$.process.run` can run a command (argv, no shell) and returns the first 4 MiB of its stdout. Which way of getting every prompt, with its uuid, is correct and fast enough for a pane, without the user installing another tool?

**Decision it feeds.** Which helper the mod calls to back-fill a conversation's prompt history (issue #6, storage and history).

## Arms, predictions and pass criteria (written before the first run)

The reference is `measure.py`'s own parse of every transcript line (Python `json`): the set of prompt uuids and each prompt's first 200 characters. A prompt is a row with `type` `user`, not `isMeta`, not `isSidechain`, whose content is a string or holds text blocks and no `tool_result` block.

| Arm | What runs | Prediction | Pass criterion | Fallback |
|---|---|---|---|---|
| C (control) | `grep -F '"type":"user"'` alone | **Fails:** about 7 MB of output, over the 4 MiB cap, so `$.process.run` would cut it off | output > 4,194,304 bytes | (designed to fail) |
| A1 | Windows PowerShell 5.1: `Select-String` keeps `"type":"user"` lines, drops lines holding a `"type":"tool_result"` block, writes UTF-8 | every reference uuid, text identical, about 1 MB, median under 1.5 s (PowerShell start-up is slow) | uuid set equal; text equal; < 4 MiB; median < 1500 ms | if text is mangled: set the output encoding differently; if too slow: run once per conversation, not per pane |
| A2 | `sh -c 'grep -F … \| grep -vF …'` (Git Bash here; any macOS or Linux) | every uuid, text identical, about 1 MB, median under 500 ms | same, < 500 ms | if Git Bash is the only `sh` on Windows, A1 is the Windows path |
| B | `python prompt_index.py <transcript>` printing `{uuid, t, text}` | every uuid, text identical, about 37 KB, median under 1 s | same, < 1000 ms | needs Python: only as an optional path |

Filtering on `"type":"tool_result"` rather than the bare word `tool_result`: a user's own text that mentions the word is JSON-escaped inside the line (`\"type\":\"tool_result\"`), so it cannot match the unescaped form, and the prompt survives the filter.

Run: `python measure.py <path to a session transcript .jsonl>` from this folder (transcripts are under `~/.claude/projects/<project>/<session id>.jsonl`). Results go in the table below, verbatim.

## Results (2026-10-04, Windows 11, this session's transcript while it was being written)

Run 1 was **method-broken**: the control returned 0 bytes in 13 ms instead of about 7 MB. Passed as its own argv entry from a Windows process, grep's pattern `"type":"user"` lost its double quotes on the way into the MSYS grep, which then matched nothing. The control was moved behind `sh -c` (as A2 already was) and the direct form kept as probe C'. Run 2, verbatim:

```
transcript: 18,762,074 bytes, 6885 lines, 1078 with type user, 152 prompts (reference)
known answer, first prompt starts: "Hey Claude we're going to use this session as a way to learn"
known answer, recent prompt present: True

arm                                median ms   out bytes  >cap prompts missing extra text≠ U+FFFD  bad
C control: grep type user only            83   7,130,633  True     109      43     0     0      0    1
C' quoting probe: grep argv direct        13           0 False       0     152     0     0      0    0
A1 Windows PowerShell 5.1                328   1,520,043 False     152       0     0     0      0    0
A2 sh + grep | grep -v                    81   1,063,046 False     152       0     0     0      0    0
B python prompt_index.py                 140      37,996 False     152       0     0     0      0    0
```

| Arm | Verdict | Notes |
|---|---|---|
| C (control) | **failed as predicted** | 7.13 MB, over the cap. Cut at 4 MiB, the mod would have seen 109 of 152 prompts: the 43 **newest** missing, plus one line cut in half |
| C' | hazard confirmed | an argv entry holding `"` reaches an MSYS tool stripped on Windows. The mod's own `$.process.run` calls must not rely on it: use `sh -c` with the pattern inside the string, or PowerShell's `-EncodedCommand` |
| A1 | **survived** | 152/152, text identical, no mangled characters, 1.52 MB, 328 ms. Output is larger than A2's for the same lines; cause not investigated (does not affect correctness) |
| A2 | **survived** | 152/152, text identical, 1.06 MB, 81 ms (Git Bash `sh` here) |
| B | **survived** | 152/152, text identical, 38 KB, 140 ms; needs Python |

Reconciliation: 6885 lines = 1078 `type user` rows + 5807 others; of the 1078, 152 are typed prompts and 926 are tool results, meta and sidechain rows. Every arm that survived returned exactly the reference's 152 uuids, none missing, none extra.

**Not measured here:** timing through the mod's own `$.process.run` (measured from Python's `subprocess`); macOS and Linux (A2 there uses the system `sh` and `grep`); how output grows on longer conversations (this one is two days old and well under the cap).

**Verdict: survived.** Zero-install back-fill works on both platforms: Windows PowerShell 5.1 (on every Windows) for Windows, `sh` + `grep` for macOS and Linux, with the mod parsing the JSON lines itself. Python (B) is the smallest output but is an extra runtime. Next: rebuild it properly in the mod, with tests, as a one-time back-fill per conversation.
