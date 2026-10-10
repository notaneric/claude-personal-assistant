# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

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
