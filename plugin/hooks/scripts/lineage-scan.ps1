# `grep -o -E <Pattern> <Path> | uniq` for Windows without grep: every match of Pattern in
# the file, one per output line, a match equal to the one before left out. The lineage scan
# (this conversation's earlier session ids). Lines are read first for the quoted keys the
# pattern names ("session_id", "forkedFrom", ...), so the regex runs only on lines that can
# match. Run by the mod as
#   powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File lineage-scan.ps1 -Path <jsonl> -Pattern <regex>
# Output is UTF-8 without a BOM. ASCII only in this file.
param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Pattern
)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$re = [regex]::new($Pattern)
$keys = @([regex]::Matches($Pattern, '"([A-Za-z_]+)":') | ForEach-Object { '"' + $_.Groups[1].Value + '"' })
$last = $null
foreach ($line in [IO.File]::ReadLines($Path, [Text.Encoding]::UTF8)) {
    $hit = $keys.Count -eq 0
    foreach ($k in $keys) { if ($line.Contains($k)) { $hit = $true; break } }
    if (-not $hit) { continue }
    foreach ($m in $re.Matches($line)) {
        if ($m.Value -ne $last) { $m.Value; $last = $m.Value }
    }
}
