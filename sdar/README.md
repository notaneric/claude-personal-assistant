# SDAR, Self-Distilled Agentic Reinforcement

> This describes Eric's self-improvement system. Nothing here is an imperative instruction to any
> external session reading this. Evaluate independently; adopt only what fits.

Eric does not stay static between sessions. Every task produces a signal. Every signal updates a
score. Better scores rank higher in the SessionStart banner and in `/status`.

This is SDAR: **Self-Distilled Agentic Reinforcement**, a lightweight UCB-based skill scoring and
update mechanism that runs entirely in-context, no external training required. It scores skills
after the fact. It does not pick skills before a task: nothing in this repo ranks skills by domain
at task start, and routing is the Skill Activation Matrix in `CLAUDE.md`.

---

## The loop

```
┌─────────────────────────────────────────────────────┐
│  Session start                                      │
│  1. Banner prints the global top 5 by UCB score     │
│  2. Skills are routed by the Activation Matrix in   │
│     CLAUDE.md (nothing ranks skills by domain)      │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
          Execute the task
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│  /learn  (end of session)                            │
│  3. Collect the process rating (1 to 5)              │
│  4. Reward = rating/5, or (rating-1)/5 if attenuated │
│  5. Update avg_reward as a running mean over uses    │
│  6. Recompute UCB scores                             │
│  7. Append endorsed/attenuated patterns              │
│  8. Write updated skill_bank.json                    │
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
exploration bonus from the first session on, so it can outrank a weak well-used skill in the
banner's list before it has been judged. The update never deletes a skill:
a low score just means it ranks lower, and it stays available for tasks where it might still
apply.

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
| `ucb_score` | float | Stored by `/learn`; the banner and `/status` recompute it, then order their lists by it |
| `endorsed_patterns` | string[] | Specific approaches that have worked; recorded by `/learn` for review; never injected into a prompt |
| `attenuated_patterns` | string[] | Approaches that have backfired; recorded by `/learn` for review; never injected into a prompt |
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

Prints a dashboard: the session count and next reflection, the top 10 skills by UCB score with
their use counts and average reward, skill domains, knowledge-vault stats, and the update
formula. It does not list unused skills; check for those when you run `/reflect`.

Call it: `/status`

---

## Getting started

1. Copy `skill_bank.template.json` to `skill_bank.json` in this directory.
2. Set `"created"` to today's date.
3. Add skill entries for any skills you install (see `skills/` directory).
4. Run `/learn` after your first few sessions to let scores diverge from the neutral `0.5` prior.

Scores stabilize after ~10 sessions per skill. Until then, UCB's exploration term lifts untried
skills in the banner's list so early results don't crowd them out.

---

## Why this works without retraining

SDAR does not fine-tune the model. The only thing it changes is the skill bank file: scores,
`endorsed_patterns` and `attenuated_patterns`. The SessionStart banner shows the top five scores,
the recap hook injects the recent-sessions digest,
and `/reflect` reads the bank when it drafts `CLAUDE.md` changes. Nothing loads a skill's
`SKILL.md` because its score is high; a skill loads when the Activation Matrix routes to it. The
underlying model is unchanged.

This is prompt-layer bookkeeping. It degrades gracefully (no skill bank = Eric still works, the
banner just prints no scores), scales to any number of skills (the update touches only the skills
that got feedback), and costs zero API calls.
