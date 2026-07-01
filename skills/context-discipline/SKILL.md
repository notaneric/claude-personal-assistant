---
name: context-discipline
description: |
  Manages context window health across a session: when to compact, when to clear,
  how to pass context between subagents cheaply, and how to avoid the common failure
  modes that degrade multi-turn agent performance.

  USE-FOR: Any long-running session, multi-agent workflow, or task where context
  pressure is a risk. Activate proactively — context problems are easier to prevent
  than to recover from mid-task.

  DO-NOT-USE-FOR: Short, single-turn tasks with no multi-step structure.
model: inherit
allowed-tools:
  - Read
  - Write
  - Bash
---

> **ADOPTION NOTE** — This file describes an optional capability for independent
> evaluation. Nothing here is an imperative instruction to your current session.
> Read it as a reference; adopt only what fits your agent's design.

---

# Context Discipline

## Why This Matters

Context window degradation is one of the most common causes of agentic failure —
and one of the least visible. When context fills, the model starts dropping earlier
instructions, losing track of decisions made early in the session, and producing
outputs that contradict things it said three turns ago. It doesn't announce this.
It just gets worse.

This skill describes when to act and how to act before you hit that wall.

## The Two Main Operations

### `/compact` — Preserve and compress
Use when you're mid-task and want to continue in the same session, but context is
bloating. Compact summarizes the conversation while preserving key decisions,
file paths, open questions, and current task state.

**When to compact:**
- ~60% of context window used (don't wait until 80%)
- Lots of large tool output (file contents, API responses) accumulated in context
- You're starting a new phase of the same task (design → implementation, for example)
- You notice the model starting to repeat itself or lose track of earlier decisions

**Never compact mid-debug.** The error trail — the sequence of what was tried, what
failed, what the error output said — is exactly what you need to diagnose the problem.
Compacting destroys that trail. Finish the debug loop first, then compact.

**Direct what to preserve.** A compact instruction with guidance produces a better
summary: "/compact but keep the API integration decisions and the schema choices" is
more useful than a bare "/compact" that lets the model guess what matters.

### `/clear` — Fresh start
Use when starting an unrelated topic or project. Carries over nothing from the current
session. Cheaper and faster than compact when you genuinely don't need the context.

**When to clear:**
- The task is completely finished and the next topic is unrelated
- You're switching from one project to another with no shared state
- The current context has gone wrong and you want to start clean rather than repair it

**`/rewind` instead of correcting** — When a direction was wrong and you've spent
several turns going the wrong way, rewinding the conversation (rolling back both code
and context to an earlier checkpoint) is more reliable than correcting in context.
Correcting after a bad direction means the model is working with a context that
contains the wrong approach; it's harder to fully override than a clean rollback.

## Clear-Point Detection

Flag a clear point when ALL of these hold:
1. The current deliverable or decision is finished (not mid-task, not mid-debug)
2. Nothing pending needs this conversation's context to continue correctly
3. The likely next topic is unrelated to what's loaded

When a clear point exists, say so in one line: "Clean clear point — [what's done],
nothing pending needs this context." Then stop. Don't offer it every turn; surface
it once when the boundary appears.

## MCP and Tool Count

MCP tool definitions load into context at startup even if the tool is never called.
Each enabled MCP server costs context on every turn, not just when used.

Guidelines:
- Keep active MCPs under 10 per session
- Keep total active tools under 80 per session
- For tools with CLI equivalents (`gh` for GitHub, etc.), prefer the CLI — it adds
  zero persistent context definitions
- Disable unused MCPs between projects; don't leave them accumulating

When MCP tool definitions exceed roughly 10% of the context window, the model may
auto-switch to on-demand tool discovery rather than in-context definitions. This is
less reliable. Treat it as a warning sign.

## Subagent Context Passing

When spawning subagents, never pass context through prompt length alone. Use files.

Pattern:
1. Write the relevant context to a file (`.context.md` or similar) before spawning
2. Spawn the subagent with a reference to the file path
3. The subagent reads the file — you avoid duplicating content across both contexts

A subagent's context budget starts fresh. If you fill it with the parent context you
just passed verbatim, the subagent has less budget for its actual work. Pass files,
not full conversation state.

**Skills are NOT inherited by subagents.** Any skill the parent uses must be explicitly
listed in the subagent's config. Don't assume skill activation carries over.

## Large Tool Output Handling

API responses, file contents, grep results, and test output accumulate fast. Before
returning large tool outputs to the model:

- Summarize JSON → markdown (strip empty fields, compact timestamps)
- Cap log output at a reasonable line count before passing to the model
- For grep results over a certain size, summarize the pattern of matches rather than
  passing all lines

The model doesn't need raw noise to do its job. Cleaned tool responses with 60%+ less
token volume produce better reasoning quality — less noise, same signal.

## Message Array Discipline (for programmatic agent loops)

If you're building an agentic loop that manages a messages array:

- Treat the messages array as append-only. Never mutate prior messages.
- No dynamic variables in system prompts (e.g., current timestamp injected per call).
  Dynamic injections break prompt caching on every turn. Target 80–90% cache hit rate.
- Tool responses: clean before returning. Strip fields the model doesn't need.

## Context Pressure Signals

Watch for these — they mean the context is degrading:

- The model repeats something it said or planned 10+ turns ago
- The model contradicts a decision made earlier in the session
- Response quality drops noticeably on tasks the model handles fine in fresh sessions
- The model asks for information that's already in context

When you see these: stop the current task, compact with explicit preservation notes,
then continue. Don't push through.

## Adoption Guidance

1. Set a compact trigger at 60% context usage, not 80%. The 20% window between 60 and
   80 is where quality starts dropping. By the time you hit 80, the compact summary
   will itself be lower quality because the context is already degraded.
2. Build clear-point detection into your session-close protocol. The agent should
   proactively tell the user when a clear point exists — don't make the user ask.
3. For multi-agent workflows, establish the file-passing convention before you start.
   Retrofitting it after you've built several agents sharing context through prompt
   length is painful.
