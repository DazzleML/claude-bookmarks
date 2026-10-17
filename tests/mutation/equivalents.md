# Mutation survivors triaged as equivalent or don't-care

Guarded authority, not an allowlist: each group is keyed by the target file's content hash (`git hash-object <file>`, first 12). When the file's current hash no longer matches its heading, every entry under it is stale and is re-triaged before reuse. Only separated-generation runs (modes 1-2) write here.

## plugin/hooks/core/bookmarks/register-ops.ts @ 50728a53c5df

- `const rec = recordById(reg, { ...op.id, owner: 'claude' })` -> `const rec = recordById(reg, op.id)` in `applyOp`'s `claim` -- **equivalent**: `claim()` itself looks on Claude's list by uuid and errors when nothing is there; with `n` present identity ignores the owner anyway. Only the error text for a mis-aimed id differs. 2026-10-16, mode 1 (v0.5.3 sweep, M9).
- `if (tomb && tombAt(tomb) >= lastTouched(r)) continue` -> `> lastTouched(r)` in `union` -- **equivalent**: the early `continue` is an optimisation; the `kept` filter below applies the same `>=` to every record, so what the first site lets through the second removes. 2026-10-16, mode 1 (v0.5.3 sweep, M13).
