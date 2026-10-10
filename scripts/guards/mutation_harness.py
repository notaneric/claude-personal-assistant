#!/usr/bin/env python3
"""Mutation testing that counts a mutant as caught only when the check named for it fails.

LIMIT: a mutant that compiles but crashes at runtime inside code that swallows its own
exceptions (a hook that exits 0 on any error, for example) can still read as CAUGHT. Give each
check a direct test of the function it covers, not only of the hook's exit code.

A test suite that has only ever passed has not been shown to fail. Mutation testing plants a
deliberate defect in the code under test and checks that the suite notices. This harness is
built so that it can return a result the author did NOT want.

WHY THIS EXISTS. Two ways an ad-hoc mutation harness reports a result it has not earned:

  A broken mutant counts as "caught". A planted mutant that references an out-of-scope
  variable dies on a NameError, and a harness that reads only "exit code != 0" prints
  CAUGHT. The mutant was "caught" by an unrelated failure while the check it existed to
  exercise stayed unproven. A harness that cannot tell a broken mutant from a real defect
  hides that mistake.

  The restore changes the file. Restoring with pathlib.write_text after read_text converts
  every LF to CRLF on Windows, so the restore reports success while the file's bytes have
  changed. Only an md5 taken beforehand shows it.

THE RULES, mechanical rather than remembered:

  1. ALL FILE I/O IS BINARY, and the restore is verified by hash. No text round-trip ever
     touches the file under test. The report records whether the restored bytes match the
     original, and assert_all_caught() raises if they do not.

  2. A MUTANT MUST COMPILE, AND MUST FAIL THE NAMED CHECK. Every mutation declares which
     check it is supposed to break. A mutant that does not compile is reported INVALID
     (not CAUGHT), and a mutant whose named check still passes is reported WRONG-CHECK
     (not CAUGHT) even when the suite went red for some other reason. Only "compiles, and
     the named check failed" counts.

  3. NO STALE BYTECODE. __pycache__ is purged and bytecode writing is disabled before every
     run, because CPython validates a .pyc by source mtime (whole seconds) and size.

  4. ONE RUN AT A TIME PER TARGET. A lock file next to the target refuses a second run.

Both the verdicts and the rules exist so the harness can fail loudly instead of reporting
green.

USE:

    import sys
    from mutation_harness import mutate

    report = mutate(
        target="scripts/guards/heredoc_gate.py",
        test_cmd=[sys.executable, "scripts/guards/test_heredoc_gate.py"],
        mutations=[
            # (label, old_bytes, new_bytes, the check that MUST fail)
            ("capital U dropped from the escape class", b"0xuUNpP", b"0xuNpP",
             "capital U"),
        ],
    )
    print(report)
    report.assert_all_caught()

Each mutation gets one verdict: CAUGHT, MISSED (the suite stayed green), WRONG-CHECK (the
suite failed, but not the named check) or INVALID (the anchor is missing or ambiguous, the
mutant does not compile, or the suite crashed without printing a FAIL line).

Run directly for the self-test:  python scripts/guards/mutation_harness.py
"""
from __future__ import annotations

import dataclasses
import hashlib
import os
import pathlib
import py_compile
import shutil
import subprocess
import sys
import tempfile

CAUGHT, INVALID, WRONG_CHECK, MISSED = "CAUGHT", "INVALID", "WRONG-CHECK", "MISSED"


@dataclasses.dataclass
class Result:
    label: str
    verdict: str
    detail: str = ""

    @property
    def ok(self) -> bool:
        return self.verdict == CAUGHT


@dataclasses.dataclass
class Report:
    results: list
    restored_clean: bool

    def __str__(self) -> str:
        lines = [f"  {r.verdict:<11} {r.label}" + (f"  -> {r.detail}" if r.detail else "")
                 for r in self.results]
        lines.append(f"  restore byte-identical: {'yes' if self.restored_clean else 'NO'}")
        return "\n".join(lines)

    def assert_all_caught(self) -> None:
        bad = [r for r in self.results if not r.ok]
        if not self.restored_clean:
            raise AssertionError("target file was NOT restored byte-identically")
        if bad:
            raise AssertionError(
                "mutation testing did not prove the checks:\n" +
                "\n".join(f"  {r.verdict}: {r.label} -> {r.detail}" for r in bad))


def _md5(b: bytes) -> str:
    return hashlib.md5(b).hexdigest()


def _failed_checks(stdout: str) -> list:
    """Lines the suite reported as failures. Convention for the tests next to this file:
    a failing check prints a line whose first token is FAIL."""
    out = []
    for line in stdout.splitlines():
        s = line.strip()
        if s.startswith("FAIL"):
            out.append(s[4:].strip())
    return out


