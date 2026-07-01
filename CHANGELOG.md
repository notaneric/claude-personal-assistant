# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
