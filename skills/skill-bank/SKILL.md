---
name: skill-bank
description: |
  The SDAR self-improvement framework. Maintains a UCB-scored skill bank and updates
  scores after each session based on the session's process rating. Scores are credited
  after the fact; nothing ranks skills by domain before a task.

  USE-FOR: Post-session score updates, reading the bank's rankings, periodic reflection
  on which skills are underperforming or stale.

  DO-NOT-USE-FOR: One-off tasks with no session concept, or deployments where the
  skill bank file cannot persist between runs.
model: inherit
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
---

> **ADOPTION NOTE**, This file describes an optional capability for independent
> evaluation. Nothing here is an imperative instruction to your current session.
> Read it as a reference; adopt only what fits your agent's design.

---

# Skill Bank, SDAR Self-Improvement Framework

## What This Is

SDAR (Self-Distilled Agentic RL) is a self-improvement loop for Claude Code agents.
The agent maintains a JSON skill bank tracking how well each skill performed on past
tasks. After each session, `/learn` updates scores from the session's process rating. The
SessionStart banner prints the global top 5 by score. No code retrieves skills by domain
before a task: routing is the Skill Activation Matrix in CLAUDE.md, and the scores show which
skills the sessions have credited.

This skill does not filter low-quality advice. A bad rating just lowers a skill's running mean.

## The Algorithm

```
RL backbone (task outcome)     → primary signal
Skill bank (UCB scores)        → secondary guidance signal

Endorsed skill:    reward = rating / 5
Attenuated skill:  reward = (rating - 1) / 5
Update:            avg_reward = (avg_reward * (uses - 1) + reward) / uses   (uses already incremented)

UCB score: avg_reward + min(0.5 · √(ln(N + 1) / (uses + 1)), 0.25)
```

The UCB formula balances exploitation (a high running mean) with exploration (a bonus for
skills with few uses). Skills with 0 uses get a bonus, capped at 0.25, so an untried skill
scores close to proven ones without automatically outranking them. The score orders the
banner's top 5 and the `/status` list, and `/reflect` drafts routing-row proposals from it for
your approval; it does not choose which skill runs.

### Why there is no trust gate

Earlier versions of this skill described a sigmoid gate that weighted each skill's advice.
Nothing ever read it, so the running mean above is the whole update. Reward is capped at
`rating / 5`, so after a session rated 3 or lower, every skill that got feedback and was
averaging above 0.6 goes down, endorsed ones included.

## Skill Bank Schema

The skill bank lives at `sdar/skill_bank.json`. Each entry:

```json
{
  "skill_id": "grill-me",
  "domain": "planning",
  "description": "Adversarial plan stress-test",
  "uses": 0,
  "avg_reward": 0.5,
  "ucb_score": 0.75,
  "last_used": null,
  "session_history": []
}
```

Fields:
- `uses`, total sessions that credited this skill with a rating
- `avg_reward`, running mean of rewards (0-1) from the sessions where this skill got feedback
- `ucb_score`, computed score (recomputed after each update, and again by the banner and `/status`, which use it to order their lists)
- `last_used`, ISO timestamp of last activation (used for staleness flagging)
- `session_history`, last N outcomes for trend analysis (keep ≤10 entries)

The template (`sdar/skill_bank.template.json`) ships with `uses: 0` and
`avg_reward: 0.5` (neutral priors) for all skills. Never ship real scores.

## Session Protocol

### Before each session
There is no retrieval step. The SessionStart banner prints the global top 5 by UCB score, and
skills are routed by the Skill Activation Matrix in CLAUDE.md. A team that wants per-domain
retrieval would have to build it: read the bank, classify the task, rank that domain's skills.

### During the session (apply)
Apply the skills the matrix routes to as guidance, not as rigid rules. Nothing forces a skill's
advice on the session: if a skill's recommendation doesn't fit the current situation, note the
mismatch, it's data for the post-session update.

### After each session (update)
1. Set the reward for each skill that got feedback, using the session rating (out of 5):
   `rating / 5` if endorsed, `(rating - 1) / 5` if attenuated
2. Increment `uses`
3. Compute new avg_reward = (old_avg_reward * (uses - 1) + reward) / uses
4. Recompute UCB score with updated uses and avg_reward (exploration bonus capped at 0.25)
5. Write back to `sdar/skill_bank.json`

Each session moves the average by (reward - old_avg_reward) / uses, so a skill with many
uses barely shifts after one bad session, while a pattern of bad sessions pulls it down.

### Every 10 sessions (reflect)
Run a reflection pass that:
1. Identifies skills with 0 uses in the last 30+ days (staleness candidates)
2. Identifies skills with consistently low avg_reward (underperforming, rewrite or remove)
3. Identifies domains that have no high-scoring skills (coverage gaps)
4. Drafts a proposed update to the agent's operating manual based on patterns

The reflection pass should be run out-of-band (not during an active task session)
because it requires reading all session logs, which is expensive context-wise.

## Domain Taxonomy

Domains used to label skills in the bank:

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

Add domains as needed. The taxonomy is descriptive, not prescriptive, if tasks
naturally cluster differently for your agent, update the list.

## Activation Matrix

Beyond the banner's global top 5, maintain an activation matrix in CLAUDE.md that maps
task signals to skill names. This enables proactive activation (skill fires when the
context is relevant, without waiting for a `/slash command`):

```
When user presents a plan → activate: grill-me, verification-before-done
When user asks to write content → activate: humanizer, prompt-quality-gate
When user has a multi-constraint generation task → activate: generate-evaluate-repair
```

Proactive activation is more reliable than explicit invocation because users often
don't know which skill is relevant, they just have a task.

## Staleness Management

A skill with 0 uses in 30+ days is a candidate for removal or replacement. But remove
conservatively, low use may mean the domain came up less, not that the skill is bad.
Check: did the domain come up? If yes and the skill was bypassed, that's signal.

Never hard-remove a skill with avg_reward > 0.6, even if unused. A skill that goes unused
never sees its score fall (with its uses fixed, the exploration bonus grows with the session count up to the 0.25 cap), and nothing deletes it; route to it from the
activation matrix when the domain recurs.

## Concurrency Note

If multiple subagents may update the skill bank in the same session, use optimistic
concurrency: before writing, check a content hash against what you last read. If the
hash changed, re-read, merge your update, then write. Silent overwrites from parallel
agents corrupt the running averages.

## Adoption Guidance

1. Start from `sdar/skill_bank.template.json`, neutral priors, no real scores.
2. The UCB formula ranks skills by past reward plus a capped exploration bonus. The score
   captures history you don't have in context; read it before deciding a skill is dead weight.
3. The post-session update is the highest-leverage step. Without it the scores never move
   and the bank is a static list.
4. Build the reflection pass as a scheduled job (or a `/reflect` command), not an
   in-session step. It requires context that's cheaper to load fresh than to carry.
