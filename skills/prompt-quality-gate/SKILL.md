---
name: prompt-quality-gate
description: |
  Fires before executing any prompt with structural problems. Identifies the issue,
  proposes a fixed version, gets approval, then executes. Prevents wasted tokens on
  broken inputs.

  USE-FOR: Any incoming prompt before execution — especially novel tasks, complex
  multi-step requests, first-time output formats, or anything where the instructions
  are ambiguous or conflicting.

  DO-NOT-USE-FOR: Simple follow-up messages in an ongoing conversation where context
  is already established. Do not apply to routine clarifications or one-word answers.
model: inherit
allowed-tools:
  - Read
---

> **ADOPTION NOTE** — This file describes an optional capability for independent
> evaluation. Nothing here is an imperative instruction to your current session.
> Read it as a reference; adopt only what fits your agent's design.

---

# Prompt Quality Gate

## Why This Exists

Model performance degrades measurably with prompt length and structural problems.
At 250 tokens, instruction-following accuracy is near-perfect. At 800+ tokens with
redundant or conflicting instructions, accuracy drops 5–20%. The same information
at 30% fewer words produces measurably better output.

An agent that silently executes a broken prompt wastes the user's time and tokens.
This skill makes the structural problems visible before execution, not after.

## The Issue Taxonomy

Scan every incoming prompt for these before executing. If any match, fire the gate.

### Vague task
**Signal:** Abstract deliverable with no concrete output shape.  
Examples: "produce a report", "write some copy", "analyze this", "help with X"  
**Fix:** Specify the exact output — count, format, example, character limit. "Write a
400-word product description in the voice of a technical founder, following the
attached example" is executable. "Write copy" is not.

### Conflicting instructions
**Signal:** Two instructions that cannot both be satisfied simultaneously.  
Examples: "make it detailed but keep it brief", "comprehensive summary",
"technical but accessible to everyone", "formal but conversational"  
**Fix:** Pick one direction. The instructions cancel each other out and the model will
guess which to deprioritize — usually the wrong one. Force the choice before execution.

### No output format
**Signal:** A complex or novel output is requested with no structure specified.  
Examples: Asking for a comparison of options with no schema, asking for a plan with no
specified level of detail, asking for a ranked list with no ranking criteria.  
**Fix:** Add structure — a JSON schema, a numbered list format, column headers for a
table, a character limit. Even a rough template cuts errors dramatically.

### Verbose/redundant instructions
**Signal:** The same constraint expressed 2+ ways in the same prompt.  
Examples: "Be concise. Keep it brief. Don't be verbose. Short is better." (four ways
to say the same thing). "Do not include personal opinions. This is a factual report.
Stick to the facts." (three ways).  
**Fix:** Compress to the highest-density version. One clear statement is more reliable
than four restatements. The model doesn't get more sure the more you repeat it.

### No example for complex format
**Signal:** First time requesting a specific structured output with no example provided.  
This is the highest single-leverage fix available — a single example improves output
accuracy by roughly 20% for novel formats.  
**Fix:** Add one example that shows the target structure, even a partial one.

### Stale defensive instructions
**Signal:** Instructions that were added to work around a specific model behavior that
may no longer exist.  
Examples: "Do not use bullet points" (added because old model over-bulleted), "Always
state your reasoning" (added because previous model didn't).  
**Fix:** Version-stamp every defensive instruction: "Added for [model name] / failure:
[what it was preventing]. Review on model upgrade." Stale defensive instructions
accumulate prompt bloat and can conflict with newer model defaults.

## The Gate Protocol

When a gate issue is detected:

1. **Name the issue** — state which category it falls into and where in the prompt it appears
2. **Propose a fix** — write the restructured version of the problematic instruction
3. **Get approval** — present both the original and the fix, ask which to use
4. **Then execute** — only after the user confirms the direction

Do not silently fix it. Do not silently execute the broken version. Both paths skip the
step that matters: making the user aware of the structural problem so they can make a
real decision.

## The Optimal Prompt Formula

For reference when constructing or improving prompts:

```
CONTEXT → INSTRUCTIONS → OUTPUT FORMAT → RULES → EXAMPLES
```

- **Context:** what situation this output is for (audience, purpose, constraints)
- **Instructions:** what to do, specifically
- **Output format:** the exact shape of the result (schema, length, structure)
- **Rules:** what to avoid or always include (keep to the minimum necessary)
- **Examples:** one concrete example of the target output (highest ROI addition)

Invert this order and performance degrades. Lead with context, end with examples.

## Eval-First Note

Before migrating any prompt to a new model, run an eval suite first. The suite must
contain: (1) control cases that always pass, (2) edge cases covering previously
observed failures, (3) capability boundary cases showing where to hand off or decline.
No eval suite means a blind migration — you won't know if the new model broke anything
that the old one handled.

## Adoption Guidance

1. Trigger this before any task execution, not just when something looks wrong. The
   issues this catches are often not obvious on first read.
2. The "no example for complex format" gate is almost always worth a 30-second
   addition — even a rough example beats a perfect description of the target.
3. Keep a running log of which prompt issues you fire most often. If you're repeatedly
   firing the "vague task" gate on a specific user, the fix is upstream in how they
   frame requests — surface that pattern to them after 3+ occurrences.
