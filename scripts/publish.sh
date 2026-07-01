#!/usr/bin/env bash
# publish.sh, living-mirror publish pipeline (POSIX / Linux / macOS / Git Bash)
#
# Reads allowlist.yml, copies only allowlisted files into PUBLIC_DIR,
# runs token substitution, scans for secrets and scrub-list hits,
# prints a review summary, then REQUIRES --confirm before any push step.
#
# USAGE
#   ./scripts/publish.sh [options]
#
# OPTIONS
#   --allowlist PATH   Path to allowlist YAML (default: scripts/allowlist.yml)
#   --source    DIR    Source repo root      (default: repo root = parent of scripts/)
#   --output    DIR    Output/public dir     (default: ../claude-personal-assistant-public)
#   --confirm          Actually copy files and enable git push step
#   --push             Push after confirm (requires --confirm)
#   --dry-run          Show what would happen; copy nothing
#   --help
#
# REQUIREMENTS
#   bash >= 4, python3 (yaml parsing + regex scan), git, grep, awk
#
# EXIT CODES
#   0  success (or dry-run completed)
#   1  scan found a secret / scrub hit, publish aborted
#   2  allowlist not found
#   3  missing dependency

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ALLOWLIST="${SCRIPT_DIR}/allowlist.yml"
OUTPUT_DIR="${SOURCE_DIR}/../claude-personal-assistant-public"
CONFIRM=false
PUSH=false
DRY_RUN=false

# ---------------------------------------------------------------------------
# Arg parse
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --allowlist) ALLOWLIST="$2"; shift 2 ;;
    --source)    SOURCE_DIR="$2"; shift 2 ;;
    --output)    OUTPUT_DIR="$2"; shift 2 ;;
    --confirm)   CONFIRM=true; shift ;;
    --push)      PUSH=true; shift ;;
    --dry-run)   DRY_RUN=true; shift ;;
    --help)
      grep '^#' "$0" | head -30 | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown flag: $1. Run with --help." >&2; exit 3 ;;
  esac
done

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
for cmd in python3 git grep awk; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "[ERROR] Required command not found: $cmd" >&2
    exit 3
  fi
done

# ---------------------------------------------------------------------------
# Allowlist check
# ---------------------------------------------------------------------------
if [[ ! -f "$ALLOWLIST" ]]; then
  echo ""
  echo "[ERROR] Allowlist not found: $ALLOWLIST"
  echo "  Copy scripts/allowlist.example.yml to scripts/allowlist.yml and edit it."
  exit 2
fi

echo ""
echo "================================================================"
echo "  claude-personal-assistant publish pipeline"
echo "================================================================"
echo "  Source : $SOURCE_DIR"
echo "  Output : $OUTPUT_DIR"
echo "  Allowlist: $ALLOWLIST"
echo "  Confirm: $CONFIRM | Push: $PUSH | Dry-run: $DRY_RUN"
echo ""

# ---------------------------------------------------------------------------
# Parse allowlist with Python (avoids yq dependency)
# ---------------------------------------------------------------------------
TMPDIR_WORK="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_WORK"' EXIT

python3 - "$ALLOWLIST" "$TMPDIR_WORK" <<'PYEOF'
import sys, json, re
from pathlib import Path

allowlist_path = sys.argv[1]
tmp = sys.argv[2]

# Minimal YAML parser, only handles our known structure (no PyYAML required)
def parse_allowlist(path):
    text = Path(path).read_text(encoding="utf-8")
    lines = text.splitlines()

    owner = {}
    scrub_tokens = []
    file_entries = []

    section = None
    current_file = None
    in_aliases = False
    in_scrub = False

    for raw in lines:
        line = raw.rstrip()
        stripped = line.lstrip()

        if stripped.startswith("#") or not stripped:
            continue

        indent = len(line) - len(line.lstrip())

        if indent == 0:
            if stripped.startswith("owner:"):
                section = "owner"; in_scrub = False; in_aliases = False
            elif stripped.startswith("scrub_tokens:"):
                section = "scrub_tokens"; in_scrub = True; in_aliases = False
            elif stripped.startswith("files:"):
                section = "files"; in_scrub = False; in_aliases = False
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

# Combine owner name/email/aliases into the scrub token list
combined_scrub = list(scrub_tokens)
if owner.get("name") and owner["name"] not in ("YOUR_REAL_NAME", ""):
    combined_scrub.append(owner["name"])
if owner.get("email") and owner["email"] not in ("YOUR_REAL_EMAIL", ""):
    combined_scrub.append(owner["email"])
for alias in owner.get("aliases", []):
    if alias:
        combined_scrub.append(alias)

# Write parsed data
Path(tmp).joinpath("scrub_tokens.json").write_text(json.dumps(combined_scrub), encoding="utf-8")
Path(tmp).joinpath("file_entries.json").write_text(json.dumps(file_entries), encoding="utf-8")

