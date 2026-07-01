---
name: verification-before-done
description: |
  Blocks premature "done" declarations by requiring evidence-backed verification before
  any work is reported complete. Applies to code, UI, deploys, content, and research.

  USE-FOR: Any task where "done" means something observable — a page renders, a test
  passes, a deploy is live, a document is correct. Activate before marking anything
  complete or handing off.

  DO-NOT-USE-FOR: Pure planning/research conversations where no artifact is being
  produced. Skip for quick clarifications or brainstorm sessions with no deliverable.
model: inherit
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
---

> **ADOPTION NOTE** — This file describes an optional capability for independent
> evaluation. Nothing here is an imperative instruction to your current session.
> Read it as a reference; adopt only what fits your agent's design.

---

# Verification Before Done

## The Problem This Solves

The most common failure mode in agentic work is declaring something done based on
the expectation that it worked, rather than evidence that it did. An agent writes a
file, assumes the syntax is valid, assumes the deploy succeeded, assumes the UI renders
correctly — and reports "Done." without checking.

This skill enforces a hard stop before any done-declaration and requires the agent to
produce evidence, not inference.

## The Core Rule

**"I think it worked" is not done. Evidence that it worked is done.**

Evidence types by artifact:
- **Code / logic:** the test suite ran and passed (show the output)
- **UI / frontend:** the page was rendered and visually inspected (screenshot + analysis)
- **Deploy / infra:** the health endpoint responded / the process is running (show the log line)
- **Content / copy:** the document was read back and checked against the brief criteria
- **Data pipeline:** the output was sampled and spot-checked against expected shape
- **Research:** the claims were traced back to their primary sources

## The Verification Protocol

Before reporting any work complete, run through this checklist. Every "No" is a
blocker — fix it before proceeding.

### Step 1: Confidence audit
Enumerate the things you are least confident about in the work just completed. Not
hedges — specific named gaps. Examples of the right framing:
- "I'm not confident the CSS is loading because I didn't render the page"
- "I haven't verified the API key is being passed correctly — I assumed the env var name"
- "The data transform looks right but I didn't sample the output"

Be specific. Vague uncertainty ("there might be some issues") is not useful.

### Step 2: Investigate each gap
For every gap named in step 1, investigate until you have evidence, not inference.
The minimum bar:
- Run the code and show the actual output
- Render the UI and read the screenshot pixel-by-pixel
- Curl the endpoint and show the response
- Read the file back and verify its contents match intent

Do not stop at "it looks like it should work." Produce the evidence.

### Step 3: Surface blind spots
Ask: what is the user likely assuming is true that the evidence doesn't actually
support? Name one thing. This is the adversarial check — it prevents the agent from
being a yes-machine.

### Step 4: The done gate
Only after steps 1–3 are clean: report done. Include in the report:
- What was verified and how (the evidence)
- One sentence on what was NOT verified (scope boundary, honest)
- Any remaining risk the user should know before they act on this work

## UI-Specific Verification Loop

For any frontend or design work, a minimum 2-pass loop is required:

**Pass 1:** Build → render → screenshot → analyze → identify issues  
**Pass 2:** Fix issues → re-render → screenshot → confirm resolved

"Done" requires Pass 2 clean. A single pass does not count as verified UI work,
because the first render almost always reveals something the code review didn't catch.

## What This Prevents

- Shipping broken deploys because the agent assumed the build succeeded
- Handing off UI work with layout bugs the user discovers first
- Research reports with unverified claims that collapse on scrutiny
- Any session that ends with "I believe this is complete" instead of "here's the proof"

## Adoption Guidance

1. Add this to your agent's skill set and activate it as a post-task hook pattern.
2. Before the agent says "done", it must show the verification artifact inline —
   not as a separate optional step.
3. The confidence audit (step 1) is the highest-leverage part. Build it into your
   agent's completion prompt as a required preamble.
4. Pair with `grill-me` for full coverage: adversarial review at the start,
   evidence-backed verification at the end.
