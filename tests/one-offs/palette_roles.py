"""Slice 3 (goal 2026-10-12__02-27-47): every drawing style in register.tsx by role (#27).

Replaces each colour, background, dim and bold prop with a spread from the palette
(style(role) for Text, buttonStyle(role) for Button, which can't be coloured at rest).
Each pattern's expected count is asserted before anything is written.
"""
import re
import sys
from pathlib import Path

REG = Path(__file__).resolve().parents[2] / "plugin" / "hooks" / "register.tsx"
src = REG.read_text(encoding="utf-8")

LITERAL = [
    ("<Text backgroundColor={LINE_BG}>", "<Text {...style('markBand')}>", 1),
    ("<Text color={WORDS_FG} bold>", "<Text {...style('mark')}>", 1),
    ("<Text dimColor wrap=", "<Text {...style('legend')} wrap=", 1),
    ('<Text key="band-num-typed" bold>', "<Text key=\"band-num-typed\" {...style('emphasis')}>", 1),
    ("| <Text bold>{last.letter}</Text>", "| <Text {...style('emphasis')}>{last.letter}</Text>", 1),
    ("plain dimColor={!marks[l]}", "plain {...(marks[l] ? {} : buttonStyle('unused'))}", 2),
    ("plain dimColor={dim && r.n !== targetN}", "plain {...(dim && r.n !== targetN ? buttonStyle('unreached') : {})}", 1),
    (
        "<Text dimColor={dim} color={isHere ? HERE_FG : undefined} bold={isHere}>",
        "<Text {...(dim ? style('unreached') : {})} {...(isHere ? style('here') : {})}>",
        2,
    ),
    ("<Text color={WORDS_FG}>★</Text>", "<Text {...style('pinned')}>★</Text>", 1),
    ("plain dimColor={dim} onPress={press}", "plain {...(dim ? buttonStyle('unreached') : {})} onPress={press}", 1),
    ("<Text color={HERE_FG}>yellow</Text> = nearest to your view", "<Text {...style('here')}>#N</Text> = nearest to your view", 1),
    ("<Text dimColor={dim}>{`", "<Text {...(dim ? style('unreached') : {})}>{`", 1),
    ("<Text color={WORDS_FG}>⚓ </Text>", "<Text {...style('pinned')}>⚓ </Text>", 1),
    ("                plain\n                dimColor={dim}\n", "                plain\n                {...(dim ? buttonStyle('unreached') : {})}\n", 1),
    ("<Text bold color={USED_FG}>{l}</Text>", "<Text {...style('emphasis')} {...style('used')}>{l}</Text>", 1),
]
REGEX = [
    (r"<Text key=\"([^\"]+)\" dimColor>", r"<Text key=\"\1\" {...style('legend')}>", 5),
    (r"<Text dimColor>", "<Text {...style('legend')}>", None),
    (r" plain dimColor (action=|onPress=)", r" plain {...buttonStyle('legend')} \1", 11),
]

for old, new, n in LITERAL:
    found = src.count(old)
    if found != n:
        sys.exit(f"expected {n} of {old!r}, found {found}")
    src = src.replace(old, new)
for pat, rep, n in REGEX:
    found = len(re.findall(pat, src))
    if n is not None and found != n:
        sys.exit(f"expected {n} of /{pat}/, found {found}")
    src = re.sub(pat, rep, src)
    print(f"/{pat}/: {found}")

REG.write_text(src, encoding="utf-8")
left = re.findall(r"dimColor|\bbold\b(?=[ >])|color=\{|backgroundColor=", src)
print("left:", len(left))
