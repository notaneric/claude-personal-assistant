#!/usr/bin/env python3
"""Negative-test heredoc_gate.py in BOTH directions, on synthetic cases and on a replay.

A guard that silently matches nothing reads exactly like a guard that works, so each
blocking case below has a counterpart that must pass. Synthetic cases only prove the shapes
someone thought of, so the last section also replays a synthetic stream of Bash calls through
the gate and bounds the share it would block.

Chains on the gate's EXIT CODE, never on its printed output.

    python scripts/guards/test_heredoc_gate.py
"""
import atexit
import glob
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))          # never hardcode absolute paths
GATE = os.path.join(HERE, "heredoc_gate.py")
BS = chr(92)                                               # avoid literal pairs in this file

sys.path.insert(0, HERE)
from heredoc_gate import find_hits                          # noqa: E402

fails = []
n = 0


def run_gate(cmd, tool="Bash"):
    """Invoke the real hook the way Claude Code does and return its exit code."""
    p = subprocess.run(
        [sys.executable, GATE],
        input=json.dumps({"tool_name": tool, "tool_input": {"command": cmd}}),
        capture_output=True, text=True,
    )
    return p.returncode


def expect(code, cmd, why, tool="Bash"):
    global n
    n += 1
    got = run_gate(cmd, tool)
    if got != code:
        fails.append("expected exit %d, got %d - %s" % (code, got, why))


HD = "cat > f.py << 'PY'\n%s\nPY\npython f.py"

# ---- MUST BLOCK (exit 2): a collapsed pair changes meaning ----------------------------
expect(2, HD % ('s = s.replace("a", "' + BS * 2 + 'n")'), "the core failure: double-backslash-n")
expect(2, HD % ('re.compile(r"' + BS * 2 + '.")'), "regex literal dot")
expect(2, HD % ('print("col' + BS * 2 + 't")'), "double-backslash-t")
expect(2, HD % ('re.sub(r"' + BS * 2 + 's+", " ", x)'), "regex whitespace class")
expect(2, HD % ('x = "' + BS * 2 + 'u00a7"'), "unicode escape")
expect(2, "cat > f.py <<PY\ny = '" + BS * 2 + "d'\nPY", "unquoted delimiter still transports the same way")
# The escape families a first version of the class missed: capital U (8-digit unicode),
# p and P (regex unicode-property classes) and N (named unicode character). A patch whose
# emoji range and property class both collapsed passed the earlier gate.
expect(2, HD % ('emo = re.findall(r"[' + BS * 2 + 'U0001F000-' + BS * 2 + 'U0001FFFF]", out)'), "capital U: 8-digit unicode escape")
expect(2, HD % ('re.test(/' + BS * 2 + 'p{Extended_Pictographic}/u)'), "lowercase p: regex unicode property class")
expect(2, HD % ('x = "' + BS * 2 + 'N{EM DASH}"'), "capital N: python named unicode escape")
expect(2, HD % ('re.compile(r"' + BS * 2 + 'P{L}+")'), "capital P: negated unicode property class")

# The pair at END OF LINE. The character class above cannot see it, because a newline is not
# one of its characters, so a gate without the end-of-line rule passes a command that joins two
# statements into one. The survivor is a line continuation in bash AND in Python, so the file
# still compiles and the damage is invisible.
expect(2, HD % ('if a and ' + BS * 2 + '\n   b:\n    pass'),
       "a double backslash at end of line becomes a line continuation")
expect(2, HD % ('x = (1 +' + BS * 2 + '   \n     2)'),
       "same, with trailing whitespace before the newline")

# ---- MUST NOT BLOCK (exit 0) ---------------------------------------------------------
expect(0, HD % ('if a and ' + BS + '\n   b:\n    pass'),
       "NEGATIVE ANCHOR: a SINGLE backslash continuation is the correct way to write this "
       "and must not be blocked - without this the end-of-line rule could match every continuation")
expect(0, HD % ('print("line' + BS + 'n")'), "single backslash survives intact")
expect(0, HD % ('p = r"c:' + BS + 'Tools' + BS + 'app"'), "raw Windows path, single backslashes")
expect(0, HD % ('p = "c:' + BS * 2 + 'Temp"'), "pair before a path letter is inert")
expect(0, HD % ('print("hello")'), "no backslash at all")
expect(0, "ls -la && git status", "no heredoc at all")
expect(0, "grep -n 'x' f.py", "plain command with quotes")
expect(0, HD % ('s = s.replace("a", "' + BS * 2 + 'n")'), "same dangerous body, but not a Bash call", tool="Write")

# ---- the gate must actually be reachable: a positive control -------------------------
n += 1
if not find_hits(HD % ('x = "' + BS * 2 + 'n"')):
    fails.append("positive control: find_hits() returned nothing on a known-bad body")
