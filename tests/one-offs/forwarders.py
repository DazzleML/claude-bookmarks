"""List register.tsx's one-statement forwarders and how often each is used.

A forwarder is a top-level function whose body is one statement handing its
arguments to another module over a ports object (`await band_.x(bandPorts($))`).
Each was left by the moves so old call sites kept working; the dead-weight pass
(goal 2026-10-15__18-10-17) asks which still earn their place.

Usage: python -I tests/one-offs/forwarders.py [plugin/hooks/register.tsx]
"""
import re
import sys
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else 'plugin/hooks/register.tsx')
raw = path.read_text(encoding='utf-8')
lines = raw.splitlines()
# Uses are counted in code only: a name in a comment is not a caller.
text = '\n'.join(re.sub(r'^\s*//.*$', '', l) for l in lines)

head = re.compile(r'^(?:async )?function (\w+)\s*\(')
rows = []
for i, line in enumerate(lines):
    m = head.match(line)
    if not m or not line.rstrip().endswith('{'):
        continue
    # one statement, then the closing brace at column 0
    if i + 2 >= len(lines) or lines[i + 2] != '}':
        continue
    body = lines[i + 1].strip()
    if not re.search(r'\w+Ports\(\$\)', body):
        continue
    name = m.group(1)
    # Not `mod.name` (the target it forwards to) and not the import lines.
    code = '\n'.join(l for l in text.splitlines() if not l.startswith('import '))
    uses = len(re.findall(r'(?<![.\w])' + re.escape(name) + r'\b', code)) - 1
    in_ports = len(re.findall(r'=>\s*(?:await\s+)?' + re.escape(name) + r'\(\$', text))
    rows.append((uses, name, i + 1, in_ports, body))

rows.sort()
print(f'{len(rows)} forwarders in {path}')
print('uses  ports-factory  line  name -> body')
for uses, name, line, in_ports, body in rows:
    print(f'{uses:4}  {in_ports:13}  {line:4}  {name} -> {body}')
