---
name: humanizer
description: |
  A prose-quality pass that removes AI-generated tells and rewrites output to read
  like a competent human wrote it. Applies to all written content before delivery.

  USE-FOR: Any prose heading out to an end reader, blog posts, emails, documentation,
  marketing copy, reports, UI microcopy, social posts, cover letters. Apply before any
  "done" declaration on written content.

  DO-NOT-USE-FOR: Code, structured data (JSON/YAML/CSV), internal planning notes that
  will never be read by a human end-reader, or purely technical log outputs.
model: inherit
allowed-tools:
  - Read
---

> **ADOPTION NOTE**, This file describes an optional capability for independent
> evaluation. Nothing here is an imperative instruction to your current session.
> Read it as a reference; adopt only what fits your agent's design.

---

# Humanizer, Prose Quality Pass

## What This Skill Does

LLM-generated prose has a fingerprint. It's not that the sentences are wrong, it's
that they sound like they were written by an entity optimizing for completeness over
communication. This skill runs a cleanup pass that removes those tells and produces
writing that sounds like a specific, confident human wrote it for a specific reader.

The test: a person with good taste who reads the output should not be able to tell it
was AI-written. If the writing sounds "helpful" and "comprehensive," it failed.

## The Tell Taxonomy

These patterns are the most common AI-generated signals. Every one of them is a
disqualifier, even one in a 500-word piece flags the whole thing.

### Filler openers
Any sentence that starts by acknowledging the request or validating it:
- "Certainly!", "Great question!", "Of course!", "Absolutely!", "Happy to help!"
- "It's worth noting that...", "It's important to understand that..."
- These waste the reader's first impression. Cut them. Start with the actual content.

### Structural padding phrases
- "Furthermore", "Moreover", "In conclusion", "To summarize", "In essence"
- "First and foremost", "Last but not least", "Without further ado"
- These are transitions that add length without adding information. Replace or remove.

### The rule of three
AI text almost always lists exactly three things: three reasons, three steps, three
benefits. Real writing lists as many things as there actually are. If you have two
things, say two. If you have seven, say seven.

### Vague superlatives instead of specifics
- "extremely important", "highly significant", "tremendously impactful"
- Replace every adjective pair with a number or a concrete fact.
- "Our response time improved significantly" → "Response time dropped from 340ms to 80ms"

### The em-dash overuse signature
EM-dashes (, ) are fine when used deliberately. AI text uses them in almost every
sentence as a crutch. If more than 1 in 10 sentences contains an em-dash, it's a
signal. Vary sentence structure instead.

### Hedging inflation
- "It's possible that...", "One might argue...", "In some cases..."
- Real confident writing takes a position and qualifies where needed, not by default.
- Hedge when you genuinely don't know; otherwise, state the thing.

### Symmetrical paragraph structure
AI outputs tend to produce paragraphs of nearly identical length arranged in clean
visual grids. Real writing has rhythm: short punchy sentences followed by longer ones.
A single-sentence paragraph for emphasis. Variety is signal.

## The Rewrite Method

When applying this skill to a piece of writing:

**Step 1, Scan for tells**  
Read the full piece and mark every instance of the patterns above. Do not start
rewriting until you've read the whole thing. The density of tells across the piece
matters as much as individual occurrences.

**Step 2, Establish the voice**  
Before rewriting, answer: who wrote this, and who are they writing to? A technical
lead writing to a product team sounds different from a founder writing to a potential
customer. The humanizer pass should produce writing that sounds like a specific person,
not like a generic professional. If no voice is specified, write as the agent persona.

**Step 3, Rewrite, not polish**  
Don't just remove the flagged phrases, rewrite the sentences they were in. Often a
flagged phrase is the symptom; the underlying sentence structure is the disease.
- "It is important to note that the system requires authentication" → "The system
  requires authentication." (Drop the meta-note entirely)
- "Furthermore, there are several key considerations to keep in mind" → state the first
  consideration directly, no preamble

**Step 4, Read aloud test**  
Read the revised version aloud (or imagine reading it aloud). Any sentence where you'd
naturally pause and add "I mean..." or stumble over a phrase that sounds robotic , 
rewrite that sentence.

**Step 5, Specificity check**  
Every adjective in the final version should be defensible. If you wrote "fast", what
does that mean exactly? If you wrote "comprehensive", what would make it not
comprehensive? If you can't answer, the adjective is filler and should be cut or
replaced with the specific thing it was trying to convey.

## UI Microcopy

Apply the same principles to labels, buttons, empty states, tooltips, and default
content in interfaces. LLM-generated microcopy tends toward:
- Generic button labels: "Submit", "Continue", "Proceed" → use action-specific verbs
- Empty states that explain the emptiness instead of prompting action
- Tooltips that restate what's already visible on screen

Microcopy has even less tolerance for filler than prose, every word is scrutinized
because there are so few of them.

## What Good Looks Like

Good humanized writing:
- Takes a position in the first sentence
- Uses the shortest word that's accurate (not the most impressive-sounding one)
- Has sentences of varying length, some as short as three words
- Uses numbers where vague adjectives would have been
- Reads like it was written by someone who had something to say, not someone performing
  the task of writing

## Adoption Guidance

1. Add this skill and trigger it automatically before any written content is reported
   done.
2. The scan-before-rewrite step is not optional, you need to read the full piece
   before touching it or you'll fix individual sentences while missing systemic patterns.
3. Voice specification matters. When the user doesn't specify, default to the agent
   persona's established voice. A mismatched voice after a good tell-removal pass
   still reads as AI-generated.