def mutate(target, test_cmd, mutations, timeout=120) -> Report:
    """Plant each mutation, run test_cmd, and judge it. Binary I/O throughout.

    mutations: iterable of (label, old_bytes, new_bytes, must_fail_check_substring).
    """
    path = pathlib.Path(target)
    # RULE 4: ONE RUN AT A TIME PER TARGET. A mutation run plants real defects into the working
    # tree, so two runs over the same file test each other's mutants and report verdicts that name
    # another mutation's checks. Run concurrently, they produce WRONG-CHECK and MISSED verdicts
    # that look like flaky tests and are only interference. A crashed run also leaves the lock
    # behind, which is the right failure - a stale lock is visible, a silently corrupted verdict
    # is not.
    lock = path.with_suffix(path.suffix + ".mutating")
    if lock.exists():
        raise RuntimeError(
            f"{lock} exists: another mutation run is already planting defects in {path.name}, or "
            f"one crashed and left the lock. Wait for it, or delete the lock if nothing is running. "
            f"Concurrent runs test each other's mutants.")
    original = path.read_bytes()            # RULE 1: bytes, never text
    original_md5 = _md5(original)
    lock.write_bytes(original_md5.encode())
    results = []

    try:
        for label, old, new, must_fail in mutations:
            if old not in original:
                results.append(Result(label, INVALID,
                                      "anchor bytes not present - the mutation patches "
                                      "nothing, so the test was never exercised"))
                continue
            if original.count(old) > 1:
                results.append(Result(label, INVALID,
                                      f"anchor appears {original.count(old)}x - ambiguous, "
                                      f"tighten it so the patch site is unique"))
                continue

            path.write_bytes(original.replace(old, new, 1))

            # RULE 2a: a mutant that does not compile proves nothing.
            if path.suffix == ".py":
                try:
                    py_compile.compile(str(path), cfile=tempfile.mktemp(), doraise=True)
                except Exception as exc:
                    results.append(Result(label, INVALID,
                                          f"mutant does not compile ({type(exc).__name__}) - "
                                          f"a syntax/name error is not a defect"))
                    continue

            # RULE 3: NO STALE BYTECODE. CPython validates a .pyc by (source mtime in WHOLE
            # SECONDS, source size). Two mutants that each add the same number of bytes produce
            # files of identical size, and written in the same second the second run imports the
            # FIRST mutant's bytecode and is judged on it. A harness whose verdict depends on
            # what the previous verdict was is the kind of false result it exists to prevent.
            for cache in path.parent.rglob("__pycache__"):
                shutil.rmtree(cache, ignore_errors=True)
            # Bytes, then decode with errors="replace", and force the child to UTF-8. In text mode
            # subprocess decodes with the locale codec (often cp1252 on Windows) and strict errors,
            # so one non-ASCII character in a check's output could make the whole stdout
            # undecodable or garbled - and a verdict then rests on "no FAIL line was parsed",
            # which is indistinguishable from a suite that failed somewhere else.
            env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1",
                       PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
            proc = subprocess.run(test_cmd, capture_output=True, timeout=timeout, env=env)
            stdout = proc.stdout.decode("utf-8", errors="replace")
            failed = _failed_checks(stdout)
            # A verdict must never rest on the ABSENCE of output. "Red, but no FAIL line" is what a
            # crashed, killed or truncated run looks like, and it is indistinguishable from a suite
            # that reddened elsewhere - so the run is repeated once before it is judged, and if it
            # is still silent the detail says the output was empty rather than blaming the check.
            if proc.returncode != 0 and not failed:
                proc = subprocess.run(test_cmd, capture_output=True, timeout=timeout, env=env)
                stdout = proc.stdout.decode("utf-8", errors="replace")
                failed = _failed_checks(stdout)
                if not failed:
                    tail = (stdout.strip().splitlines() or ["<no stdout>"])[-1][:120]
                    results.append(Result(label, INVALID,
                                          "the suite exited non-zero but printed no FAIL line, "
                                          "twice - the run crashed or was killed rather than "
                                          f"failing a check; last stdout line: {tail!r}"))
                    continue

            if proc.returncode == 0:
                results.append(Result(label, MISSED,
                                      "suite stayed green - the check cannot detect this"))
            elif any(must_fail in f for f in failed):
                results.append(Result(label, CAUGHT, f"'{must_fail}' failed, as required"))
            else:
                # RULE 2b: red for the wrong reason is not proof.
                results.append(Result(label, WRONG_CHECK,
                                      f"suite went red but '{must_fail}' did not fail; "
                                      f"failures were {failed or '(none parsed)'}"))
    finally:
        path.write_bytes(original)          # RULE 1: byte-exact restore, always
        restored_clean = _md5(path.read_bytes()) == original_md5
        lock.unlink(missing_ok=True)

    return Report(results, restored_clean)


