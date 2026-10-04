# Platform support

The plugin runs inside Claude Code, so it goes wherever Claude Code's terminal app goes. What varies is the terminal and the renderer.

| Platform / setup | Status | Notes |
|---|---|---|
| Windows 11, Windows Terminal, fullscreen renderer | **Tested** (proof of concept, Claude Code 2.1.288) | Chords, selection marks, in-place highlight, jumps |
| macOS, fullscreen renderer | Expected | Not yet tested |
| Linux, fullscreen renderer | Expected | Not yet tested |
| tmux / GNU screen | Unknown | `Ctrl+X` chords should pass through; check prefix keys |
| VS Code / JetBrains integrated terminals | Unknown | |
| Classic renderer (non-fullscreen) | Not supported | Scrolling the transcript and reading the selection need fullscreen |
| Claude Code Desktop app | Out of scope for now | |
| Screen-reader mode | Not supported | Uses the classic renderer |

Requires Claude Code **2.1.287 or later**.
