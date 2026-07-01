# /status — Current State Dashboard

Print Eric's complete current state: skill bank, knowledge vault, installed plugins, session history.

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
E R I C  —  Your Personal AI Assistant
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SESSION HISTORY
  Total sessions:    [N]
  Last session:      [date]
  Next reflection:   Session #[N+10-remainder]

TOP SKILLS BY UCB SCORE
  [skill]   [score]  [domain]      [uses uses · avg reward]
  ...top 10...

SKILL DOMAINS
  design:       [N skills active]  →  impeccable, taste, huashu, ui-ux-pro-max...
  research:     [N skills active]  →  deep-research, graphify, notebooklm-py...
  content:      [N skills active]  →  humanizer, marketing-skills, brand-guidelines...
  seo:          [N skills active]  →  seo suite...
  browser:      [N skills active]  →  browser-agent, playwright...
  multiagent:   [N skills active]  →  massgen, crewai, autogen, metagpt...
  automation:   [N skills active]  →  n8n, google-workspace-cli...
  meta:         [N skills active]  →  grill-me, context-mode, skill-creator...

KNOWLEDGE VAULT
  Location:        your-knowledge-vault/
  Files:           [count] markdown  |  [count] PDFs  |  [count] media
  Last graphified: [date or "never — run /graphify"]
  Knowledge graph: [node count] nodes  |  [edge count] edges

SLASH COMMANDS AVAILABLE
  /learn    /reflect    /status
  /research /design     /write
  /automate /grill      /security-audit

SELF-IMPROVEMENT CYCLE
  Algorithm:  SDAR (sigmoid gate + UCB retrieval)
  Gate:       g = σ(5·Δ) — asymmetric trust
  Formula:    UCB = avg_reward + 0.5·sqrt(ln(N+1)/(uses+1))
  Status:     [active / needs /learn to prime]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## How to Run

Read `sdar/skill_bank.json` and your knowledge vault directory to populate the dashboard.
Compute live UCB scores using:
```
ucb_score = avg_reward + 0.5 * sqrt(ln(total_sessions + 1) / (uses + 1))
```