# ---------------------------------------------------------------------------------------
# SELF-TEST. The harness's own claim is "it can return a verdict the author did not want",
# so the self-test drives all four verdicts, not just CAUGHT.
# ---------------------------------------------------------------------------------------
def _self_test() -> int:
    failures = []

    def check(name, cond, got=""):
        print(f"  {'PASS' if cond else 'FAIL'}  {name}" + ("" if cond else f"  {got}"))
        if not cond:
            failures.append(name)

    tmp = pathlib.Path(tempfile.mkdtemp())
    subject = tmp / "subject.py"
    subject.write_bytes(b"def f(x):\n    return x * 2\n\n\ndef g(x):\n    return x + 1\n")
    tester = tmp / "test_subject.py"
    tester.write_text(
        "import subject, sys\n"
        "bad = []\n"
        "def chk(n, c):\n"
        "    print(('PASS  ' if c else 'FAIL  ') + n)\n"
        "    if not c: bad.append(n)\n"
        "chk('double works', subject.f(3) == 6)\n"
        "chk('increment works', subject.g(3) == 4)\n"
        "sys.exit(1 if bad else 0)\n", encoding="utf-8")
    cmd = [sys.executable, str(tester)]

    print("mutation_harness self-test\n")

    r = mutate(subject, cmd, [("real defect in f", b"x * 2", b"x * 3", "double works")])
    check("CAUGHT when the named check fails", r.results[0].verdict == CAUGHT,
          str(r.results[0]))

    r = mutate(subject, cmd, [("defect in f, but blames g", b"x * 2", b"x * 3",
                               "increment works")])
    check("WRONG-CHECK when the suite reddens for another reason",
          r.results[0].verdict == WRONG_CHECK, str(r.results[0]))

    r = mutate(subject, cmd, [("syntax garbage", b"return x * 2", b"return x *", "double works")])
    check("INVALID when the mutant does not compile",
          r.results[0].verdict == INVALID, str(r.results[0]))

    r = mutate(subject, cmd, [("untested code path", b"def g(x):", b"def g(x, unused=1):",
                               "double works")])
    check("MISSED when the suite stays green", r.results[0].verdict == MISSED,
          str(r.results[0]))

    r = mutate(subject, cmd, [("absent anchor", b"THIS IS NOT IN THE FILE", b"x", "double works")])
    check("INVALID when the anchor is absent", r.results[0].verdict == INVALID,
          str(r.results[0]))

    # RULE 3, as a regression: two mutants of IDENTICAL size run back to back. Before the
    # __pycache__ purge + PYTHONDONTWRITEBYTECODE, the second one's test run imported the first
    # one's bytecode (a .pyc is validated by whole-second mtime + size), so its verdict was the
    # previous mutant's behaviour. Both are real defects in their own function, so both must be
    # CAUGHT on their own name.
    r = mutate(subject, cmd, [
        ("same-size mutant A", b"return x * 2", b"return x * 9", "double works"),
        ("same-size mutant B", b"return x + 1", b"return x + 7", "increment works"),
    ])
    check("two same-size mutants are judged independently (no stale .pyc)",
          [x.verdict for x in r.results] == [CAUGHT, CAUGHT],
          [(x.label, x.verdict, x.detail) for x in r.results])

    # RULE 4: a second run while one is in progress must refuse, not interleave.
    held = subject.with_suffix(subject.suffix + ".mutating")
    held.write_bytes(b"pretend another run is live")
    try:
        mutate(subject, cmd, [("blocked", b"x * 2", b"x * 3", "double works")])
        check("a concurrent run on the same target is refused", False, "it ran anyway")
    except RuntimeError as exc:
        check("a concurrent run on the same target is refused",
              "already planting defects" in str(exc), str(exc)[:90])
    finally:
        held.unlink(missing_ok=True)
    check("the refused run left the subject untouched",
          b"x * 2" in subject.read_bytes())
    r = mutate(subject, cmd, [("after the lock clears", b"x * 2", b"x * 3", "double works")])
    check("a run works once the lock is gone", r.results[0].verdict == CAUGHT, str(r.results[0]))
    check("no lock file is left behind", not held.exists())

    # The restore guarantee, stated as bytes.
    before = subject.read_bytes()
    mutate(subject, cmd, [("defect", b"x * 2", b"x * 3", "double works")])
    check("restore is byte-identical (no LF->CRLF drift)", subject.read_bytes() == before,
          f"{_md5(before)} vs {_md5(subject.read_bytes())}")
    check("report states the restore was clean", r.restored_clean)

    # assert_all_caught must be able to RAISE - a gate that only passes is not a gate.
    r = mutate(subject, cmd, [("blames wrong check", b"x * 2", b"x * 3", "increment works")])
    try:
        r.assert_all_caught()
        check("ANCHOR assert_all_caught raises on a non-CAUGHT verdict", False, "it did not raise")
    except AssertionError:
        check("ANCHOR assert_all_caught raises on a non-CAUGHT verdict", True)

    print()
    if failures:
        print(f"{len(failures)} FAILED")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(_self_test())
