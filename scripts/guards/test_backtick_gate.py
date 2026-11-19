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
    # An interpreter flag before -c must not hide the opener from the gate. Bash runs a
    # backticked `git push` out of a note being appended to a file.
    ('python -I -c "\np=\'x.md\'\ns+=\'\'\'\n- NEXT: then `git push origin main` later\n\'\'\'\n"',
     "python -I -c, backticked git push"),
    ('python3 -X utf8 -c "print(\'`ls`\')"', "flag with a value before -c"),
    ('C:/Python314/python.exe -E -c "print(\'`ls`\')"', "python.exe path with a flag"),
    ("node --input-type=module -e \"console.log('`x`')\"", "node long flag before -e"),
    ('py -3 -c "print(\'`ls`\')"',
     'py launcher with -3 flag'),
    ('py -3.12 -c "print(\'`ls`\')"',
     'py launcher with a versioned flag'),
    ('pythonw -c "print(\'`ls`\')"',
     'pythonw'),
    ('perl -0777 -e "print \'`ls`\'"',
     'perl numeric flag before -e'),
    ('python -W ignore -c "print(\'`ls`\')"',
     '-W takes a separate value'),
    ('node --require ./x.js -e "console.log(\'`x`\')"',
     '--require takes a separate value'),
    ('python -Ic "print(\'`ls`\')"',
     'bundled flags ending in c'),
    ('perl -ne "print \'`ls`\'"',
     'bundled -ne'),
    ('node -pe "\'`ls`\'"',
     'bundled -pe'),
    ('python -IX utf8 -c "print(\'`ls`\')"', 'bundled flags ending in X, separate value'),
    ('perl -I lib -e "print \'`ls`\'"', 'perl -I with a separate value'),
    ('node --input-type module -e "console.log(\'`x`\')"', 'node --input-type with a separate value'),
    ('py.exe -3 -c "print(\'`ls`\')"', 'py.exe launcher'),
    ('node.exe -e "console.log(\'`x`\')"', 'node.exe'),
    ('perl.exe -e "print \'`ls`\'"', 'perl.exe'),
    ('"C:/Program Files/nodejs/node.exe" -e "console.log(\'`x`\')"', 'quoted node.exe path'),
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
    ("python -I -c 'print(\"see `notes.md`\")'", "single-quoted -c with a flag is inert"),
    ('python -I tool.py "$(cat x)" && echo `date +%F`', "flags but no -c; substitution outside -c"),
    ('python tool.py -c "print(\'`ls`\')"',
     '.py extension is not the py launcher'),
    ('./build.py -e "echo `date`"',
     'script named build.py'),
    ('rg -t py -e "see `x`"',
     'rg type filter py'),
    ('rg --type py -e "see `x`"',
     'rg --type py'),
    ('grep --include=*.py -e "see `x`" .',
     'grep --include=*.py'),
    ('python -m pytest -c "conf `x`"',
     '-m takes a module, then pytest -c'),
    ('python -u deploy.py -e "prod `x`"',
     'script argument named -e'),
    ('rg -T py -e "see `x`"', 'rg -T py is not the py launcher'),
    ('fd -e py -e "see `x`"', 'fd -e py is not the py launcher'),
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

    # A crafted 48 KB run of flags must not make the opener regex backtrack badly.
    import time
    crafted = "python " + "-X py " * 8000 + 'x "`"'
    t0 = time.time()
    rc, _ = run(crafted)
    dt = time.time() - t0
    if dt >= 1.0:
        fails.append(("timing", "48 KB crafted input took %.1fs" % dt, rc))
        print("  TIME  FAIL %.1fs" % dt)
    else:
        print("  TIME  ok   48 KB crafted input in %.2fs" % dt)

    total = len(MUST_BLOCK) + len(MUST_PASS) + 2
    print(f"\n{total - len(fails)}/{total} passed")
    for f in fails:
        print("  FAIL:", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
