# Mutation survivors triaged as equivalent or don't-care

Guarded authority, not an allowlist: each group is keyed by the target file's content hash (`git hash-object <file>`, first 12). When the file's current hash no longer matches its heading, every entry under it is stale and is re-triaged before reuse. Only separated-generation runs (modes 1-2) write here.

## plugin/hooks/core/bookmarks/register-ops.ts @ 50728a53c5df

- `const rec = recordById(reg, { ...op.id, owner: 'claude' })` -> `const rec = recordById(reg, op.id)` in `applyOp`'s `claim` -- **equivalent**: `claim()` itself looks on Claude's list by uuid and errors when nothing is there; with `n` present identity ignores the owner anyway. Only the error text for a mis-aimed id differs. 2026-10-16, mode 1 (v0.5.3 sweep, M9).
- `if (tomb && tombAt(tomb) >= lastTouched(r)) continue` -> `> lastTouched(r)` in `union` -- **equivalent**: the early `continue` is an optimisation; the `kept` filter below applies the same `>=` to every record, so what the first site lets through the second removes. 2026-10-16, mode 1 (v0.5.3 sweep, M13).

## plugin/hooks/handlers/bookmarks.ts @ 66e79932a081

- `const order = [session, ...registers.filter(s => s !== session)]` -> `const order = [...registers]` in `migrateAtStart` -- **don't-care**: the opened conversation migrating first matters only if the sweep is interrupted between files; within one start every register is migrated before the first load, so the order is unobservable without failure injection in the harness. The preference stays in the code for the interrupted case. 2026-10-16, mode 1 (v0.5.4 sweep, M12).
