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
│  5. Collect the process rating (1 to 5)             │
│  6. Reward = rating/5, or (rating-1)/5 if attenuated │
│  7. Update avg_reward as a running mean over uses    │
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
ucb_score = avg_reward + min( exploration_c * sqrt( ln(total_sessions + 1) / (uses + 1) ), exploration_cap )
```

| Variable | Where it lives | What it does |
|---|---|---|
| `avg_reward` | per-skill | Exploitation signal, how well this skill has performed |
| `exploration_c` | top-level (`0.5` default) | Exploration weight, how much to favour untried skills |
| `exploration_cap` | top-level (`0.25` default) | Ceiling on the exploration bonus. The bonus is capped at 0.25. Uncapped, it keeps growing with the session count: past about 55 sessions a never-used skill's bonus alone is larger than the whole 0-to-1 reward range, so untried skills outrank every skill with a real track record, and using a skill well makes it rank lower. |
| `total_sessions` | top-level | Session counter; grows with each `/learn` call |
| `uses` | per-skill | How many times this skill was activated |

A skill with `uses: 0` starts at its seeded `avg_reward` of 0.5 and earns the full 0.25
exploration bonus from the first session on, so it can outrank a weak well-used skill and gets
tried before being judged. The update never deletes a skill:
a low score just means it gets retrieved less often, and it stays available for tasks where it
might still apply.

Nothing in this loop filters noise. A bad rating just lowers a skill's running mean.

---

## Why there is no trust gate

Earlier versions of this page described a sigmoid gate that was meant to weight how much each
skill's advice counted. Nothing ever read it: `ucb_score` depends only on `avg_reward`, `uses`
and `total_sessions`. The running mean is the whole update:

```
endorsed skill:    reward = rating / 5
attenuated skill:  reward = (rating - 1) / 5
avg_reward = (avg_reward * (uses - 1) + reward) / uses     # uses already incremented
```

Reward is capped at `rating / 5`, so after a session rated 3 or lower, every skill that got
feedback and was averaging above 0.6 goes down, endorsed ones included.

---

## skill_bank.json schema

```json
{
  "schema_version": "1.0",
  "created": "YYYY-MM-DD",
  "total_sessions": 0,
  "exploration_c": 0.5,
  "exploration_cap": 0.25,
  "skills": {
    "<skill-name>": {
      "domain": "<domain>",
      "task_types": ["<type>", "..."],
      "uses": 0,
      "successes": 0,
      "avg_reward": 0.5,
      "ucb_score": 0.5,
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
| `avg_reward` | float 0-1 | Running mean of rewards: `rating/5` if endorsed, `(rating-1)/5` if attenuated |
| `ucb_score` | float | Recomputed each session; drives retrieval order |
| `endorsed_patterns` | string[] | Specific approaches that have worked; injected as hints |
| `attenuated_patterns` | string[] | Approaches that have backfired; injected as warnings |
| `notes` | string[] | Session-stamped observations (no personal data) |
| `source` | string | Path to SKILL.md or upstream repo URL |

---

## Commands

### `/learn`

Runs at the end of every session. Eric:

1. Asks for a rating of the session's process (or, in self-assessed mode, reads the session for your corrections)
2. Turns the rating (out of 5) into a reward per skill: `rating/5` if endorsed, `(rating-1)/5` if attenuated
3. Folds that reward into `avg_reward` as a running mean
4. Updates `ucb_score`, `endorsed_patterns`, `attenuated_patterns`
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
