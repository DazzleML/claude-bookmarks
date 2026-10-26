# core/places/

What a place in a conversation is, without the engine: any row a person might search, star, link to or list, in any of a conversation's files. The design is `2026-10-25__09-42-49__dev-workflow-process__places-search-and-tabs-the-0-7-groundwork.md`, unit 2.

| File | What it decides |
|---|---|
| `place.ts` | The `Place` address (`{ session, uuid }`, with `file` for a row outside the main transcript and `part` for one of several blocks), its kind (prompt, reply, thinking, tool call, tool result, another session's message, an agent's report, notice, event, other), who wrote it, and the attributes a search scope filters on (agent, tool, tool category, failed). `classifyRecord` turns one transcript record into its places, or names why it is skipped, so a reader can reconcile every line. |
| `landing.ts` | Where a jump to a place lands: a message on itself; any other row on the message it belongs to (the last prompt or reply before it), an agent's row where the agent was started, a stored output where the row that refers to it would land; outside (open the export) when nothing in the transcript fits. The capability table's `jump.toolRow` and `jump.agentRow` rows say when a build can land on the row itself. |
| `reader.ts` | Reading a whole conversation into places: each file fed in chunks with its own watermark, a compact row per place in memory (address, kind, attributes, a short head), the text in pieces for a search to stream, the files besides the transcript (agents' files with their types, stored outputs, a continued conversation), and the saved index a later pass resumes from. Driven by `handlers/places.ts`. |
