# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Model routing names the current models (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.2) and tells you to set tiers by alias (`opus`, `sonnet`, `haiku`, `fable`), so the next release does not leave you pinned to an old model. `.claude/settings.example.json` now uses `"model": "opus"` (it pinned `claude-opus-4-8`). Reflection and CLAUDE.md rewrites moved from Fable to Opus at `max` effort.
- The 5.5 models default to `medium` effort in Claude Code. `.claude/rules/performance.md` now says so, and explains where to save a default (a top-level `effortLevel` covers every model in project, local and managed settings, but not Opus 5.5 or later in your user file, where those go per model under `modelSettings`) and that `max` can only be set per session or by environment variable.
- `/learn` asks for a rating of the process rather than the outcome, scores what reached you rather than what a check caught first, and gives anchors for each score. It also describes an optional self-assessed mode for when you trust the assistant to rate itself.
- `.claude/rules/performance.md` gives Fable 5.2 (`claude-fable-5-2`, released 2026-11-09) its API price, its 1M-token context and its `medium` default effort in Claude Code. It links the four breaking changes to read before moving off Fable 5.1, quotes Anthropic's launch benchmarks against Opus 5.5 (the half-the-cost claim is for FrontierCode 2.0 only), marked as vendor numbers to check against your own tasks, and gives the standing plan-limit rule for Max and Pro. It also says to default a worker with no obvious tier to `sonnet` and keep reviews on `opus`.
- Every command in `.claude/commands/` now has a `description` in its frontmatter, so the `/` menu and the model's command list say what it does instead of falling back to the heading. `docs/CUSTOMIZATION.md` shows the format for your own commands.

### Added

- `.claude/rules/security.md`: Claude Code 2.1.319 to 2.1.325 fixed permission and sandbox bypasses that never got an advisory; the list names some of each release's fixes ("among them"), each under its own release and checked against the upstream changelog, including 2.1.321's MCP OAuth refresh-token leak and 2.1.325's zstd decoding fix. The CVE list now names 2.1.325 as the minimum version. How to reach it depends on the install: a native install on the `stable` channel sets `autoUpdatesChannel` to `"latest"`, Homebrew (which ignores that key) moves to the `claude-code@latest` cask, and apt, dnf and apk installs switch to the `latest` repository. `minimumVersion` only keeps updates from dropping below a version. `/security-audit self` reads the minimum from that section instead of keeping its own copy, and reports the route to it as advice.
- `CLAUDE.md` and the `prompt-quality-gate` skill: an "Unnamed consumer" check. Before the first line of an artifact, write "After reading this, [reader] will [verb] [object]."
- `CLAUDE.md` and `docs/ARCHITECTURE.md`: Claude Code strips block-level HTML comments before CLAUDE.md reaches the model, so notes for maintainers cost no context. Anthropic's memory docs suggest under 200 lines per CLAUDE.md, and the rules files without `paths` frontmatter load at launch too; this template's CLAUDE.md and rules start at over 700 lines together, and `CLAUDE.md` now says to cut what you will not use.
- `.claude/rules/agents.md`: a gate reads a zero in its state as a value. `state.get("limit") or DEFAULT` turns a limit of `0` back into the default.
- `.claude/mods/progress-eta/`: an optional Claude Code mod. A panel and a status line show each running agent, workflow, background command and the main reply, with elapsed time and estimated time left; agents are asked to report their steps through a `progress` tool. Install it by setting `CLAUDE_CODE_PLUGIN_DIRS` to the mod folder in your user `~/.claude/settings.json` (project settings are never read for it), then start a new session and type `/progress`. Needs a Claude Code build with function-hook mods (tested on 2.1.318). It adds a step-reporting note to every agent prompt and one paragraph to the system prompt; `docs/CUSTOMIZATION.md` lists everything it changes.
- `.claude/rules/performance.md`: never set `ANTHROPIC_MODEL` in the VS Code `claudeCode.environmentVariables` setting; it outranks every settings file on that machine only, so two machines drift apart.
- `.claude/rules/performance.md`: an `ANTHROPIC_API_KEY` in your environment makes Claude Code bill at API rates instead of your Pro or Max subscription, including in `claude -p`. Use a different variable name for keys your own scripts use.
- `.claude/rules/agents.md`: every new checker ships with a control that fails.
- `.claude/rules/security.md`: a gate that allows everything when its data is missing must say so at session start.

### Fixed

