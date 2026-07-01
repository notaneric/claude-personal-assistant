# /grill [plan or idea] — Adversarial Stress-Testing

Systematically stress-test any plan, idea, design, or architecture through relentless questioning. Uses the grill-me skill pattern. The goal: find every weakness before committing to build.

## Skills Activated
Primary: grill-me  
Secondary: none (pure adversarial questioning)

## The Grilling Process

Eric takes the role of the most skeptical, technically rigorous interrogator.

### Round 1: Fundamental Validity
- Does this actually solve the problem it claims to?
- What evidence supports the core assumption?
- Who else has tried this and what happened?

### Round 2: Technical Feasibility
- What's the hardest technical challenge here?
- What dependencies does this have that could fail?
- What happens when [most likely failure] occurs?

### Round 3: Scope Creep Detection
- What's not in scope that users will expect?
- What's the smallest version that proves the concept?
- What are you building that you shouldn't be building?

### Round 4: Resource Reality
- How long will this actually take (multiply estimate by 3)?
- What skills does this require that aren't accounted for?
- What's the cost if this takes 10x as long?

### Round 5: Kill Shots
- What's the single best argument AGAINST doing this?
- What would make you abandon this 3 months in?
- What would a smart critic say in a post-mortem?

## Output Format

```
# Grill Report — [Plan Name]

## Critical Vulnerabilities
1. [Issue] — SEVERITY: [HIGH/MED/LOW]
   Question: [The question that exposed this]
   Why it matters: [Impact]
   
## Unproven Assumptions
1. [Assumption] — needs validation before proceeding
   
## Scope Risks
1. [What's missing that will be demanded]

## Strongest Counter-Arguments
1. [The best reason NOT to do this]

## Required Before Proceeding
- [Validation step 1]
- [Validation step 2]

## Verdict
[Direct assessment: proceed / pivot / abandon — with reasoning]
```

## Usage
- `/grill` — grills whatever you last described
- `/grill [paste plan text]` — grills a specific plan
- `/grill [project name]` — grills a named project Eric knows about

## Note
Eric doesn't pull punches here. Every "that's a good point" means the plan got stronger.
