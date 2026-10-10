#!/usr/bin/env python3
"""PreToolUse backtick gate (matcher: Bash) - blocks bash command substitution inside a
double-quoted inline interpreter argument.

THE BUG. In a double-quoted string bash substitutes backticks BEFORE the interpreter runs:

    python -c "print('see `notes.md`')"     -> bash executes notes.md, splices stdout

Used to write or edit a file this way, every backticked span is silently deleted from the
text that lands on disk. A span that happens to contain an example command is worse: bash
runs it for real, with whatever side effects it has (a login flow, a deploy).

WHY A HOOK AND NOT A RULE. "Bash eats your escapes, write a file instead" is easy to read
and still forget, and here the cost includes executing text that was only meant to be
written. A PreToolUse exit 2 is not optional.

WHY heredoc_gate DOES NOT COVER IT. That gate's predicates are about the Bash tool
collapsing double backslashes inside heredocs. This is a different transport - bash's own
substitution - and it fires with no heredoc anywhere in the command.

SCOPE. The predicate is deliberately narrow, to keep false positives near zero: only a
backtick inside a DOUBLE-quoted -c/-e argument to a known interpreter. A backtick in a
single-quoted argument is inert and is NOT flagged; ordinary shell substitution outside an
interpreter argument is a real bash feature and is NOT flagged.

The block is a redirect, not a refusal: write the script to a file and run it.

Exit 2 blocks and feeds stderr back to Claude. Fail-open on internal error.
"""
import json
import re
import sys

# python -c " / python3 -c " / node -e " / perl -e " / ruby -e "
OPENER = re.compile(
    r"\b(?:python[0-9.]*|node|perl|ruby)\s+-(?:c|e)\s+\"")


def _double_quoted_span(cmd, start):
    """Return the text of the double-quoted argument beginning at `start` (the opening
    quote index), honouring backslash escapes. None if unterminated."""
    i = start + 1
    out = []
    while i < len(cmd):
        ch = cmd[i]
        if ch == "\\" and i + 1 < len(cmd):
            out.append(cmd[i:i + 2])
            i += 2
            continue
        if ch == '"':
            return "".join(out)
        out.append(ch)
        i += 1
    return None


def find_hits(cmd):
    """Return [snippet] for each double-quoted interpreter argument containing a live
    backtick. An escaped backtick (\\`) is inert to bash and is not a hit."""
    hits = []
    for m in OPENER.finditer(cmd):
        span = _double_quoted_span(cmd, m.end() - 1)
        if not span:
            continue
        stripped = span.replace("\\`", "")
        if "`" in stripped:
            k = span.find("`")
            lo = max(0, k - 50)
            hits.append(span[lo:k + 50].replace("\n", " "))
    return hits


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("tool_name") != "Bash":
        return 0
    cmd = (payload.get("tool_input") or {}).get("command") or ""
    try:
        hits = find_hits(cmd)
    except Exception:
        return 0
    if not hits:
        return 0
    detail = "\n".join("  ..." + h + "..." for h in hits[:3])
    print(
        "backtick_gate: BLOCKED - this command has a backtick inside a double-quoted\n"
        "interpreter argument. Bash runs command substitution on it BEFORE the interpreter\n"
        "sees the string, so the backticked span is deleted from your text and executed as a\n"
        "command instead. Silent: the call still succeeds and writes the wrong content.\n\n"
        + detail
        + "\n\nFix: write the script to a file with the Write tool, then run it with\n"
        "`python <path>`. For a one-liner, single-quote the argument instead, or use the\n"
        "Edit tool if it is a file change.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
