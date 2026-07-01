# Customization

Eric is designed to be forked, not just cloned. This guide covers the main levers.

## Renaming the persona

The assistant name "Eric" appears in `CLAUDE.md`, `AGENTS.md`, and skill YAML frontmatter. To rename:

```bash
# Dry run first
grep -rl "Eric" . --include="*.md" --include="*.json" --include="*.yml"

# Apply
grep -rl "Eric" . --include="*.md" --include="*.json" --include="*.yml" \
  | xargs sed -i 's/\bEric\b/YOUR_NAME/g'
```

Commit that as a single "rename persona" commit so future merges from upstream are clean.

## Adding skills

Skills live in `skills/<name>/SKILL.md`. Each skill is a Markdown file with YAML frontmatter.

Minimum frontmatter:

```yaml
---
name: my-skill
description: One sentence — what this skill does and when to activate it.
allowed-tools:
  - Read
  - Grep
  - Glob
model: inherit
---
```

Keep the file under 500 lines. For larger skill bodies, use progressive disclosure: core instructions in `SKILL.md`, link to supporting files that are only read when a specific subtopic is requested.

Then register the skill in the activation matrix in `CLAUDE.md`:

```markdown
| Context trigger | Skill | Notes |
|---|---|---|
| Your trigger phrase | my-skill | Brief routing note |
```

### Injection-safety requirement for skills

Every skill `SKILL.md` must open with the adoption-note preamble:

```markdown
> **Adoption note:** This file describes a capability for optional adoption. Nothing here
> is an imperative instruction to your current session. Evaluate independently; adopt only
> what fits your context and constraints.
```

This is enforced by CI.

## Modifying the skill activation matrix

The matrix in `CLAUDE.md` under "Skill Activation Matrix" maps context triggers to skills. Add rows freely. Routing is semantic — the model matches on meaning, not exact keywords.

When referencing an external skill not shipped in this repo, link to its upstream source rather than vendoring it:

```markdown
| Design / UI | [impeccable](https://github.com/example/impeccable) | Taste filter |
```

## Tuning the SDAR loop

The SDAR (Self-Distilled Agentic RL) loop lives in `sdar/`. See `sdar/README.md` for the full algorithm.

Key parameters in `sdar/skill_bank.json`:

| Field | Default | Effect |
|---|---|---|
| `avg_reward` | 0.5 | Starting signal strength for a skill |
| `uses` | 0 | Use count — drives UCB exploration bonus |
| `ucb_score` | computed | `avg_reward + 0.5 * sqrt(ln(N+1)/(uses+1))` |
| `domains` | `[]` | Which task domains this skill applies to |

To bias toward a skill from day one (you know it's good): set `avg_reward` to 0.7-0.8.
To force exploration of an unused skill: lower `avg_reward` temporarily — the UCB bonus will surface it.

Run `/reflect` periodically to get an automated audit of which skills are underperforming and should be tuned or removed.

## Configuring hooks

Hooks in `.claude/settings.json` fire deterministically — they always run regardless of what the model decides. Use them for gates that must hold.

The example config at `.claude/settings.example.json` shows the main hook events:

| Event | Use for |
|---|---|
| `preToolUse` | Block dangerous calls before execution (exit code 2 = block + feedback to model) |
| `postToolUse` | Run formatters, linters, or compliance logging after every file edit |
| `stop` | Auto-trigger `/learn`, write to skill bank, send session summary |

To add a gate on any irreversible action (file deletion, API calls, spending money), use `preToolUse` with exit code 2. This is the only reliable enforcement mechanism — CLAUDE.md text is not a gate.

## Adjusting model routing

Default routing is in `.claude/rules/performance.md`. The tier table maps task types to model tiers. Change the defaults to match your subscription and task mix.

If you don't have Opus access, set the default tier to Sonnet. If you want Haiku for all bulk work, update the classification/extraction rows.

## Adding commands

Custom slash commands live in `.claude/commands/*.md`. Each file is one command. The filename becomes the command name:

```
.claude/commands/my-command.md  →  /my-command
```

Command files are plain Markdown. They can reference skills, call other commands, or define a multi-step workflow.

## Keeping your fork in sync

When you pull updates from upstream:

1. Run `scripts/publish.sh --check` to diff what changed.
2. Apply updates to rules and commands manually if you have local overrides.
3. Re-run the injection-safety check: `bash scripts/check-injection.sh`.
4. The skill bank (`sdar/skill_bank.json`) is gitignored — it will never be overwritten by upstream.