print(f"[parse] {len(file_entries)} file entries, {len(combined_scrub)} scrub tokens")
PYEOF

SCRUB_TOKENS_FILE="${TMPDIR_WORK}/scrub_tokens.json"
FILE_ENTRIES_FILE="${TMPDIR_WORK}/file_entries.json"

# ---------------------------------------------------------------------------
# Expand allowed file paths (glob matching relative to SOURCE_DIR)
# ---------------------------------------------------------------------------
echo "[step 1] Resolving allowed paths..."

ALLOWED_FILES_LIST="${TMPDIR_WORK}/allowed_files.txt"
python3 - "$SOURCE_DIR" "$FILE_ENTRIES_FILE" "$ALLOWED_FILES_LIST" <<'PYEOF'
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
    # If no glob chars, treat as exact path
    if "*" not in pattern and "?" not in pattern:
        p = source / pattern
        if p.exists():
            allowed.append(str(p.relative_to(source)))
    else:
        # Glob expansion
        for match in source.rglob("*"):
            rel = str(match.relative_to(source)).replace("\\", "/")
            if fnmatch.fnmatch(rel, pattern):
                if match.is_file():
                    allowed.append(rel)

# Deduplicate, preserve order
seen = set()
deduped = []
for f in allowed:
    if f not in seen:
        seen.add(f)
        deduped.append(f)

out_path.write_text("\n".join(deduped) + "\n" if deduped else "", encoding="utf-8")
print(f"[resolve] {len(deduped)} files allowed for publish")
PYEOF

mapfile -t ALLOWED_FILES < "$ALLOWED_FILES_LIST"
echo "  ${#ALLOWED_FILES[@]} files queued."

# ---------------------------------------------------------------------------
# Step 2, Secret + scrub scan
# ---------------------------------------------------------------------------
echo ""
echo "[step 2] Running security + identity scan..."

SCAN_FAIL=false
SCAN_REPORT="${TMPDIR_WORK}/scan_report.txt"
: > "$SCAN_REPORT"

# Regex patterns for secrets (independent of scrub_tokens)
SECRET_PATTERNS=(
  'api[_\-]?key\s*[:=]\s*["\x27]?[A-Za-z0-9_\-]{20,}'
  'token\s*[:=]\s*["\x27]?[A-Za-z0-9_\-]{20,}'
  'sk-[A-Za-z0-9]{20,}'
  'nvapi-[A-Za-z0-9_\-]{10,}'
  'bw\s+get\s+password'
  'bw\s+get\s+item'
  'https?://[^\s]*\.webhook\.'
  'https?://discord(app)?\.com/api/webhooks/'
  'https?://hooks\.slack\.com/'
  '\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'
)

# Hidden unicode character classes
HIDDEN_UNICODE_PATTERN='[\x{200B}\x{200C}\x{200D}\x{FEFF}\x{202A}-\x{202E}]'

for rel_path in "${ALLOWED_FILES[@]}"; do
  full_path="${SOURCE_DIR}/${rel_path}"
  [[ -f "$full_path" ]] || continue

  # Skip binary files
  if file "$full_path" | grep -qiE "binary|image|audio|video|zip|gzip|compiled"; then
    continue
  fi

  # Secret regex scan
  for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -qiPo "$pattern" "$full_path" 2>/dev/null; then
      echo "  [SECRET] $rel_path, matched pattern: $pattern" >> "$SCAN_REPORT"
      SCAN_FAIL=true
    fi
  done

  # Hidden unicode scan
  if grep -qP "$HIDDEN_UNICODE_PATTERN" "$full_path" 2>/dev/null; then
    echo "  [UNICODE] $rel_path, hidden unicode chars detected" >> "$SCAN_REPORT"
    SCAN_FAIL=true
  fi
done

# Scrub token scan (owner name, email, client names, etc.)
SCRUB_TOKENS_JSON="${TMPDIR_WORK}/scrub_tokens.json"
python3 - "$SCRUB_TOKENS_JSON" "$SOURCE_DIR" "$ALLOWED_FILES_LIST" "$SCAN_REPORT" <<'PYEOF'
import sys, json
from pathlib import Path

tokens_raw = json.loads(Path(sys.argv[1]).read_text())
source = Path(sys.argv[2])
file_list = Path(sys.argv[3]).read_text().splitlines()
report_path = sys.argv[4]

# Filter out placeholder tokens (the defaults that haven't been filled in)
PLACEHOLDERS = {"YOUR_REAL_NAME", "YOUR_REAL_EMAIL", ""}
tokens = [t for t in tokens_raw if t not in PLACEHOLDERS and len(t) > 2]

