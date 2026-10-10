#!/usr/bin/env python3
"""PreToolUse heredoc gate (matcher: Bash) - blocks the one transport bug that silently
corrupts scripted edits made through a bash heredoc.

THE BUG: the Bash tool can collapse a DOUBLE backslash to a single one before bash runs
the command. This gate checks heredoc bodies, where the damage is silent; the same collapse
can happen in other quoting, which nothing here checks. Single backslashes survive intact.

    typed            arrives as
    \\n         ->   \\n          (fine)
    \\\\n       ->   \\n          (WRONG - the pair collapsed)
    r"c:\\Tools"   ->   r"c:\\Tools"    (fine)
    "c:\\\\Tools"  ->   "c:\\Tools"     (collapsed, usually harmless for a path)
    \\\\.       ->   \\.          (WRONG - regex meaning changed)

The collapse is silent. It is harmless when the surviving backslash precedes a letter
that means nothing (the `\\C` in a Windows path), which is why it can go unnoticed for a
long time. It is a real defect when the survivor forms a meaningful escape in the
destination language: `\\\\n` intended as literal-backslash-n becomes a newline, and
`\\\\.` in a regex changes meaning.

WHY A HOOK AND NOT A RULE. A written warning ("bash eats your escapes, write a file
instead") is applied probabilistically, and this mistake is easy to repeat after reading
it. A PreToolUse exit 2 is not optional.

SCOPE. The predicate is deliberately narrow, to keep false positives low. A doubled
backslash is flagged only when the survivor would be a meaningful escape (DANGER below)
or when the pair ends a line (EOL_PAIR below). The blunt version of this predicate - any
backslash at all - interrupted too many ordinary commands to ship. test_heredoc_gate.py
replays a synthetic stream of Bash calls to bound the false-positive rate; replay your own
recorded calls before widening the class.

The block is a redirect, not a refusal: write the file with the Write tool and run it,
which is what the correct path looks like anyway.

Exit 2 blocks and feeds stderr back to Claude. Fail-open on internal error - a broken
gate must never brick the session.
"""
import json
import re
import sys

# Heredoc opener: << or <<-, optional quoting, then the delimiter word.
HEREDOC_RE = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")

# A collapsed pair only matters when the surviving backslash forms a meaningful escape in
# the destination language: string escapes (n t r f v b 0 x u), the 8-digit unicode and
# named-character escapes (U N), regex classes and anchors (s d w S D W A Z), the regex
# unicode-property class (p P), and regex operators such as . + * ? ( ) [ ] { } | ^ $.
# A pair before a path-ish letter is inert and is deliberately NOT flagged.
#
# Capital U, N and p/P are in the class because their survivors are real escapes: a pair
# collapsed before `U0001F000` or `p{Extended_Pictographic}` leaves a patch that dies on
# "invalid escape" with its anchor string silently altered. Lowercase u and x alone are
# not enough.
#
# The quote characters ' and " are in the class too. A pair before a quote is NOT inert:
# the survivor escapes the quote and the file dies on "unterminated string literal" (for
# example `f.split('<pair>')[-1]` in path-handling code). The same applies to the
# intentional JSON-escape form `.replace('"', '<pair>"')`, where the collapse silently
# drops the escape. The literal below is a raw TRIPLE-quoted string because the class
# contains a double quote and r"..." cannot hold one.
DANGER = re.compile(r"""\\\\[ntrfvbsdwSDWAZ0xuUNpP.+*?()\[\]{}|^$-'"]""")

# The pair at END OF LINE, which the class above cannot see because a newline is not one of
# its characters. It is the worst version of the bug, not a lesser one: the survivor is a
# line continuation in bash AND in Python, so two statements silently become one and the
# file still compiles. Whatever the intent, the pair does not arrive intact, so blocking it
# never stops a command that would have worked.
EOL_PAIR = re.compile(r"\\\\[ \t]*\n")


def heredoc_bodies(cmd):
    """Yield (delimiter, body) for every heredoc in the command."""
    out = []
    for m in HEREDOC_RE.finditer(cmd):
        delim = m.group(2)
        rest = cmd[m.end():]
        end = re.search(r"^\s*%s\s*$" % re.escape(delim), rest, re.M)
        out.append((delim, rest[: end.start()] if end else rest))
    return out


def find_hits(cmd):
    """Return [(delimiter, offending_snippet)] for heredocs that will be mangled."""
    hits = []
    for delim, body in heredoc_bodies(cmd):
        m = DANGER.search(body) or EOL_PAIR.search(body)
        if m:
            lo = max(0, m.start() - 40)
            hits.append((delim, body[lo: m.end() + 40].replace("\n", " ")))
    return hits


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("tool_name") != "Bash":
        return 0
    cmd = (payload.get("tool_input") or {}).get("command") or ""
    hits = find_hits(cmd)
    if not hits:
        return 0
    detail = "\n".join("  <<%s  ...%s..." % (d, s) for d, s in hits[:3])
    print(
        "heredoc_gate: BLOCKED - this heredoc contains a double backslash, which the Bash\n"
        "tool collapses to a single one before bash ever sees it. The corruption is silent:\n"
        "the command runs and produces a wrong result, or dies on a syntax error two steps\n"
        "later.\n\n"
        + detail
        + "\n\nFix: write the script to a file with the Write tool, then run it with\n"
        "`python <path>`. That is the correct shape for anything this long anyway.\n"
        "If you must stay inline, use `python -c` with chr(92) instead of a literal pair,\n"
        "or use the Edit tool for a file change.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
