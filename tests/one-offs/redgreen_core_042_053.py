"""Red-green audit of the core modules added in 0.4.42-0.4.53 (issue #5, criterion 1).

Each mutant breaks one behaviour a test claims, never the API, on a COPY of the plugin
in a scratch folder (the live plugin/ hot-reloads a running Claude Code session and is
never written). For each mutant: which tests in the module's test file turn red.

Usage: python -I tests/one-offs/redgreen_core_042_053.py <scratch dir>
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
scratch = Path(sys.argv[1]).resolve()
if scratch == REPO or REPO in scratch.parents:
    sys.exit('scratch must be outside the repository')

BE = 'plugin/hooks/core/band/band-entry.ts'
BS = 'plugin/hooks/core/band/band-state.ts'
PP = 'plugin/hooks/core/kit/pane-position.ts'
VT = 'plugin/hooks/handlers/view-tracker.ts'
TESTS = {BE: 'tests/core/band-entry.test.ts', BS: 'tests/core/band-state.test.ts', PP: 'tests/core/pane-position.test.ts', VT: 'tests/core/view-tracker.test.ts'}

# (file, id, what it breaks, old, new)
MUTANTS = [
    (BE, 'BE1', 'the enter mode never completes a number', "if (jumpsAt !== 'complete') return false", "if (false) return false"),
    (BE, 'BE2', 'a number completes though a digit could follow', 'n * 10 > count', 'true'),
    (BE, 'BE3', 'a number past the count completes', 'n >= 1 && n <= count &&', 'n >= 1 &&'),
    (BE, 'BE4', "the default jumps without Enter", "PROMPT_NUMBER_JUMPS_AT: 'enter' | 'complete' = 'enter'", "PROMPT_NUMBER_JUMPS_AT: 'enter' | 'complete' = 'complete'"),
    (BE, 'BE5', 'next and previous swapped', 'cur - dir', 'cur + dir'),
    (BE, 'BE6', 'no clamp at the newest', 'Math.min(count, Math.max(1, cur - dir))', 'Math.max(1, cur - dir)'),
    (BE, 'BE7', 'a non-number does not land on the newest', '!typed || !cur ? count', '!typed ? count'),
    (BE, 'BE8', 'empty names the newest even when not asked', "t === '' && emptyIsNewest ? count", "t === '' ? count"),
    (BE, 'BE9', 'a fraction is a position', 'Number.isInteger(n) && n >= 1', 'n >= 1'),
    (BE, 'BE10', 'the entry is not trimmed (listPosition)', "  const t = typed.trim()\n  const n = t === ''", "  const t = typed\n  const n = t === ''"),
    (BE, 'BE11', 'a pin entry is not a pin', "if (t.startsWith('*')) return", "if (false) return"),
    (BE, 'BE12', 'the pin keeps its star', "{ kind: 'pin', typed: t.slice(1) }", "{ kind: 'pin', typed: t }"),
    (BE, 'BE13', 'a filter entry is not a filter', "if (t.startsWith('/')) return", "if (false) return"),
    (BE, 'BE14', 'N. does not unfold', 'if (parsed?.unfold) return', 'if (false) return'),
    (BE, 'BE15', 'N.k is not a footnote', 'if (parsed?.k !== undefined) return', 'if (false) return'),
    (BE, 'BE16', 'an out-of-range number jumps', "n === undefined ? { kind: 'invalid', typed: t } : { kind: 'jump', n }", "{ kind: 'jump', n: n ?? 0 }"),
    (BE, 'BE17', 'a footnote matched by prompt only', 'x?.n === n && x.k === k', 'x?.n === n'),
    (BE, 'BE18', 'the group does not wrap backwards', '(current + step + groups) % groups', '(current + step) % groups'),
    (BS, 'BS1', 'a restarted wait leaves the old one running', '    this.waitTimer?.cancel()\n    this.waitTimer = start()', '    this.waitTimer = start()'),
    (BS, 'BS2', 'stopping the wait forgets nothing', '    this.waitTimer?.cancel()\n    this.waitTimer = undefined', '    this.waitTimer?.cancel()'),
    (BS, 'BS3', 'a restarted watch leaves the old one running', '    this.watchTimer?.cancel()\n    this.watchTimer = start()', '    this.watchTimer = start()'),
    (BS, 'BS4', 'ending the mode leaves the watch', '    this.stopWaiting()\n    this.stopWatching()\n    this.ringOn = undefined', '    this.stopWaiting()\n    this.ringOn = undefined'),
    (BS, 'BS5', 'ending the mode keeps the ring', '    this.stopWatching()\n    this.ringOn = undefined', '    this.stopWatching()'),
    (BS, 'BS6', 'a new conversation keeps the reminder', '    this.escOwed = false\n    this.ringOn = undefined', '    this.ringOn = undefined'),
    (BS, 'BS7', 'a new conversation keeps the ring', '    this.escOwed = false\n    this.ringOn = undefined\n  }', '    this.escOwed = false\n  }'),
    (BS, 'BS8', 'a new conversation drops the band id', '    this.escOwed = false\n    this.ringOn = undefined\n  }', '    this.escOwed = false\n    this.ringOn = undefined\n    this.requestId = undefined\n  }'),
    (PP, 'PP1', 'the restore does not clear the pane anchor', '    this.restoreTo = undefined\n    this.paneAnchor = undefined\n    this.paneView = undefined\n    return { here, block, fromPane }', '    this.restoreTo = undefined\n    this.paneView = undefined\n    return { here, block, fromPane }'),
    (PP, 'PP2', "the pane's edge is lost", "(fromPane && this.paneView?.block) || 'start'", "'start'"),
    (PP, 'PP3', 'no view spot: the anchor is not used', 'this.paneView?.uuid ?? this.paneAnchor', 'this.paneView?.uuid'),
    (PP, 'PP4', 'a jump keeps the way back', '  jumped(): void {\n    this.paneAnchor = undefined\n  }', '  jumped(): void {\n  }'),
    (PP, 'PP5', 'a pane highlight notes the top, not the pane anchor', 'paneAction ? this.paneAnchor ?? top : top', 'top'),
    (PP, 'PP6', 'every highlight counts as a pane moment', 'this.restoreIsPane = paneAction', 'this.restoreIsPane = true'),
    (PP, 'PP7', 'a non-pane restore leaves the flag set', '      this.restoreTo = undefined\n      this.restoreIsPane = true\n', '      this.restoreTo = undefined\n'),
    (PP, 'PP8', 'a new conversation keeps the restore', '  newConversation(): void {\n    this.restoreTo = undefined\n', '  newConversation(): void {\n'),
    (PP, 'PP9', 'a new conversation keeps the view', '    this.paneAnchor = undefined\n    this.paneView = undefined\n  }\n\n  /** The jump', '    this.paneAnchor = undefined\n  }\n\n  /** The jump'),
    (VT, 'VT1', 'a listed prompt under another door is no boundary', "r.door === 'prompt' || promptSet.has(r.uuid)", "r.door === 'prompt'"),
    (VT, 'VT2', 'replies share their prompt\'s order', 'order.set(r.uuid, base + ++k)', 'order.set(r.uuid, base)'),
    (VT, 'VT3', 'the screen is not put in conversation order', '.sort((a, b) => order.get(a)! - order.get(b)!)', ''),
    (VT, 'VT4', 'an uncaptured message is never the top', 'return known[0] ?? visible[0]', 'return known[0]'),
    (VT, 'VT5', 'a streaming reply does not hold the row', "if (stable.length === 0 && this.lastScreenOrder.length > 0) return this.held('a reply streaming in')", ''),
    (VT, 'VT6', 'a held rule answers nothing', '    this.heldBy = rule\n    return this.lastHere', '    this.heldBy = rule\n    return undefined'),
    (VT, 'VT7', 'a new conversation keeps the yellow row', '    this.lastHeldLogged = undefined\n    this.lastHere = undefined\n', '    this.lastHeldLogged = undefined\n'),
    (VT, 'VT8', 'any far whole report is a redraw', 'if (this.screen.recentSelfRedraw(now) && looksLikeRedraw(', 'if (looksLikeRedraw('),
    (VT, 'VT9', 'a redraw is never ignored', 'if (this.screen.recentSelfRedraw(now) && looksLikeRedraw(', 'if (false && looksLikeRedraw('),
    (VT, 'VT10', 'nothing placeable does not hold the row', "if (i === undefined && !visible.some(m => byFour.has(m.id))) return this.held(", "if (false) return this.held("),
    (VT, 'VT11', 'a second report does not cancel the pending update', '    this.viewTimer?.cancel()\n    this.viewTimer = ports.after(', '    this.viewTimer = ports.after('),
    (VT, 'VT12', 'the update runs with the list pane closed', 'if (!(await ports.listPaneOpen())) return', 'if (false) return'),
    (VT, 'VT13', 'an unmoved row still redraws the pane', 'if (here === this.lastHere) return', 'if (false) return'),
    (VT, 'VT14', "the pane follows though the setting is 'never'", "if (here && follow !== 'never' && (", 'if (here && ('),
    (VT, 'VT15', 'the pane follows to the wrong row', 'ports.scrollPaneTo(`p-${here}`)', 'ports.scrollPaneTo(`p-${this.lastHere}`)'),
    (VT, 'VT16', 'an empty screen still names an anchor', '    if (!top) return undefined\n    const reports', '    const reports'),
    (VT, 'VT17', 'the anchor is always the top message\'s start', 'return { uuid: pick.id, block: pick.block }', "return { uuid: top, block: 'start' }"),
    (VT, 'VT18', 'every message weighs one row', 'lines: seen ? seen.last - seen.first + 1 : 1', 'lines: 1'),
]


def fresh_copy():
    if scratch.exists():
        shutil.rmtree(scratch)
    shutil.copytree(REPO / 'plugin' / 'hooks', scratch / 'plugin' / 'hooks')
    shutil.copytree(REPO / 'plugin' / 'types', scratch / 'plugin' / 'types')
    (scratch / 'tests' / 'core').mkdir(parents=True)
    for t in TESTS.values():
        shutil.copy2(REPO / t, scratch / t)


def run(test_file):
    p = subprocess.run(['node', '--test', '--test-reporter=tap', test_file], cwd=scratch, capture_output=True, text=True, encoding='utf-8')
    failed = re.findall(r'^not ok \d+ - (.+)$', p.stdout, re.M)
    passed = re.findall(r'^ok \d+ - (.+)$', p.stdout, re.M)
    return passed, failed


fresh_copy()
baseline = {}
for src, t in TESTS.items():
    passed, failed = run(t)
    baseline[t] = passed
    print(f'baseline {t}: {len(passed)} pass, {len(failed)} fail')
    if failed:
        sys.exit('baseline not green')

killed_by = {name: [] for t in TESTS.values() for name in baseline[t]}
for src, mid, what, old, new in MUTANTS:
    path = scratch / src
    text = path.read_text(encoding='utf-8').replace('\r\n', '\n')
    if text.count(old) != 1:
        print(f'{mid}: anchor text found {text.count(old)} times -- mutant not applied')
        continue
    path.write_text(text.replace(old, new), encoding='utf-8')
    passed, failed = run(TESTS[src])
    shutil.copy2(REPO / src, path)  # restore the copy from the live file
    verdict = 'killed' if failed else 'SURVIVED'
    print(f'{mid} {verdict:8} {what}' + (f'  <- {"; ".join(failed)}' if failed else ''))
    for name in failed:
        killed_by.setdefault(name, []).append(mid)

print('\nper test:')
for name, mids in killed_by.items():
    print(f'  {"anchor" if mids else "GUARD "}  {name}  [{", ".join(mids) or "no mutant"}]')
