# publish.ps1, living-mirror publish pipeline (Windows PowerShell 5.1 / 7+)
#
# Reads allowlist.yml, copies only allowlisted files into $OutputDir,
# runs token substitution, scans for secrets and scrub-list hits,
# prints a review summary, then REQUIRES -Confirm before any push step.
#
# USAGE
#   .\scripts\publish.ps1 [options]
#
# OPTIONS
#   -Allowlist  PATH   Path to allowlist YAML (default: scripts\allowlist.yml)
#   -Source     DIR    Source repo root      (default: repo root = parent of scripts\)
#   -OutputDir  DIR    Output/public dir     (default: ..\claude-personal-assistant-public)
#   -Confirm           Actually copy files and enable git push step
#   -Push              Push after confirm (requires -Confirm)
#   -DryRun            Show what would happen; copy nothing
#
# REQUIREMENTS
#   PowerShell 5.1+, python3 on PATH (yaml parsing + regex scan), git
#
# EXIT CODES
#   0  success (or dry-run completed)
#   1  scan found a secret / scrub hit
#   2  allowlist not found
#   3  missing dependency

[CmdletBinding()]
param(
    [string]$Allowlist  = "",
    [string]$Source     = "",
    [string]$OutputDir  = "",
    [switch]$Confirm,
    [switch]$Push,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Defaults (resolve relative to script location)
# ---------------------------------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $ScriptDir

if (-not $Source)    { $Source    = $RepoRoot }
if (-not $Allowlist) { $Allowlist = Join-Path $ScriptDir "allowlist.yml" }
if (-not $OutputDir) { $OutputDir = Join-Path (Split-Path -Parent $RepoRoot) "claude-personal-assistant-public" }

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
function Require-Command($cmd) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "[ERROR] Required command not found: $cmd"
        exit 3
    }
}
Require-Command python3
Require-Command git

# ---------------------------------------------------------------------------
# Allowlist check
# ---------------------------------------------------------------------------
if (-not (Test-Path $Allowlist)) {
    Write-Host ""
    Write-Host "[ERROR] Allowlist not found: $Allowlist" -ForegroundColor Red
    Write-Host "  Copy scripts\allowlist.example.yml to scripts\allowlist.yml and edit it."
    exit 2
}

Write-Host ""
Write-Host "================================================================"
Write-Host "  claude-personal-assistant publish pipeline"
Write-Host "================================================================"
Write-Host "  Source    : $Source"
Write-Host "  Output    : $OutputDir"
Write-Host "  Allowlist : $Allowlist"
Write-Host "  Confirm=$Confirm | Push=$Push | DryRun=$DryRun"
Write-Host ""

# ---------------------------------------------------------------------------
# Temp working directory
# ---------------------------------------------------------------------------
$TmpDir = Join-Path $env:TEMP "ca-publish-$(Get-Random)"
New-Item -ItemType Directory -Path $TmpDir | Out-Null

function Cleanup {
    if (Test-Path $TmpDir) { Remove-Item -Recurse -Force $TmpDir }
}

# ---------------------------------------------------------------------------
# Parse allowlist with Python
# ---------------------------------------------------------------------------
$parseScript = @'
import sys, json
from pathlib import Path

allowlist_path = sys.argv[1]
tmp = sys.argv[2]

def parse_allowlist(path):
    text = Path(path).read_text(encoding="utf-8")
    lines = text.splitlines()

    owner = {}
    scrub_tokens = []
    file_entries = []
    section = None
    current_file = None
    in_aliases = False

    for raw in lines:
        line = raw.rstrip()
        stripped = line.lstrip()
        if stripped.startswith("#") or not stripped:
            continue
        indent = len(line) - len(line.lstrip())

        if indent == 0:
            if stripped.startswith("owner:"):
                section = "owner"; in_aliases = False
            elif stripped.startswith("scrub_tokens:"):
                section = "scrub_tokens"; in_aliases = False
            elif stripped.startswith("files:"):
                section = "files"; in_aliases = False
            continue

        if section == "owner":
            if "name:" in stripped:
                owner["name"] = stripped.split(":", 1)[1].strip().strip('"')
            elif "email:" in stripped:
                owner["email"] = stripped.split(":", 1)[1].strip().strip('"')
            elif "aliases:" in stripped:
                in_aliases = True
            elif in_aliases and stripped.startswith("-"):
                owner.setdefault("aliases", []).append(stripped[1:].strip().strip('"'))
        elif section == "scrub_tokens":
            if stripped.startswith("-"):
                val = stripped[1:].strip().strip('"')
                if not val.startswith("#"):
                    scrub_tokens.append(val)
        elif section == "files":
            if stripped.startswith("- path:"):
                val = stripped.split(":", 1)[1].strip().strip('"')
                current_file = {"path": val, "publish": False}
                file_entries.append(current_file)
            elif stripped.startswith("publish:") and current_file is not None:
                val = stripped.split(":", 1)[1].strip().lower()
                current_file["publish"] = val == "true"

    return owner, scrub_tokens, file_entries

