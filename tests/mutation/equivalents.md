# Mutation survivors triaged as equivalent or don't-care

Guarded authority, not an allowlist: each group is keyed by the target file's content hash (`git hash-object <file>`, first 12). When the file's current hash no longer matches its heading, every entry under it is stale and is re-triaged before reuse. Only separated-generation runs (modes 1-2) write here.

## plugin/hooks/core/bookmarks/register-ops.ts @ 79ad281cc7fb

(Re-keyed from `50728a53c5df` on 2026-10-16 for v0.5.5: the two lines below are unchanged in the new file, re-read and still equivalent.)

- `export const LETTER_HISTORY_CAP = 50` -> `49` -- **don't-care**: the value is one of the open format values djdarcy decides; the tests use the constant's name on purpose (goal 2026-10-16: "named constants ... never guessed into a check"). Its application is pinned. 2026-10-16, mode 1 (v0.5.5 sweep, M1).

- `const rec = recordById(reg, { ...op.id, owner: 'claude' })` -> `const rec = recordById(reg, op.id)` in `applyOp`'s `claim` -- **equivalent**: `claim()` itself looks on Claude's list by uuid and errors when nothing is there; with `n` present identity ignores the owner anyway. Only the error text for a mis-aimed id differs. 2026-10-16, mode 1 (v0.5.3 sweep, M9).
- `if (tomb && tombAt(tomb) >= lastTouched(r)) continue` -> `> lastTouched(r)` in `union` -- **equivalent**: the early `continue` is an optimisation; the `kept` filter below applies the same `>=` to every record, so what the first site lets through the second removes. 2026-10-16, mode 1 (v0.5.3 sweep, M13).

## plugin/hooks/handlers/bookmarks.ts @ 66e79932a081

- `const order = [session, ...registers.filter(s => s !== session)]` -> `const order = [...registers]` in `migrateAtStart` -- **don't-care**: the opened conversation migrating first matters only if the sweep is interrupted between files; within one start every register is migrated before the first load, so the order is unobservable without failure injection in the harness. The preference stays in the code for the interrupted case. 2026-10-16, mode 1 (v0.5.4 sweep, M12).

## plugin/hooks/handlers/bookmarks.ts @ f002cd7a0b83