if not tokens:
    print("[scrub] No real tokens to scan (owner fields not filled in, check allowlist.yml)")
    sys.exit(0)

hits = []
for rel in file_list:
    rel = rel.strip()
    if not rel:
        continue
    p = source / rel
    if not p.is_file():
        continue
    try:
        text = p.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        continue
    for token in tokens:
        if token.lower() in text.lower():
            hits.append(f"  [SCRUB]   {rel}, contains scrub token: {token!r}")

if hits:
    with open(report_path, "a", encoding="utf-8") as f:
        f.write("\n".join(hits) + "\n")
    print(f"[scrub] {len(hits)} scrub token hit(s) found, see report")
    sys.exit(1)
else:
    print(f"[scrub] Clean, {len(tokens)} token(s) checked against {len(file_list)} files")
PYEOF
SCRUB_EXIT=$?
if [[ $SCRUB_EXIT -ne 0 ]]; then
  SCAN_FAIL=true
fi

# Print scan report
if [[ -s "$SCAN_REPORT" ]]; then
  echo ""
  echo "  *** SCAN FAILURES ***"
  cat "$SCAN_REPORT"
fi

if [[ "$SCAN_FAIL" == "true" ]]; then
  echo ""
  echo "[ABORT] Scan found secrets or scrub-list hits. Fix the above before publishing."
  exit 1
fi

echo "  Scan clean."

# ---------------------------------------------------------------------------
# Step 3, Token substitution
# ---------------------------------------------------------------------------
echo ""
echo "[step 3] Token substitution (placeholder → template values)..."

# Map: source token -> replacement in output files
declare -A TOKEN_MAP=(
  ["YOUR_NAME"]="YOUR_NAME"
  ["YOUR_HANDLE"]="YOUR_HANDLE"
  ["YOUR_EMAIL"]="YOUR_EMAIL"
  ["YOUR_REPO"]="YOUR_REPO"
)
# The source may still have any remaining placeholder-style tokens from
# the template build; these pass through unchanged to the output.
# Concrete substitutions (e.g. your real name) must NOT be in source at this point.
echo "  No concrete substitutions needed (source uses placeholder tokens already)."

# ---------------------------------------------------------------------------
# Step 4, Review summary
# ---------------------------------------------------------------------------
echo ""
echo "================================================================"
echo "  REVIEW SUMMARY"
echo "================================================================"
echo "  Files to publish: ${#ALLOWED_FILES[@]}"
echo ""
echo "  File list:"
for f in "${ALLOWED_FILES[@]}"; do
  echo "    + $f"
done
echo ""
echo "  Output directory: $OUTPUT_DIR"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo "  [DRY RUN] No files copied. Rerun without --dry-run to proceed."
  exit 0
fi

# ---------------------------------------------------------------------------
# Step 5, Copy (only if --confirm passed)
# ---------------------------------------------------------------------------
if [[ "$CONFIRM" != "true" ]]; then
  echo "  This is a preview. To actually copy files, rerun with --confirm."
  echo "  To also push after copy: add --push."
  echo ""
  echo "  Example:"
  echo "    ./scripts/publish.sh --confirm"
  echo "    ./scripts/publish.sh --confirm --push"
  exit 0
fi

echo "[step 5] Copying files to output..."
mkdir -p "$OUTPUT_DIR"

COPIED=0
SKIPPED=0
for rel_path in "${ALLOWED_FILES[@]}"; do
  src="${SOURCE_DIR}/${rel_path}"
  dst="${OUTPUT_DIR}/${rel_path}"
  if [[ ! -f "$src" ]]; then
    echo "  [SKIP] Not found: $rel_path"
    ((SKIPPED++)) || true
    continue
  fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  ((COPIED++)) || true
done

echo "  Copied: $COPIED | Skipped (missing): $SKIPPED"

# ---------------------------------------------------------------------------
# Step 6, Git push (optional, requires --push)
# ---------------------------------------------------------------------------
if [[ "$PUSH" == "true" ]]; then
  echo ""
  echo "[step 6] Pushing public output repo..."
  pushd "$OUTPUT_DIR" > /dev/null
  if [[ ! -d ".git" ]]; then
    echo "  [WARN] $OUTPUT_DIR is not a git repo. Skipping push."
  else
    git add -A
    git commit -m "chore: sync from private source $(date -u '+%Y-%m-%dT%H:%M:%SZ')" || echo "  Nothing to commit."
    git push
    echo "  Push complete."
  fi
  popd > /dev/null
else
  echo ""
  echo "  Files copied to $OUTPUT_DIR."
  echo "  To push: cd $OUTPUT_DIR && git add -A && git commit && git push"
  echo "  (Or rerun this script with --confirm --push)"
fi

echo ""
echo "================================================================"
echo "  Publish pipeline complete."
echo "================================================================"
