# core/search/

Searching a conversation, without the engine: what a query says, which places it looks in, and the search that streams the place reader's pieces of text. The designs are `2026-10-25__09-42-49__dev-workflow-process__places-search-and-tabs-the-0-7-groundwork.md` (unit 4) and `2026-10-25__20-22-46__dev-workflow-process__what-a-search-searches-scopes-and-filters.md`; the match syntax is the one `2026-10-04__21-26-14__dev-workflow-process__conversation-search-and-leader.md` settled.

| File | What it decides |
|---|---|
| `query.ts` | The query: words (any order, any case), `"phrases"` (exact, case by default), `m/pattern/flags` regexes, an incomplete pattern named rather than dropped; the scope rules (`in:`, `from:`, `agent:`, `tool:`, `failed`, and their `-` exclusions, an exclusion winning); the presets the pane's on/off toggles are made of (everything, user, claude, agents, sessions, tools, outputs, thinking, notices, other); and the scope's label for the pane's title. |
| `search.ts` | The search: the rows in scope, grouped by the piece that holds their text; a listing when the query has no words (no text read); otherwise each piece read once, in order, its rows matched, with a limit and a deadline that stop it early and say so. |
