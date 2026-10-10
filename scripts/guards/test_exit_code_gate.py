"""Prove exit_code_gate blocks the trap and leaves ordinary commands alone.

A gate is only worth wiring if BOTH directions are measured: it must catch the
real construct in the shapes people actually type, and it must not fire on the
many legitimate `| tail` reads that happen every session. A guard measured in
one direction only is untested in the other.

    python scripts/guards/test_exit_code_gate.py
"""
from __future__ import annotations

import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from exit_code_gate import offending

# Constructs that trigger the trap, plus close variants.
MUST_BLOCK = [
    'python run_checks.py 2>&1 | tail -45; echo "EXIT=$?"',
    'python build.py 2>&1 | head -5; echo "build exit=$?"',
    'pytest -q | tail -20 ; echo $?',
    'npm test | head -30; echo "rc=$?"',
    'python x.py | tail -5 && echo $?',
]

# Everything ordinary that must NOT be disturbed.
MUST_ALLOW = [
    'python run_checks.py 2>&1 | tail -45',
    'git log --oneline | head -10',
    'ls -la | tail -3',
    'python check.py > /tmp/o.txt 2>&1; echo "EXIT=$?"; tail -20 /tmp/o.txt',
    'python check.py; echo "EXIT=$?"',
    'cat file.txt | head -1',
    'grep foo bar.txt | tail -2 && git status',
    'python a.py && echo $?',
    'du -k * | sort -rn | head -8',
    # A heredoc body is data, not shell. Documentation describing this very
    # trap (a commit message, a doc file) must not trip it.
    ("cat >> doc.md << 'MDEOF'\n"
     "blocks any command that pipes into tail/head and then reads $? -\n"
     "in a pipeline $? is tail's status, so a failing check prints EXIT=0.\n"
     "MDEOF\n"
     "git commit -q -m 'done'"),
    ("python - << 'PYEOF'\n"
     "print('cmd | tail -5; echo $?')\n"
     "PYEOF"),
]

fails = []
for c in MUST_BLOCK:
    if not offending(c):
        fails.append(f"MISSED (should block): {c}")
for c in MUST_ALLOW:
    if offending(c):
        fails.append(f"FALSE POSITIVE (should allow): {c}")

blocked = sum(1 for c in MUST_BLOCK if offending(c))
allowed = sum(1 for c in MUST_ALLOW if not offending(c))
print(f"caught {blocked}/{len(MUST_BLOCK)} trap constructs")
print(f"left alone {allowed}/{len(MUST_ALLOW)} legitimate commands "
      f"(false-positive rate {len(MUST_ALLOW)-allowed}/{len(MUST_ALLOW)})")
for f in fails:
    print("FAIL  " + f)
print("\nRESULT:", "PASS" if not fails else "FAIL")
sys.exit(1 if fails else 0)
