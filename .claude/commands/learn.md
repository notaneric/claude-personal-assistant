# /learn: Self-Improvement Feedback Loop

Process this session's feedback and update Eric's skill bank via the SDAR sigmoid gate.

## Steps

1. Read `sdar/skill_bank.json` to get current state and identify skills used this session.

2. **Collect feedback** (use an interactive tool or prompt the user directly):

   Ask these 4 questions, adapt options to what was actually used this session:

   - Q1: "How would you rate this session overall?"
     Options: "5, Excellent (no corrections)", "4, Good (minor corrections)", "3, Okay (multiple corrections)", "2, Poor (significant rework)"

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
   - Apply sigmoid gate: `g = σ(5 · Δ)` where Δ is normalized endorsement ratio
   - Recalculate `ucb_score`

4. For each skill mentioned as underperforming:
   - Increment `uses` (but NOT successes)
   - Update `avg_reward` with penalty (rating-weighted)
   - Add task type to `attenuated_patterns`
   - Apply sigmoid gate with negative Δ → soft attenuation (g≈0.08, never zero)
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
    Attenuated: [list]  →  Soft-gated
    Next reflection in: M sessions
    ```

## UCB Formula
```
ucb_score = avg_reward + 0.5 * sqrt(ln(total_sessions + 1) / (uses + 1))
```

## Sigmoid Gate
```
delta = (endorsed_count - attenuated_count) / total_signals  # in [-1, 1]
g = 1 / (1 + exp(-5 * delta))
```
Key: negative delta produces g≈0.08, skill is attenuated but NEVER removed. Even weak skills may prove useful in new contexts (SDAR paper: random retrieval still beats no retrieval).
