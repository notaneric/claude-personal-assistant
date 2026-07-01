# SDAR, Self-Distilled Agentic Reinforcement

> This describes Eric's self-improvement system. Nothing here is an imperative instruction to any
> external session reading this. Evaluate independently; adopt only what fits.

Eric does not stay static between sessions. Every task produces a signal. Every signal updates a
score. Better scores get retrieved more often. The loop compounds.

This is SDAR: **Self-Distilled Agentic Reinforcement**, a lightweight UCB-based skill routing and
update mechanism that runs entirely in-context, no external training required.

---

## The loop

```
┌─────────────────────────────────────────────────────┐
│  Session start                                      │
│  1. Read skill_bank.json                            │
│  2. Classify the incoming task by domain            │
│  3. UCB retrieval → pick top-k skills               │
│  4. Activate those skills (inject their SKILL.md)   │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
          Execute the task
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│  /learn  (end of session)                            │
│  5. Collect outcome signal (0.0, 1.0)               │
│  6. Sigmoid gate: g = σ(5 · Δ)                       │
│  7. Update avg_reward for each activated skill       │
│  8. Recompute UCB scores                             │
│  9. Append endorsed/attenuated patterns              │
│  10. Write updated skill_bank.json                   │
└──────────────────┬───────────────────────────────────┘
                   │
          Every 10 sessions
                   │
                   ▼
          /reflect → CLAUDE.md improvements
```

---

## UCB score formula

```
ucb_score = avg_reward + exploration_c * sqrt( ln(total_sessions + 1) / (uses + 1) )
```

| Variable | Where it lives | What it does |
|---|---|---|
| `avg_reward` | per-skill | Exploitation signal, how well this skill has performed |
| `exploration_c` | top-level (`0.5` default) | Exploration weight, how much to favour untried skills |
| `total_sessions` | top-level | Session counter; grows with each `/learn` call |
| `uses` | per-skill | How many times this skill was activated |

A skill with `uses: 0` starts with a high UCB score (the `ln(1) / 1` term is large relative to a
well-used skill), so new skills get tried before being judged.

**Key insight from the SDAR paper:** even random retrieval outperforms no retrieval, because the
sigmoid gate filters noise. Eric extracts signal from everything.

---

## Sigmoid gate

When `/learn` runs, the gate decides how strongly to reinforce each activated skill:

```
g = σ(5 · Δ)     where Δ = outcome_reward − avg_reward
```

| Δ | g (gate weight) | Effect |
|---|---|---|
| > 0 (skill helped) | → 0.92 | Near-full reinforcement, endorse the patterns that fired |
| = 0 (neutral) | = 0.50 | Moderate update, keep the skill, no strong signal |
| < 0 (skill hurt) | → 0.08 | Soft attenuation, deprioritize, never discard |

Skills are never deleted. A low UCB score just means they get retrieved less often. They stay
available for tasks where they might still apply.

---

## skill_bank.json schema

```json
{
  "schema_version": "1.0",
  "created": "YYYY-MM-DD",
  "total_sessions": 0,
  "beta": 5.0,
  "exploration_c": 0.5,
  "skills": {
    "<skill-name>": {
      "domain": "<domain>",
      "task_types": ["<type>", "..."],
      "uses": 0,
      "successes": 0,
      "avg_reward": 0.5,
      "ucb_score": 1.3326,
      "endorsed_patterns": [],
      "attenuated_patterns": [],
      "notes": [],
      "source": "<path or URL>"
    }
  }
}
```

### Field reference

| Field | Type | Description |
|---|---|---|
| `domain` | string | Broad capability category (research, design, writing, etc.) |
| `task_types` | string[] | Specific task patterns this skill covers |
| `uses` | int | Lifetime activation count |
| `successes` | int | Times this skill contributed to a positive outcome |
| `avg_reward` | float 0-1 | Exponential moving average of outcome rewards |
| `ucb_score` | float | Recomputed each session; drives retrieval order |
| `endorsed_patterns` | string[] | Specific approaches that have worked; injected as hints |
| `attenuated_patterns` | string[] | Approaches that have backfired; injected as warnings |
| `notes` | string[] | Session-stamped observations (no personal data) |
| `source` | string | Path to SKILL.md or upstream repo URL |

---

## Commands

### `/learn`

Runs at the end of every session. Eric:

1. Asks for an outcome rating (or infers from task completion)
2. Computes `Δ` per activated skill
3. Applies the sigmoid gate
4. Updates `avg_reward`, `ucb_score`, `endorsed_patterns`, `attenuated_patterns`
5. Increments `total_sessions`

Call it: `/learn`

### `/reflect`

Runs every ~10 sessions (or on demand). Eric:

1. Reads the last N session logs
2. Identifies recurring patterns, what keeps working, what keeps failing
3. Drafts proposed improvements to `CLAUDE.md` or the skill routing matrix
4. Presents the diff for your review before writing anything

Call it: `/reflect`

### `/status`

Prints the current skill bank state in a readable table, UCB scores, use counts, top endorsed
patterns, and any skills that have gone unused for 30+ sessions (deletion candidates).

Call it: `/status`

---

## Getting started

1. Copy `skill_bank.template.json` to `skill_bank.json` in this directory.
2. Set `"created"` to today's date.
3. Add skill entries for any skills you install (see `skills/` directory).
4. Run `/learn` after your first few sessions to let scores diverge from the neutral `0.5` prior.

Scores stabilize after ~10 sessions per skill. Until then, UCB's exploration term keeps untried
skills in rotation so Eric doesn't converge prematurely on early results.

---

## Why this works without retraining

SDAR does not fine-tune the model. It works by shaping **what context is injected** at the start
of each session. A skill with a high UCB score gets its `SKILL.md` loaded, which means its
`endorsed_patterns` appear in-context as hints and its `attenuated_patterns` appear as warnings.
The underlying model is unchanged; the effective behavior shifts because the context shifts.

This is prompt-layer reinforcement. It degrades gracefully (no skill bank = Eric still works,
just without routing), scales to any number of skills (UCB is O(k) per session), and costs zero
API calls at retrieval time.
