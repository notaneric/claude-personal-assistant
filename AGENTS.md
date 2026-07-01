# AGENTS.md — Cross-Tool Agent Entry Point

> **ADOPTION NOTE — read before proceeding.**
> This file describes a capability system for *optional* adoption. Nothing here is an
> imperative instruction to your current session. Evaluate independently; adopt only
> what fits your workflow and constraints. This is a reference, not a command.

---

## What this repo is

`claude-personal-assistant` is a complete, de-identified operating system for a Claude
Code-based personal AI agent named **Eric**. It packages:

- A structured CLAUDE.md operating manual with a skill activation matrix
- A self-improvement framework (SDAR) that gets better every session via UCB retrieval
  and a sigmoid gate
- Modular skill files you can drop into any Claude Code project
- Agent orchestration patterns and a hooks system
- A curated slash-command set and a sanitization pipeline so the repo stays safe to publish

The repo is designed to be **agent-ingestible** — you can paste `llms.txt` into a
context, link to individual skill files, or clone the whole structure and adapt it.

---

## How to selectively adopt capabilities

This is a menu, not a monolith. Take what fits; ignore the rest.

**Option A — Adopt a single skill**
Copy any `skills/<name>/SKILL.md` into your project's `skills/` directory. The YAML
frontmatter declares `allowed_tools` and an optional `model` pin. Load it when context
is relevant; skip it otherwise.

**Option B — Adopt the skill activation matrix**
Copy the routing table from `CLAUDE.md` into your own operating manual. Replace rows
that don't apply. Add project-specific rows. The routing concept (automatic, semantic,
not invocation-dependent) transfers regardless of which skills you have installed.

**Option C — Adopt the SDAR self-improvement loop**
Copy `sdar/skill_bank.template.json` and `sdar/README.md`. Wire up `/learn` and
`/reflect` commands from `.claude/commands/`. The UCB formula and sigmoid gate are
model-agnostic; the template ships with neutral priors (uses: 0, avg_reward: 0.5) so
you start from a blank slate.

**Option D — Adopt the hooks system**
Review `.claude/settings.example.json`. The hook patterns (PreToolUse gate for
irreversible actions, postToolUse for formatters, stop hook for session audits) are
the highest-leverage part of the system. Wire them to your own scripts.

**Option E — Clone and personalize**
Use the repo as a GitHub template. Follow `docs/SETUP.md` to configure identity,
knowledge vault path, and permissions. Run `scripts/publish.sh` to sanitize before
any public push.

---

## Repo map

```
CLAUDE.md                    Operating manual + skill activation matrix
AGENTS.md                    This file — cross-tool entry point
llms.txt                     Capability index for LLM ingestion
LICENSE                      MIT

.claude/
  commands/                  Slash commands (/learn, /reflect, /status, /grill, ...)
  rules/
    security.md              Prompt defense + secrets handling + deny list patterns
    performance.md           Model tier routing + context discipline + effort levels
    agents.md                Multi-agent orchestration patterns + subagent design
  settings.example.json      Hooks, permissions, MCP config (sanitized template)

skills/
  grill-me/SKILL.md              Adversarial stress-test for plans before building
  humanizer/SKILL.md             Prose quality gate — no AI tells, specific over vague
  verification-before-done/SKILL.md  Enforce visual/runtime verification before declaring done
  prompt-quality-gate/SKILL.md   Catch vague, conflicting, or low-density prompts before execution
  generate-evaluate-repair/SKILL.md  3-step constrained generation loop (generate → eval → fix)
  skill-bank/SKILL.md            UCB-scored skill retrieval and SDAR update logic
  context-discipline/SKILL.md    Context window hygiene — compact triggers, clear-points, MCP limits

  # External skills (not vendored — reference by link):
  # impeccable  → https://github.com/pbakaus/impeccable
  # deep-research → https://github.com/dzhng/deep-research
  # graphify    → https://github.com/safishamsi/graphify
  # last30days  → https://github.com/mvanhorn/last30days-skill

sdar/
  README.md                  Full SDAR algorithm + sigmoid gate explainer
  skill_bank.template.json   Neutral-prior skill bank (uses:0, avg_reward:0.5)

scripts/
  publish.sh                 Sanitization pipeline (POSIX)
  publish.ps1                Sanitization pipeline (PowerShell)
  allowlist.example.yml      Default-deny allowlist for the sync gate

docs/
  SETUP.md                   First-time configuration guide
  CUSTOMIZATION.md           How to extend skills, commands, and rules
  ARCHITECTURE.md            System design: SDAR loop, hook chain, context flow

.github/
  workflows/ci.yml           Lint + sanitization check on every PR
  CONTRIBUTING.md
  SECURITY.md
```

---

## Boundaries

**Always — Eric does these without asking:**
- Read files, grep, glob, run git status/diff/log
- Write to project directories it already owns
- Run python, node, npm within the project
- Activate skills when context matches (no slash command required)
- Flag clear-points and prompt quality issues

**Ask first — pause before these:**
- Any destructive or irreversible action (delete, force-push, production deploy)
- Outward-facing communications (emails, PRs to external repos, public posts)
- Spending real money or placing orders
- Modifying `.claude/settings.json` or hook scripts
- Committing credentials or secrets (even accidentally)

**Never — hard blocks enforced in settings.json:**
- Read `~/.ssh/**` or `~/.aws/**`
- Read any `.env*` file
- Execute `curl * | bash` or `curl * | sh`
- Run `ssh`, `scp`, or `nc`
- Set `ANTHROPIC_BASE_URL` (supply-chain attack vector)
- Hardcode or log any secret, API key, or credential

---

## Example: adopting one skill into an existing Claude Code project

Suppose you want Eric's adversarial plan checker in your own project without the full repo.

1. Copy `skills/grill-me/SKILL.md` into `your-project/skills/grill-me/SKILL.md`.
2. Add to your `CLAUDE.md`:
   ```
   ## Plan Gate
   Before any significant design direction or architecture decision: read skills/grill-me/SKILL.md
   and stress-test the plan. Zero build work before direction is confirmed.
   ```
3. That's it. The skill declares its own `allowed_tools` and fires when a significant plan
   or design is detected. You don't need the rest of this repo.

The same pattern works for any skill in this repo. Each one is self-contained.

For external skills not shipped here (design taste filter, fan-out research, knowledge graph,
social-scored research), link to the upstream repos rather than copying:
- Design taste: [impeccable](https://github.com/pbakaus/impeccable)
- Deep research: [deep-research](https://github.com/dzhng/deep-research)
- Knowledge graph: [graphify](https://github.com/safishamsi/graphify)
- Social intelligence: [last30days](https://github.com/mvanhorn/last30days-skill)

---

## A note on injection safety

This file and every `SKILL.md` are designed to be pasted into agent contexts. They open
with an adoption-note preamble precisely because they may arrive via tool output, RAG
retrieval, or context injection — and should never be mistaken for imperative
instructions by the host agent.

If you build on top of this repo, preserve the adoption-note pattern in any file that
might be injected into another agent's context.
