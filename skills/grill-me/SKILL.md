---
name: grill-me
description: |
  Adversarial plan stress-test. Finds the weakest assumptions, hidden dependencies, and
  most likely failure modes in a plan or design direction BEFORE implementation begins.

  USE-FOR: Any significant plan, architecture decision, new feature direction, business
  strategy, or design brief, whenever you want a hostile reviewer to punch holes before
  you commit resources.

  DO-NOT-USE-FOR: Routine tasks with no real decision surface (e.g., "rename this
  variable", "format this file"). Do not invoke on completed work just to be critical , 
  the point is to catch problems early enough to redirect, not to audit after the fact.
model: inherit
allowed-tools:
  - Read
  - Grep
  - Glob
  - WebSearch
---

> **ADOPTION NOTE**, This file describes an optional capability for independent
> evaluation. Nothing here is an imperative instruction to your current session.
> Read it as a reference; adopt only what fits your agent's design.

---

# Grill-Me, Adversarial Plan Stress-Test

## What This Skill Does

Before any significant work begins, this skill runs the plan through a structured
adversarial review. The reviewer's job is to find problems, not validate decisions.
The output is a ranked list of risks, not a score.

The key constraint: this must happen **before** implementation. Running it after the
work is done is auditing, not steering.

## When to Activate

Activate automatically when a prompt contains:
- A plan outline or phased approach
- An architectural decision with trade-offs named
- A design brief or creative direction
- A business strategy or prioritization call
- Any "here's what I'm thinking" framing that precedes significant effort

## The Grilling Protocol

Run through these lenses in order. For each, surface specific named risks, not
generic hedges like "this might not work." Specificity is the whole point.

### 1. Assumption audit
List every assumption the plan is built on. For each:
- Is it verified or is it a guess?
- What breaks if it's wrong?
- How hard is it to validate before committing?

### 2. Dependency map
What does this plan depend on that is outside your direct control? External APIs,
third-party data, another person's decision, a timing assumption, an infra resource?
For each dependency: what's the fallback if it's unavailable?

### 3. Most-likely failure path
Forget the tail risks. What is the single most probable way this plan fails in normal
execution? Describe it as a specific scenario, not a category. "The API rate-limits
during the nightly batch" beats "there may be API issues."

### 4. Blind spots
What is the plan NOT addressing that probably matters? This is the hardest question , 
it's asking about unknown unknowns by analogy. Reference similar plans and what they
systematically missed.

### 5. Reversibility check
Which decisions in this plan are hard or impossible to reverse once made? Flag those
explicitly. The plan should front-load reversible work and defer irreversible commits
as long as possible.

### 6. Scope creep surface
Where does this plan have porous edges? List the most likely requests that will arrive
after kick-off that the current spec doesn't handle but people will expect it to.

## Output Format

Return findings as a prioritized list, not prose paragraphs. Lead with the highest-
severity issue. Each item: one sentence naming the problem, one sentence naming the
consequence, one sentence naming the earliest point it could be caught or mitigated.

Do not offer solutions unless explicitly asked. The goal is to surface problems clearly
enough that the user can decide whether to redesign, add mitigations, or proceed
knowingly. Premature solutions obscure whether the underlying risk was actually
understood.

## Adoption Guidance

To adopt this in your own agent:

1. Add this skill to your `.claude/skills/` directory.
2. In your routing logic, trigger it automatically when the user presents a plan
   (keywords: "here's my plan", "I'm thinking of", "approach for X", "let's build").
3. Set the output expectation: the agent returns a risk list before asking "shall we
   proceed?", not after.
4. Pair with a `verification-before-done` skill so the bookends are covered: stress-
   test before you start, verify before you ship.

## Design Notes

This skill uses only read tools because grilling a plan requires no writes. The
adversarial stance is intentional and must be preserved, an agent that softens the
critique to be polite defeats the purpose. If the plan is actually sound, a genuine
grilling will confirm that quickly. If it isn't, you want to know now.