- CI's ripgrep scans ran with ripgrep's defaults, which skip hidden folders and every path an ignore file names (`.gitignore`, `.ignore`, `.rgignore`), even a tracked one. So `.claude/` (rules, commands, skills), `.github/`, `.mcp.json`, and a force-added `.claude/settings.json` or `settings.local.json` were never scanned for hidden unicode, secrets or `ANTHROPIC_BASE_URL` overrides. Every `rg` scan in `.github/workflows/ci.yml` now passes `--hidden` and `--no-ignore` and excludes `.git`, so a committed `.rgignore` cannot hide a folder from it, and the `ANTHROPIC_BASE_URL` scan no longer skips `.claude/rules/`. The pull request template's hidden-unicode command uses the same flags. A new `tests` job runs the repository's Python tests, which CI did not run before. The `api_key` pattern also missed a JSON key such as `"api_key": "..."`, because the quote that closes the key name sits before the colon; that quote is now optional. Strings planted in `.claude/commands/` and in tracked `.claude/settings.json` and `settings.local.json` files now fail the scan that targets them; before, the scans passed all of them.
- `.claude/rules/agents.md` sent its delegation triggers to agents and skills this template does not ship (`planner`, `code-reviewer`, `security-reviewer`, `architect`, `agent-introspection-debugging`, `autonomous-loops`, `eval-harness`), so they routed nowhere. They now name Claude Code's built-in `Plan` agent, `/code-review`, `/security-review`, `/loop` and `/schedule`, a general-purpose agent, or a section of the same file. The file also said `/reflect` maintains a `memory-index.md` and flags unused skills; it does neither, and the paragraph now says so and describes Claude Code's own `MEMORY.md` index and its load limit. Its example gate read `tool` from the hook input, which Claude Code sends as `tool_name`, so the example let every call through; it now reads `tool_name`, gates `PowerShell`, `Monitor`, `Edit` and `NotebookEdit` as well as `Bash` and `Write`, and says that it does not cover MCP tools. `scripts/action_gate.py` and the example settings' hook matcher cover the same six tools (see below).
- `CLAUDE.md` routed four matrix rows to the same nonexistent skills (`agent-introspection`, `eval-harness`, `autonomous-loops`, `agentic-engineering`); they now match `.claude/rules/agents.md`. `docs/ARCHITECTURE.md` and `README.md` said rules load on demand, by topic or by reference; a rules file without `paths` frontmatter loads at launch, a path-scoped one when Claude uses the Read, Write, or Edit tool on a matching file, and an `@` import saves no context. `sdar/README.md` and `/status` described output the dashboard does not print (installed plugins, unused skills); both now match it.
- `/reflect` said untried skills sit at 1.0; with the capped exploration bonus they sit at 0.75. `/automate` showed a `gws gmail send` form that does not exist; it now uses the real `gws` helpers (`gmail +send`, `sheets +append`, `calendar +insert`) and a real `drive files list` call. `/security-audit` no longer carries its own copy of the CVE list, which went stale; it reads `.claude/rules/security.md` and compares each patched version with `claude --version`. That list gains two newer advisories, CVE-2026-40068 and CVE-2026-46406.
- CI failed on every push since v0.1.0. The `ANTHROPIC_BASE_URL` check flagged every mention of the variable, including its own step and the deny rule that blocks it. It now flags only an assignment to a URL, and carries a control that must match. The next step, which never ran because of that failure, read `|` in its patterns as "or" and would have flagged the deny list too; it now checks the hook commands in settings files, which is what can actually run.
- `scripts/action_gate.py`: a relative entry in `PROTECTED_PATHS` (`.env`, `secrets/`) never matched, because Claude Code sends absolute paths. It now matches that name anywhere. The example settings wired the gate to `Bash|Write` only, so edits went unchecked. The matcher and the gate now cover the same six tools, `Bash`, `PowerShell`, `Monitor`, `Write`, `Edit` and `NotebookEdit`; PowerShell and Monitor commands get the Bash checks, and `scripts/test_action_gate.py` blocks a force-push through each (a copy without those two checkers lets both through). The test reads the tool sets from `settings.example.json`, `action_gate.py` and `agents.md` and fails when they differ, so narrowing the matcher back to `Bash|Write` fails it. `PROTECTED_PATHS` ships empty, and the session recap now says so at session start instead of letting an empty gate look like a working one.
- `.claude/settings.example.json` sets `xhigh`, the default the rules recommend, both as a top-level `effortLevel` and per model under `modelSettings` for `claude-opus-5-5`, so its Opus 5.5 setting holds wherever you copy it: the top-level key covers every model in project settings but not Opus 5.5 or later in your user file, and within one file the per-model entry wins. In the user file, add a `modelSettings` entry for any other Opus 5.5-or-later model you use, Fable 5.2 included. Without it Claude Code runs the 5.5 models at `medium`.
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
