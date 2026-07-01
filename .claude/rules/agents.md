# Agent Orchestration Rules — Eric

## Parallel by Default

For independent operations, ALWAYS dispatch in the same message — never sequential when parallel is possible.

```
# CORRECT: one message, multiple agent calls
Agent 1: research component A
Agent 2: research component B
Agent 3: check knowledge vault for existing coverage

# WRONG: sequential when parallelizable
Do agent 1. Wait. Do agent 2. Wait.
```

## When to Use a Subagent

Only two cases justify a subagent. All other subagents should be collapsed back into the main agent.

1. **Parallelization** — Throw multiple Claude instances at independent parts of one problem simultaneously.
2. **Fresh perspective** — A code reviewer that has never seen the writing agent's context produces better reviews than the main thread reviewing its own work. Separate context prevents "I built this" bias.

**Consolidation rule:** As frontier models improve, many existing subagents can be eliminated by folding their capability into the main orchestrator. Re-evaluate any subagent against these two tests before assuming it is necessary.

## Delegation Triggers

Invoke a specialized sub-agent immediately (no permission needed) when:

| Trigger | Sub-agent |
|---|---|
| Complex multi-file feature | planner → then implement |
| Code written / modified | code-reviewer (if quality matters) |
| Security-sensitive code | security-reviewer (before committing) |
| Architectural decision | architect |
| Bug fix with unclear root cause | agent-introspection-debugging |
| Autonomous loop setup | autonomous-loops skill |
| Eval / regression check | eval-harness skill |

## Subagent Design Principles

**Structured output format is the single highest-impact improvement.** Without a defined output schema, subagents don't know when to stop and run far longer than necessary. A concrete output contract is a natural stopping condition.

Output schema should always include an **`obstacles` section**: workarounds discovered, commands that needed special flags, dependency issues. If omitted, the main thread rediscovers the same problems on every run.

**Three confirmed antipatterns:**
1. `"You are a Python expert"` — adds no value; Claude already has that knowledge.
2. Sequential multi-step pipelines where each step depends on the previous step's discoveries — information is lost in handoffs.
3. Test runner subagents — they hide failure output needed for diagnosis; the main thread needs full test output.

**Communication breakdown is the #1 failure mode in multi-subagent systems.** When an eval fails and the subagent got the right answer, check the handoff protocol before debugging the subagent itself.

**Do NOT wrap subagents as tools.** Use Claude Managed Agents' callable agents primitive for full observability and logging of subagent behavior.

## Subagent Configuration

Subagent config files: `.claude/agents/` (project-scoped) or `~/.claude/agents/` (user-scoped). Markdown with YAML front matter.

Key YAML fields:
- `model`: `haiku` | `sonnet` | `opus` | `inherit` — pin cheapest model that handles the task
- `skills`: list of skills to load at subagent start — **skills are NOT inherited from main context; they must be explicitly declared here**
- `allowed_tools`: restrict tool access to the minimum needed for the subagent's purpose

Skills listed in a subagent's config load at startup (not on-demand). Only list skills always relevant to that subagent's purpose — they consume the subagent's full context budget from the start.

Adding `"proactively"` to a subagent's description causes the parent agent to auto-launch it more often without explicit instruction. Use intentionally.

Reviewer subagent system prompt should encode your project-specific review standards — this produces consistent criteria across all reviews, not just general best practices.

## Tool Scoping

Restrict sub-agents to the minimum tools needed:

- **Research agents** → Read, Grep, Glob, WebFetch, WebSearch (no Write/Bash)
- **Analysis agents** → Read, Grep, Glob (read-only)
- **Implementation agents** → full tools, constrained to project directory
- **Background agents** → always specify `--allowedTools` if using `claude -p`

## Multi-Perspective Analysis

