# /learn: Self-Improvement Feedback Loop

Process this session's feedback and update Eric's skill bank with the SDAR running-mean update.

## Steps

1. Read `sdar/skill_bank.json` to get current state and identify skills used this session.

2. **Collect feedback** (use an interactive tool or prompt the user directly):

   Ask these 4 questions, adapt options to what was actually used this session:

   - Q1: "Rate the **process** this session: how the work was done, not how it turned out."
     Options: "5, Excellent (no corrections)", "4, Good (minor corrections)", "3, Okay (multiple corrections)", "2, Poor (significant rework)"

     The rating is the only input to every skill's average, so two rules keep it honest:
     - **Process, not outcome.** A search that correctly finds nothing, or a sound decision that turned out badly, is not a 4. If the answer names an outcome, record it in `rating_note` and ask for the process rating.
     - **Score what reached you.** A defect a check caught before you saw it (a test, a dry run, a review) is the system working and does not cost the 5. Without this rule, the more checks the assistant runs, the more defects it "finds", and no session can score 5.

     | score | anchor |
     |---|---|
     | 5 | No corrections from you, and nothing wrong reached you. Defects caught by a check are listed with the check that caught them. |
     | 4 | Something wrong reached you and the assistant found it afterwards, or one correction that forced no rework. |
     | 3 | Several corrections, or one that forced a rebuild. |
     | 2 | The result was wrong in a way that meant starting over, or something shipped that should not have. |

     **Self-assessed mode (optional).** Once you trust the assistant's judgment, you can tell it to rate sessions itself. It then asks nothing: it reads the session for your corrections, scores against the anchors above, names every defect with where it was caught, and quotes any rating you volunteered, which always wins. A self-judge drifts toward the middle and toward flattering itself, so the anchors are required in this mode.

   - Q2: "Which skills or approaches performed well?"
     (pick from skills used this session)

   - Q3: "What went wrong or needed correction?"
     (pick from skills used this session)

   - Q4: "Any behavior to lock in for future sessions?"

3. For each skill mentioned as endorsed:
   - Increment `successes`
   - Increment `uses`
   - Update `avg_reward = (avg_reward * (uses-1) + rating/5) / uses`
   - Add task type to `endorsed_patterns` if not present
   - Recalculate `ucb_score`

4. For each skill mentioned as underperforming:
   - Increment `uses` (but NOT successes)
   - Update `avg_reward = (avg_reward * (uses-1) + (rating-1)/5) / uses`
   - Add task type to `attenuated_patterns`
   - Recalculate `ucb_score`

5. Increment `total_sessions` in skill_bank.json

6. Write session log:
   ```
   sdar/logs/YYYY-MM-DD-sessionN.json
   ```
   **Required fields (attribution mandatory):**
   ```json
   {
     "session_id": "YYYY-MM-DD-sessionN",
     "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
     "agent": "eric-main",
     "session_date": "YYYY-MM-DD",
     "session_number": N,
     "domain": "<primary domain, e.g. research | design | writing>",
     "skills_used": [],
     "user_rating": N,
     "rating_note": "<WHY this score, specific corrections, misses, or wins. NON-EMPTY, REQUIRED>",
     "endorsed": [],
     "attenuated": [],
     "notes": [],
     "ucb_updates": {}
   }
   ```
   `session_id`, `timestamp`, `agent`, `rating_note`, and `domain` are all mandatory and must be non-empty. A bare rating number with no reason makes future `/reflect` unable to root-cause quality trends.

7. Save updated skill_bank.json

8. **Update the rolling session digest** (`sdar/recent-sessions.md`), prepend one compressed line, newest-first, trim to last 8 sessions:
   ```
   - S<N> (YYYY-MM-DD, <domain>, rated <r>): <≤140-char summary of what was built/decided + any key correction>
   ```
   This is what SessionStart injects next session for continuity. Keep it high-signal, not a raw activity dump.

9. **Repeat-flaw tracking.** If this session surfaced a recurring flaw that was NOT structurally fixed, upsert `sdar/flags.json` with `domain`, `flaw`, `count`, `sessions[]`, `status`, and attribution. `count` increments on recurrence without a committed fix.
   - **For any money or irreversible domain:** a recognized lesson requires a committed artifact before session close, a committed skill/rule edit, a hook, or a dated `sdar/pending/<slug>.md` spec. Recognition logged as prose without a committed artifact does not close the loop.

10. If `total_sessions % 10 == 0`: automatically trigger `/reflect`

11. Print summary:
    ```
    Session #N logged
    Endorsed: [list]  →  UCB scores updated
    Attenuated: [list]  →  UCB scores updated
    Next reflection in: M sessions
    ```

## UCB Formula
```
ucb_score = avg_reward + min(0.5 * sqrt(ln(total_sessions + 1) / (uses + 1)), 0.25)
```

## Why there is no trust gate

Earlier versions of this command had a sigmoid gate step, and nothing ever read its output. `ucb_score` uses only `avg_reward`, `uses` and `total_sessions`, so the running mean in steps 3 and 4 is the whole update. Reward is capped at `rating/5`, so after a session rated 3 or lower, every skill that got feedback and was averaging above 0.6 goes down, endorsed ones included. A low average only means a skill is retrieved less often, and the update never removes one.