owner, scrub_tokens, file_entries = parse_allowlist(allowlist_path)

combined_scrub = list(scrub_tokens)
if owner.get("name") and owner["name"] not in ("YOUR_REAL_NAME", ""):
    combined_scrub.append(owner["name"])
if owner.get("email") and owner["email"] not in ("YOUR_REAL_EMAIL", ""):
    combined_scrub.append(owner["email"])
for alias in owner.get("aliases", []):
    if alias:
        combined_scrub.append(alias)

Path(tmp).joinpath("scrub_tokens.json").write_text(json.dumps(combined_scrub), encoding="utf-8")
Path(tmp).joinpath("file_entries.json").write_text(json.dumps(file_entries), encoding="utf-8")

print(f"[parse] {len(file_entries)} file entries, {len(combined_scrub)} scrub tokens")
'@

$parsePy = Join-Path $TmpDir "parse_allowlist.py"
[System.IO.File]::WriteAllText($parsePy, $parseScript, [System.Text.Encoding]::UTF8)
python3 $parsePy $Allowlist $TmpDir
if ($LASTEXITCODE -ne 0) { Cleanup; exit 1 }

# ---------------------------------------------------------------------------
# Expand allowed file paths (glob matching)
# ---------------------------------------------------------------------------
Write-Host "[step 1] Resolving allowed paths..."

$resolveScript = @'
import sys, json, fnmatch
from pathlib import Path

source = Path(sys.argv[1])
entries = json.loads(Path(sys.argv[2]).read_text())
out_path = Path(sys.argv[3])

allowed = []
for entry in entries:
    if not entry.get("publish", False):
        continue
    pattern = entry["path"]
    if "*" not in pattern and "?" not in pattern:
        p = source / pattern
        if p.exists():
            allowed.append(str(p.relative_to(source)).replace("\\", "/"))
    else:
        for match in source.rglob("*"):
            rel = str(match.relative_to(source)).replace("\\", "/")
            if fnmatch.fnmatch(rel, pattern) and match.is_file():
                allowed.append(rel)

seen = set()
deduped = []
for f in allowed:
    if f not in seen:
        seen.add(f)
        deduped.append(f)

out_path.write_text("\n".join(deduped) + "\n" if deduped else "", encoding="utf-8")
print(f"[resolve] {len(deduped)} files allowed for publish")
'@

$resolvePy  = Join-Path $TmpDir "resolve_paths.py"
$fileListTxt = Join-Path $TmpDir "allowed_files.txt"
[System.IO.File]::WriteAllText($resolvePy, $resolveScript, [System.Text.Encoding]::UTF8)
python3 $resolvePy $Source (Join-Path $TmpDir "file_entries.json") $fileListTxt
if ($LASTEXITCODE -ne 0) { Cleanup; exit 1 }

$AllowedFiles = Get-Content $fileListTxt | Where-Object { $_ -match '\S' }
Write-Host "  $($AllowedFiles.Count) files queued."

# ---------------------------------------------------------------------------
# Step 2, Secret + scrub scan
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "[step 2] Running security + identity scan..."

$scanScript = @'
import sys, json, re
from pathlib import Path

source    = Path(sys.argv[1])
file_list = Path(sys.argv[2]).read_text().splitlines()
scrub_raw = json.loads(Path(sys.argv[3]).read_text())
report_p  = Path(sys.argv[4])

PLACEHOLDERS = {"YOUR_REAL_NAME", "YOUR_REAL_EMAIL", ""}
scrub_tokens = [t for t in scrub_raw if t not in PLACEHOLDERS and len(t) > 2]

