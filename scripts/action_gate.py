#!/usr/bin/env python3
"""
action_gate.py — PreToolUse hook for Claude Code
==================================================
Blocks risky tool calls before they execute.

Wiring (in .claude/settings.json or settings.local.json):
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "python scripts/action_gate.py" }
        ]
      }
    ]
  }

How it works:
  Claude Code passes the pending tool call as JSON on stdin:
    { "tool_name": "...", "tool_input": { ... } }
  Exit 0  → allow the call.
  Exit 2  → BLOCK the call; stderr is returned to Claude as feedback.
  Exit 1  → hard error (treated as allow by Claude Code — use sparingly).

Customize the PROTECTED_PATHS and BLOCKED_PATTERNS lists below.
"""

import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# CONFIGURATION — edit these to match your environment
# ---------------------------------------------------------------------------

# Paths that must never be written or deleted.
# Use forward slashes; matching is case-insensitive on Windows.
PROTECTED_PATHS: list[str] = [
    # Add production config files, secrets stores, or critical directories.
    # Examples (uncomment and adapt):
    # ".env",
    # ".env.production",
    # "secrets/",
    # "/etc/",
]

# Protected branch names — force-pushes to these are blocked.
PROTECTED_BRANCHES: list[str] = ["main", "master", "production", "release"]

# Shell patterns that are blocked regardless of context.
# Each entry is a regex matched against the full command string.
BLOCKED_SHELL_PATTERNS: list[str] = [
    # Pipe-to-shell attacks (curl/wget piped to sh/bash)
    r"curl\s+.*\|\s*(ba)?sh",
    r"wget\s+.*\|\s*(ba)?sh",
    r"curl\s+.*\|\s*python",
    # Recursive forced removal of root or home
    r"rm\s+(-[^\s]*r[^\s]*|-[^\s]*f[^\s]*\s+-[^\s]*r[^\s]*)\s+/",
    r"rm\s+-rf\s+[/~]",
    # Write to /etc or system dirs
    r"(>|>>|tee)\s+/etc/",
    r"(>|>>|tee)\s+/usr/",
    # Direct credential extraction patterns
    r"cat\s+.*\.env",
    r"printenv\s+.*KEY",
    r"printenv\s+.*SECRET",
    r"printenv\s+.*TOKEN",
    r"printenv\s+.*PASSWORD",
]

# ---------------------------------------------------------------------------
# GATE LOGIC — you should not need to edit below this line
# ---------------------------------------------------------------------------


def block(reason: str) -> None:
    """Exit 2 to block the tool call. Claude receives the reason as feedback."""
    print(f"[action_gate] BLOCKED: {reason}", file=sys.stderr)
    sys.exit(2)


def is_protected_path(path_str: str) -> bool:
    """Return True if path_str matches or is a child of any protected path."""
    path_str = path_str.replace("\\", "/").lower()
    for protected in PROTECTED_PATHS:
        p = protected.replace("\\", "/").lower()
        if path_str == p or path_str.startswith(p.rstrip("/") + "/"):
            return True
    return False


def check_bash(tool_input: dict) -> None:
    """Gate checks for Bash tool calls."""
    command = tool_input.get("command", "")

    # Shell pattern blocklist
    for pattern in BLOCKED_SHELL_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            block(
                f"Command matches blocked pattern '{pattern}'.\n"
                "If this action is intentional, run it manually outside Claude Code."
            )

    # Force-push to protected branches
    # Matches: git push --force, git push -f, git push --force-with-lease
    force_push = re.search(
        r"git\s+push\s+.*(-f\b|--force\b|--force-with-lease\b)", command, re.IGNORECASE
    )
    if force_push:
        for branch in PROTECTED_BRANCHES:
            if branch in command:
                block(
                    f"Force-push to protected branch '{branch}' is not allowed.\n"
                    "Create a PR or ask a maintainer to override branch protection."
                )


def check_write(tool_input: dict) -> None:
    """Gate checks for file Write tool calls."""
    file_path = tool_input.get("file_path", "")
    if is_protected_path(file_path):
        block(
            f"Write to protected path '{file_path}' is not allowed.\n"
            "Edit PROTECTED_PATHS in scripts/action_gate.py to adjust this list."
        )


def check_edit(tool_input: dict) -> None:
    """Gate checks for file Edit tool calls."""
    file_path = tool_input.get("file_path", "")
    if is_protected_path(file_path):
        block(
            f"Edit to protected path '{file_path}' is not allowed.\n"
            "Edit PROTECTED_PATHS in scripts/action_gate.py to adjust this list."
        )


# Map tool names to their specific checker functions.
TOOL_CHECKERS = {
    "Bash": check_bash,
    "Write": check_write,
    "Edit": check_edit,
}


def main() -> None:
    raw = sys.stdin.read().strip()
    if not raw:
        # No input — allow (Claude Code should always send JSON, but be safe).
        sys.exit(0)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        # Malformed input — allow and log; don't block valid work on a parse bug.
        print(f"[action_gate] WARNING: could not parse stdin JSON: {exc}", file=sys.stderr)
        sys.exit(0)

    tool_name: str = payload.get("tool_name", "")
    tool_input: dict = payload.get("tool_input", {})

    checker = TOOL_CHECKERS.get(tool_name)
    if checker:
        checker(tool_input)

    # All checks passed — allow the call.
    sys.exit(0)


if __name__ == "__main__":
    main()
