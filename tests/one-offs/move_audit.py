"""Move audit: every line a commit removed from a source file must be found in the
destination file, after the substitutions the move declared (renames, `$` -> ports).

A retroactive check for moves that were not done copy-first under /move-code: it lists
each removed line (code and comments) that cannot be found, so each can be explained
as a declared modification or put right.

Usage:
  python -I tests/one-offs/move_audit.py <commit> <source> <destination> [old=>new ...]
"""
import subprocess
import sys


def removed_lines(commit: str, source: str) -> list[str]:
    diff = subprocess.run(
        ['git', 'diff', '-U0', f'{commit}^', commit, '--', source],
        capture_output=True, text=True, encoding='utf-8', check=True,
    ).stdout
    out = []
    for line in diff.splitlines():
        if line.startswith('-') and not line.startswith('---'):
            text = line[1:].strip()
            if text and text not in ('}', '{', ')', '})', '])'):
                out.append(text)
    return out


def main() -> int:
    commit, source, destination, *subs = sys.argv[1:]
    pairs = [s.split('=>', 1) for s in subs]
    dest = subprocess.run(
        ['git', 'show', f'{commit}:{destination}'],
        capture_output=True, text=True, encoding='utf-8', check=True,
    ).stdout
    missing = []
    lines = removed_lines(commit, source)
    for text in lines:
        moved = text
        for old, new in pairs:
            moved = moved.replace(old, new)
        if moved not in dest:
            missing.append((text, moved))
    print(f'{commit}: {len(lines)} removed lines from {source}; {len(lines) - len(missing)} found in {destination}')
    for text, moved in missing:
        print(f'  NOT FOUND: {text}')
        if moved != text:
            print(f'      as:    {moved}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
