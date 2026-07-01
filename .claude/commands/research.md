# /research [topic] — Deep Iterative Research Agent

Run a multi-iteration research pipeline on any topic. Synthesizes web sources, your knowledge vault, and structured analysis into a cited report.

## Skills Activated
Primary: deep-research  
Secondary: notebooklm-py, browser-agent  
Support: graphify (check knowledge vault first)

## Steps

1. **Check your knowledge vault first** (via `/graphify [topic]`):
   - What do you already know about this?
   - What sources are already stored?
   - Avoids redundant research

2. **Run deep-research agent** (dzhng/deep-research pattern):
   - Iteration 1: Broad search, identify key subtopics
   - Iterations 2-N: Drill into each subtopic, follow references
   - Stop condition: coverage plateau OR 5 iterations (whichever first)
   - Use stealth browser for sources behind bot detection

3. **Synthesize findings:**
   - Organize by: overview → key findings → evidence → gaps → next steps
   - Mark confidence level per finding: high/medium/low
   - Include source citations with URLs

4. **Create NotebookLM notebook** (optional):
   - Load top sources into a NotebookLM notebook
   - Generate audio overview for async consumption

5. **Output format:**
   ```
   # [Topic]
   > Depth: [N] iterations · Sources: [M] · Confidence: [high/medium/low]
   > Vault hits: [K] prior notes
   
   ## Overview
   [2-3 sentence summary]
   
   ## Key Findings
   1. **[Finding]** — [evidence] ([source])
   2. ...
   
   ## Evidence Base
   [Detailed notes organized by subtopic]
   
   ## Knowledge Gaps
   - [What's still unclear]
   
   ## Next Steps
   - [Actions you might take based on findings]
   
   ## Sources
   [Numbered list with URLs]
   ```

6. **Update skill bank**: record research task + outcome for `/learn`

## Research Depth Options
- `/research brief [topic]` — 1 iteration, fast overview
- `/research [topic]` — default (3-4 iterations)
- `/research deep [topic]` — 5+ iterations, maximum coverage

## Research Standards (mandatory)

**Context-specific splits required.** Never use overall averages as the sole input for any analysis where context matters. Pull context-specific data (time period, conditions, population) before drawing conclusions. Overall averages are starting context only.

**Validate all cited figures against the specific context.** Before stating any statistic, confirm it comes from the right population and time frame. Wrong population = wrong recommendation.

**Academic/peer-reviewed sources:** open-access first (arXiv, OpenAlex, PubMed, Semantic Scholar) before recommending paywalled content.

**Any numerical figure from memory → verify with search before citing.**

## Domain-Specific Routing
- Academic paper writing (literature review, peer review, citation management) → use `/academic` pipeline — dedicated multi-agent pipeline, not this command
