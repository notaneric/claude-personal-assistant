# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Model routing names the current models (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1) and tells you to set tiers by alias (`opus`, `sonnet`, `haiku`, `fable`), so the next release does not leave you pinned to an old model. `.claude/settings.example.json` now uses `"model": "opus"` (it pinned `claude-opus-4-8`). Reflection and CLAUDE.md rewrites moved from Fable to Opus at `max` effort.
- The 5.5 models default to `medium` effort in Claude Code. `.claude/rules/performance.md` now says so, and explains how to save a default (`effortLevel`, `modelSettings`) and that `max` can only be set per session or by environment variable.
- `/learn` asks for a rating of the process rather than the outcome, scores what reached you rather than what a check caught first, and gives anchors for each score. It also describes an optional self-assessed mode for when you trust the assistant to rate itself.

### Added

- `.claude/rules/performance.md`: an `ANTHROPIC_API_KEY` in your environment makes Claude Code bill at API rates instead of your Pro or Max subscription, including in `claude -p`. Use a different variable name for keys your own scripts use.
- `.claude/rules/agents.md`: every new checker ships with a control that fails.
- `.claude/rules/security.md`: a gate that allows everything when its data is missing must say so at session start.

### Fixed

- CI failed on every push since v0.1.0. The `ANTHROPIC_BASE_URL` check flagged every mention of the variable, including its own step and the deny rule that blocks it. It now flags only an assignment to a URL, and carries a control that must match. The next step, which never ran because of that failure, read `|` in its patterns as "or" and would have flagged the deny list too; it now checks the hook commands in settings files, which is what can actually run.
- `scripts/action_gate.py`: a relative entry in `PROTECTED_PATHS` (`.env`, `secrets/`) never matched, because Claude Code sends absolute paths. It now matches that name anywhere. The example settings wired the gate to `Bash|Write` only, so edits went unchecked; the matcher now includes `Edit`, `MultiEdit` and `NotebookEdit`. `PROTECTED_PATHS` ships empty, and the session recap now says so at session start instead of letting an empty gate look like a working one.
- `.claude/settings.example.json` sets `"effortLevel": "xhigh"`, the default the rules recommend; without it Claude Code runs the 5.5 models at `medium`.
- Two uncited "SDAR paper" claims are gone, and the docs now call the rating a rating of the process, matching `/learn`.
- The docs described a "sigmoid trust gate" that weighted each skill's advice. Nothing ever read it: the ranking uses only the average reward, the use count and the session count. The claim is gone from 10 files. `/learn`, `CLAUDE.md`, `sdar/README.md` and the `skill-bank` skill now state the real update (endorsed: rating/5; underperforming: (rating-1)/5; a running mean), and the unused `sigmoid_gate` and `beta` keys are removed from the skill-bank template. The same files described a 0.1-rate moving average that contradicted the running mean; that is corrected too.

- The SSH and AWS write blocks did not work in current Claude Code. `.claude/settings.example.json` and `.claude/rules/security.md` listed `Write(~/.ssh/**)` and `Write(~/.aws/**)`, and a `Write(...)` deny rule matches nothing, so both folders stayed writable. They are now `Edit(...)` rules, which cover every file-editing tool. **If you copied the old example into your own `settings.json`, make the same change there.** Recent Claude Code versions print a startup warning for a `Write(path)` rule they will not consult. Deny rules cover Claude Code's own file tools only; a script that opens the file itself is not checked (see the note in `.claude/rules/security.md`).
- `/security-audit self` checked for the broken `Write(...)` spelling and would have passed it. It now expects `Edit(...)` and fails any `Write(...)` deny rule.
- Skill ranking inverted as sessions accumulated. The UCB exploration bonus had no ceiling, so an untried skill's bonus kept growing with the session count. On a sample bank at 200 sessions, an untried skill scored 1.651 and a proven one (0.9 average over 40 uses) scored 1.080. The bonus is now capped at 0.25 (`exploration_cap` in the skill bank), and the same bank ranks the proven skill first: 1.080 against 0.75. The formula is updated in `/learn`, `/status`, `CLAUDE.md`, the `SessionStart` banner (which now reads `exploration_c` and `exploration_cap` from the bank), `sdar/`, `docs/` and the `skill-bank` skill, and the template's seeded `ucb_score` values are now 0.5, the value at zero sessions.
- The `SessionStart` banner never printed on Windows. Its box-drawing characters raised `UnicodeEncodeError` under the default console encoding, the hook discards errors, and only the fallback line appeared. It now writes UTF-8.

