# POC: a `bm:` reference in a reply drawn as a clickable link

Design: `2026-10-27__14-00-02__dev-workflow-process__the-bm-short-reference-end-to-end.md` (D5), the first-mile's one POC.

**The question.** Claude Code's `Markdown` draws only `https:`, `http:` and `file:` links. Can the plugin's reply hook expand a `bm:` reference into its `file:` anchor before the existing anchored-reply drawing, so it is pressable, while replies without a reference draw exactly as before?

**Prediction (written before running).**
- P1: a reply holding `[that place](bm:<sid8>/<uuid8>)` for the current session is drawn as Markdown whose `pressableLinks` holds the expanded `file:` anchor.
- P2: a bare `bm:<sid8>/<uuid8>` token is drawn the same way, labelled with the token.
- P3: a reply with no reference has no pressable link drawn by the plugin (unchanged path).
- P4: a malformed reference (`bm:zz/123`) and one naming another session stay text.
- The whole kit suite stays green on the candidate (198 pass).

**Control arm (designed to fail).** The same test file on an unmodified copy: P1 and P2 must fail there. If they pass on the control, the tests do not detect expansion and the result is void.

**Pass criterion.** Candidate: P1-P4 pass and the kit suite has no new failure. Control: P1 and P2 fail, P3 and P4 pass.

**Not covered (stated, not tested).** The press itself (the anchored path's `onAnchorPress`, unchanged and already tested by `highlight-links.test.ts`); references inside code spans (the real unit reuses `markdownLinks`' code skipping); resolving a uuid prefix to the full uuid, the lookup form, and other sessions (design units 1 and 3); draw latency beyond the kit.

Run: `python run.py` (copies `plugin/` twice into this folder's `arms/`, never touches the live `plugin/`).