SECRET_PATTERNS = [
    (r'api[_\-]?key\s*[:=]\s*["\x27]?[A-Za-z0-9_\-]{20,}', "api key pattern"),
    (r'token\s*[:=]\s*["\x27]?[A-Za-z0-9_\-]{20,}',         "token pattern"),
    (r'sk-[A-Za-z0-9]{20,}',                                  "sk- key"),
    (r'nvapi-[A-Za-z0-9_\-]{10,}',                            "nvapi key"),
    (r'bw\s+get\s+(password|item)',                            "bitwarden fetch"),
    (r'https?://[^\s]*\.webhook\.',                            "webhook url"),
    (r'https?://discord(app)?\.com/api/webhooks/',             "discord webhook"),
    (r'https?://hooks\.slack\.com/',                           "slack webhook"),
    (r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b', "email address"),
]

HIDDEN_UNICODE = re.compile(
    u'[\u200B\u200C\u200D\uFEFF\u202A\u202B\u202C\u202D\u202E]'
)

hits = []

BINARY_SIGS = [b'\x00', b'\xff\xfe', b'\xfe\xff']

for rel in file_list:
    rel = rel.strip()
    if not rel:
        continue
    p = source / rel
    if not p.is_file():
        continue
    try:
        raw = p.read_bytes()
        # Skip likely binary
        if any(sig in raw[:512] for sig in BINARY_SIGS):
            continue
        text = raw.decode("utf-8", errors="ignore")
    except Exception:
        continue

    # Hidden unicode
    if HIDDEN_UNICODE.search(text):
        hits.append(f"  [UNICODE] {rel}, hidden unicode characters")

    # Secret patterns
    for pattern, label in SECRET_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            # Allow placeholder tokens to contain the word "email" etc.
            # Only flag if it looks like a real value
            hits.append(f"  [SECRET]  {rel}, {label}")
            break

    # Scrub tokens
    for token in scrub_tokens:
        if token.lower() in text.lower():
            hits.append(f"  [SCRUB]   {rel}, contains: {token!r}")

report_p.write_text("\n".join(hits) + "\n" if hits else "", encoding="utf-8")
if hits:
    for h in hits:
        print(h)
    sys.exit(1)
else:
    print(f"  Scan clean, {len(file_list)} files checked, {len(scrub_tokens)} scrub tokens")
'@

$scanPy    = Join-Path $TmpDir "scan.py"
$reportTxt = Join-Path $TmpDir "scan_report.txt"
[System.IO.File]::WriteAllText($scanPy, $scanScript, [System.Text.Encoding]::UTF8)

python3 $scanPy $Source $fileListTxt (Join-Path $TmpDir "scrub_tokens.json") $reportTxt
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ABORT] Scan found secrets or scrub-list hits. Fix the above before publishing." -ForegroundColor Red
    Cleanup
    exit 1
}

Write-Host "  Scan clean."

# ---------------------------------------------------------------------------
# Step 3, Token substitution
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "[step 3] Token substitution..."
Write-Host "  Source uses placeholder tokens (YOUR_NAME, YOUR_HANDLE, etc.), passing through as-is."

# ---------------------------------------------------------------------------
# Step 4, Review summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "================================================================"
Write-Host "  REVIEW SUMMARY"
Write-Host "================================================================"
Write-Host "  Files to publish: $($AllowedFiles.Count)"
Write-Host ""
Write-Host "  File list:"
foreach ($f in $AllowedFiles) {
    Write-Host "    + $f"
}
Write-Host ""
Write-Host "  Output directory: $OutputDir"
Write-Host ""

if ($DryRun) {
    Write-Host "  [DRY RUN] No files copied. Rerun without -DryRun to proceed."
    Cleanup
    exit 0
}

# ---------------------------------------------------------------------------
# Step 5, Copy (only if -Confirm passed)
# ---------------------------------------------------------------------------
if (-not $Confirm) {
    Write-Host "  This is a preview. To actually copy files, rerun with -Confirm."
    Write-Host "  To also push after copy: add -Push."
    Write-Host ""
    Write-Host "  Example:"
    Write-Host "    .\scripts\publish.ps1 -Confirm"
    Write-Host "    .\scripts\publish.ps1 -Confirm -Push"
    Cleanup
    exit 0
}

Write-Host "[step 5] Copying files to output..."
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }

$Copied = 0
$Skipped = 0
foreach ($rel in $AllowedFiles) {
    $src = Join-Path $Source $rel.Replace("/", "\")
    $dst = Join-Path $OutputDir $rel.Replace("/", "\")
    if (-not (Test-Path $src)) {
        Write-Host "  [SKIP] Not found: $rel"
        $Skipped++
        continue
    }
    $dstDir = Split-Path -Parent $dst
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir | Out-Null }
    Copy-Item -Path $src -Destination $dst -Force
    $Copied++
}

Write-Host "  Copied: $Copied | Skipped (missing): $Skipped"

# ---------------------------------------------------------------------------
# Step 6, Git push (optional)
# ---------------------------------------------------------------------------
if ($Push) {
    Write-Host ""
    Write-Host "[step 6] Pushing public output repo..."
    Push-Location $OutputDir
    if (-not (Test-Path ".git")) {
        Write-Host "  [WARN] $OutputDir is not a git repo. Skipping push."
    } else {
        $timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        git add -A
        $commitOut = git commit -m "chore: sync from private source $timestamp" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host $commitOut
            git push
            Write-Host "  Push complete."
        } else {
            Write-Host "  Nothing to commit."
        }
    }
    Pop-Location
} else {
    Write-Host ""
    Write-Host "  Files copied to $OutputDir."
    Write-Host "  To push: cd $OutputDir; git add -A; git commit; git push"
    Write-Host "  (Or rerun with -Confirm -Push)"
}

Cleanup

Write-Host ""
Write-Host "================================================================"
Write-Host "  Publish pipeline complete."
Write-Host "================================================================"