For complex decisions (architecture, security, performance), use split-role sub-agents:
- Factual reviewer: "What does the code actually do?"
- Senior engineer: "Is this the right approach?"
- Security expert: "What can go wrong?"
- Consistency reviewer: "Does this match existing patterns?"

Never ask a single agent to wear all four hats — it collapses distinctions.

## Research-First Protocol

Before any web search or API call:
1. Check your knowledge vault (`/graphify [topic]`) — avoid redundant research
2. Check `skill_bank.json` for relevant prior skill activations
3. Check project `context.md` files for known constraints
4. Only then: web search / API calls

## Subagent Spawn Pattern

When spawning subagents for parallel work, pass conventions explicitly in the prompt — don't assume they have project context. Include:
- Relevant file paths
- Applicable project rules (design standards, content standards, etc.)
- Clear done condition
- Output format expected (including obstacles section)

## Eval Loop Pattern

Use evals as the core engineering loop: establish baseline → tweak architecture → rerun → measure delta. Never fly blind on agent quality.

**Three types of eval tasks every agent needs:**
1. Control cases — always pass, unambiguous (regression guard)
2. Edge cases — previously observed failures now guarded
3. Capability boundary cases — where to hand off or refuse

**Grader types:** Always combine deterministic graders (count-based, regex, schema checks) with LLM-as-judge (rubric-based). Unanchored rubrics compress to a meaningless 2.8-4.4 range even on obviously poor output — the judge has nothing to compare against. Minimum: 2 anchor examples (score 0 example + max-score example). Evals are living artifacts: when human judgment disagrees with the grader score, fix the grader before acting on the score — the definition of "good" may have been wrong, not the output.

**QA loop instruction:** Tell the critic agent adversarially — "Assume there are problems. Your job is to find them." This is stronger than "check for issues."

**Judge output order:** Reasoning before score, never score first. An LLM anchored on a number will rationalize it even when wrong.

## Generate → Evaluate → Repair Loop

For complex constrained generation tasks (scheduling, allocation, multi-rule compliance, slide generation, complex copy), default to a 3-step decomposed loop over a single mega-prompt:

1. **Generate** — minimal prompt, no overconstraints
2. **Evaluate** — LLM grader reports specific rule violations (not a score, a list of failures)
3. **Repair** — targeted fixes based on evaluator output

Why: three minimal prompts outperform one complex prompt consistently. Soft constraints can be injected into the eval prompt at runtime without touching the generator.

## Critique Agent Pattern

After generating any research report, architectural plan, or multi-step agentic plan:
- Spawn a separate agent with ONLY the output (no generator context)
- System prompt: "Assume there are problems. Your job is to find them. What did this miss?"
- Critique agent output gates the plan — not a rubber stamp

**Plans as executable specs:** Multi-agent plans must be structured as checkable artifacts (ordered task list with explicit done conditions per step), not prose. Prose plans drift; spec plans catch coherence gaps.

## MCP Scope Rule

MCP servers are only justified when multiple agents share the same governed tool set AND the tool has security/compliance requirements requiring a centralized gateway. Default to CLI/bash/code-execution first. "Running to MCP first" is the most common premature escalation in agent architecture.

## Brain/Hands Decoupling (Autonomous Loops)

Any autonomous loop (scheduled agents, background workers, automation pipelines) must decouple:
- **Brain** (orchestration): main agent loop, runs decisions, manages state
- **Hands** (execution): tool containers / subagents, run in isolated context

Never couple them — when the hands context fills, it kills the brain too.

Every autonomous loop requires:
1. An explicit outcome rubric (not just a task description) — the stopping condition
2. Event-log architecture (append-only events, not request-response) — enables resumability
3. Session state awareness: idle → running → rescheduling → terminated

## Orchestration Hierarchy

| Pattern | When |
|---|---|
| CrewAI | Role-playing team, content pipeline, research team |
| AutoGen | Code generation + review loop |
| MetaGPT | Full software company simulation (PM→Eng→QA) |
| MassGen | Maximum parallelism, frontier model scaling |
| Agent tool (native) | Quick parallel research or single-purpose delegation |