n += 1
if find_hits("echo hi"):
    fails.append("negative control: find_hits() flagged a command with no heredoc")


# ---- TRANSCRIPT REPLAY: every Bash call in a directory of recorded transcripts -------
# Synthetic cases only prove the shapes someone thought of. This section feeds the gate a
# larger, mixed stream in the JSONL shape Claude Code records transcripts in, and fails if the
# gate would block too large a share of ordinary calls, or none at all. The stream is a small
# fixture written to a temp dir. To measure your own false-positive rate instead, replace the
# three lines that create TDIR below with `TDIR = <a directory of real transcripts>` (Claude
# Code keeps them under ~/.claude/projects/ as one *.jsonl file per session).
def write_fixture(directory):
    """Write two transcript files: a mixed stream of Bash calls, and some noise."""
    plain = [
        "git status --short",
        "git log --oneline | head -5",
        "ls -la src/",
        "grep -n TODO src/app.py",
        "python -m pytest -q",
        "cat README.md | head -20",
        "npm run build 2>&1 | tail -30",
        "find . -name '*.py' -not -path './venv/*'",
    ]
    benign_heredocs = [
        "cat > notes.md << 'EOF'\n# Notes\nplain text, no backslashes\nEOF",
        "python - << 'PY'\nprint('hello')\nPY",
        "git commit -F - << 'MSG'\nfix: handle empty input\nMSG",
        # Backslashes that a blunt "any backslash" predicate would flag and this gate must
        # not: a raw Windows path, a single-backslash continuation, a pair before an inert letter.
        HD % ('p = r"c:' + BS + 'Tools' + BS + 'app"'),
        HD % ('if a and ' + BS + '\n   b:\n    pass'),
        HD % ('p = "c:' + BS * 2 + 'Temp"'),
    ]
    doubled = [
        HD % ('re.compile(r"' + BS * 2 + 'd+")'),
        "python - << 'PY'\nprint(\"a" + BS * 2 + "nb\")\nPY",
    ]
    calls = plain * 12 + benign_heredocs * 5 + doubled

    def bash_call(cmd):
        return {"type": "assistant", "message": {"role": "assistant", "content": [
            {"type": "tool_use", "name": "Bash", "input": {"command": cmd}}]}}

    # Shapes a real transcript also holds, none of which may count as a Bash call: text that
    # is not JSON, a tool result whose message content is a plain string, and a non-Bash tool
    # call carrying a dangerous body beside one ordinary Bash call.
    noise = [
        'this line mentions "Bash" but is not JSON',
        json.dumps({"type": "user", "toolUseResult": {"tool_name": "Bash"},
                    "message": {"role": "user", "content": "plain string content"}}),
        json.dumps({"type": "assistant", "message": {"role": "assistant", "content": [
            {"type": "tool_use", "name": "Write", "input": {"command": doubled[0]}},
            {"type": "tool_use", "name": "Bash", "input": {"command": "ls"}}]}}),
    ]
    for name, lines in (("session-a.jsonl", [json.dumps(bash_call(c)) for c in calls]),
                        ("session-b.jsonl", noise)):
        with io.open(os.path.join(directory, name), "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(lines) + "\n")


HEREDOC_RE = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
TDIR = tempfile.mkdtemp(prefix="heredoc_gate_replay_")
atexit.register(shutil.rmtree, TDIR, ignore_errors=True)
write_fixture(TDIR)
tot = blocked = with_hd = 0
if os.path.isdir(TDIR):
    for f in sorted(glob.glob(os.path.join(TDIR, "*.jsonl"))):
        for line in io.open(f, encoding="utf-8", errors="replace"):
            if '"Bash"' not in line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            for blk in (rec.get("message") or {}).get("content") or []:
                if not (isinstance(blk, dict) and blk.get("type") == "tool_use"
                        and blk.get("name") == "Bash"):
                    continue
                cmd = (blk.get("input") or {}).get("command") or ""
                tot += 1
                if HEREDOC_RE.search(cmd):
                    with_hd += 1
                if find_hits(cmd):
                    blocked += 1
    n += 1
    rate = 100.0 * blocked / max(tot, 1)
    print("transcript replay: %d Bash calls, %d with a heredoc, %d would block (%.2f%%)"
          % (tot, with_hd, blocked, rate))
    if rate > 3.0:
        fails.append("false-positive rate %.2f%% exceeds the 3%% ceiling" % rate)
    if blocked == 0:
        fails.append("zero blocks in the replay - a guard that matches nothing reads exactly like one that works")
else:
    print("transcript replay: transcripts not found at %s (skipped)" % TDIR)

print("\nchecks run: %d   failed: %d" % (n, len(fails)))
for f in fails:
    print("  FAIL  " + f)
sys.exit(1 if fails else 0)