### Added

- `scripts/guards/`: three Bash `PreToolUse` hooks, each blocking one command shape that fails without any error.
  - `exit_code_gate.py`: piping into `tail`/`head` and then reading `$?`. The status is `tail`'s, so a failing script reports success.
  - `heredoc_gate.py`: a doubled backslash inside a heredoc. The Bash tool can collapse it to one before bash sees it, so the script runs with different text. The gate checks heredocs only; the collapse can also happen in other quoting.
  - `backtick_gate.py`: backticks inside a double-quoted `python -c` (or similar) argument. Bash runs them as commands before the interpreter starts and splices in their output.
- `scripts/guards/mutation_harness.py`: a tool for planting a deliberate defect in a check and requiring that specific check to fail. It ships with its own self-test; the guards above do not ship mutation runs yet. A guard whose tests have only ever passed is not yet proven to catch anything.
- `.claude/settings.example.json` wires the three guards under a `Bash` matcher.

## [0.1.0] - 2026-07-01

### Added

- `CLAUDE.md`, full operating manual for the Eric persona: identity, communication style, skill activation matrix, planning and design gates, context management rules, end-of-session audit protocol
- `AGENTS.md`, cross-tool entry point for agent-ingestible capability discovery (adoption-note preamble, injection-safe)
- `llms.txt`, flat index of repo capabilities for LLM-native discovery
- `.claude/rules/security.md`, prompt defense baseline, permission deny list, untrusted content handling, supply chain rules
- `.claude/rules/performance.md`, model tier routing, effort levels, context window discipline, cache optimization
- `.claude/rules/agents.md`, agent orchestration patterns, subagent design, eval loop, multi-agent hierarchy
- `.claude/commands/`, generic command set: `/learn`, `/reflect`, `/status`, `/research`, `/design`, `/write`, `/grill`, `/automate`, `/security-audit`
- `.claude/settings.example.json`, sanitized hooks and permission examples
- `skills/`, curated generic skills: `grill-me`, `humanizer`, `verification-before-done`, `prompt-quality-gate`, `generate-evaluate-repair`, `skill-bank`, `context-discipline` (external skills `impeccable`, `deep-research`, `graphify`, `last30days` are referenced by link, not vendored)
- `sdar/skill_bank.template.json`, neutral-prior skill bank template (UCB structure, all scores at zero)
- `sdar/README.md`, SDAR self-improvement framework documentation
- `scripts/publish.sh` + `scripts/publish.ps1` + `scripts/allowlist.example.yml`, re-runnable sanitization/publish pipeline
- `docs/SETUP.md`, installation and first-run guide
- `docs/CUSTOMIZATION.md`, how to rename Eric, add skills, tune the SDAR loop
- `docs/ARCHITECTURE.md`, system architecture with Mermaid SDAR loop diagram
- `LICENSE`, MIT, Copyright (c) 2026 notaneric
- `.github/CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, community health files
- `.github/ISSUE_TEMPLATE/`, bug report and feature request templates
- `.github/pull_request_template.md`, PR checklist
- `.github/workflows/ci.yml`, lint + injection-safety (hidden character + secret scan) CI gate

[Unreleased]: https://github.com/notaneric/claude-personal-assistant/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/notaneric/claude-personal-assistant/releases/tag/v0.1.0
