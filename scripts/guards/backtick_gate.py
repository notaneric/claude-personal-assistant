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

# python -c " / python3 -c " / pythonw -c " / py -3 -c " / node -e " / perl -e " / ruby -e ",
# also .exe names and quoted paths ("C:/Program Files/nodejs/node.exe" -e "), with interpreter
# flags between the name and -c/-e: python -I -c ", python3 -X utf8 -c ", py -3.12 -c ",
# perl -0777 -e ", node --input-type=module -e ". A flag is a dash token. A flag that takes a
# value may be followed by one separate value token, per interpreter: python -X/-W (also as the
# last letter of a bundle, `python -IX utf8 -c`), perl -I/-M (`perl -I lib -e`), ruby -I/-r,
# node -r, --require, --import, --input-type. Any other flag followed by a bare word is not
# an interpreter one-liner (`python -m pytest -c "`, `python -u deploy.py -e "`). A bundled
# final flag ending in c/e (python -Ic ", perl -ne ", node -pe ") counts too. Up to 16 flags.
# The name must not follow a word char, dot, dash or `=` (that is `tool.py -c`, `./build.py -e`,
# `--include=*.py -e`), nor `-t ` / `--type ` (`rg -t py -e "`). The bare launcher `py`/`pyw`
# counts only in command position (start, after ; && || | ( $( newline, sudo/time/exec, or env
# assignments), so `rg -T py -e "` and `fd -e py -e "` are not flagged.
# Not covered: other flags that take a separate value (e.g. node --loader x), an attached
# argument (python -c"..."), perl -E, node -p and node --eval, and the py launcher after
# if, !, {, do, then, else, env, nohup, sudo -u or time -p, or after more than eight
# assignments or one whose value holds $(, quotes or &. Known false positives:
# rg -T perl -e "..." (also ruby or python), rg --type-not python -e "..." and
# docker run --name node -it -e "...".
def _build_opener():
    guard = r"(?<![\w.=-])(?<!-t )(?<!--type )"
    exe = r"(?:\.[Ee][Xx][Ee])?[\x22\x27]?(?=\s)"
    plain = r"\s+--?[A-Za-z0-9][\w.:-]*(?:=\S+)?"
    tail = r"\s+-(?:c|e|[A-Za-z]*[ce])\s+\""

    def flags(letters, longs=""):
        valued = r"\s+(?:-[A-Za-z0-9]*[" + letters + "]"
        if longs:
            valued += "|" + longs
        valued += r")\s+[^\s-]\S*"
        return r"(?:" + valued + "|" + plain + r"){0,16}?"

    py = guard + r"pythonw?[0-9.]*" + exe + flags("XW") + tail
    node = guard + "node" + exe + flags("r", r"--(?:require|import|input-type)") + tail
    perl = guard + "perl" + exe + flags("IM") + tail
    ruby = guard + "ruby" + exe + flags("Ir") + tail
    cmdpos = r"(?:^|[;&|(\n]|\$\()[ \t]*(?:(?:sudo|time|exec|\w+=[^\s;&|()]*)[ \t]+){0,8}"
    launcher = (cmdpos + r"[\x22\x27]?(?:[\w:.\\/-]*[/\\])?(?<![\w.=-])pyw?"
                + exe + flags("XW") + tail)
    return re.compile("|".join("(?:" + p + ")" for p in (py, node, perl, ruby, launcher)))


OPENER = _build_opener()


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