## Memory Architecture for Multi-Agent

Memory stores must have version history and attribution metadata. Every write to working memory should include:
- `session_id`
- `timestamp`
- `agent` (which subagent wrote it)

Use optimistic concurrency on shared memory (especially `skill_bank.json`): before overwriting, check a content hash to verify no other parallel agent has written since your last read.

**Dreaming pattern** for `/reflect`: spawn one subagent per log file to analyze in parallel, then an orchestrator synthesizes. Out-of-band batch processing — not in-session incremental. Achieves ~95% cache hit rate because transcripts are stable.

## Memory Scoping (3 Tiers)

Explicit tiers — write to the RIGHT tier, don't blur them:
- **Ephemeral (session):** In-context state. Cleared on `/clear`. Never persisted.
- **Working memory (`.agent/`):** `skill_bank.json`, session logs, pending changes. Survives sessions. Maintained by `/learn` and `/reflect`.
- **Long-term (knowledge vault):** Research outputs, reference material, permanent knowledge. Updated via `/graphify`. Queried before any web research.

**Index file pattern:** `memory-index.md` — slug-based index over working memory. Reading an index to find what to look for is faster than grepping. Maintained by `/reflect`. Dreaming runs out-of-band from the agent loop (never during active task execution — separate `/reflect` pass). Memory staleness: `/reflect` flags `skill_bank.json` entries with 0 uses in the last 30+ days as deletion candidates.

## Hooks Reference

Hooks are deterministic — they always execute regardless of what Claude decides. If something must happen every time, use a hook, not a CLAUDE.md instruction (which is probabilistic).

| Event | Use For |
|---|---|
| `userPromptSubmit` | Transform or validate prompt before Claude processes it |
| `preToolUse` | Block dangerous tool calls before execution (exit code 2 = block + send feedback to Claude) |
| `postToolUse` | Run formatters, linters, compliance logging after every edit |
| `notification` | Route Claude notifications to an alerting channel |
| `stop` | Auto-trigger `/learn`, send session summary, write to skill bank |

**Blocking a tool call:** Pre-tool-use hooks receive tool name + input as JSON on stdin. Exit code `2` blocks the call and sends stderr back to Claude as feedback — Claude adapts. Use this for: block writes to production config, block `rm -rf`, block commits to protected branches.

**Money / irreversible actions must be gated by a PreToolUse hook (exit 2), never by prose instructions alone.** A SessionStart hook or a skill instruction block only injects context text — it CANNOT stop a tool call, so it is annotation, not enforcement. The deny list and PreToolUse exit-2 are the only real action-blocks.

Key the gate on objective, machine-written state (a state file, a counter, an approval record) — NOT on the agent's own generated text (e.g., a keyword the agent writes that triggers the gate). The agent will simply stop writing the keyword once it becomes a kill-switch.

**Example: irreversible-action gate pattern**

```python
#!/usr/bin/env python3
# preToolUse hook — gates irreversible actions against a machine-written state file
import json, sys, pathlib

tool = json.load(sys.stdin)
if tool.get("tool") not in {"Bash", "Write"}:
    sys.exit(0)

state = pathlib.Path(".agent/gate-state.json")
if not state.exists():
    print("Gate state file missing — action blocked", file=sys.stderr)
    sys.exit(2)

s = json.loads(state.read_text())
if not s.get("approved"):
    print(f"Action blocked: approval required. State: {s}", file=sys.stderr)
    sys.exit(2)
```

**Portability:** Use `CLAUDE_PROJECT_DIR` environment variable inside hook commands to reference project scripts regardless of Claude's current working directory.

**Version control:** Hooks in `.claude/settings.json` are project-scoped and version-controlled — the whole team gets identical hooks on clone. User-level hooks only protect one machine.
