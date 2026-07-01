#!/usr/bin/env python3
"""
session_recap.py — SessionStart hook for Claude Code
=====================================================
Prints a short context recap at the start of every Claude Code session:
  - Current git branch and working-tree status
  - Count of open TODO/FIXME markers across tracked files
  - Any pending items flagged in a local notes file

Wiring (in .claude/settings.json or settings.local.json):
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "python scripts/session_recap.py" }
        ]
      }
    ]
  }

Output goes to stdout so Claude Code injects it into the session context.
Errors are soft-logged to stderr; they never block the session from starting.

Customize the NOTES_FILE and SEARCH_EXTENSIONS constants below.
"""

import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------

# Path (relative to repo root) to an optional plain-text notes file.
# Each non-blank line in this file is surfaced as a pending item.
# Set to None to disable.
NOTES_FILE: str | None = ".pending-notes.txt"

# File extensions to scan for TODO/FIXME markers.
SEARCH_EXTENSIONS: list[str] = [".py", ".ts", ".tsx", ".js", ".jsx", ".md", ".sh"]

# Maximum number of TODO lines to show (to avoid flooding context).
MAX_TODOS: int = 10

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------


def run(cmd: list[str], cwd: Path | None = None) -> tuple[int, str]:
    """Run a subprocess, returning (returncode, combined output)."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=cwd,
        )
        out = (result.stdout + result.stderr).strip()
        return result.returncode, out
    except FileNotFoundError:
        return 1, f"command not found: {cmd[0]}"


def repo_root() -> Path:
    """Return the git repo root, or the current directory if not in a repo."""
    code, out = run(["git", "rev-parse", "--show-toplevel"])
    if code == 0 and out:
        return Path(out)
    return Path.cwd()


def git_branch() -> str:
    code, out = run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    return out if code == 0 else "(unknown branch)"


def git_status_summary() -> str:
    """Return a compact git status summary."""
    code, out = run(["git", "status", "--short"])
    if code != 0 or not out:
        return "clean"
    lines = out.splitlines()
    staged = sum(1 for l in lines if l and l[0] not in (" ", "?"))
    unstaged = sum(1 for l in lines if l and l[0] == " " and l[1] != " ")
    untracked = sum(1 for l in lines if l.startswith("??"))
    parts = []
    if staged:
        parts.append(f"{staged} staged")
    if unstaged:
        parts.append(f"{unstaged} unstaged")
    if untracked:
        parts.append(f"{untracked} untracked")
    return ", ".join(parts) if parts else "clean"


def find_todos(root: Path) -> list[str]:
    """Return up to MAX_TODOS TODO/FIXME lines from tracked source files."""
    import re

    pattern = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b", re.IGNORECASE)
    results: list[str] = []

    # Only scan git-tracked files to avoid scanning node_modules / build dirs.
    code, out = run(["git", "ls-files"], cwd=root)
    if code != 0 or not out:
        return results

    for rel in out.splitlines():
        if not any(rel.endswith(ext) for ext in SEARCH_EXTENSIONS):
            continue
        fp = root / rel
        try:
            for i, line in enumerate(fp.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                if pattern.search(line):
                    results.append(f"  {rel}:{i}: {line.strip()}")
                    if len(results) >= MAX_TODOS:
                        return results
        except OSError:
            continue

    return results


def read_notes(root: Path) -> list[str]:
    """Return lines from the optional pending-notes file."""
    if NOTES_FILE is None:
        return []
    path = root / NOTES_FILE
    if not path.exists():
        return []
    try:
        return [l.strip() for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    except OSError:
        return []


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------


def main() -> None:
    root = repo_root()
    branch = git_branch()
    status = git_status_summary()
    todos = find_todos(root)
    notes = read_notes(root)

    lines: list[str] = [
        "--- session recap ---",
        f"branch : {branch}",
        f"status : {status}",
    ]

    if todos:
        lines.append(f"todos  : {len(todos)} found (showing up to {MAX_TODOS})")
        lines.extend(todos)
    else:
        lines.append("todos  : none")

    if notes:
        lines.append("pending notes:")
        for note in notes:
            lines.append(f"  - {note}")

    lines.append("--- end recap ---")
    print("\n".join(lines))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Never crash the session on a recap error.
        print(f"[session_recap] WARNING: {exc}", file=sys.stderr)
        sys.exit(0)
