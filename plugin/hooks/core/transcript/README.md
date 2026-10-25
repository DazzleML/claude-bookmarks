# core/transcript/

The whole-conversation loader, without the engine. A conversation's transcript is a JSON-lines file that can run to hundreds of MB, and the engine hands back a program's output 4 MiB at a time, so the file is read once, in the background, in pieces. `handlers/transcript.ts` drives these over ports; `register.tsx` runs the program that reads each piece (`sh` with `tail`/`head`, or `scripts/read-chunk.ps1` on Windows).

| File | What it is |
|---|---|
| `loader.ts` | The reader: fed the transcript's pieces in order, it keeps one row for every prompt and reply (its uuid, its line and byte range, its role, its text and its time), carrying a line split across two pieces. |
| `index.ts` | The index a pass leaves on disk (the rows without their text, the byte watermark, the file size the pass saw), so the next load resumes where the last one stopped instead of reading the whole file again. |
