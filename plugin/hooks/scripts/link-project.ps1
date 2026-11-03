# Links a project's data folder into its vault (0.8.x unit 6a; the registry design's 17:50
# addendum): the folder's contents move into the vault's junction point, and a directory
# junction takes the folder's place, so the plugin keeps its one path and the vault sees the
# files. Nothing is ever deleted: the emptied folder is renamed aside, and a failure stops
# with both halves readable. Run by the mod as
#   powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File link-project.ps1 -Source <project folder> -Target <vault junction point> -Id <project id> [-DryRun]
# Prints one JSON line: { ok, dryRun, steps, refused?, failedAt?, realPath?, movedAside?, moved }.
# ASCII only in this file.
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Target,
    [Parameter(Mandatory = $true)][string]$Id,
    [switch]$DryRun
)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
$steps = New-Object System.Collections.Generic.List[string]
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')

function Finish([bool]$ok, [hashtable]$more) {
    $out = [ordered]@{ ok = $ok; dryRun = [bool]$DryRun; steps = @($steps) }
    foreach ($k in $more.Keys) { $out[$k] = $more[$k] }
    $out | ConvertTo-Json -Compress -Depth 4
    exit 0
}
function Refuse([string]$why) { Finish $false @{ refused = $why; moved = 0 } }

# Retries a rename that a scanner or an open handle holds (EPERM, EBUSY): five tries, 200 ms apart.
function Rename-Retrying([string]$from, [string]$newName) {
    for ($i = 1; $i -le 5; $i++) {
        try { Rename-Item -LiteralPath $from -NewName $newName; return $true }
        catch { if ($i -eq 5) { return $false }; Start-Sleep -Milliseconds 200 }
    }
}

$Source = $Source.TrimEnd('\', '/')
$Target = $Target.TrimEnd('\', '/')

# --- checks: nothing is made or moved before all of these pass -------------------------
# 1. the target must be on a local drive: a mapped drive or a UNC path makes a link the
#    engine cannot follow (the design's X2, X3, R5).
if ($Target -match '^[\\/]{2}') { Refuse 'the target is a network path (UNC)' }
if ($Target -notmatch '^[A-Za-z]:[\\/]') { Refuse 'the target is not an absolute path on a drive' }
$drive = [System.IO.DriveInfo]::new($Target.Substring(0, 3))
if ($drive.DriveType -ne 'Fixed' -and $drive.DriveType -ne 'Removable') { Refuse "the target's drive is $($drive.DriveType), not a local drive" }
$steps.Add("1. the target is on a local drive ($($Target.Substring(0, 2)))")

if (-not (Test-Path -LiteralPath $Source -PathType Container)) { Refuse 'the source folder does not exist' }
$src = Get-Item -LiteralPath $Source -Force
if ($src.LinkType) { Refuse "the source is already a link ($($src.LinkType) to $($src.Target))" }
if (-not (Test-Path -LiteralPath (Join-Path $Source 'project.json') -PathType Leaf)) { Refuse 'the source has no project.json: not a project folder' }

# 2. the target is created when absent, and refused when it holds anything.
$targetExists = Test-Path -LiteralPath $Target
if ($targetExists) {
    if (-not (Test-Path -LiteralPath $Target -PathType Container)) { Refuse 'the target is a file' }
    if ((Get-Item -LiteralPath $Target -Force).LinkType) { Refuse 'the target is a link' }
    if (@(Get-ChildItem -LiteralPath $Target -Force).Count -gt 0) { Refuse 'the target is not empty' }
    $steps.Add('2. the target exists and is empty')
} else {
    $steps.Add("2. the target will be created: $Target")
}

$entries = @(Get-ChildItem -LiteralPath $Source -Force)
$linkTemp = "$Source.__link-$stamp"
$aside = Join-Path (Split-Path -Parent $Source) "$Id.__moved-$stamp"
$steps.Add("3. a junction will be made at $linkTemp to the target, and checked with a marker")
$steps.Add("4. $($entries.Count) entries will move from the source into the target, one by one")
$steps.Add("5. the emptied source will be renamed to $aside, and the junction into the source's place")
$steps.Add('6. project.json will be read through the junction')
if ($DryRun) { Finish $true @{ moved = 0 } }

# --- the work ----------------------------------------------------------------------------
if (-not $targetExists) { New-Item -ItemType Directory -Path $Target -Force | Out-Null }

# 3. the junction, proven by a marker written through it and read at the target itself.
try { New-Item -ItemType Junction -Path $linkTemp -Target $Target | Out-Null }
catch { Finish $false @{ failedAt = 3; error = "the junction could not be made: $($_.Exception.Message)"; moved = 0 } }
$markerName = ".bm-link-check-$stamp"
Set-Content -LiteralPath (Join-Path $linkTemp $markerName) -Value $Id -NoNewline
$seen = Test-Path -LiteralPath (Join-Path $Target $markerName)
Remove-Item -LiteralPath (Join-Path $Target $markerName) -Force -ErrorAction SilentlyContinue
if (-not $seen) { Finish $false @{ failedAt = 3; error = 'the marker written through the junction was not at the target'; linkAt = $linkTemp; moved = 0 } }

# 4. the contents, entry by entry; the first failure stops with both halves readable.
$moved = 0
foreach ($e in $entries) {
    try { Move-Item -LiteralPath $e.FullName -Destination (Join-Path $Target $e.Name); $moved++ }
    catch { Finish $false @{ failedAt = 4; error = "$($e.Name) could not be moved: $($_.Exception.Message)"; linkAt = $linkTemp; moved = $moved } }
}

# 5. the emptied source aside (never deleted), then the junction into its place.
if (-not (Rename-Retrying $Source (Split-Path -Leaf $aside))) { Finish $false @{ failedAt = 5; error = 'the emptied source could not be renamed aside'; linkAt = $linkTemp; moved = $moved } }
if (-not (Rename-Retrying $linkTemp (Split-Path -Leaf $Source))) { Finish $false @{ failedAt = 5; error = 'the junction could not take the source''s name; it is still at its temporary name'; linkAt = $linkTemp; movedAside = $aside; moved = $moved } }

# 6. project.json through the junction, and where the junction leads.
$pj = Join-Path $Source 'project.json'
if (-not (Test-Path -LiteralPath $pj -PathType Leaf)) { Finish $false @{ failedAt = 6; error = 'project.json cannot be read through the junction'; movedAside = $aside; moved = $moved } }
$real = (Get-Item -LiteralPath $Source -Force).Target
Finish $true @{ realPath = "$real"; movedAside = $aside; moved = $moved }
