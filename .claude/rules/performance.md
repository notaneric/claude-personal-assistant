# Performance Rules, Eric

## Model Tier Routing

Route by task complexity. Never over-provision unless reasoning depth is demonstrably needed.

**Name tiers by alias** (`opus`, `sonnet`, `haiku`, `fable`) in `settings.json` and in agent or skill frontmatter. Claude Code resolves each alias to the current model, so a new release never leaves you pinned to an old one. Use a full model ID only where a script must stay on one version.

| Tier (alias) | Current model (October 2026) | Use For |
|---|---|---|
| Haiku (`haiku`) | Haiku 5.5, `claude-haiku-5-5` | Classification, boilerplate transforms, narrow single-file edits, worker agents in parallel swarms |
| Sonnet (`sonnet`) | Sonnet 5.5, `claude-sonnet-5-5` | Implementation, multi-file refactors, content generation, orchestrating multi-agent workflows |
| Opus (`opus`) | Opus 5.5, `claude-opus-5-5` | The main session. Architecture decisions, root-cause analysis, multi-file invariants, deep research, CLAUDE.md rewrites, `/reflect`, anything involving money or an irreversible step |
| Fable (`fable`) | Fable 5.1, `claude-fable-5-1` | Deliberate escalation only: the longest autonomous runs, or a task where Opus at `max` effort demonstrably stalls |

**Escalation rule:** Only escalate model tier when a lower tier fails with a clear reasoning gap, not because the task "feels hard." Track per-task: model used, token estimate, success/failure.

**Small model ceiling:** Low effort on Opus outperforms Haiku at max effort for intelligence-demanding tasks. Use Haiku only for non-intelligence-bound tasks: classification, summarization, extraction, or when low time-to-first-token is the constraint.

**Set effort explicitly on the 5.5 models.** In Claude Code, Opus 5.5, Sonnet 5.5 and Haiku 5.5 default to `medium` effort (Opus 5 defaulted to `high`). Save your default with `effortLevel` in `settings.json`, or per model under `modelSettings`. `max` cannot be saved in settings: use `/effort max` for the session, or the `CLAUDE_CODE_EFFORT_LEVEL` environment variable.

**Fable notes:**
- Thinking is always on and cannot be disabled; effort is the only control.
- Hard tasks can run many minutes per turn, and Fable uses more of your plan's capacity per task than Opus. Check your plan's terms before making it a habit.
- Subagents inherit the session model. If Fable is the session model, pin every worker to `haiku` or `sonnet`.

**Set the model in one place.** Never put `ANTHROPIC_MODEL` in the VS Code `claudeCode.environmentVariables` setting: it outranks every settings file, on that machine only, so if you sync `settings.json` between machines they quietly run different models.

**API keys and subscriptions:** if `ANTHROPIC_API_KEY` is set in the environment, Claude Code uses it instead of your Pro or Max login and bills at API rates, including in `claude -p`. Give a key meant for your own scripts a different variable name, and pass it to the SDK explicitly.

**Recommended agent session mapping:**
- **Main interactive session** → `opus` (the best model reads your prompt and decomposes)
- **Subagents by task:** `haiku` for classification/extraction, `sonnet` for implementation, `opus` for deep research/security/architecture
- **CLAUDE.md rewrites / `/reflect`** → `opus` at `max` effort (run `/effort max` first: a command cannot raise the session's effort itself)

## External-Model Offload Lane

When high-volume, non-frontier work can leave the native Claude loop, route it to an external model to reduce API costs. This pattern applies to: classification, extraction, enrichment, first-draft generation, large-corpus summarization.

**Hard architectural facts, where external models can and cannot run:**
- NOT the main agent loop, that stays on the best model you have (it reads your prompt and decomposes).
- NOT Claude Code native subagents (`Agent` tool). Their `model:` field is Claude-only (`haiku|sonnet|opus|fable|inherit`, or a full Claude model ID). The only override is `ANTHROPIC_BASE_URL`, which is on the security deny list (CVE-2026-21852) AND swaps the brain not the hands. Do not attempt.
- External agent frameworks (CrewAI/AutoGen/MetaGPT/n8n), point worker agents at a cost-efficient external model via LiteLLM or an OpenAI-compatible API.
- Direct CLI/API calls for bulk grunt work that does not require tool use or Claude Code integration.

**Routing logic:** The main agent (Opus) reads the prompt and decomposes. For each subtask that (a) leaves the native loop AND (b) does not need frontier reasoning, route to the external model. The main Claude instance stays the evaluate/QA layer (generate → evaluate → repair: external model generates, Claude judges anything that matters). Cost savings come from the offloadable tail; the interactive session stays Opus by design.

**Sensitive-data wall:** Never send sensitive data, PII, health records, confidential business documents, or any data with compliance requirements, to a third-party cloud API without a verified data-processing agreement. Validate all external-model output before it touches a real deliverable; Opus acts as the QA gate.

**Check the price first:** for non-sensitive bulk work, Haiku 5.5 on the Anthropic API costs $0.10 per million input tokens and $0.50 per million output for prompts up to 100K tokens ($0.50 and $2.50 above that; half price through the Batch API; October 2026 pricing), which is often cheaper than running an external model.

**Self-hosted models:** A locally-hosted open-source model is a valid external offload lane with no data-egress risk. Suitable for: bulk classification, summarization, first-draft generation, embedding/reranking. Route high-volume embedding and reranking tasks to a local model before considering a cloud API.

## Task Type → Model + Effort Routing

Classify every task before routing. "Speed vs correctness" = prototype vs production framing.

| Task type | Stakes | Model | Effort |
|---|---|---|---|
| Prototype / draft | speed | Sonnet 5.5 | high |
| Production artifact | correctness | Opus 5.5 | xhigh-max |
| Classification / extraction | throughput | Haiku 5.5 | low |
| Synthesis / decision | quality | Sonnet 5.5 | xhigh |
| Architecture / security | correctness | Opus 5.5 | max |
| CLAUDE.md rewrites / reflection | reasoning depth | Opus 5.5 | max |

## Effort Levels

Use effort levels instead of thinking on/off toggles. Adaptive thinking has been Anthropic's production default since Opus 4.6, do not set `thinking: enabled/disabled` as a binary.

| Effort | When |
|---|---|
| `low` | Subagents doing fast lookup or classification; simple single-step tasks |
| `medium` | Standard implementation tasks with clear specs |
| `high` | Default for most interactive sessions, best cost/quality balance |
| `xhigh` | **Default for complex tasks.** Spec iteration, architectural decisions, agentic loops. Not Claude Code's own default on the 5.5 models (that is `medium`), so set it. |
| `max` | Explicitly hardest reasoning, correctness matters more than cost. |

**Session default:** `xhigh`. Even though individual generation costs more tokens, you iterate fewer times. Switch to `max` only when correctness is the dominant constraint.

**Task budgets:** For long-horizon agentic tasks, set an explicit token ceiling: "Do not spend more than X tokens before checking in." Prevents runaway loops on open-ended tasks.

## Thinking Lever Rules

- Never set `thinking: enabled/disabled` as a binary. On Opus 5.5 thinking cannot be disabled at all, and Sonnet 5.5 and Haiku 5.5 only have narrow off switches, so treat effort as the control.
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
