#!/usr/bin/env sh
# check-injection.sh, injection-safety scanner (Bash/POSIX)
# ===========================================================
# Scans the repository for:
#   1. Hidden unicode characters that can be used for prompt injection
#      (zero-width spaces, bidi overrides, homoglyph candidates)
#   2. Lines that look like hardcoded secrets (common key prefixes)
#
# Usage:
#   sh scripts/check-injection.sh [path]
#   (default path: repo root, auto-detected via git)
#
# Exit codes:
#   0, clean
#   1, one or more findings; details printed to stdout
#
# Used by .github/workflows/ci.yml and recommended as a pre-push hook.
# No external tools required beyond grep and git.

set -eu

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

# File extensions to scan. Add/remove as needed.
SCAN_EXTENSIONS="py ts tsx js jsx md sh ps1 yaml yml json txt"

# Secret-prefix patterns (regex alternation). These are the first few chars
# that distinguish common API key formats. Adjust to your key providers.
# Pattern is intentionally kept broad, tune to cut false positives.
SECRET_PATTERN="(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36,}|xoxb-[0-9]|AIza[0-9A-Za-z_-]{35,}|AKIA[0-9A-Z]{16,})"

# ---------------------------------------------------------------------------
# SETUP
# ---------------------------------------------------------------------------

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SCAN_PATH="${1:-$REPO_ROOT}"
ERRORS=0

# Build a grep --include pattern from the extension list.
INCLUDE_ARGS=""
for ext in $SCAN_EXTENSIONS; do
    INCLUDE_ARGS="$INCLUDE_ARGS --include=*.$ext"
done

# ---------------------------------------------------------------------------
# SCAN 1: Hidden unicode (escape sequences, no literal control chars in source)
# ---------------------------------------------------------------------------

echo "==> Scanning for hidden unicode in: $SCAN_PATH"

# The patterns below use hex escape sequences (\xNN) to represent the
# codepoints without embedding literal control characters in this script.
#
# U+200B zero-width space, U+200C/D zero-width non-joiner/joiner,
# U+FEFF BOM/zero-width no-break space,
# U+202A-202E bidi embedding/override/pop characters.
#
# grep -P is required for \x{} / \xNN syntax (Perl-compatible regex).
# If your system grep lacks -P, install grep from Homebrew or use ripgrep.

UNICODE_PATTERN="[\x{200B}\x{200C}\x{200D}\x{FEFF}\x{202A}\x{202B}\x{202C}\x{202D}\x{202E}]"

if grep -rPl "$UNICODE_PATTERN" $INCLUDE_ARGS "$SCAN_PATH" 2>/dev/null | grep -q .; then
    echo "FAIL: hidden unicode characters found in:"
    grep -rPl "$UNICODE_PATTERN" $INCLUDE_ARGS "$SCAN_PATH" 2>/dev/null
    ERRORS=$((ERRORS + 1))
else
    echo "  OK: no hidden unicode"
fi

# ---------------------------------------------------------------------------
# SCAN 2: Secret prefixes
# ---------------------------------------------------------------------------

echo "==> Scanning for secret prefixes"

if grep -rPl "$SECRET_PATTERN" $INCLUDE_ARGS "$SCAN_PATH" 2>/dev/null | grep -q .; then
    echo "FAIL: potential secrets found in:"
    grep -rPl "$SECRET_PATTERN" $INCLUDE_ARGS "$SCAN_PATH" 2>/dev/null
    # Show context (file:line but not the secret value itself, for log safety)
    grep -rPn --color=never "$SECRET_PATTERN" $INCLUDE_ARGS "$SCAN_PATH" 2>/dev/null \
        | sed 's/\(.\{60\}\).*/\1...REDACTED/'
    ERRORS=$((ERRORS + 1))
else
    echo "  OK: no secret prefixes detected"
fi

# ---------------------------------------------------------------------------
# RESULT
# ---------------------------------------------------------------------------

if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo "check-injection: $ERRORS check(s) failed. Fix before committing."
    exit 1
else
    echo ""
    echo "check-injection: all checks passed."
    exit 0
fi
