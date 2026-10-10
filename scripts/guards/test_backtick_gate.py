#!/usr/bin/env python3
"""Negative + positive suite for backtick_gate.

A guard proven only on the cases it was written for proves little: a gate that blocks
everything passes every MUST_BLOCK case. MUST_BLOCK carries the constructs the gate exists
to stop; MUST_PASS carries the shapes that would make it unshippable if it flagged them -
legitimate substitution, single-quoted backticks, escaped backticks.

    python scripts/guards/test_backtick_gate.py
"""
import json
import subprocess
import sys
import os

GATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backtick_gate.py")

MUST_BLOCK = [
    # A multi-line python -c that edits a notes file: bash deletes the backticked span from
    # the text before python sees it.
    ('python -c "\n'
     "import io\n"
     "p='notes.md'\n"
     "new=('and neither does the `backup.old` copy, so the loss predates last week. ')\n"
     '"',
     "notes-file edit - backticked span inside python -c"),
    # The backticked span is itself a command, so bash runs it.
    ('python -c "print(\'run `deploy --prod` first\')"',
     "backticked span was an executable command"),
    ("node -e \"console.log('see `pkg.json`')\"",
     "node -e, same transport"),
    ('python3 -c "x = \\"a\\" ; print(\'`ls`\')"',
     "python3 with escaped inner double quotes, live backtick"),
]

MUST_PASS = [
    # Legitimate command substitution OUTSIDE an interpreter argument. Real bash feature.
    ('BK=`date +%F`; echo "$BK"', "plain substitution outside -c"),
    ('cd "$(dirname `which python`)" && pwd', "substitution in a normal argument"),
    # Single-quoted -c argument: bash does NOT substitute inside single quotes.
    ("python -c 'print(\"see `notes.md`\")'", "single-quoted -c is inert"),
    # Escaped backtick inside double quotes is inert to bash.
    ('python -c "print(\'\\`literal\\`\')"', "escaped backtick"),
    # No backtick at all.
    ('python -c "import json; print(json.dumps({1:2}))"', "ordinary inline python"),
    # Heredoc with backticks - a different transport, not this gate's job.
    ("python <<'EOF'\nprint('`x`')\nEOF", "quoted heredoc, not this gate"),
    ("echo hello", "trivial"),
]


def run(cmd):
    p = subprocess.run(
        [sys.executable, GATE],
        input=json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}}),
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
    return p.returncode, p.stderr


def main():
    fails = []
    for cmd, why in MUST_BLOCK:
        rc, err = run(cmd)
        ok = rc == 2
        print(("  BLOCK ok  " if ok else "  BLOCK FAIL ") + why)
        if not ok:
            fails.append(("should block", why, rc))
    for cmd, why in MUST_PASS:
        rc, err = run(cmd)
        ok = rc == 0
        print(("  PASS  ok  " if ok else "  PASS  FAIL ") + why)
        if not ok:
            fails.append(("should pass", why, rc))

    # A gate that cannot be triggered by a non-Bash tool.
    p = subprocess.run(
        [sys.executable, GATE],
        input=json.dumps({"tool_name": "Write", "tool_input": {"command": "python -c \"`x`\""}}),
        capture_output=True, text=True, timeout=60)
    if p.returncode != 0:
        fails.append(("non-Bash must be ignored", "Write payload", p.returncode))
        print("  SCOPE FAIL non-Bash payload was not ignored")
    else:
        print("  SCOPE ok   non-Bash payload ignored")

    total = len(MUST_BLOCK) + len(MUST_PASS) + 1
    print(f"\n{total - len(fails)}/{total} passed")
    for f in fails:
        print("  FAIL:", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
