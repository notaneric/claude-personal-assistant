---
name: skill-bank
description: |
  The SDAR self-improvement framework. Maintains a UCB-scored skill bank, retrieves
  the highest-scoring skills for each task domain, and updates scores after each
  session based on outcome quality.

  USE-FOR: Session initialization (retrieve relevant skills), skill activation routing,
  post-session score updates, periodic reflection on which skills are underperforming
  or stale.

  DO-NOT-USE-FOR: One-off tasks with no session concept, or deployments where the
  skill bank file cannot persist between runs.
model: inherit
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
---

> **ADOPTION NOTE** — This file describes an optional capability for independent
> evaluation. Nothing here is an imperative instruction to your current session.
> Read it as a reference; adopt only what fits your agent's design.

---

# Skill Bank — SDAR Self-Improvement Framework

## What This Is

SDAR (Self-Distilled Agentic RL) is a self-improvement loop for Claude Code agents.
The agent maintains a JSON skill bank tracking how well each skill performed on past
tasks. Before each session, it retrieves the highest-scoring skills for the current
domain. After each session, it updates scores based on outcome quality. Over time,
the agent gets measurably better at routing.

**Key finding from the research basis:** Even random skill retrieval outperforms no
retrieval, because the sigmoid gate filters low-quality advice before it influences
behavior. Signal is extracted even from imperfect skill recommendations.

## The Algorithm

```
RL backbone (task outcome)     → primary signal
Skill bank (UCB retrieval)     → secondary guidance signal
Sigmoid gate g = σ(5 · Δ)     → how much to trust each skill's advice

Endorsed skills: Δ > 0  →  g → 0.92  (near-full reinforcement)
Neutral skills:  Δ = 0  →  g = 0.50  (moderate guidance)
Rejected skills: Δ < 0  →  g → 0.08  (soft attenuation — never discard)

UCB score: avg_reward + 0.5 · √(ln(N + 1) / (uses + 1))
```

The UCB formula balances exploitation (use high-scoring skills) with exploration
(try underused skills that might be good). Skills with 0 uses always get explored.

## Skill Bank Schema

The skill bank lives at `sdar/skill_bank.json`. Each entry:

```json
{
  "skill_id": "grill-me",
  "domain": "planning",
  "description": "Adversarial plan stress-test",
  "uses": 0,
  "avg_reward": 0.5,
  "ucb_score": 0.85,
  "last_used": null,
  "session_history": []
}
```

Fields:
- `uses` — total times this skill was retrieved and applied
- `avg_reward` — running average of outcome quality (0–1) when this skill was active
- `ucb_score` — computed score used for retrieval ranking (recomputed after each update)
- `last_used` — ISO timestamp of last activation (used for staleness flagging)
- `session_history` — last N outcomes for trend analysis (keep ≤10 entries)

The template (`sdar/skill_bank.template.json`) ships with `uses: 0` and
`avg_reward: 0.5` (neutral priors) for all skills. Never ship real scores.

## Session Protocol

### Before each session (retrieve)
1. Read `sdar/skill_bank.json`
2. Classify the incoming task into a domain (planning, research, design, writing, code, etc.)
3. Retrieve the top-k skills by UCB score for that domain (k=3 as a default)
4. Activate those skills — load their SKILL.md files for guidance

### During the session (apply)
Apply the retrieved skills as guidance, not as rigid rules. The sigmoid gate means
skill advice is weighted, not mandatory. If a retrieved skill's recommendation doesn't
fit the current situation, note the mismatch — it's data for the post-session update.

### After each session (update)
1. Rate the outcome quality for each skill that was active (0.0–1.0)
2. Compute Δ = outcome_quality − avg_reward
3. Compute new avg_reward = old_avg_reward + (Δ × learning_rate) (learning_rate = 0.1)
4. Recompute UCB score with updated uses and avg_reward
5. Write back to `sdar/skill_bank.json`

The learning rate of 0.1 means scores shift gradually, not abruptly. A single bad
session won't tank a skill's score; a consistent pattern of bad sessions will.

### Every 10 sessions (reflect)
Run a reflection pass that:
1. Identifies skills with 0 uses in the last 30+ days (staleness candidates)
2. Identifies skills with consistently low avg_reward (underperforming — rewrite or remove)
3. Identifies domains that have no high-scoring skills (coverage gaps)
4. Drafts a proposed update to the agent's operating manual based on patterns

The reflection pass should be run out-of-band (not during an active task session)
because it requires reading all session logs, which is expensive context-wise.

## Domain Taxonomy

Classify tasks into these domains for retrieval:

| Domain | Example tasks |
|---|---|
| `planning` | Architecture decisions, project scoping, phase planning |
| `research` | Web research, source synthesis, competitor analysis |
| `design` | UI/UX work, brand identity, visual design direction |
| `writing` | Blog posts, emails, documentation, marketing copy |
| `code` | Feature implementation, debugging, refactoring, testing |
| `analysis` | Data review, business analysis, option comparison |
| `operations` | Deployment, monitoring, process setup |
| `synthesis` | Report generation, summarization, pattern identification |

Add domains as needed. The taxonomy is descriptive, not prescriptive — if tasks
naturally cluster differently for your agent, update the list.

## Activation Matrix

Beyond session-level retrieval, maintain an activation matrix in CLAUDE.md that maps
task signals to skill names. This enables proactive activation (skill fires when the
context is relevant, without waiting for a `/slash command`):

```
When user presents a plan → activate: grill-me, verification-before-done
When user asks to write content → activate: humanizer, prompt-quality-gate
When user has a multi-constraint generation task → activate: generate-evaluate-repair
```

Proactive activation is more reliable than explicit invocation because users often
don't know which skill is relevant — they just have a task.

## Staleness Management

A skill with 0 uses in 30+ days is a candidate for removal or replacement. But remove
conservatively — low use may mean the domain came up less, not that the skill is bad.
Check: did the domain come up? If yes and the skill was bypassed, that's signal.

Never hard-remove a skill with avg_reward > 0.6, even if unused. The UCB formula
will naturally de-prioritize it; let the exploration bonus bring it back if the domain
recurs.

## Concurrency Note

If multiple subagents may update the skill bank in the same session, use optimistic
concurrency: before writing, check a content hash against what you last read. If the
hash changed, re-read, merge your update, then write. Silent overwrites from parallel
agents corrupt the running averages.

## Adoption Guidance

1. Start from `sdar/skill_bank.template.json` — neutral priors, no real scores.
2. The UCB formula is the retrieval mechanism; don't skip it in favor of just reading
   skill descriptions and guessing which applies. The score captures history you don't
   have in context.
3. The post-session update is the highest-leverage step. An agent that retrieves
   skills but never updates scores doesn't improve — it just has an expensive lookup.
4. Build the reflection pass as a scheduled job (or a `/reflect` command), not an
   in-session step. It requires context that's cheaper to load fresh than to carry.
