# Performance Rules, Eric

## Model Tier Routing

Route by task complexity. Never over-provision unless reasoning depth is demonstrably needed.

| Tier | Model | Use For |
|---|---|---|
| Haiku 4.5 | `claude-haiku-4-5` | Classification, boilerplate transforms, narrow single-file edits, worker agents in parallel swarms |
| Sonnet 4.6 | `claude-sonnet-4-6` | Implementation, multi-file refactors, content generation, orchestrating multi-agent workflows |
| Opus 4.8 | `claude-opus-4-8` | Architecture decisions, root-cause analysis, multi-file invariants, deep research, debate/risk reasoning |
| Fable 5 | `claude-fable-5` | Hardest reasoning tasks: CLAUDE.md rewrites, `/reflect`, complex agentic loops, codebase-wide migrations, long-horizon research |

**Escalation rule:** Only escalate model tier when a lower tier fails with a clear reasoning gap, not because the task "feels hard." Track per-task: model used, token estimate, success/failure.

**Small model ceiling:** Low effort on Opus outperforms Haiku at max effort for intelligence-demanding tasks. Use Haiku only for non-intelligence-bound tasks: classification, summarization, extraction, or when low time-to-first-token is the constraint.

**Fable 5 notes:**
- Adaptive thinking is always-on, cannot be disabled. No extended thinking, no `budget_tokens`.
- Uses the Opus 4.7+ tokenizer: same text produces ~30% more tokens than pre-4.7 models. Budget accordingly.
- ~5% of sessions auto-fallback to Opus 4.8 due to safety guardrails, transparent to the caller.
- 128k max output, 1M context. Available on Claude API, Bedrock, Vertex, Foundry.

**Recommended agent session mapping:**
- **Main interactive session** → Opus 4.8 (best model reads your prompt and decomposes)
- **Subagents by task:** Haiku for classification/extraction, Sonnet for implementation, Opus for deep research/security/architecture
- **CLAUDE.md rewrites / `/reflect`** → Fable 5

## External-Model Offload Lane

When high-volume, non-frontier work can leave the native Claude loop, route it to an external model to reduce API costs. This pattern applies to: classification, extraction, enrichment, first-draft generation, large-corpus summarization.

**Hard architectural facts, where external models can and cannot run:**
- NOT the main agent loop, that stays on the best model you have (it reads your prompt and decomposes).
- NOT Claude Code native subagents (`Agent` tool). Their `model:` field is Claude-only (`haiku|sonnet|opus|inherit`). The only override is `ANTHROPIC_BASE_URL`, which is on the security deny list (CVE-2026-21852) AND swaps the brain not the hands. Do not attempt.
- External agent frameworks (CrewAI/AutoGen/MetaGPT/n8n), point worker agents at a cost-efficient external model via LiteLLM or an OpenAI-compatible API.
- Direct CLI/API calls for bulk grunt work that does not require tool use or Claude Code integration.

**Routing logic:** The main agent (Opus) reads the prompt and decomposes. For each subtask that (a) leaves the native loop AND (b) does not need frontier reasoning, route to the external model. The main Claude instance stays the evaluate/QA layer (generate → evaluate → repair: external model generates, Claude judges anything that matters). Cost savings come from the offloadable tail; the interactive session stays Opus by design.

**Sensitive-data wall:** Never send sensitive data, PII, health records, confidential business documents, or any data with compliance requirements, to a third-party cloud API without a verified data-processing agreement. Validate all external-model output before it touches a real deliverable; Opus acts as the QA gate.

**Self-hosted models:** A locally-hosted open-source model is a valid external offload lane with no data-egress risk. Suitable for: bulk classification, summarization, first-draft generation, embedding/reranking. Route high-volume embedding and reranking tasks to a local model before considering a cloud API.

## Task Type → Model + Effort Routing

Classify every task before routing. "Speed vs correctness" = prototype vs production framing.

