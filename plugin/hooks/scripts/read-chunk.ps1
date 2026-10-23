# One piece of the conversation file, by byte offset, for the plugin's whole-conversation
# loader (slice F). The engine caps a program's output at 4 MiB per call and the file can
# run to hundreds of MB, so the plugin asks for it in pieces: this writes up to -Count
# bytes from -Offset to standard output as the raw bytes of the file (no code-page
# re-encoding; the file is UTF-8 and the plugin decodes it as such). The piece is cut
# back to a UTF-8 character boundary so a character split across two pieces never
# reaches the plugin as two broken ones; the plugin advances its offset by the bytes it
# received. The file is opened shared for reading and writing, because Claude Code holds
# it open for appends. Started by the plugin as:
#   powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File read-chunk.ps1 -Path <transcript> -Offset <bytes> -Count 4000000
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][long]$Offset,
  [int]$Count = 4000000
)
$ErrorActionPreference = 'Stop'
$fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
try {
  if ($Offset -ge $fs.Length) { exit 0 }
  $null = $fs.Seek($Offset, [System.IO.SeekOrigin]::Begin)
  $buf = New-Object byte[] $Count
  $n = 0
  while ($n -lt $Count) {
    $got = $fs.Read($buf, $n, $Count - $n)
    if ($got -le 0) { break }
    $n += $got
  }
  if ($n -eq $Count -and ($Offset + $n) -lt $fs.Length) {
    # Cut back to a UTF-8 boundary: walk back over continuation bytes (10xxxxxx) to the lead
    # byte, and drop the lead byte too when its sequence is not complete within the piece.
    $i = $n - 1
    while ($i -gt 0 -and ($buf[$i] -band 0xC0) -eq 0x80) { $i-- }
    $lead = $buf[$i]
    $need = 1
    if (($lead -band 0xE0) -eq 0xC0) { $need = 2 } elseif (($lead -band 0xF0) -eq 0xE0) { $need = 3 } elseif (($lead -band 0xF8) -eq 0xF0) { $need = 4 }
    if ($n - $i -lt $need) { $n = $i }
  }
  $out = [Console]::OpenStandardOutput()
  $out.Write($buf, 0, $n)
  $out.Flush()
} finally {
  $fs.Dispose()
}
