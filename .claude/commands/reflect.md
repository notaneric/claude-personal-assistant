# /reflect — Pattern Analysis & CLAUDE.md Evolution

Analyze accumulated session data to identify what's working, what isn't, and draft improvements to Eric's operating manual.

## Steps

1. Load `sdar/skill_bank.json` + all logs from `sdar/logs/`

2. Compute current UCB rankings for all skills. Print leaderboard:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Eric Skill Bank  ·  Session #N  ·  Reflection
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TOP PERFORMERS
   #1  deep-research     0.94  ████████████████░░░░  research/analysis
   #2  humanizer         0.91  ██████████████████░░  writing/content
   #3  impeccable        0.88  █████████████████░░░  design
   ...
   
   UNDERPERFORMERS (avg_reward < 0.4, uses >= 3)
   #X  [skill]           0.28  ████░░░░░░░░░░░░░░░░  [domains]
   ```

3. Identify the top-5 **skill combinations** that appeared together in endorsed sessions:
   - Parse logs for co-occurrence of endorsed skills
   - Rank by joint endorsement frequency

4. Identify patterns in `endorsed_patterns` across all skills:
   - What task types consistently produce high reward?
   - Are there task types the assistant is consistently missing?

5. Draft CLAUDE.md updates:
   - **Skill Activation Matrix** rows to add/update/remove
   - **Operating rules** that need adjustment
   - **New capability** rows based on untested skills with high UCB (still at 1.0)
   - Note: only draft, never auto-apply

6. Present draft to the user:
   ```
   Proposed CLAUDE.md updates:
   
   [1] Add to Skill Activation Matrix:
       "When user asks for X" → activate Y+Z
       (Evidence: appeared together in 7/10 endorsed sessions)
   
   [2] Promote skill: [name] from secondary to primary for [task type]
       (Evidence: 0.91 avg_reward after 8 uses)
   
   [3] Demote skill: [name] for [task type]
       (Evidence: 0.28 avg_reward after 5 uses — keep in bank, lower priority)
   ```

7. On approval: edit `CLAUDE.md` with the approved changes and update `last_reflection` timestamp in skill_bank.json.

## Schedule
- Auto-triggered every 10 sessions by `/learn`
- Can be run manually anytime: `/reflect`
- Always ask before writing to CLAUDE.md