| Task type | Stakes | Model | Effort |
|---|---|---|---|
| Prototype / draft | speed | Sonnet 4.6 | high |
| Production artifact | correctness | Opus 4.8 / Fable 5 | xhigh-max |
| Classification / extraction | throughput | Haiku 4.5 | low |
| Synthesis / decision | quality | Sonnet 4.6 | xhigh |
| Architecture / security | correctness | Opus 4.8 | max |
| CLAUDE.md rewrites / reflection | reasoning depth | Fable 5 | xhigh |

## Effort Levels

Use effort levels instead of thinking on/off toggles. Adaptive thinking has been Anthropic's production default since Opus 4.6, do not set `thinking: enabled/disabled` as a binary.

| Effort | When |
|---|---|
| `low` | Subagents doing fast lookup or classification; simple single-step tasks |
| `medium` | Standard implementation tasks with clear specs |
| `high` | Default for most interactive sessions, best cost/quality balance |
| `xhigh` | **Default for complex tasks.** Spec iteration, architectural decisions, agentic loops. Anthropic's own default for Claude Code and Claude.ai. |
| `max` | Explicitly hardest reasoning, correctness matters more than cost. Opus-tier only. |

**Session default:** `xhigh`. Even though individual generation costs more tokens, you iterate fewer times. Switch to `max` only when correctness is the dominant constraint.

**Task budgets:** For long-horizon agentic tasks, set an explicit token ceiling: "Do not spend more than X tokens before checking in." Prevents runaway loops on open-ended tasks.

## Thinking Lever Rules

- Never set `thinking: enabled/disabled` as a binary. Adaptive thinking is always-on from Sonnet 4.6+. Toggling it off removes a capability, not just tokens.
- Control reasoning depth through effort levels only: low/medium/high/xhigh/max.
- Low effort for non-intelligence-bound tasks (classification, extraction), may find shortcuts the model wouldn't take at higher effort.
- `xhigh` is the default. `max` only when correctness dominates cost.

## Message Array Discipline (Cache Optimization)

- Append-only message arrays: treat everything in `messages[]` as immutable once set. Never mutate prior messages.
- No dynamic variables in system prompts (e.g., current datetime, session IDs injected at runtime). These break prompt cache on every turn. Target: 80-90% cache hit rate on any agentic loop.
- Tool responses: clean before returning to Claude. Convert JSON → markdown summary, compact timestamps, strip empty fields. Cleaning tool response JSON before passing it back to Claude yielded 66-77% token reduction with accuracy increase, less noise for Claude to reason over.

## Context Window Discipline

**MCP count:** Configure as many MCPs as useful, but keep **under 10 enabled / under 80 tools active** per session. Too many tools shrinks effective context significantly.

- Disable unused MCPs between projects
- Run `/mcp` to audit active tool count before long sessions
- Prefer disabling at session level, not permanently deleting config
- **CLI > MCP when context budget is tight:** MCP tool definitions inject into context at startup even if never called. For tools with CLI equivalents (`gh` for GitHub, `aws` for AWS), prefer CLI invocation via Bash, context-cheaper because it adds zero persistent definitions.
- **MCP auto-degradation threshold:** When MCP tool definitions exceed ~10% of context window, Claude Code auto-activates "tool search mode" (on-demand discovery instead of in-context). This is less reliable. Monitor with `/context` and disable unused servers when approaching the threshold.

**Context pressure signals:**
- Approaching last 20% of window → stop large refactors, complete current task only
- Repeated plans or notes duplicated in context → compact before continuing
- Runaway subagent producing oversized logs → cap at 500 lines before passing to orchestrator

## Session Strategy

- Continue session for closely-coupled task units (same feature, same debug loop)
- Start fresh session after major phase transitions (design → implementation → review)
- `/compact` mid-feature (preserves feature context). `/clear` when starting a new unrelated feature. **Never compact mid-debug**, you lose the error trail needed for diagnosis.
- Pass context via files (e.g., `.agent-context.md`) not prompt length when spawning sub-agents

## Build/Run Troubleshooting

If a build or process fails:
1. Diagnose root cause before retrying
2. Apply ALL fixes before restarting, never restart after each individual fix
3. Check process group on kill, kill the child PID, not just the parent
