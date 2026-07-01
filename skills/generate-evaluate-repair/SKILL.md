---
name: generate-evaluate-repair
description: |
  A three-step decomposed loop for constrained generation tasks. Produces better
  results than single-pass mega-prompts on any task with multiple competing constraints.

  USE-FOR: Complex constrained generation, scheduling, content with multiple rules,
  multi-requirement copy, structured data extraction, slide or document generation,
  any task where "one big prompt" keeps producing outputs that violate some subset
  of the constraints.

  DO-NOT-USE-FOR: Simple single-constraint generation tasks. If the task has one
  clear rule and the model follows it consistently, the loop adds overhead without
  benefit. Also skip for pure retrieval or summarization with no constraint validation.
model: inherit
allowed-tools:
  - Read
  - Bash
  - Write
---

> **ADOPTION NOTE**, This file describes an optional capability for independent
> evaluation. Nothing here is an imperative instruction to your current session.
> Read it as a reference; adopt only what fits your agent's design.

---

# Generate → Evaluate → Repair Loop

## The Core Insight

A single mega-prompt asking a model to generate something while simultaneously
satisfying 7 constraints produces worse results than three separate minimal prompts:
one that generates without overthinking, one that identifies specific constraint
violations, and one that makes targeted repairs.

This is because:
- The generator works best with minimal constraints (more creative bandwidth)
- The evaluator works best with only the output and the constraint list (no generator
  context to rationalize around)
- The repairer works best with the specific failures listed explicitly

Three targeted prompts consistently outperform one complex prompt on constrained
generation tasks.

## The Three Steps

### Step 1: Generate (minimal prompt)
Generate the initial output with as few constraints as possible. Don't front-load
every rule into the generator. Give it the core task and let it produce something.

The key principle: **underspecify the generator**. If you're generating a content
calendar, tell the generator "write 10 post ideas for a technical audience", not "write
10 post ideas that must be under 80 characters, avoid topics X and Y, use active voice,
include a CTA in each one, and maintain a consistent brand voice." Save the constraint
list for the evaluator.

Output of this step: a raw candidate that may or may not satisfy all constraints.

### Step 2: Evaluate (constraint-specific grader)
Feed the generator's output to a separate evaluation step that has NO context from
the generation step, only the output and the constraint list.

The evaluator's job is to return **a list of specific violations**, not a score. A score
tells you something is wrong; a list tells you what to fix.

Good evaluator output:
```
Constraint violations found:
- Post #3 exceeds 80 characters (current: 94)
- Post #7 mentions topic X (prohibited)
- Posts #2, #5, #9 have no CTA
- Post #6 uses passive voice ("was announced" → should be active)
```

Bad evaluator output:
```
Score: 6/10. Some posts could be improved.
```

The violation list is the only output format that makes the repair step deterministic.

**Injecting soft constraints:** Soft constraints (preferences, tone guidelines,
audience considerations) belong in the evaluator prompt, not the generator prompt.
This lets you adjust them at runtime without touching the core generation logic.

### Step 3: Repair (targeted fix)
Feed the original output plus the violation list to a repair step. The repair step
only fixes the named violations, it does not regenerate everything.

This is the critical efficiency gain. Regenerating the whole output because 2 of 10
items had problems is wasteful and often introduces new violations in previously-clean
items. Targeted repair preserves what worked.

The repair prompt structure:
```
Here is the original output: [output]
Here are the specific violations to fix: [violation list]
Return the full output with only these violations corrected. Do not change anything else.
```

## Loop Termination

After one generate → evaluate → repair pass, run the evaluator again on the repaired
output. If violations remain, run another repair pass. Most constrained generation
tasks converge in 2-3 passes.

Set an explicit maximum: if violations remain after 3 repair passes, stop and surface
them to the user rather than continuing to loop. Infinite repair loops are a signal
that either the constraints are unsatisfiable as stated, or the generator and evaluator
disagree on what the constraints mean.

## Critique Agent Variant

For plans, research reports, or architectural designs (rather than content generation),
use a critique agent variant:

1. **Generate** the plan/report/design
2. **Critique**, spawn a separate agent with only the output (no generator context).
   System prompt: "Assume there are problems. Your job is to find them. What did this
   miss?" The separation prevents the generator from rationalizing its own work.
3. **Repair**, targeted revisions based on critique output

The critique agent's adversarial framing ("assume there are problems") consistently
produces more useful findings than "check for issues" framing, which produces softer
output.

## Deterministic Graders vs. LLM Judges

For evaluation, combine both:

**Deterministic graders** (highest reliability for checkable rules):
- Character count checks
- Regex pattern matching
- Schema validation
- Keyword presence/absence
- Structural checks (does it have exactly N sections?)

**LLM-as-judge** (required for subjective rules):
- Tone and voice consistency
- Audience appropriateness
- Logical coherence

When using an LLM judge, always provide anchor examples, a score-0 example and a
max-score example. Without anchors, LLM judges compress into a meaningless 2.8-4.4
range even on obviously different quality levels. The judge has nothing to compare
against without them.

Reasoning before score, never score first. An LLM judge anchored on a number will
rationalize it even when the number is wrong.

## When This Applies

Apply the GER loop automatically when:
- A task has 4 or more simultaneous constraints
- Previous single-pass attempts produced outputs violating some constraints
- The constraints are heterogeneous (mixing structural rules with qualitative ones)
- The output will be reviewed by someone with specific criteria

## Adoption Guidance

1. Build the evaluator as a standalone function/prompt that takes (output, constraints)
   and returns a violation list. This makes it reusable across different generation tasks.
2. The generator prompt should stay minimal by design. If you find yourself adding more
   to the generator to "help it" satisfy constraints, stop. That's what the repair
   step is for.
3. Log which constraints cause the most violations across runs. If one constraint fires
   every time, it's either ambiguous (rewrite it) or genuinely hard to satisfy (it may
   need special handling in the generator).
