# Bash guards

PreToolUse hooks for Claude Code's Bash tool. Each reads the tool call as JSON on stdin, exits 2
with a message on stderr to block it, and exits 0 to let it through. A non-Bash tool, a
malformed payload or an internal error is let through, so a broken guard cannot lock up a
session. Each guard is narrow on purpose: a guard that fires on ordinary commands gets removed.

## What they block

- `exit_code_gate.py`: a pipe into `tail` or `head` in the same command as a read of `$?`.
  After a pipeline `$?` is the status of the last command, so `python check.py | tail -20;
  echo "EXIT=$?"` prints 0 even when the check failed. A pipe with no `$?` read is left alone.
- `heredoc_gate.py`: a heredoc whose body holds a doubled backslash that would become a real
  escape (`\\n`, `\\.`, `\\U`, a quote) or that ends a line. The Bash tool can collapse `\\` to
  `\` (this gate checks heredoc bodies; other quoting can collapse too), so the command runs with different text than was written and nothing
  reports it. The block message says to write the file with the Write tool and run it.
- `backtick_gate.py`: a backtick inside a double-quoted argument to `python -c`, `node -e`,
  `perl -e` or `ruby -e`. Bash runs command substitution on that string first, so the
  backticked text is deleted from the script and executed as a command. Single-quoted
  arguments and escaped backticks are left alone.

## Wiring

Merge this into `.claude/settings.json`:
```json
"hooks": { "PreToolUse": [ { "matcher": "Bash", "hooks": [
  { "type": "command", "command": "python \"$CLAUDE_PROJECT_DIR/scripts/guards/exit_code_gate.py\"" },
  { "type": "command", "command": "python \"$CLAUDE_PROJECT_DIR/scripts/guards/heredoc_gate.py\"" },
  { "type": "command", "command": "python \"$CLAUDE_PROJECT_DIR/scripts/guards/backtick_gate.py\"" }
] } ] }
```

## Tests

Run from the repository root; each exits 0 on success and 1 on failure.
```
python scripts/guards/test_exit_code_gate.py
python scripts/guards/test_heredoc_gate.py
python scripts/guards/test_backtick_gate.py
python scripts/guards/mutation_harness.py
```
Each test drives its gate both ways: constructs it must block, and ordinary commands it must
leave alone. `test_heredoc_gate.py` also replays a transcript fixture and fails if the gate
blocks more than 3% of its Bash calls, or none. The last command is the harness self-test.

## What the mutation harness proves

A suite that has only ever passed has not been shown to fail. `mutation_harness.py` plants a
deliberate defect in a file and runs the suite. The result counts only if the mutant still
compiles and the specific check named for that defect is the one that fails. A check is
trusted once such a defect makes it fail by name.

Verdicts: CAUGHT; MISSED (suite stayed green); WRONG-CHECK (suite failed, but not on the named
check); INVALID (anchor missing or ambiguous, mutant does not compile, or the suite crashed
without printing a FAIL line). The target is read and restored as bytes with a hash check,
`__pycache__` is cleared between runs, and a lock file stops two runs on one target. The
suite must print a line starting with `FAIL` for each failed check. The docstring in
`mutation_harness.py` has an example.
