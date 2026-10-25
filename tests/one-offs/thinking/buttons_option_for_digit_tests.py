"""Run the digit-button kit tests under listInput: buttons (input routing, 2026-10-25, AC5).

Since 0.6.27 the band takes a list number in its own field by default (listInput: auto).
The tests below press the band's digit buttons, the path listInput: buttons keeps, so each
gets that option; their bodies are unchanged. One-off; asserts each anchor is unique.
"""
import pathlib

TESTS = pathlib.Path(__file__).resolve().parents[3] / "plugin" / "tests"
OPT = "listInput: 'buttons'"

PLAIN = {  # test(name, async ...) -> test(name, { options: { listInput: 'buttons' } }, async ...)
    "deletion.test.ts": ["test('d after a number in the bookmarks row removes that bookmark: a tombstone keeps its place', async"],
    "footnotes.test.ts": ["test('a footnote number that does not exist says so', async", "test('in the band, 1 . then go unfolds #1', async"],
    "goldens.test.ts": ["test('p in the band opens the prompts pane and the band takes a number', async"],
    "pane-keys.test.ts": ["test(\"the band's number row draws the step keys either side of go\", async"],
    "seams.test.ts": ["test('2 go with nothing typed closes the list and brings the bar back (settle, esc)', async", "test('4 a submitted prompt ends the band waiting for a number', async"],
    "tool.test.ts": ["test('c in the bookmarks list claims the chosen record', async"],
}
WITH_OPTIONS = {  # an existing options object gains the key
    "footnotes.test.ts": ["test('hidden: 1 . 1 go still finds the footnote; 1 . go says footnotes are hidden', { options: { footnotes: 'hidden' } }, async ($, on) => {"],
    "band.test.ts": ["takes its key in the band and opens no pane`, { options: { panes: 'off' } }, async ($, on) => {"],
}

for name, anchors in PLAIN.items():
    p = TESTS / name
    t = p.read_text(encoding="utf-8")
    for a in anchors:
        done = a[: -len(", async")] + f", {{ options: {{ {OPT} }} }}, async"
        if t.count(done) == 1:
            continue  # applied by an earlier run
        assert t.count(a) == 1, (name, a, t.count(a))
        t = t.replace(a, a[: -len(", async")] + f", {{ options: {{ {OPT} }} }}, async")
    p.write_text(t, encoding="utf-8")
for name, anchors in WITH_OPTIONS.items():
    p = TESTS / name
    t = p.read_text(encoding="utf-8")
    for a in anchors:
        assert t.count(a) == 1, (name, a, t.count(a))
        t = t.replace(a, a.replace(" } }, async", f", {OPT} }} }}, async"))
    p.write_text(t, encoding="utf-8")
print("done")
