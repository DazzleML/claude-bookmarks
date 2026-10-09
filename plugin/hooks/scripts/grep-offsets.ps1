# `grep -bn` for Windows without grep: every line of a file that contains Pattern, as
# <line>:<byteoffset>:<text>, the offset counted in UTF-8 bytes from the start of the
# file (the transcript is UTF-8 with LF line ends). Run by the mod as
#   powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File grep-offsets.ps1 -Path <jsonl> -Pattern <text>
# Output is UTF-8 without a BOM. ASCII only in this file.
param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Pattern
)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$i = 0
$off = 0
foreach ($line in [IO.File]::ReadLines($Path, [Text.Encoding]::UTF8)) {
    $i++
    if ($line.Contains($Pattern)) { '{0}:{1}:{2}' -f $i, $off, $line }
    $off += [Text.Encoding]::UTF8.GetByteCount($line) + 1
}
