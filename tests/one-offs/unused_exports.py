"""List exported names under plugin/hooks that no other file names.

tsc's --noUnusedLocals does not see an export nobody imports; this does, by text:
an export counts as used when its name appears as a word in any other .ts/.tsx file
under plugin/ or tests/ (tests count: a core export used only by its tests is the
tested surface, not dead weight). Names are words, so a false "used" is possible and
a false "unused" is not, except for names reached by string (none here).

Usage: python -I tests/one-offs/unused_exports.py
"""
import re
from pathlib import Path

roots = [Path('plugin'), Path('tests')]
files = [p for r in roots for p in r.rglob('*.ts*') if 'node_modules' not in p.parts and p.suffix in ('.ts', '.tsx')]
texts = {p: p.read_text(encoding='utf-8') for p in files}

decl = re.compile(r'^export (?:async )?(?:function|const|let|class|type|interface|enum) (\w+)', re.M)
listed = re.compile(r'^export \{([^}]*)\}', re.M)

unused = []
for path, text in texts.items():
    if not str(path).replace('\\', '/').startswith('plugin/hooks/'):
        continue
    names = decl.findall(text)
    for group in listed.findall(text):
        names += [n.split(' as ')[-1].strip() for n in group.split(',') if n.strip()]
    for name in names:
        word = re.compile(r'\b' + re.escape(name) + r'\b')
        if not any(word.search(t) for p, t in texts.items() if p != path):
            # used inside its own file only?
            own = len(word.findall(text))
            unused.append((str(path), name, own))

for path, name, own in sorted(unused):
    print(f'{path}  {name}  (mentions in its own file: {own})')
print(f'{len(unused)} exports named by no other file')
