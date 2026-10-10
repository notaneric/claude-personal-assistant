"""PreToolUse gate: block a piped command whose exit code is then reported.

The flaw this closes
--------------------
`python check.py | tail -20; echo "EXIT=$?"` prints EXIT=0 no matter what the
script did, because `$?` in a pipeline is the exit status of the LAST command -
`tail` - which essentially always succeeds. The verification output scrolls past,
the zero looks like a pass, and a failing check reads as a passing one.

The mistake is easy to type and easy to miss, and a written rule against it is
applied probabilistically. That is the argument for a hook over a rule: a
PreToolUse exit 2 is not optional.

Deliberately narrow
-------------------
`| tail` and `| head` are fine and used constantly for reading long output. What
is NOT fine is pairing one with an exit-code read in the same command, because
that is the construct that manufactures false confidence. Matching only the
CONJUNCTION keeps the false-positive rate at essentially zero - a command that
never inspects `$?` is never touched.

The fix the gate suggests is the one that actually works: redirect to a file,
check the real exit code, then read the file.
"""
from __future__ import annotations

import json
import re
import sys

# A pipe into a pager-ish command that discards the upstream status.
PIPED = re.compile(r"\|\s*(tail|head)\b")
# ...and, in the same command, an exit-code read.
EXIT_READ = re.compile(r"\$\?")


HEREDOC = re.compile(
    r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1.*?^\s*\2\s*$",
    re.S | re.M)


def strip_heredocs(cmd: str) -> str:
    """Drop heredoc BODIES before scanning.

    A heredoc body is data, not shell. Documentation that happens to describe
    this very trap - "pipes into tail and then reads $?" - is prose, and firing
    on it is a false positive. A commit message or doc file written through a
    heredoc that explains this gate would otherwise trip it.
    """
    return HEREDOC.sub(" <<heredoc-body-elided>> ", cmd)


def offending(cmd: str) -> bool:
    cmd = strip_heredocs(cmd)
    # Only the segments that actually contain a pipe-to-tail matter; a later
    # `$?` after an unrelated `&&` chain is a different statement.
    for part in re.split(r"(?:;|&&|\|\|)\s*", cmd):
        if PIPED.search(part) and EXIT_READ.search(part):
            return True
    # `cmd | tail` on one statement, `echo $?` on the next, is the same trap:
    # $? still refers to the pipeline, i.e. to tail. Split on every separator
    # that carries $? forward - `;` and `&&` and `||` all do.
    stmts = [s for s in re.split(r"(?:;|&&|\|\|)\s*", cmd) if s.strip()]
    for i, s in enumerate(stmts[:-1]):
        if PIPED.search(s) and EXIT_READ.search(stmts[i + 1]):
            return True
    return False


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("tool_name") != "Bash":
        return 0
    cmd = (payload.get("tool_input") or {}).get("command", "")
    if not cmd or not offending(cmd):
        return 0

    sys.stderr.write(
        "exit_code_gate: BLOCKED - this command pipes into tail/head and then "
        "reads $?.\n"
        "In a pipeline $? is the exit status of the LAST command (tail), which "
        "almost always\n"
        "succeeds - so a FAILING script reports EXIT=0 and a broken check reads "
        "as a passing one.\n\n"
        "Fix - capture the real status, then read the output:\n"
        "  python check.py > /tmp/out.txt 2>&1; echo \"EXIT=$?\"; tail -20 "
        "/tmp/out.txt\n"
        "Or, if you only want to LOOK at output and do not care about the "
        "status, drop the $?.\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
