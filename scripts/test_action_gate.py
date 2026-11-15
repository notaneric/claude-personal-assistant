"""Prove action_gate.py checks every tool its matcher sends it, in both directions.

Three places name the tools the gate covers, and they must agree: the PreToolUse matcher in
.claude/settings.example.json, TOOL_CHECKERS in scripts/action_gate.py, and the example gate in
.claude/rules/agents.md. A tool the matcher sends but the gate has no checker for is allowed
silently, and a tool the gate checks but the matcher never sends is never checked. So the test
reads all three sets from the files and requires them to be equal, then requires a blocking case
for every tool in the set, and cases that must not block. The last check removes the PowerShell
and Monitor checkers from a copy of the gate and requires exactly their two cases to fail, so the
suite is known to catch that regression.

    python scripts/test_action_gate.py
"""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
GATE = ROOT / "scripts" / "action_gate.py"
SETTINGS = ROOT / ".claude" / "settings.example.json"
AGENTS = ROOT / ".claude" / "rules" / "agents.md"
PUSH = "git push --force origin main"

# (name, tool_name, tool_input, expected exit code)
CASES = [
    ("Bash force-push", "Bash", {"command": PUSH}, 2),
    ("PowerShell force-push", "PowerShell", {"command": PUSH}, 2),
    ("Monitor force-push", "Monitor", {"command": PUSH, "description": "push", "timeout_ms": 1000}, 2),
    ("Write protected path", "Write", {"file_path": "/repo/secrets/key.txt"}, 2),
    ("Edit protected path", "Edit", {"file_path": "/repo/secrets/key.txt"}, 2),
    ("NotebookEdit protected path", "NotebookEdit", {"notebook_path": "/repo/secrets/n.ipynb"}, 2),
    ("PowerShell ordinary command", "PowerShell", {"command": "git status"}, 0),
    ("Monitor ordinary command", "Monitor", {"command": "tail -f build.log"}, 0),
    ("Edit ordinary path", "Edit", {"file_path": "/repo/src/app.py"}, 0),
    ("Read protected path (Read is not gated)", "Read", {"file_path": "/repo/secrets/key.txt"}, 0),
]


def matcher_tools() -> set[str]:
    """Tools the example settings send to action_gate.py."""
    for block in json.loads(SETTINGS.read_text(encoding="utf-8"))["hooks"]["PreToolUse"]:
        if any("action_gate.py" in h.get("command", "") for h in block.get("hooks", [])):
            return set(block["matcher"].split("|"))
    raise AssertionError("no PreToolUse hook in settings.example.json runs action_gate.py")


def gate_tools(source: str) -> set[str]:
    """Tools action_gate.py has a checker for."""
    body = re.search(r"TOOL_CHECKERS = \{(.*?)\}", source, re.S)
    assert body, "TOOL_CHECKERS not found in action_gate.py"
    return set(re.findall(r'"(\w+)":', body.group(1)))


def example_tools() -> set[str]:
    """Tools the example gate in agents.md checks."""
    m = re.search(r'tool\.get\("tool_name"\) not in \{([^}]*)\}', AGENTS.read_text(encoding="utf-8"))
    assert m, "the example gate's tool set was not found in agents.md"
    return set(re.findall(r'"(\w+)"', m.group(1)))


def gate_copy(source: str, folder: pathlib.Path) -> pathlib.Path:
    """The gate with one protected entry, because PROTECTED_PATHS ships empty."""
    patched, n = re.subn(r"PROTECTED_PATHS: list\[str\] = \[",
                         'PROTECTED_PATHS: list[str] = [\n    "secrets/",', source, count=1)
    assert n == 1, "PROTECTED_PATHS not found in action_gate.py"
    path = folder / "action_gate.py"
    path.write_text(patched, encoding="utf-8")
    return path


def run(gate: pathlib.Path, tool: str, tool_input: dict) -> int:
    payload = json.dumps({"hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": tool_input})
    return subprocess.run([sys.executable, str(gate)], input=payload, text=True,
                          capture_output=True).returncode


def failures(gate: pathlib.Path) -> list[str]:
    return [name for name, tool, tool_input, want in CASES if run(gate, tool, tool_input) != want]


problems = []
source = GATE.read_text(encoding="utf-8")
sets = {"settings.example.json matcher": matcher_tools(), "action_gate.py TOOL_CHECKERS": gate_tools(source),
        "agents.md example gate": example_tools()}
for where, tools in sets.items():
    print(f"{where:30s} {sorted(tools)}")
if len({frozenset(t) for t in sets.values()}) != 1:
    problems.append("the three tool sets differ")
blocking = {tool for _, tool, _, want in CASES if want == 2}
if blocking != sets["action_gate.py TOOL_CHECKERS"]:
    problems.append(f"tools without a blocking case: {sorted(sets['action_gate.py TOOL_CHECKERS'] - blocking)}")

with tempfile.TemporaryDirectory() as tmp:
    folder = pathlib.Path(tmp)
    current = failures(gate_copy(source, folder))
    print(f"current gate: {len(CASES) - len(current)}/{len(CASES)} cases as expected")
    problems += [f"case failed: {name}" for name in current]

    # Mutation: drop the PowerShell and Monitor checkers. Exactly their two blocking cases must fail.
    mutant_source, n = re.subn(r'^\s*"(PowerShell|Monitor)": check_bash,\n', "", source, flags=re.M)
    assert n == 2, f"expected to remove 2 checker lines, removed {n}"
    mutant = failures(gate_copy(mutant_source, folder))
    caught = mutant == ["PowerShell force-push", "Monitor force-push"]
    print(f"mutant without the PowerShell and Monitor checkers fails: {mutant} "
          f"({'caught' if caught else 'NOT caught'})")
    if not caught:
        problems.append("the mutation was not caught")

for p in problems:
    print("FAIL  " + p)
print("\nRESULT:", "PASS" if not problems else "FAIL")
sys.exit(1 if problems else 0)
