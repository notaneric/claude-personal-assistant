# check-injection.ps1 — injection-safety scanner (PowerShell)
# =============================================================
# Windows equivalent of check-injection.sh.
# Scans the repository for:
#   1. Hidden unicode characters that can be used for prompt injection
#      (zero-width spaces, bidi overrides, homoglyph candidates)
#   2. Lines that look like hardcoded secrets (common key prefixes)
#
# Usage:
#   pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/check-injection.ps1 [path]
#   (default path: repo root, auto-detected via git)
#
# Exit codes:
#   0 — clean
#   1 — one or more findings; details printed to stdout
#
# Requires: PowerShell 5.1+ or pwsh (PowerShell 7+).
# No external tools required beyond git.

param(
    [string]$ScanPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

# File extensions to scan. Add/remove as needed.
$ScanExtensions = @("py","ts","tsx","js","jsx","md","sh","ps1","yaml","yml","json","txt")

# Secret-prefix patterns (regex alternation).
$SecretPattern = "(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36,}|xoxb-[0-9]|AIza[0-9A-Za-z_\-]{35,}|AKIA[0-9A-Z]{16,})"

# ---------------------------------------------------------------------------
# SETUP
# ---------------------------------------------------------------------------

# Resolve repo root.
try {
    $RepoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
} catch {
    $RepoRoot = $PWD.Path
}
if (-not $RepoRoot) { $RepoRoot = $PWD.Path }

if (-not $ScanPath) { $ScanPath = $RepoRoot }

$Errors = 0

# Build the set of files to scan (git-tracked only, matching extensions).
$GitFiles = @()
try {
    $GitFiles = git -C $RepoRoot ls-files 2>$null |
        Where-Object { $ext = [System.IO.Path]::GetExtension($_).TrimStart("."); $ScanExtensions -contains $ext } |
        ForEach-Object { Join-Path $RepoRoot $_ } |
        Where-Object { Test-Path $_ }
} catch {
    Write-Host "WARNING: could not enumerate git-tracked files; falling back to filesystem scan."
    $GitFiles = Get-ChildItem -Path $ScanPath -Recurse -File |
        Where-Object { $ScanExtensions -contains $_.Extension.TrimStart(".") } |
        Select-Object -ExpandProperty FullName
}

if ($GitFiles.Count -eq 0) {
    Write-Host "No files found to scan."
    exit 0
}

# ---------------------------------------------------------------------------
# SCAN 1: Hidden unicode
# ---------------------------------------------------------------------------

Write-Host "==> Scanning for hidden unicode in: $ScanPath"

# Codepoints checked (referenced by numeric value, no literal chars in source):
#   0x200B = zero-width space
#   0x200C = zero-width non-joiner
#   0x200D = zero-width joiner
#   0xFEFF = zero-width no-break space / BOM
#   0x202A..0x202E = bidi embedding/override/pop chars
$HiddenCodepoints = @(0x200B, 0x200C, 0x200D, 0xFEFF, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E)

$HiddenHits = @()
foreach ($File in $GitFiles) {
    try {
        $Content = [System.IO.File]::ReadAllText($File, [System.Text.Encoding]::UTF8)
        foreach ($cp in $HiddenCodepoints) {
            $ch = [char]$cp
            if ($Content.Contains($ch)) {
                $HiddenHits += $File
                break
            }
        }
    } catch {
        # Skip unreadable files silently.
    }
}

if ($HiddenHits.Count -gt 0) {
    Write-Host "FAIL: hidden unicode characters found in:"
    $HiddenHits | ForEach-Object { Write-Host "  $_" }
    $Errors++
} else {
    Write-Host "  OK: no hidden unicode"
}

# ---------------------------------------------------------------------------
# SCAN 2: Secret prefixes
# ---------------------------------------------------------------------------

Write-Host "==> Scanning for secret prefixes"

$SecretHits = @()
foreach ($File in $GitFiles) {
    try {
        $Lines = [System.IO.File]::ReadAllLines($File, [System.Text.Encoding]::UTF8)
        $LineNum = 0
        foreach ($Line in $Lines) {
            $LineNum++
            if ($Line -match $SecretPattern) {
                # Log file+line but redact the matched value for log safety.
                $SecretHits += "${File}:${LineNum}: ...REDACTED..."
            }
        }
    } catch {
        # Skip unreadable files silently.
    }
}

if ($SecretHits.Count -gt 0) {
    Write-Host "FAIL: potential secrets found:"
    $SecretHits | ForEach-Object { Write-Host "  $_" }
    $Errors++
} else {
    Write-Host "  OK: no secret prefixes detected"
}

# ---------------------------------------------------------------------------
# RESULT
# ---------------------------------------------------------------------------

Write-Host ""
if ($Errors -gt 0) {
    Write-Host "check-injection: $Errors check(s) failed. Fix before committing."
    exit 1
} else {
    Write-Host "check-injection: all checks passed."
    exit 0
}
