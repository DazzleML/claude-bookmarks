# The user rows of a Claude Code transcript, one JSON line each, on Windows where
# `sh` and `grep` may be missing. Run by the mod as
#   powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File user-rows.ps1 -Path <jsonl> -UserRow <text> -QueuedRow <text> -ToolResultRow <text>
# A line holding either marker is kept: a typed prompt (`"type":"user"`) or a message
# typed while Claude was working, which Claude Code queues and stores as an attachment
# (`"type":"queued_command"`). A line that holds the tool-result marker is a tool
# result, not a prompt, and is dropped.
# Output is UTF-8 without a BOM so the mod can count bytes. ASCII only in this file.
param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$UserRow,
    [Parameter(Mandatory = $true)][string]$QueuedRow,
    [Parameter(Mandatory = $true)][string]$ToolResultRow
)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Select-String -LiteralPath $Path -SimpleMatch -CaseSensitive -Pattern @($UserRow, $QueuedRow) -Encoding UTF8 |
    Where-Object { -not $_.Line.Contains($ToolResultRow) } |
    ForEach-Object { $_.Line }