(The file changed since `66e79932a081`; the entry above is stale for this hash and is re-triaged when `migrateAtStart` is next in a sweep's scope.)

- `e.kind !== 'file' || !e.name.endsWith('.json') || e.name === INDEX_JSON` -> `e.kind !== 'file' || !e.name.endsWith('.json')` in `rebuildIndex` -- **equivalent**: without the skip, `index.json` is read and handed to `parseRegister`, which refuses it (no `sessionId` string, no `perma` array) and returns undefined, so no entry is made and the two files written are byte-identical. The skip stays as a statement of intent and saves one parse. 2026-10-17, mode 1 (v0.5.10 sweep, M12).

## plugin/hooks/core/band/keymap.ts @ 218ea0ee18e6

- `if (UNUSABLE_NAMES.has(word))` -> `if (UNUSABLE_NAMES.has(key))` in `keyOf` -- **equivalent**: `key` differs from `word` only through `KEY_WORDS`, which maps `Space`/`space` to `' '`; no entry maps to an unusable name, so the two sets of inputs that reach the test are the same. Becomes a real difference only if a key word is ever added for an arrow or Enter, which the names set forbids by design. 2026-10-20, mode 1 (v0.6.2 sweep, M2).
- `if (by !== undefined && by !== c.id)` -> `if (by !== undefined)` in `applyKeymap`'s clash filter -- **equivalent**: `taken` is filled for a command only after its own keys are decided, and `chosen` dedupes a value's words, so a command never meets its own id in the map; the `=== c.id` half is a belt the code never needs. The sibling filter on the fallback line has the same shape; the fallback itself is pinned (M6, killed in round 2). 2026-10-20, mode 1 (v0.6.2 sweep, M5).

## plugin/hooks/handlers/command-line.ts @ 84b704e3cc08

Both entries are kit-blind rather than equivalent: the behaviour is real and is held by a live checklist line (the A6 checklist), not by a test.

- `if (operation.pane === 'list' || operation.pane === 'bookmarks') await ports.setBandNum('')` -> `&&` in `perform`'s open case -- **don't-care (kit-blind)**: a number is still typed when an open command arrives only through a chord keybinding pressed in the band's list mode; the field and the bar are drawn only while the band is idle, the kit presses drawn elements only, and `endBandMode` clears the number on every other path. Live check: `p`, a digit, then the prompts chord's keybinding; the number field reads `_`. 2026-10-20, mode 1 (v0.6.3 sweep, M1).
## plugin/hooks/views/bookmarks-pane.tsx @ 2c11c2213b9c

- `/^\d+$/.test(typed.slice(0, -1))` -> `/^\d*$/` in the `#` field's remove check -- **equivalent**: the same condition requires `typed.length > 1`, so the prefix is never empty and the two patterns accept the same inputs. 2026-10-21, mode 1 (v0.6.4 sweep, unit A5.2 round 2, N6).

## plugin/hooks/core/marks/highlight.ts @ 3b637d08b551

- `const labelEnd = labelStart + (m[1] ?? '').length` -> `+ 1`, in `markedLineMarkdown` -- **equivalent**: the words come from the plain line, which has no `]`, so a literal match in the raw line can never end one past the label (that character is the bracket); `inLabel` decides the same for every reachable input. 2026-10-21, mode 1 (v0.6.5 sweep, slice B, M5).

## plugin/hooks/handlers/bookmarks.ts @ 9f4f67325ce5

- `if (template === undefined) {` -> `if (!template) {` in `ensureReadme` -- **don't-care**: the two differ only for an empty template file, a packaging state the design never covered (missing was the case djdarcy named); an empty README written or a refusal are both defensible, and the kit cannot seed an empty template without a path it does not know. If an empty file ever shows up in practice, decide then and pin it. 2026-10-21, mode 1 (v0.6.6 sweep, slice C, M5).

## plugin/hooks/core/bookmarks/check.ts @ 74d54eb0d884

- `(p.tier ?? 'bookmark') === 'mark' && p.n !== undefined && !named.has(p.n)` -> the `p.n !== undefined` conjunct dropped, in the orphan-mark note -- **equivalent**: a letter's record is minted only in a numbered file (`setMark` refuses an unnumbered one), so no `mark` record lacks `n`; the conjunct narrows the type for `Set<number>.has`, and the mutant does not type-check. 2026-10-21, mode 1 (v0.6.4 sweep, unit A5.3, M2).

## plugin/hooks/handlers/command-line.ts @ 84b704e3cc08 (continued)

- `operation.pane === 'mark' ? 'band-mark-cancel' : undefined` -> arms swapped, in `perform`'s `handOff` call -- **don't-care (kit-blind)**: both arms end in `focusBand`, whose `$.ui.focus` is not routed to kit hooks and throws (harness note, measured 2026-10-12) before the arms can differ. The cancel press is what scrolls back after a mark's highlight; checked live. 2026-10-20, mode 1 (v0.6.3 sweep, M9).

## plugin/hooks/core/places/place.ts @ 5d12c445b567

- `...(b.is_error === true ? { failed: true } : {})` -> `...(b.is_error ? { failed: true } : {})` -- **don't-care**: Claude Code writes `is_error` as a JSON boolean (12,464 tool results in one conversation, none otherwise), so strict and truthy read the same on the real population; `=== true` stays as the stated contract. 2026-10-25, mode 1 (v0.7.0 sweep, unit 2, M1).

## plugin/hooks/core/places/reader.ts @ a0a2e5db6615

- `if (idx.open.bytes > 0 && idx.open.bytes + size > PIECE_BYTES) seal(idx)` -> the `idx.open.bytes > 0` conjunct dropped -- **equivalent**: `seal()` returns at once when the open piece has no lines. 2026-10-25, mode 1 (v0.7.0 sweep, unit 3, M6).

## plugin/hooks/handlers/places.ts @ d82b2c8e2a6c

- `got < PLACES_CHUNK - 4` -> `got < PLACES_CHUNK - 400000` -- **don't-care**: a short last chunk then reads as "not done", the next read returns 0 bytes and ends the file; the same places and watermarks, at the cost of one more program run per file. 2026-10-25, mode 1 (v0.7.0 sweep, unit 3, M11).
- `if (size <= WHOLE_READ_MAX) text` -> `if (size < WHOLE_READ_MAX - 1000000) text` -- **equivalent**: a stored output read in chunks yields the same text as one read. 2026-10-25, mode 1 (v0.7.0 sweep, unit 3, M12).
- the "already kept" skip of a stored output removed -- **don't-care**: `addPlace` refuses the duplicate; the cost is one read. 2026-10-25, mode 1 (v0.7.0 sweep, unit 3, M13).

## plugin/hooks/core/search/query.ts @ 15b79f343311

- `/^m\/(.*)$/s` -> the `s` flag dropped -- **equivalent**: a token is a run of non-whitespace and never holds a newline. 2026-10-25, mode 1 (v0.7.0 sweep, unit 4, M7).
- `if (!m && pattern === '') return undefined` -> `if (pattern === '') return undefined` -- **don't-care**: `m//` then reads as the word `m//` instead of an empty pattern matching every text; nobody types it to mean either. 2026-10-25, mode 1 (v0.7.0 sweep, unit 4, M8).

## plugin/hooks/core/places/landing.ts @ 48318f94ec03

- `messageBefore(rows, call)` -> `messageBefore(rows, call - 1)`, and `for (let j = i; ...` -> `for (let j = i - 1; ...` -- **equivalent**: neither call site starts on a message (a message target returns earlier; the Agent call's row is a tool call). 2026-10-25, mode 1 (v0.7.0 sweep, unit 5, M3, M4).
- the call lookup's `r.kind === 'tool-call'` dropped -- **equivalent**: the only other main row with the Agent call's id is its result, which always follows the call. 2026-10-25, mode 1 (unit 5, M6).
- the stored lookup's `!r.at.file?.startsWith('tool-result:')` dropped -- **equivalent**: a stored-output place never carries `stored`. 2026-10-25, mode 1 (unit 5, M8).

## plugin/hooks/core/search/search.ts @ 750b2301051e

- the no-terms listing's `.sort((a, b) => a - b)` dropped -- **equivalent**: the place reader writes rows in piece order (a row's piece never decreases along the index), so the rows in scope flattened piece by piece are already in order. 2026-10-25, mode 1 (v0.7.0 sweep, unit 4, M12).
